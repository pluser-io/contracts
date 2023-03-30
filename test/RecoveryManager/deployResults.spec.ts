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
        expect(await accountInfo.recoveryManager.REQUEST_TIMEOUT()).to.equal(3 * 24 * 60 * 60);
        expect(await accountInfo.recoveryManager.wallet()).to.equal(accountInfo.account.address);
        expect(await accountInfo.recoveryManager.authKey()).to.equal(authKey.address);
        expect(await accountInfo.recoveryManager.nonce()).to.equal(0);
        expect((await accountInfo.recoveryManager.request())[0]).to.equal(ethers.constants.AddressZero);
        expect((await accountInfo.recoveryManager.request())[1]).to.equal(0);
    });
});
