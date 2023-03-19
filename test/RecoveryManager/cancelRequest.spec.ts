import { expect } from "chai";
import { config, ethers, getUnnamedAccounts } from "hardhat";
import { deployAccount, setupTestEnv, TestEnv } from "../../utils/tests";
import type { Signer, TypedDataDomain, Wallet } from "ethers";
import type { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import type { RecoveryManager } from "../../typechain-types";

const DAY = 24 * 60 * 60;
const createRequestTypes = {
    CreateRequest: [
        { name: "key", type: "address" },
        { name: "nonce", type: "uint256" },
    ],
};
const cancelRequestTypes = {
    CancelRequest: [
        { name: "key", type: "address" },
        { name: "unlockTime", type: "uint256" },
        { name: "nonce", type: "uint256" },
    ],
};

describe("RecoveryManager: cancel request", () => {
    let deployerAccount: Signer;
    const authKey: Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const deivceKey: Wallet = ethers.Wallet.createRandom();
    const newDeviceKey: Wallet = ethers.Wallet.createRandom();

    let env: TestEnv;
    let twoFactorOwner: Wallet;

    let recoveryManager: RecoveryManager;

    let domain: TypedDataDomain;

    before(async () => {
        const accounts = await getUnnamedAccounts();

        const deployerAccountAddress = accounts[0];
        if (deployerAccountAddress === undefined) {
            throw new Error("No accounts");
        }

        deployerAccount = await ethers.getSigner(deployerAccountAddress);

        const accountsFromConfig = <HardhatNetworkHDAccountsConfig>config.networks.hardhat.accounts;
        twoFactorOwner = ethers.Wallet.fromMnemonic(accountsFromConfig.mnemonic, accountsFromConfig.path + `/1`);
    });

    beforeEach(async () => {
        env = await setupTestEnv();

        const accountInfo = await deployAccount(authKey, deivceKey, env.factory, env.singleton);

        recoveryManager = accountInfo.recoveryManager.connect(authKey);

        domain = {
            name: "RecoveryManager",
            version: "1",
            chainId: 31337,
            verifyingContract: recoveryManager.address,
        };

        await (
            await deployerAccount.sendTransaction({
                to: authKey.address,
                value: ethers.utils.parseEther("1"),
            })
        ).wait();
    });

    const createRequest = async (newDeviceKey: Wallet): Promise<number> => {
        const signature = await twoFactorOwner._signTypedData(domain, createRequestTypes, {
            key: newDeviceKey.address,
            nonce: 1,
        });

        expect((await recoveryManager.request())[0]).to.be.eq(ethers.constants.AddressZero);
        expect((await recoveryManager.request())[1]).to.be.eq(0);
        expect(await recoveryManager.requestNonce()).to.be.eq(0);

        const createRqRes = await (await recoveryManager.createRequest(newDeviceKey.address, signature)).wait();
        const block = await ethers.provider.getBlock(createRqRes.blockNumber);

        expect((await recoveryManager.request())[0]).to.be.eq(newDeviceKey.address);
        expect((await recoveryManager.request())[1]).to.be.eq(block.timestamp + 3 * DAY);
        expect(await recoveryManager.requestNonce()).to.be.eq(1);

        const unlockTime = block.timestamp + 3 * DAY;
        return unlockTime;
    };

    it("cancelRequest", async () => {
        const unlockTime = await createRequest(newDeviceKey);
        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: newDeviceKey.address,
            unlockTime: unlockTime,
            nonce: 2,
        });

        await (await recoveryManager.cancelRequest(signatureCancel)).wait();

        expect((await recoveryManager.request())[0]).to.be.eq(ethers.constants.AddressZero);
        expect((await recoveryManager.request())[1]).to.be.eq(0);
        expect(await recoveryManager.requestNonce()).to.be.eq(2);
    });

    it("cancelRequest (invalid sign)", async () => {
        await createRequest(newDeviceKey);

        const signatureCancel = await twoFactorOwner.signMessage("invalid sign");

        await expect(recoveryManager.cancelRequest(signatureCancel)).to.be.revertedWith("GS026");
    });

    it("cancelRequest (invalid nonce)", async () => {
        const unlockTime = await createRequest(newDeviceKey);

        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: newDeviceKey.address,
            unlockTime: unlockTime,
            nonce: 100,
        });

        await expect(recoveryManager.cancelRequest(signatureCancel)).to.be.revertedWith("GS026");
    });

    it("cancelRequest (invalid key)", async () => {
        const unlockTime = await createRequest(newDeviceKey);

        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: deivceKey.address,
            unlockTime: unlockTime,
            nonce: 2,
        });

        await expect(recoveryManager.cancelRequest(signatureCancel)).to.be.revertedWith("GS026");
    });

    it("cancelRequest (invalid unlockTime)", async () => {
        await createRequest(newDeviceKey);

        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: newDeviceKey.address,
            unlockTime: 123,
            nonce: 2,
        });

        await expect(recoveryManager.cancelRequest(signatureCancel)).to.be.revertedWith("GS026");
    });

    it("cancelRequest (RequestManager: Request not exists)", async () => {
        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: newDeviceKey.address,
            unlockTime: 120,
            nonce: 1,
        });

        await expect(recoveryManager.cancelRequest(signatureCancel)).to.be.revertedWith("RequestManager: Request not exists");
    });

    it("cancelRequest (invalid sender)", async () => {
        const unlockTime = await createRequest(newDeviceKey);
        const signatureCancel = await twoFactorOwner._signTypedData(domain, cancelRequestTypes, {
            key: newDeviceKey.address,
            unlockTime: unlockTime,
            nonce: 2,
        });

        await expect(recoveryManager.connect(deployerAccount).cancelRequest(signatureCancel)).to.be.revertedWith(
            "RequestManager: Permission denied",
        );
    });
});
