import { expect } from "chai";
import { config, ethers, getUnnamedAccounts } from "hardhat";
import { deployAccount, setNextTime, setupTestEnv, TestEnv } from "../../utils/tests";
import type { Signer, TypedDataDomain, Wallet } from "ethers";
import type { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import type { GnosisSafe, RecoveryManager } from "../../typechain-types";

const DAY = 24 * 60 * 60;
const createRequestTypes = {
    CreateRequest: [
        { name: "key", type: "address" },
        { name: "nonce", type: "uint256" },
    ],
};

describe("RecoveryManager: addDevice", () => {
    let deployerAccount: Signer;
    const authKey: Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const deivceKey: Wallet = ethers.Wallet.createRandom();
    const newDeviceKey: Wallet = ethers.Wallet.createRandom();

    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();
    });

    before(async () => {
        const accounts = await getUnnamedAccounts();

        const deployerAccountAddress = accounts[0];
        if (deployerAccountAddress === undefined) {
            throw new Error("No accounts");
        }
        deployerAccount = await ethers.getSigner(deployerAccountAddress);
    });

    it("add", async () => {
        const account = await deployAccount(authKey, deivceKey, env.factory, env.singleton);

        const sign = await deivceKey._signTypedData(
            {
                name: "RecoveryManager",
                version: "1",
                chainId: 31337,
                verifyingContract: account.recoveryManager.address,
            },
            {
                AddDevice: [
                    { name: "newDeviceKey", type: "address" },
                    { name: "nonce", type: "uint256" },
                ],
            },
            {
                newDeviceKey: newDeviceKey.address,
                nonce: await account.recoveryManager.nonce(),
            },
        );

        await (
            await deployerAccount.sendTransaction({
                to: authKey.address,
                value: ethers.utils.parseEther("1"),
            })
        ).wait();

        const tx = await account.recoveryManager.connect(authKey).addDevice(sign, newDeviceKey.address);

        await tx.wait();
    });
});
