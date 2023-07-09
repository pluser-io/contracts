import { expect } from "chai";
import { ethers, getUnnamedAccounts } from "hardhat";
import type { Wallet } from "ethers";
import { setupTestEnv, TestEnv, deployAccount, getLastTimestamp } from "../../utils/tests";

describe("Factory", () => {
    const authKey: Wallet = ethers.Wallet.createRandom();
    const sessionKey: Wallet = ethers.Wallet.createRandom();

    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();
    });

    it("deploy account", async () => {
        const accountInfo = await deployAccount(authKey, sessionKey, env.factory);

        expect(accountInfo.accountCreatedEvent.authKey, "Verify authKey").to.equal(authKey.address);

        expect(accountInfo.accountCreatedEvent.sessionKey, "Verify sessionKey").to.equal(sessionKey.address);

        expect(await accountInfo.account.isOwner(sessionKey.address), "Verify owners").to.true;

        expect((await accountInfo.account.getOwners()).length, "Verify owners count").to.equal(1);

        expect(await accountInfo.account.isModuleEnabled(accountInfo.accountCreatedEvent.pluserModule), "Check PluserModule module").to
            .true;

        //       emit ChangedGuard(guard);
        expect(accountInfo.guard, "Check PluserGuard module").to.eq(accountInfo.accountCreatedEvent.pluserModule);

        const sessionLifetime = (await accountInfo.pluserModule.SESSION_LIFETIME()).toNumber();
        expect(sessionLifetime).to.equal(1 * 60 * 60);
        expect(await accountInfo.pluserModule.RECOVERY_TIME()).to.equal(3 * 24 * 60 * 60);
        expect(await accountInfo.pluserModule.SIGNATURE_LIFETIME()).to.equal(15 * 60);

        const userAccountAddress = await accountInfo.pluserModule.account();
        expect(userAccountAddress).to.equal(accountInfo.account.address);
        expect(await accountInfo.pluserModule.factory()).to.equal(env.factory.address);
        expect(await accountInfo.pluserModule.authKey()).to.equal(authKey.address);

        const lastTimestamp = await getLastTimestamp();
        expect(await accountInfo.pluserModule.timeoutBySessionKey(accountInfo.accountCreatedEvent.sessionKey)).to.eq(
            lastTimestamp + sessionLifetime,
        );

        expect(await accountInfo.pluserModule.recoveryNonce()).to.equal(0);
        expect((await accountInfo.pluserModule.recoveryRequest())[0]).to.equal(ethers.constants.AddressZero);
        expect((await accountInfo.pluserModule.recoveryRequest())[1]).to.equal(0);
    });

    it("deploy with wrong signature", async () => {
        const signatures = await authKey.signMessage("wrong signature");

        await expect(env.factory.deploy(authKey.address, sessionKey.address, signatures)).to.be.revertedWith("Invalid signature (authKey)");
    });

    it("deploy with wrong owner", async () => {
        const accounts = await getUnnamedAccounts();

        const signatures = await authKey.signMessage("wrong signature");

        await expect(
            env.factory.connect(await ethers.getSigner(accounts[1]!)).deploy(authKey.address, sessionKey.address, signatures),
        ).to.be.revertedWith("Not a deployer");
    });
});
