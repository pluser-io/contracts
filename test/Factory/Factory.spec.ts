import { expect } from "chai";
import { ethers } from "hardhat";
import type { Wallet } from "ethers";
import { getTestnetSignerBySender, Sender, setupTestEnv, TestEnv } from "../../utils/tests";
import { PluserClient } from "../../utils/client";

describe("Factory", () => {
    const provider = ethers.provider;

    const authKey: Wallet = ethers.Wallet.createRandom(provider);
    const sessionKey: Wallet = ethers.Wallet.createRandom(provider);

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

        expect(
            await deployedAccountInfo.account.isModuleEnabled(deployedAccountInfo.accountCreatedEvent.pluserModule),
            "Check PluserModule module",
        ).to.true;

        const userAccountAddress = await deployedAccountInfo.pluserModule.account();
        expect(userAccountAddress).to.equal(await deployedAccountInfo.account.getAddress());

        expect(await deployedAccountInfo.pluserModule.factory()).to.equal(await env.factory.getAddress());
        expect(await deployedAccountInfo.pluserModule.authKey()).to.equal(authKey.address);

        expect(await deployedAccountInfo.pluserModule.recoveryNonce()).to.equal(0);
        expect((await deployedAccountInfo.pluserModule.recoveryRequest())[0]).to.equal(ethers.ZeroAddress);
        expect((await deployedAccountInfo.pluserModule.recoveryRequest())[1]).to.equal(0);
    });

    it("deploy with wrong signature", async () => {
        const signatures = await authKey.signMessage("wrong signature");

        await expect(env.factory.deploy(authKey.address, sessionKey.address, signatures, signatures)).to.be.revertedWith(
            "Invalid signature (authKey)",
        );
    });
});
