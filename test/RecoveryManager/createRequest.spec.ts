import { expect } from "chai";
import { config, ethers, getUnnamedAccounts } from "hardhat";
import { deployAccount, setupTestEnv, TestEnv } from "../../utils/tests";
import type { Signer, TypedDataDomain, Wallet } from "ethers";
import type { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import type { RecoveryManager } from "../../typechain-types";

const DAY = 24 * 60 * 60;
const typehashTypes = {
    CreateRequest: [
        { name: "key", type: "address" },
        { name: "nonce", type: "uint256" },
    ],
};

describe("RecoveryManager: create request", () => {
    let deployerAccount: Signer;
    const authKey: Wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const deivceKey: Wallet = ethers.Wallet.createRandom();

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

    it("createRequest", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: newDeviceKey.address,
            nonce: 1,
        });

        expect((await recoveryManager.request())[0]).to.be.eq(ethers.constants.AddressZero);
        expect((await recoveryManager.request())[1]).to.be.eq(0);
        expect(await recoveryManager.requestNonce()).to.be.eq(0);

        const res = await (await recoveryManager.createRequest(newDeviceKey.address, signature)).wait();
        expect(res.status).to.be.eq(1);

        const block = await ethers.provider.getBlock(res.blockNumber);
        expect((await recoveryManager.request())[0]).to.be.eq(newDeviceKey.address);
        expect((await recoveryManager.request())[1]).to.be.eq(block.timestamp + 3 * DAY);
        expect(await recoveryManager.requestNonce()).to.be.eq(1);
    });

    it("createRequest (invalid sign)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner.signMessage("invalid");

        await expect(recoveryManager.createRequest(newDeviceKey.address, signature)).to.be.revertedWith("GS026");
    });

    it("createRequest (invalid nonce)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: newDeviceKey.address,
            nonce: 100,
        });

        await expect(recoveryManager.createRequest(newDeviceKey.address, signature)).to.be.revertedWith("GS026");
    });

    it("createRequest (invalid key)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: newDeviceKey.address,
            nonce: 1,
        });

        await expect(recoveryManager.createRequest(ethers.Wallet.createRandom().address, signature)).to.be.revertedWith("GS026");
    });

    it("createRequest (request alrady exist)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: newDeviceKey.address,
            nonce: 1,
        });

        const res = await (await recoveryManager.createRequest(newDeviceKey.address, signature)).wait();

        expect(res.status).to.be.eq(1);
        await expect(recoveryManager.createRequest(newDeviceKey.address, signature)).to.be.revertedWith(
            "RequestManager: Request already exists",
        );
    });

    it("createRequest (owner exist)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: deivceKey.address,
            nonce: 1,
        });

        await expect(recoveryManager.createRequest(newDeviceKey.address, signature)).to.be.revertedWith("GS026");
    });

    it("createRequest (invalid sender)", async () => {
        const newDeviceKey: Wallet = ethers.Wallet.createRandom();

        const signature = await twoFactorOwner._signTypedData(domain, typehashTypes, {
            key: newDeviceKey.address,
            nonce: 1,
        });

        await expect(recoveryManager.connect(deployerAccount).createRequest(newDeviceKey.address, signature)).to.be.revertedWith(
            "RequestManager: Permission denied",
        );
    });
});
