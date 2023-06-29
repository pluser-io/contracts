// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

library RecoveryRequest {
    struct NewSessionKey {
        address key;
        uint256 unlockTime;
    }

    function isUnlocked(NewSessionKey storage self) internal view returns (bool) {
        // slither-disable-next-line timestamp
        return block.timestamp > self.unlockTime;
    }

    function isExist(NewSessionKey storage self) internal view returns (bool) {
        return self.unlockTime != 0 && self.key != address(0x00);
    }

    function reset(NewSessionKey storage self) internal {
        self.unlockTime = 0;
        self.key = address(0x00);
    }
}
