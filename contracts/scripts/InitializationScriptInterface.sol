// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../modules/RecoveryManager.sol";
import "../guards/TwoFactorGuard.sol";

interface InitializationScriptInterface {
    function initializeAccount(RecoveryManager recoveryManager, TwoFactorGuard guard) external;
}
