// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { Guard } from "@gnosis.pm/safe-contracts/contracts/base/GuardManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/SignatureDecoder.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../guards/TwoFactorGuard.sol";
import "../libs/Request.sol";

contract PluserModuleState {
    // --------------- Constants ---------------
    uint256 public constant SESSION_LIFETIME = 1 hours;
    uint256 public constant RECOVERY_TIME = 3 days;
    uint256 public constant SIGNATURE_LIFETIME = 15 minutes;

    // --------------- Events ---------------
    event RequestCreated(address newSessionKey);
    event RequestCanceled(address sessionKey);
    event Restored(address newSessionKey);

    // --------------- Typehashes ---------------
    bytes32 private constant _CREATE_RECOVERY_REQUEST_TYPEHASH =
        keccak256("CreateRecoveryRequest(address newSessionKey,uint256 nonce,uint256 signTimestamp)");
    bytes32 private constant _CANCEL_RECOVERY_TYPEHASH = keccak256("CancelRecovery(uint256 nonce,uint256 signTimestamp)");
    bytes32 private constant _EXECUTE_RECOVERY_REQUEST_TYPEHASH = keccak256("ExecuteRecoveryRequest(uint256 nonce,uint256 signTimestamp)");

    // --------------- Global vars ---------------
    GnosisSafe public owner;
    Factory public factory;
    address public authKey;

    mapping(address => uint) public timeoutBySessionKey;

    uint256 public recoveryNonce;
    Request.NewSessionKey public recoveryRequest;
}

contract PluserModuleInternal is PluserModuleState {
    function _verifySignature(uint8 v, bytes32 r, bytes32 s) private returns (address currentOwner) {
        if (v > 30) {
            currentOwner = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", dataHash)), v - 4, r, s);
        } else {
            currentOwner = ecrecover(dataHash, v, r, s);
        }

        require(currentOwner != address(0), "PluserModule: Invalid signature");

        return currentOwner;
    }
}

