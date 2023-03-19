// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { Guard } from "@gnosis.pm/safe-contracts/contracts/base/GuardManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";

import "../guards/TwoFactorGuard.sol";
import "../libs/Request.sol";

contract RecoveryManager is Initializable, ERC2771ContextUpgradeable, EIP712Upgradeable {
    using Request for Request.NewDeviceKey;

    bytes32 private constant _CREATE_TYPEHASH = keccak256("CreateRequest(address key,uint256 nonce)");
    bytes32 private constant _CANCEL_TYPEHASH = keccak256("CancelRequest(address key,uint256 unlockTime,uint256 nonce)");

    uint256 public constant REQUEST_TIMEOUT = 3 days;

    GnosisSafe public wallet;
    TwoFactorGuard public guard;
    address public authKey;

    uint256 public requestNonce;
    Request.NewDeviceKey public request;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address trustedForwarder_) ERC2771ContextUpgradeable(trustedForwarder_) {
        _disableInitializers();
    }

    function initialize(GnosisSafe wallet_, address authKey_, TwoFactorGuard guard_) external initializer {
        __EIP712_init("RecoveryManager", "1");
        uint chainId;

        wallet = wallet_;
        authKey = authKey_;
        guard = guard_;
    }

    modifier onlyAuthKey() {
        require(_msgSender() == authKey, "RequestManager: Permission denied");
        _;
    }

    modifier onlyAuthKeyOrGuardOwner() {
        address sender = _msgSender();
        address verifyer = address(guard.twoFactorVerifier());

        require(sender == authKey || sender == verifyer, "RequestManager: Permission denied");
        _;
    }

    function createRequest(address newDeviceKey, bytes calldata guarderSignatures) public onlyAuthKey {
        require(!wallet.isOwner(newDeviceKey), "RequestManager: Owner already exists");

        // slither-disable-next-line timestamp
        require(!request.isExist(), "RequestManager: Request already exists");

        guard.verifyGuarderSignatures(
            _hashTypedDataV4(keccak256(abi.encode(_CREATE_TYPEHASH, newDeviceKey, ++requestNonce))),
            guarderSignatures
        );

        // slither-disable-next-line timestamp
        request = Request.NewDeviceKey({ deviceKey: newDeviceKey, unlockTime: block.timestamp + REQUEST_TIMEOUT });
    }

    function cancelRequest(bytes calldata guarderSignatures) public onlyAuthKey {
        // slither-disable-next-line timestamp
        require(request.isExist(), "RequestManager: Request not exists");

        guard.verifyGuarderSignatures(
            _hashTypedDataV4(keccak256(abi.encode(_CANCEL_TYPEHASH, request.deviceKey, request.unlockTime, ++requestNonce))),
            guarderSignatures
        );

        request.reset();
    }

    function recovery() public onlyAuthKeyOrGuardOwner {
        // slither-disable-next-line timestamp
        require(request.isExist(), "RequestManager: Request not exists");
        require(request.isUnlocked(), "RequestManager: Request not unlocked");

        require(
            wallet.execTransactionFromModule(
                address(wallet),
                0,
                abi.encodeCall(wallet.addOwnerWithThreshold, (request.deviceKey, 1)),
                Enum.Operation.Call
            ),
            "RequestManager: Add owner failed"
        );

        address[] memory owners = wallet.getOwners();
        // TODO: calls-loop - security issue
        for (uint256 i = 1; i < owners.length; i++) {
            require(
                wallet.execTransactionFromModule(
                    address(wallet),
                    0,
                    abi.encodeCall(wallet.removeOwner, (owners[i - 1], owners[i], 1)),
                    Enum.Operation.Call
                ),
                "RequestManager: Remove owner failed"
            );
        }

        request.reset();
    }
}
