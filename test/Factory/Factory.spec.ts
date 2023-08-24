import { expect } from "chai";
import { ethers, getUnnamedAccounts } from "hardhat";
import type { Wallet } from "ethers";
import { getTestnetSignerBySender, Sender, setupTestEnv, TestEnv } from "../../utils/tests";
import { PluserClient } from "../../utils/client";

describe("Factory", () => {
    const authKey: Wallet = ethers.Wallet.createRandom();
    const sessionKey: Wallet = ethers.Wallet.createRandom();

    let pluserClient: PluserClient | undefined = undefined;

    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();

        pluserClient = new PluserClient(env.factory);
    });

    it("deploy account", async () => {
        const deployer = await getTestnetSignerBySender(Sender.AccountsDeployer);

        const deployedAccountInfo = await pluserClient!.deployAccount(authKey, sessionKey, deployer);

        expect(deployedAccountInfo.accountCreatedEvent.authKey, "Verify authKey").to.equal(authKey.address);

        expect(deployedAccountInfo.accountCreatedEvent.sessionKey, "Verify sessionKey").to.equal(sessionKey.address);

        expect(await deployedAccountInfo.account.isOwner(sessionKey.address), "Verify owners").to.true;

        expect((await deployedAccountInfo.account.getOwners()).length, "Verify owners count").to.equal(1);

        expect(await deployedAccountInfo.account.isModuleEnabled(accountInfo.accountCreatedEvent.pluserModule), "Check PluserModule module")
            .to.true;

        const userAccountAddress = await accountInfo.pluserModule.account();
        expect(userAccountAddress).to.equal(accountInfo.account.address);

        expect(await deployedAccountInfo.pluserModule.factory()).to.equal(env.factory.address);
        expect(await deployedAccountInfo.pluserModule.authKey()).to.equal(authKey.address);

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
