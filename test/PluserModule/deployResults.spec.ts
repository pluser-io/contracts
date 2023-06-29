import { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { deployAccount, DeployedAccountInfo, setupTestEnv, TestEnv } from "../../utils/tests";
import type { Wallet } from "ethers";

describe("RecoveryManager: deploy results", () => {
    const authKey: Wallet = ethers.Wallet.createRandom();
    const deivceKey: Wallet = ethers.Wallet.createRandom();

    let env: TestEnv;
    let accountInfo: DeployedAccountInfo;

    beforeEach(async () => {
        env = await setupTestEnv();

        accountInfo = await deployAccount(authKey, deivceKey, env.factory, env.singleton);
    });

    it("verify public vars", async () => {
        // verify constants
        /*
           uint256 public constant SESSION_LIFETIME = 1 hours;
    uint256 public constant RECOVERY_TIME = 3 days;
    uint256 public constant SIGNATURE_LIFETIME = 15 minutes;
*/
        expect(await accountInfo.pluserModule.SESSION_LIFETIME()).to.equal(1 * 60 * 60);
        expect(await accountInfo.pluserModule.RECOVERY_TIME()).to.equal(3 * 24 * 60 * 60);
        expect(await accountInfo.pluserModule.SIGNATURE_LIFETIME()).to.equal(15 * 60);

        expect(await accountInfo.pluserModule.account()).to.equal(accountInfo.account.address);
        expect(await accountInfo.pluserModule.authKey()).to.equal(authKey.address);
        expect(await accountInfo.pluserModule.recoveryNonce()).to.equal(0);
        expect((await accountInfo.pluserModule.recoveryRequest())[0]).to.equal(ethers.constants.AddressZero);
        expect((await accountInfo.pluserModule.recoveryRequest())[1]).to.equal(0);
    });
});
