import { expect } from "chai";
import { config, ethers, getUnnamedAccounts } from "hardhat";
import { concatSignatures, deployAccount, GnosisOperation, setupTestEnv, signGnosisSafe, TestEnv } from "../utils/tests";
import type { GnosisSafe } from "../typechain-types";
import type { Signer, Wallet } from "ethers";
import type { HardhatNetworkHDAccountsConfig } from "hardhat/types";

describe("TwoFactorGuard", () => {
    let deployerAccount: Signer;
    let twoFactorOwner: Wallet;
    const authKey: Wallet = ethers.Wallet.createRandom();
    const deivceKey: Wallet = ethers.Wallet.createRandom();
    let account: GnosisSafe;

    let env: TestEnv;

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

        account = (await deployAccount(authKey, deivceKey, env.factory, env.singleton)).account;

        await (
            await deployerAccount.sendTransaction({
                to: account.address,
                value: ethers.utils.parseEther("1"),
            })
        ).wait();
    });

    it("execute", async () => {
        const receiver = ethers.Wallet.createRandom();
        const tx = {
            to: receiver.address,
            value: ethers.utils.parseEther("1"),
            data: new Array(0),
            operation: GnosisOperation.CALL,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: ethers.constants.AddressZero,
            refundReceiver: ethers.constants.AddressZero,
            nonce: 0,
        };

        const data = await account.encodeTransactionData(
            tx.to,
            tx.value,
            tx.data,
            tx.operation,
            tx.safeTxGas,
            tx.baseGas,
            tx.gasPrice,
            tx.gasToken,
            tx.refundReceiver,
            tx.nonce,
        );

        await account.execTransaction(
            tx.to,
            tx.value,
            tx.data,
            tx.operation,
            tx.safeTxGas,
            tx.baseGas,
            tx.gasPrice,
            tx.gasToken,
            tx.refundReceiver,
            concatSignatures([await signGnosisSafe(deivceKey, data), await signGnosisSafe(twoFactorOwner, data)]),
        );
    });

    it("execute (invalid length of twoFactorSignatures)", async () => {
        const receiver = ethers.Wallet.createRandom();
        const tx = {
            to: receiver.address,
            value: ethers.utils.parseEther("1"),
            data: new Array(0),
            operation: GnosisOperation.CALL,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: ethers.constants.AddressZero,
            refundReceiver: ethers.constants.AddressZero,
            nonce: 0,
        };

        const data = await account.encodeTransactionData(
            tx.to,
            tx.value,
            tx.data,
            tx.operation,
            tx.safeTxGas,
            tx.baseGas,
            tx.gasPrice,
            tx.gasToken,
            tx.refundReceiver,
            tx.nonce,
        );

        await expect(
            account.execTransaction(
                tx.to,
                tx.value,
                tx.data,
                tx.operation,
                tx.safeTxGas,
                tx.baseGas,
                tx.gasPrice,
                tx.gasToken,
                tx.refundReceiver,
                await signGnosisSafe(deivceKey, data),
            ),
        ).to.revertedWith("TwoFactorGuard: Not enough signatures");
    });

    it("execute (invalid twoFactorSignatures)", async () => {
        const receiver = ethers.Wallet.createRandom();
        const tx = {
            to: receiver.address,
            value: ethers.utils.parseEther("1"),
            data: new Array(0),
            operation: GnosisOperation.CALL,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: ethers.constants.AddressZero,
            refundReceiver: ethers.constants.AddressZero,
            nonce: 0,
        };

        const data = await account.encodeTransactionData(
            tx.to,
            tx.value,
            tx.data,
            tx.operation,
            tx.safeTxGas,
            tx.baseGas,
            tx.gasPrice,
            tx.gasToken,
            tx.refundReceiver,
            tx.nonce,
        );

        await expect(
            account.execTransaction(
                tx.to,
                tx.value,
                tx.data,
                tx.operation,
                tx.safeTxGas,
                tx.baseGas,
                tx.gasPrice,
                tx.gasToken,
                tx.refundReceiver,
                concatSignatures([await signGnosisSafe(deivceKey, data), await signGnosisSafe(receiver, data)]),
            ),
        ).to.revertedWith("GS026");
    });

    it("execute (invalid call type - DELEGATECALL)", async () => {
        const receiver = ethers.Wallet.createRandom();
        const tx = {
            to: receiver.address,
            value: ethers.utils.parseEther("1"),
            data: new Array(0),
            operation: GnosisOperation.DELEGATECALL,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: ethers.constants.AddressZero,
            refundReceiver: ethers.constants.AddressZero,
            nonce: 0,
        };

        const data = await account.encodeTransactionData(
            tx.to,
            tx.value,
            tx.data,
            tx.operation,
            tx.safeTxGas,
            tx.baseGas,
            tx.gasPrice,
            tx.gasToken,
            tx.refundReceiver,
            tx.nonce,
        );

        await expect(
            account.execTransaction(
                tx.to,
                tx.value,
                tx.data,
                tx.operation,
                tx.safeTxGas,
                tx.baseGas,
                tx.gasPrice,
                tx.gasToken,
                tx.refundReceiver,
                await signGnosisSafe(deivceKey, data),
            ),
        ).to.revertedWith("TwoFactorGuard: Only calls are allowed");
    });
});

//TODO: assembly logic with n threshold
// verify constructor
