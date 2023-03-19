// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

library Request {
    struct NewDeviceKey {
        address deviceKey;
        uint256 unlockTime;
    }

    function isUnlocked(NewDeviceKey storage self) internal view returns (bool) {
        // slither-disable-next-line timestamp
        return block.timestamp > self.unlockTime;
    }

    function isExist(NewDeviceKey storage self) internal view returns (bool) {
        return self.unlockTime != 0 && self.deviceKey != address(0x00);
    }

    function reset(NewDeviceKey storage self) internal {
        self.unlockTime = 0;
        self.deviceKey = address(0x00);
    }
}
