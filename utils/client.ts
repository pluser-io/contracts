import { Factory, GnosisSafe, PluserModule } from "../typechain-types";
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

const CREATE_ACCOUNT_TYPE = {
    CreateAccount: [
        { name: "authKey", type: "address" },
        { name: "sessionKey", type: "address" },
    ],
};

const EXECUTE_TRANSACTION_TYPE = {
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

const CREATE_RECOVERY_REQUEST_TYPE = {
    CreateRecoveryRequest: [
        { name: "newSessionKey", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "signTimestamp", type: "uint256" },
    ],
};

export class PluserClient {
    public account: GnosisSafe | undefined;
    public pluserModule: PluserModule | undefined;
    public authKey: ethers.Wallet | undefined;
    public sessionKey: ethers.Wallet | undefined;

    private _factoryTypedData: ethers.TypedDataDomain = {};
    private _accountTypedData: ethers.TypedDataDomain = {};
    private _pluserModuleTypedData: ethers.TypedDataDomain = {};

    constructor(private _factory: Factory) {
        this._factory.getAddress().then(
            (address) =>
                (this._factoryTypedData = {
                    name: "PluserFactory",
                    version: "1.0.0",
                    chainId: 31337,
                    verifyingContract: address,
                }),
        );
    }

    async deployAccount(
        userAuthKey: ethers.Wallet,
        userSessionKey: ethers.Wallet,
        deployerKey: ethers.Wallet,
    ): Promise<DeployedAccountInfo> {
        const accountSignature = await userAuthKey.signTypedData(this._factoryTypedData, CREATE_ACCOUNT_TYPE, {
            authKey: userAuthKey.address,
            sessionKey: userSessionKey.address,
        });

        const deployerSignature = await deployerKey.signTypedData(this._factoryTypedData, CREATE_ACCOUNT_TYPE, {
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

        const { account, pluserModule, authKey, sessionKey } = accountCreatedLogArgs;

        await this.setAccount(authKey, sessionKey, account, pluserModule);

        return {
            account: account,
            pluserModule: pluserModule,
            txResult: createTransactionResponse!,
            accountCreatedEvent: {
                account: account,
                authKey: authKey,
                sessionKey: sessionKey,
                pluserModule: pluserModule,
            },
        };
    }

    async setAccount(authKey: ethers.Wallet, sessionKey: ethers.Wallet, account: GnosisSafe, pluserModule: PluserModule) {
        this.account = account;
        this.pluserModule = pluserModule;
        this.sessionKey = sessionKey;
        this.authKey = authKey;

        this._accountTypedData = {
            chainId: 31337,
            verifyingContract: await account.getAddress(),
        };

        this._pluserModuleTypedData = {
            chainId: 31337,
            name: "PluserModule",
            version: "0.0.369",
            verifyingContract: await pluserModule.getAddress(),
        };
    }

    async signAndsendTransaction(
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
        verifyerKey: ethers.Wallet,
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
            await this.authKey!.signTypedData(this._accountTypedData, EXECUTE_TRANSACTION_TYPE, typehashValue),
        );

        const verifyerSignature = ethers.Signature.from(
            await verifyerKey.signTypedData(this._accountTypedData, EXECUTE_TRANSACTION_TYPE, typehashValue),
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

    async createRecoveryRequest(newSessionKey: ethers.AddressLike, verifyerKey: ethers.Wallet): Promise<ethers.ContractTransactionReceipt> {
        const signTimestamp = Math.floor(Date.now() / 1000);
        const typehashValue = {
            newSessionKey: newSessionKey,
            nonce: await this.pluserModule!.recoveryNonce(),
            signTimestamp: signTimestamp,
        };
        const authKeySignature = await this.authKey!.signTypedData(
            this._pluserModuleTypedData,
            CREATE_RECOVERY_REQUEST_TYPE,
            typehashValue,
        );
        const verifyerSignature = await verifyerKey.signTypedData(this._pluserModuleTypedData, CREATE_RECOVERY_REQUEST_TYPE, typehashValue);

        const tx = await this.pluserModule!.createRecoveryRequest(newSessionKey, authKeySignature, verifyerSignature, signTimestamp);

        return (await tx.wait())!;
    }

    /*
    async cancelRecoveryRequest(newSessionKey: ethers.AddressLike, verifyerKey: ethers.Wallet): Promise<ethers.ContractTransactionReceipt> {
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
