// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { GnosisSafe } from "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "./InitializationScriptInterface.sol";

contract InitializationScriptV1 is InitializationScriptInterface {
    function initializeAccount(PluserModule pluserModule) external {
        GnosisSafe account = GnosisSafe(payable(address(this)));

        account.enableModule(address(pluserModule));
        account.setGuard(address(pluserModule));
    }
}
