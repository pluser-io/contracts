// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { Guard } from "@gnosis.pm/safe-contracts/contracts/base/GuardManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/SignatureDecoder.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

import "../libs/RecoveryRequest.sol";
import "../Factory.sol";

contract PluserModuleState {
    // --------------- Constants ---------------
    uint256 public constant RECOVERY_TIME = 3 days;
    uint256 public constant SIGNATURE_LIFETIME = 15 minutes;

    // --------------- Typehashes ---------------
    bytes32 internal constant _CREATE_RECOVERY_REQUEST_TYPEHASH =
        keccak256("CreateRecoveryRequest(address newSessionKey,uint256 nonce,uint256 signTimestamp)");
    bytes32 internal constant _CANCEL_RECOVERY_TYPEHASH = keccak256("CancelRecovery(uint256 nonce,uint256 signTimestamp)");
    bytes32 internal constant _EXECUTE_RECOVERY_REQUEST_TYPEHASH = keccak256("ExecuteRecoveryRequest(uint256 nonce,uint256 signTimestamp)");

    // --------------- Events ---------------
    event RequestCreated(address newSessionKey);
    event RequestCanceled(address sessionKey);
    event Restored(address newSessionKey);

    // --------------- Global vars ---------------
    GnosisSafe public account;
    address public authKey;
    Factory public factory;

    uint256 public recoveryNonce;
    RecoveryRequest.NewSessionKey public recoveryRequest;
}

contract PluserGuard is PluserModuleState, SignatureDecoder, EIP712Upgradeable, Guard {
    using RecoveryRequest for RecoveryRequest.NewSessionKey;

    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
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

        require(msg.sender == address(account), "TwoFactorGuard: Invalid sender"); //TODO: msg.sender or  address /* msgSender */?
        require(!recoveryRequest.isExist(), "TwoFactorGuard: Account isn't active");

        bytes32 txHash = account.getTransactionHash(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            account.nonce() - 1
        );

        // get verifyer signature
        uint256 lastSigIndex = account.getThreshold();
        (uint8 v, bytes32 r, bytes32 s) = signatureSplit(signatures, lastSigIndex);

        // check verifyer signature
        require(ECDSA.recover(txHash, v, r, s) == factory.getTwoFactorVerifier(), "Invalid signature (authKey)");
    }

    function checkAfterExecution(bytes32 /*txHash*/, bool /*success*/) external pure {
        return;
    }
}

contract PluserModule is PluserModuleState, EIP712Upgradeable {
    using RecoveryRequest for RecoveryRequest.NewSessionKey;

    // --------------- Modifiers ---------------
    modifier onlyAccount() {
        require(msg.sender == address(account), "PluserModule: Only account");
        _;
    }

    // --------------- Initialize ---------------
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(GnosisSafe account_, address authKey_, address sessionKey_, Factory factory_) external initializer {
        __EIP712_init("PluserModule", "0.0.369");

        account = account_;
        authKey = authKey_;
        factory = factory_;
    }

    // --------------- Public mutable functions ---------------
    function createRecoveryRequest(
        address newSessionKey,
        bytes calldata authKeySignature,
        bytes calldata verifyerSignature,
        uint signTimestamp
    ) external {
        require(!recoveryRequest.isExist(), "RequestManager: Request already exists");
        require(!account.isOwner(newSessionKey), "RequestManager: account already exists");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_CREATE_RECOVERY_REQUEST_TYPEHASH, newSessionKey, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), authKeySignature) == authKey, "Invalid signature (authKey)");
        require(
            ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == factory.getTwoFactorVerifier(),
            "Invalid signature (verifyer)"
        );

        // slither-disable-next-line timestamp
        recoveryRequest = RecoveryRequest.NewSessionKey({ key: newSessionKey, unlockTime: block.timestamp + RECOVERY_TIME });
        emit RequestCreated(newSessionKey);
    }

    function cancelRecovery(bytes calldata authKeySignature, uint signTimestamp) external onlyAccount {
        require(recoveryRequest.isExist(), "RequestManager: Request not exists");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_CANCEL_RECOVERY_TYPEHASH, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), authKeySignature) == authKey, "Invalid signature (auth key)");

        recoveryRequest.reset();
        emit RequestCanceled(recoveryRequest.key);
    }

    /*
    function executeRecoveryRequest(bytes calldata authKeySignature, bytes calldata verifyerSignature, uint signTimestamp) external {
        require(recoveryRequest.isExist(), "RequestManager: Request not exists");
        require(recoveryRequest.isUnlocked(), "RequestManager: Request not unlocked");
        require(signTimestamp + SIGNATURE_LIFETIME > block.timestamp, "RequestManager: Signature is expired");

        bytes32 structHash = keccak256(abi.encode(_EXECUTE_RECOVERY_REQUEST_TYPEHASH, recoveryNonce++, signTimestamp));
        require(ECDSA.recover(_hashTypedDataV4(structHash), authKeySignature) == authKey, "Invalid signature (auth key)");
        require(
            ECDSA.recover(_hashTypedDataV4(structHash), verifyerSignature) == factory.getTwoFactorVerifier(),
            "Invalid signature (verifyer)"
        );

        address[] memory sessionKeys = account.getOwners();
        for (uint256 i = 0; i < sessionKeys.length; i++) {
            delete timeoutBySessionKey[sessionKeys[i]];

            address sessionKey = sessionKeys[i];
            address prevSessionKey = address(0x1);
            if (i != 0) {
                prevSessionKey = sessionKeys[i - 1];
            }

            require(
                account.execTransactionFromModule(
                    address(account),
                    0,
                    abi.encodeCall(account.removeOwner, (prevSessionKey, sessionKey, 1)),
                    Enum.Operation.Call
                ),
                "RequestManager: Remove owner failed"
            );
        }

        address newSessionKey = recoveryRequest.key;
        require(
            account.execTransactionFromModule(
                address(account),
                0,
                abi.encodeCall(account.addOwnerWithThreshold, (newSessionKey, 1)),
                Enum.Operation.Call
            ),
            "RequestManager: Add owner failed"
        );

        timeoutBySessionKey[newSessionKey] = block.timestamp + SESSION_LIFETIME;

        emit Restored(newSessionKey);
        recoveryRequest.reset();
    }*/
}
