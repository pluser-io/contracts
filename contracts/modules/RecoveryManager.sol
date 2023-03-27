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

        wallet = wallet_;
        authKey = authKey_;
        guard = guard_;
    }

    modifier onlyAuthKey() {
        require(_msgSender() == authKey, "RequestManager: Permission denied");
        _;
    }

    function createRequest(address newDeviceKey) public onlyAuthKey {
        require(!wallet.isOwner(newDeviceKey), "RequestManager: Owner already exists");
        require(!request.isExist(), "RequestManager: Request already exists");

        // slither-disable-next-line timestamp
        request = Request.NewDeviceKey({ deviceKey: newDeviceKey, unlockTime: block.timestamp + REQUEST_TIMEOUT });
    }

    function cancelRequest() public onlyAuthKey {
        require(request.isExist(), "RequestManager: Request not exists");
        request.reset();
    }

    function restore() public onlyAuthKey {
        require(request.isExist(), "RequestManager: Request not exists");
        require(request.isUnlocked(), "RequestManager: Request not unlocked");

        address[] memory owners = wallet.getOwners();
        // TODO: calls-loop - security issue
        for (uint256 i = 0; i < owners.length; i++) {
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

        require(
            wallet.execTransactionFromModule(
                address(wallet),
                0,
                abi.encodeCall(wallet.addOwnerWithThreshold, (request.deviceKey, 1)),
                Enum.Operation.Call
            ),
            "RequestManager: Add owner failed"
        );

        request.reset();
    }
}

//TODO: add device key with authKey + deviceKey signature
