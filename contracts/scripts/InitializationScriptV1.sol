// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "./InitializationScriptInterface.sol";

contract InitializationScriptV1 is InitializationScriptInterface {
    function initializeAccount(RecoveryManager recoveryManager, TwoFactorGuard guard) external {
        GnosisSafe wallet = GnosisSafe(payable(address(this)));

        wallet.enableModule(address(recoveryManager));
        wallet.setGuard(address(guard));
    }
}
