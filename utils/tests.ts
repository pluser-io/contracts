import { keccak256 } from "ethers/lib/utils";
import { deployments, ethers } from "hardhat";
import type { Deploy, Factory, GnosisSafe, RecoveryManager } from "../typechain-types";
import type { Event, Wallet } from "ethers";

enum GnosisOperation {
    CALL = 0,
    DELEGATECALL = 1,
}

type TestEnv = {
    factory: Factory;
    singleton: GnosisSafe;
};

type DeployedAccountInfo = {
    account: GnosisSafe;
    recoveryManager: RecoveryManager;
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

        const singleton = (await ethers.getContractAt("Singleton", await deploy.gnosisSingleton())) as GnosisSafe;

        return {
            factory: factory,
            singleton: singleton,
        };
    })();

const deployAccount = async (
    accountAuthKey: Wallet,
    accountDeivceKey: Wallet,
    factory: Factory,
    singleton: GnosisSafe,
): Promise<DeployedAccountInfo> => {
    const signatures = await accountAuthKey._signTypedData(
        {
            name: "PluserFactory",
            version: "1",
            chainId: 31337,
            verifyingContract: factory.address,
        },
        {
            CreateAccount: [
                { name: "authKey", type: "address" },
                { name: "deviceKey", type: "address" },
            ],
        },
        {
            singleton: singleton.address,
            authKey: accountAuthKey.address,
            deviceKey: accountDeivceKey.address,
        },
    );

    const res = await (await factory.deploy(accountAuthKey.address, accountDeivceKey.address, signatures)).wait();

    const accountCreatedLog = res.events!.find((event: Event) => {
        if (event.event === "AccountCreated") {
            return true;
        }
    });

    const { authKey, account, deivceKey, recoveryManager } = accountCreatedLog!.args!;
    const accountCreatedEvent = {
        authKey: authKey,
        account: account,
        deivceKey: deivceKey,
        recoveryManager: recoveryManager,
    };

    const accountContract = (await ethers.getContractAt("GnosisSafe", accountCreatedEvent.account)) as GnosisSafe;
    const recoveryManagerContract = (await ethers.getContractAt("RecoveryManager", accountCreatedEvent.recoveryManager)) as RecoveryManager;

    return {
        account: accountContract,
        recoveryManager: recoveryManagerContract,
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