contract PluserModule is PluserModuleInternal, Guard {
    using Request for Request.NewSessionKey;

    // --------------- Modifiers ---------------
    modifier onlyOwner() {
        require(msg.sender == address(owner), "PluserModule: Only owner");
        _;
    }

    // --------------- Initialize ---------------
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address trustedForwarder_) ERC2771Context(trustedForwarder_) {
        _disableInitializers();
    }

    function initialize(GnosisSafe owner_, address authKey_, address sessionKey_) external initializer {
        owner = owner_;
        authKey = authKey_;

        timeoutBySessionKey[sessionKey_] = block.timestamp + SESSION_LIFETIME;
    }

    // --------------- View functions ---------------
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address /* msgSender */
    ) external view {
        require(operation == Enum.Operation.Call, "TwoFactorGuard: Only calls are allowed");

        require(msg.sender == owner, "TwoFactorGuard: Invalid sender"); //TODO: msg.sender or  address /* msgSender */?

        uint256 safeNonce = wallet.nonce() - 1;
        bytes32 txHash = wallet.getTransactionHash(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            safeNonce
        );

        bytes4 selector = data[0:4];

        if (to == address(this)) {
            require(selector == PluserModule.updateSession.selector, "PluserModule: Invalid selector");

            address sessionKey = abi.decode(data[16:36], (address));

            (v, r, s) = signatureSplit(signatures, 0);
            address signatureOwner = _verifySignature(v, r, s);

            require(sessionKey == signatureOwner, "PluserModule: Invalid session key signature");
            require(timeoutBySessionKey[sessionKey] > block.timestamp, "PluserModule: Session key is expired");
        } else if (to == address(owner)) {} else {
            require(timeoutBySessionKey[sessionKey] > block.timestamp, "PluserModule: Session key is expired");
        }
    }

    function checkAfterExecution(bytes32 /*txHash*/, bool /*success*/) external pure {
        return;
    }

    // --------------- Public mutable functions ---------------
    function createRecoveryRequest(
        address newSessionKey,
        bytes calldata authKeySignature,
        bytes calldata verifyerSignature,
        uint signTimestamp
    ) external {
        require(!recoveryRequest.isExist(), "RequestManager: Request already exists");
        require(!owner.isOwner(newSessionKey), "RequestManager: Owner already exists");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_CREATE_RECOVERY_REQUEST_TYPEHASH, newSessionKey, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), authKeySignature) == authKey, "Invalid signature (authKey)");
        require(
            ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == factory.getTwoFactorVerifier(),
            "Invalid signature (verifyer)"
        );

        // slither-disable-next-line timestamp
        recoveryRequest = Request.NewSessionKey({ newSessionKey: newSessionKey, unlockTime: block.timestamp + RECOVERY_TIME });
        emit RequestCreated(newSessionKey);
    }

    function cancelRecovery(
        address sessionKey,
        bytes calldata sessionKeySignature,
        bytes calldata verifyerSignature,
        uint signTimestamp
    ) external {
        require(recoveryRequest.isExist(), "RequestManager: Request not exists");
        require(owner.isOwner(sessionKey), "RequestManager: Session key not exists");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_CANCEL_RECOVERY_TYPEHASH, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), sessionKeySignature) == sessionKey, "Invalid signature (session key)");
        require(
            ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == factory.getTwoFactorVerifier(),
            "Invalid signature (verifyer)"
        );

        emit RequestCanceled(recoveryRequest.sessionKey);

        recoveryRequest.reset();
    }

    function executeRecoveryRequest(bytes calldata authKeySignature, bytes calldata verifyerSignature, uint signTimestamp) external {
        require(recoveryRequest.isExist(), "RequestManager: Request not exists");
        require(recoveryRequest.isUnlocked(), "RequestManager: Request not unlocked");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_EXECUTE_RECOVERY_REQUEST_TYPEHASH, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), authKeySignature) == sessionKey, "Invalid signature (auth key)");
        require(
            ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == factory.getTwoFactorVerifier(),
            "Invalid signature (verifyer)"
        );

        address sessionKey = recoveryRequest.key;

        address[] memory sessionKeys = owner.getOwners();
        for (uint256 i = 0; i < sessionKeys.length; i++) {
            delete timeoutBySessionKey[sessionKeys[i]];

            address sessionKey = sessionKeys[i];
            address prevSessionKey;
            if (i != 0) {
                prevSessionKey = sessionKeys[i - 1];
            }

            require(
                owner.execTransactionFromModule(
                    address(owner),
                    0,
                    abi.encodeCall(owner.removeOwner, (prevSessionKey, sessionKey, 1)),
                    Enum.Operation.Call
                ),
                "RequestManager: Remove owner failed"
            );
        }

        require(
            owner.execTransactionFromModule(
                address(owner),
                0,
                abi.encodeCall(owner.addOwnerWithThreshold, (deviceKey, 1)),
                Enum.Operation.Call
            ),
            "RequestManager: Add owner failed"
        );

        timeoutBySessionKey[sessionKey] = block.timestamp + SESSION_LIFETIME;

        emit Restored(deviceKey);
        recoveryRequest.reset();
    }

    function updateSession(address currentSessionKey, address newSessionKey, bytes calldata verifyerSignature) external onlyOwner {
        require(owner.isOwner(currentSessionKey), "PluserModule: Invalid session key");

        bytes32 structHash = keccak256(abi.encode(_CREATE_REQUEST_TYPEHASH, newSessionKey, recoveryNonce++));
        require(ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == verifyer, "Invalid signature (verifyer)");

        timeoutBySessionKey[newSessionKey] = block.timestamp + SESSION_LIFETIME;
        delete timeoutBySessionKey[currentSessionKey];

        require(
            owner.execTransactionFromModule(
                address(owner),
                0,
                abi.encodeCall(owner.removeOwner, (owners[i - 1], owners[i], 1)),
                Enum.Operation.Call
            ),
            "PluserModule: Remove owner failed"
        );

        require(
            owner.execTransactionFromModule(
                address(owner),
                0,
                abi.encodeCall(owner.addOwnerWithThreshold, (newSessionKey, 1)),
                Enum.Operation.Call
            ),
            "PluserModule: Add owner failed"
        );
    }
}
