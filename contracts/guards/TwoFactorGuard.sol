// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Guard } from "@gnosis.pm/safe-contracts/contracts/base/GuardManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/SignatureDecoder.sol";
import "../Factory.sol";

contract TwoFactorGuard is Guard, SignatureDecoder {
    Factory public immutable factory;

    constructor(Factory factory_) {
        factory = factory_;
    }

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

        GnosisSafe wallet = GnosisSafe(payable(msg.sender));

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

        address verifyer = factory.getTwoFactorVerifier();

        uint256 walletThreshold = wallet.getThreshold();
        (uint8 v, bytes32 r, bytes32 s) = signatureSplit(signatures, walletThreshold);

        require(verifyer == ECDSA.recover(txHash, v, r, s), "TwoFactorGuard: Invalid signature");
    }

    function checkAfterExecution(bytes32 /*txHash*/, bool /*success*/) external pure {
        return;
    }
}
