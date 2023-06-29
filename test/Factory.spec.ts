import { expect } from "chai";
import { ethers, getUnnamedAccounts } from "hardhat";
import { setupTestEnv, TestEnv } from "../utils/tests";
import type { Event, Wallet } from "ethers";
import type { GnosisSafe } from "../typechain-types";

describe("Factory", () => {
    const authKey: Wallet = ethers.Wallet.createRandom();
    const sessionKey: Wallet = ethers.Wallet.createRandom();

    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();
    });

    it("deploy", async () => {
        const signatures = await authKey._signTypedData(
            {
                name: "PluserFactory",
                version: "1.0.0",
                chainId: 31337,
                verifyingContract: env.factory.address,
            },
            {
                CreateAccount: [
                    { name: "authKey", type: "address" },
                    { name: "sessionKey", type: "address" },
                ],
            },
            {
                authKey: authKey.address,
                sessionKey: sessionKey.address,
            },
        );

        const res = await (await env.factory.deploy(authKey.address, deivceKey.address, signatures)).wait();

        const accountCreatedLog = res.events!.find((event: Event) => {
            if (event.event === "AccountCreated") {
                return true;
            }
        });

        const accountCreatedEvent = {
            authKey: accountCreatedLog!.args![0],
            account: accountCreatedLog!.args![1],
            deivceKey: accountCreatedLog!.args![2],
            recoveryManager: accountCreatedLog!.args![3],
        };

        const account = (await ethers.getContractAt("GnosisSafe", accountCreatedEvent.account)) as GnosisSafe;

        expect(accountCreatedEvent.authKey, "Verify authKey").to.equal(authKey.address);

        expect(accountCreatedEvent.deivceKey, "Verify deviceKeys").to.equal(deivceKey.address);
        expect(await account.isOwner(deivceKey.address), "Verify owners").to.true;
        expect((await account.getOwners()).length, "Verify owners count").to.equal(1);

        expect(await account.isModuleEnabled(accountCreatedEvent.recoveryManager), "Check RecoveryManager module").to.true;
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
