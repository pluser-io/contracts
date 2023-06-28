// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "../modules/PluserModule.sol";

interface InitializationScriptInterface {
    function initializeAccount(PluserModule pluserModule) external;
}
