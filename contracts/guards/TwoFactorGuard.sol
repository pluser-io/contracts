// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Guard } from "@gnosis.pm/safe-contracts/contracts/base/GuardManager.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/common/SignatureDecoder.sol";

contract TwoFactorGuard is Guard, SignatureDecoder {
    GnosisSafe public immutable twoFactorVerifier;

    constructor(GnosisSafe _twoFactorVerifier) {
        twoFactorVerifier = _twoFactorVerifier;
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

        twoFactorVerifier.checkSignatures(txHash, data, _getTwoFactorSignatures(wallet, signatures));
    }

    function checkAfterExecution(bytes32 /*txHash*/, bool /*success*/) external pure {
        return;
    }

    function verifyGuarderSignatures(bytes32 dataHash, bytes calldata signatures) external view {
        bytes memory emptyData = new bytes(0);
        twoFactorVerifier.checkSignatures(dataHash, emptyData, signatures);
    }

    function _getTwoFactorSignatures(GnosisSafe wallet, bytes memory signatures) private view returns (bytes memory) {
        uint256 twoFactorThreshold = twoFactorVerifier.getThreshold();
        uint256 walletThreshold = wallet.getThreshold();

        require(signatures.length >= (walletThreshold + twoFactorThreshold) * 65, "TwoFactorGuard: Not enough signatures");

        bytes memory twoFactorSignatures = new bytes(twoFactorThreshold * 65);
        {
            for (uint256 i = 0; i < twoFactorThreshold; i++) {
                uint8 v;
                bytes32 r;
                bytes32 s;

                (v, r, s) = signatureSplit(signatures, walletThreshold + i);

                uint256 signaturePos = i * 65;
                uint256 twoFactorSignaturesValues;

                // slither-disable-next-line assembly
                assembly {
                    // length slot. Signature is longer then 32 bytes. Length use one slot.
                    twoFactorSignaturesValues := add(twoFactorSignatures, 0x20)

                    // r is 32 bytes long
                    mstore(add(twoFactorSignaturesValues, signaturePos), r)
                    // s is 32 bytes long
                    mstore(add(twoFactorSignaturesValues, add(signaturePos, 0x20)), s)
                }
                //TODO: safe version of mstore - will use assembly
                twoFactorSignatures[signaturePos + 64] = bytes1(v);
            }
        }

        return twoFactorSignatures;
    }
}
