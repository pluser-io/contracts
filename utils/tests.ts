import { keccak256 } from "ethers/lib/utils";
import { deployments, ethers } from "hardhat";
import type { Deploy, Factory, GnosisSafe, PluserModule } from "../typechain-types";
import type { Event, Wallet } from "ethers";
import { assert } from "chai";

enum GnosisOperation {
    CALL = 0,
    DELEGATECALL = 1,
}

type TestEnv = {
    factory: Factory;
    deploy: Deploy;
};

type DeployedAccountInfo = {
    account: GnosisSafe;
    pluserModule: PluserModule;
};

const setupTestEnv = async () =>
    deployments.createFixture(async ({ deployments, ethers }): Promise<TestEnv> => {
        process.env = {
            ...process.env,
            ACCOUNT_DEPLOYER: (await ethers.getSigners())[0]!.address,
        };
        await deployments.fixture();

        const deploy = (await ethers.getContractAt("Deploy", (await deployments.get("Deploy")).address)) as Deploy;

        const factory = (await ethers.getContractAt("Factory", await deploy.factory())) as Factory;

        return {
            factory: factory,
            deploy: deploy,
        };
    })();

const deployAccount = async (accountAuthKey: Wallet, accountDeivceKey: Wallet, factory: Factory): Promise<DeployedAccountInfo> => {
    const signatures = await accountAuthKey._signTypedData(
        {
            name: "PluserFactory",
            version: "1.0.0",
            chainId: 31337,
            verifyingContract: factory.address,
        },
        {
            CreateAccount: [
                { name: "authKey", type: "address" },
                { name: "sessionKey", type: "address" },
            ],
        },
        {
            authKey: accountAuthKey.address,
            sessionKey: accountDeivceKey.address,
        },
    );

    const res = await (await factory.deploy(accountAuthKey.address, accountDeivceKey.address, signatures)).wait();

    const accountCreatedLog = res.events!.find((event: Event) => {
        if (event.event === "AccountCreated") {
            return true;
        }
    });

    const { authKey, account, sessionKey, pluserModule } = accountCreatedLog!.args!;
    const accountCreatedEvent = {
        authKey: authKey,
        account: account,
        sessionKey: sessionKey,
        pluserModule: pluserModule,
    };

    assert(sessionKey.toLowerCase() === accountDeivceKey.address.toLowerCase());

    const accountContract = (await ethers.getContractAt("GnosisSafe", accountCreatedEvent.account)) as GnosisSafe;
    const pluserModuleContract = (await ethers.getContractAt("PluserModule", accountCreatedEvent.pluserModule)) as PluserModule;

    return {
        account: accountContract,
        pluserModule: pluserModuleContract,
    };
};

const signGnosisSafe = async (key: Wallet, data: string): Promise<string> => {
    const signature = await key._signingKey().signDigest(keccak256(data));

    let vString = signature.v.toString(16);
    if (vString.length === 1) {
        vString = "0" + vString;
    }

    return "0x" + signature.r.substring(2) + signature.s.substring(2) + vString;
};

const concatSignatures = (signatures: string[]): string => {
    let result = "0x";
    for (let i = 0; i < signatures.length; i++) {
        result += signatures[i]!.substring(2);
    }
    return result;
};

const setNextTime = async (time: number) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [time]);
    await ethers.provider.send("evm_mine", []);
};

export { GnosisOperation, TestEnv, DeployedAccountInfo, concatSignatures, signGnosisSafe, deployAccount, setupTestEnv, setNextTime };
