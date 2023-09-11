import { Factory, GnosisSafe, GnosisSafe__factory, PluserModule, PluserModule__factory } from "../typechain-types";
import { ethers } from "ethers";

export enum GnosisSafeOperation {
    CALL = 0,
    DELEGATECALL = 1,
}

export type DeployedAccountInfo = {
    account: GnosisSafe;
    pluserModule: PluserModule;
    txResult: ethers.TransactionReceipt;
    accountCreatedEvent: {
        account: string;
        authKey: string;
        sessionKey: string;
        pluserModule: string;
    };
};

export const CREATE_ACCOUNT_TYPE = {
    CreateAccount: [
        { name: "authKey", type: "address" },
        { name: "sessionKey", type: "address" },
    ],
};

export const EXECUTE_TRANSACTION_TYPE = {
    SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
    ],
};

export const CREATE_RECOVERY_REQUEST_TYPE = {
    CreateRecoveryRequest: [
        { name: "newSessionKey", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "signTimestamp", type: "uint256" },
    ],
};

export const EXECUTE_RECOVERY_REQUEST_TYPE = {
    ExecuteRecoveryRequest: [
        { name: "newSessionKey", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "signTimestamp", type: "uint256" },
    ],
};

export class PluserClient {
    public account: GnosisSafe | undefined;
    public pluserModule: PluserModule | undefined;
    public authKey: ethers.HDNodeWallet | undefined;
    public sessionKey: ethers.HDNodeWallet | undefined;

    public factoryTypedData: ethers.TypedDataDomain = {};
    public accountTypedData: ethers.TypedDataDomain = {};
    public pluserModuleTypedData: ethers.TypedDataDomain = {};

    constructor(private _factory: Factory) {
        this._factory.getAddress().then(
            (address) =>
                (this.factoryTypedData = {
                    name: "PluserFactory",
                    version: "1.0.0",
                    chainId: 31337,
                    verifyingContract: address,
                }),
        );
    }

    async deployAccount(
        userAuthKey: ethers.HDNodeWallet,
        userSessionKey: ethers.HDNodeWallet,
        deployerKey: ethers.HDNodeWallet,
    ): Promise<DeployedAccountInfo> {
        const accountSignature = await userAuthKey.signTypedData(this.factoryTypedData, CREATE_ACCOUNT_TYPE, {
            authKey: userAuthKey.address,
            sessionKey: userSessionKey.address,
        });

        const deployerSignature = await deployerKey.signTypedData(this.factoryTypedData, CREATE_ACCOUNT_TYPE, {
            authKey: userAuthKey.address,
            sessionKey: userSessionKey.address,
        });

        const createTransactionResponse = await (
            await this._factory.deploy(userAuthKey.address, userSessionKey.address, accountSignature, deployerSignature)
        ).wait();

        const accountCreatedEventTopicHash = this._factory.interface.getEvent("AccountCreated").topicHash;
        const accountCreatedLog = createTransactionResponse!.logs.find((log) => log.topics[0] === accountCreatedEventTopicHash);
        const accountCreatedLogArgs = this._factory.interface.parseLog({
            topics: [...accountCreatedLog!.topics],
            data: accountCreatedLog!.data,
        })!.args;

        const { authKey, sessionKey } = accountCreatedLogArgs;

        const accountAddress = accountCreatedLogArgs.getValue("account");
        const pluserModuleAddress = accountCreatedLogArgs.getValue("pluserModule");

        const account = GnosisSafe__factory.connect(accountAddress, deployerKey);
        const pluserModule = PluserModule__factory.connect(pluserModuleAddress, deployerKey);

        await this.setAccount(authKey, sessionKey, account, pluserModule);

        return {
            account: account,
            pluserModule: pluserModule,
            txResult: createTransactionResponse!,
            accountCreatedEvent: {
                account: accountAddress,
                authKey: authKey,
                sessionKey: sessionKey,
                pluserModule: pluserModuleAddress,
            },
        };
    }

    async setAccount(authKey: ethers.HDNodeWallet, sessionKey: ethers.HDNodeWallet, account: GnosisSafe, pluserModule: PluserModule) {
        this.account = account;
        this.pluserModule = pluserModule;
        this.sessionKey = sessionKey;
        this.authKey = authKey;

        this.accountTypedData = {
            chainId: 31337,
            verifyingContract: await account.getAddress(),
        };

        this.pluserModuleTypedData = {
            chainId: 31337,
            name: "PluserModule",
            version: "0.0.369",
            verifyingContract: await pluserModule.getAddress(),
        };
    }

    async signAndSendTransaction(
        to: string,
        value: ethers.BigNumberish,
        data: string,
        operation: GnosisSafeOperation,
        safeTxGas: ethers.BigNumberish,
        baseGas: ethers.BigNumberish,
        gasPrice: ethers.BigNumberish,
        gasToken: string,
        refundReceiver: string,
        nonce: ethers.BigNumberish,
        verifyerKey: ethers.HDNodeWallet,
    ): Promise<ethers.ContractTransactionReceipt> {
        if (!this.account) {
            throw new Error("Account not set");
        }

        const typehashValue = {
            to: to,
            value: value,
            data: data,
            operation: operation,
            safeTxGas: safeTxGas,
            baseGas: baseGas,
            gasPrice: gasPrice,
            gasToken: gasToken,
            refundReceiver: refundReceiver,
            nonce: nonce,
        };

        const accountSignature = ethers.Signature.from(
            await this.authKey!.signTypedData(this.accountTypedData, EXECUTE_TRANSACTION_TYPE, typehashValue),
        );

        const verifyerSignature = ethers.Signature.from(
            await verifyerKey.signTypedData(this.accountTypedData, EXECUTE_TRANSACTION_TYPE, typehashValue),
        );

        const tx = await this.account.execTransaction(
            to,
            value,
            data,
            Number(operation),
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            ethers.concat([accountSignature.serialized, verifyerSignature.serialized]),
        );

        return (await tx.wait())!;
    }

    async createRecoveryRequest(
        newSessionKey: ethers.AddressLike,
        verifyerKey: ethers.HDNodeWallet,
    ): Promise<ethers.ContractTransactionReceipt> {
        const signTimestamp = Math.floor(Date.now() / 1000);
        const typehashValue = {
            newSessionKey: newSessionKey,
            nonce: await this.pluserModule!.recoveryNonce(),
            signTimestamp: signTimestamp,
        };
        const authKeySignature = await this.authKey!.signTypedData(this.pluserModuleTypedData, CREATE_RECOVERY_REQUEST_TYPE, typehashValue);
        const verifyerSignature = await verifyerKey.signTypedData(this.pluserModuleTypedData, CREATE_RECOVERY_REQUEST_TYPE, typehashValue);

        const tx = await this.pluserModule!.createRecoveryRequest(newSessionKey, authKeySignature, verifyerSignature, signTimestamp);

        return (await tx.wait())!;
    }

    /*
    async cancelRecoveryRequest(newSessionKey: ethers.AddressLike, verifyerKey: ethers.HDNodeWallet): Promise<ethers.ContractTransactionReceipt> {
        const signTimestamp = Math.floor(Date.now() / 1000);
        const verifyerSignature = await this.authKey!.signTypedData(
            this._pluserModuleTypedData,
            CREATE_RECOVERY_REQUEST_TYPE,
            typehashValue,
        );

        const tx = await this.pluserModule!.createRecoveryRequest(newSessionKey, authKeySignature, verifyerSignature, signTimestamp);

        return (await tx.wait())!;
    }*/
}
