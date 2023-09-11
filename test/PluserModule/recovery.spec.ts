import { expect } from "chai";
import { ethers } from "hardhat";
import type { HDNodeWallet } from "ethers";
import { getTestnetSignerBySender, Sender, setNextTime, setupTestEnv, TestEnv } from "../../utils/tests";
import { CREATE_RECOVERY_REQUEST_TYPE, DeployedAccountInfo, EXECUTE_RECOVERY_REQUEST_TYPE, PluserClient } from "../../utils/client";

const DAY = 24 * 60 * 60;
describe("PluserModule", () => {
    const provider = ethers.provider;

    const authKey: HDNodeWallet = ethers.Wallet.createRandom(provider);
    const sessionKey: HDNodeWallet = ethers.Wallet.createRandom(provider);

    let deployedAccountInfo: DeployedAccountInfo | undefined = undefined;

    let pluserClient: PluserClient | undefined = undefined;

    let env: TestEnv;

    beforeEach(async () => {
        env = await setupTestEnv();

        pluserClient = new PluserClient(env.factory);

        const deployer = await getTestnetSignerBySender(Sender.AccountsDeployer);
        deployedAccountInfo = await pluserClient!.deployAccount(authKey, sessionKey, deployer);
    });

    it("create-execute recovery request", async () => {
        // --- Create recovery request ---
        expect(await deployedAccountInfo!.pluserModule.recoveryNonce()).to.equal(0);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[0]).to.equal(ethers.ZeroAddress);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[1]).to.equal(0);

        const newSessionKey = ethers.Wallet.createRandom(provider);

        let sigTimestamp = Math.floor(Date.now() / 1000);

        const typehashValue = {
            newSessionKey: newSessionKey.address,
            nonce: await deployedAccountInfo!.pluserModule.recoveryNonce(),
            signTimestamp: sigTimestamp,
        };

        const authKeySignature = await authKey.signTypedData(
            pluserClient!.pluserModuleTypedData,
            CREATE_RECOVERY_REQUEST_TYPE,
            typehashValue,
        );

        const verifyerKey = await getTestnetSignerBySender(Sender.TwoFactorVerifyer);
        const verifyerSignature = await verifyerKey.signTypedData(
            pluserClient!.pluserModuleTypedData,
            CREATE_RECOVERY_REQUEST_TYPE,
            typehashValue,
        );

        const tx = await deployedAccountInfo!.pluserModule.createRecoveryRequest(
            newSessionKey.address,
            authKeySignature,
            verifyerSignature,
            sigTimestamp,
        );

        const txRes = await tx.wait();

        const requestCreatedLog = deployedAccountInfo!.pluserModule.interface.parseLog({
            data: txRes!.logs[0]!.data,
            topics: [...txRes!.logs[0]!.topics],
        });

        expect(requestCreatedLog!.name).to.equal("RequestCreated");
        expect(requestCreatedLog!.args!.getValue("newSessionKey")).to.equal(newSessionKey.address);

        const executionBlock = await provider!.getBlock(txRes!.blockNumber!);
        expect(await deployedAccountInfo!.pluserModule.recoveryNonce()).to.equal(1);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[0]).to.equal(newSessionKey.address);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[1]).to.equal(executionBlock!.timestamp + 3 * DAY);

        sigTimestamp = executionBlock!.timestamp + 3 * DAY + 1;

        // --- Wait ---
        setNextTime(sigTimestamp);

        // --- Execute recovery request ---

        const executeTypehashValue = {
            newSessionKey: newSessionKey.address,
            nonce: await deployedAccountInfo!.pluserModule.recoveryNonce(),
            signTimestamp: sigTimestamp,
        };

        const executeAuthKeySignature = await authKey.signTypedData(
            pluserClient!.pluserModuleTypedData,
            EXECUTE_RECOVERY_REQUEST_TYPE,
            executeTypehashValue,
        );

        const executeVerifyerSignature = await verifyerKey.signTypedData(
            pluserClient!.pluserModuleTypedData,
            EXECUTE_RECOVERY_REQUEST_TYPE,
            executeTypehashValue,
        );

        const executeTx = await deployedAccountInfo!.pluserModule.executeRecoveryRequest(
            executeAuthKeySignature,
            executeVerifyerSignature,
            sigTimestamp,
        );

        const executeTxRes = await executeTx.wait();

        const requestExecutedLog = executeTxRes!.logs.find((log) => {
            if (log.topics[0] === pluserClient!.pluserModule!.interface.getEvent("RequestExecuted").topicHash) {
                return true;
            }
        });

        const requestExecutedParsedLog = pluserClient!.pluserModule!.interface.parseLog({
            data: requestExecutedLog!.data,
            topics: [...requestExecutedLog!.topics],
        });

        expect(requestExecutedParsedLog!.name).to.equal("RequestExecuted");
        expect(requestExecutedParsedLog!.args!.getValue("newSessionKey")).to.equal(newSessionKey.address);

        expect(await deployedAccountInfo!.pluserModule.recoveryNonce()).to.equal(2);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[0]).to.equal(ethers.ZeroAddress);
        expect((await deployedAccountInfo!.pluserModule.recoveryRequest())[1]).to.equal(0);

        const sessionKeys = await deployedAccountInfo!.account.getOwners();
        expect(sessionKeys.length).to.equal(1);
        expect(sessionKeys[0]).to.equal(newSessionKey.address);
    });
});
