import { keccak256 } from "ethers/lib/utils";
import { deployments, ethers } from "hardhat";
import { Signer } from "ethers";
import { GnosisSafe__factory, type DeployHelper, type Factory, type GnosisSafe, type PluserModule } from "../typechain-types";
import type { Event, Wallet } from "ethers";
import { assert } from "chai";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deploy } from "../typechain-types/contracts/Deploy";

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
    accountCreatedEvent: {
        authKey: string;
        account: string;
        sessionKey: string;
        pluserModule: string;
    };
    guard: string;
};

export enum Sender {
    ContractsDeployer,
    TwoFactorVerifyer,
    AccountsDeployer,
    User,
}

export const getSignerAddressBySender = async (sender: Sender, hre: HardhatRuntimeEnvironment): Promise<string> => {
    const signers = await ethers.getSigners();
    let address;

    switch (sender) {
        case Sender.ContractsDeployer:
            if (signers.length <= 0 || !signers[0]) {
                throw new Error("invalid signer");
            }

            address = await signers[0].getAddress();
            break;
        case Sender.TwoFactorVerifyer:
            if (hre.network.name === "hardhat") {
                const signer = await getTestnetSignerBySender(Sender.TwoFactorVerifyer);
                address = await signer.getAddress();
            } else {
                address = process.env["TWO_FACTOR_VERIFYER"];
            }

            break;
        case Sender.AccountsDeployer:
            if (hre.network.name === "hardhat") {
                const signer = await getTestnetSignerBySender(Sender.AccountsDeployer);
                address = await signer.getAddress();
            } else {
                address = process.env["ACCOUNTS_DEPLOYER"];
            }
            break;
        default:
            throw new Error("invalid sender address");
    }

    if (!address) {
        throw new Error("invalid sender address");
    }
    return address;
};

export const getTestnetSignerBySender = async (sender: Sender): Promise<Signer> => {
    const signers = await ethers.getSigners();

    let i = 0;
    switch (sender) {
        case Sender.ContractsDeployer:
            i = 0;
            break;
        case Sender.TwoFactorVerifyer:
            i = 1;
            break;
        case Sender.AccountsDeployer:
            i = 2;
            break;
        case Sender.User:
            i = 3;
            break;
        default:
            throw new Error("invalid sender");
    }

    if (signers.length <= i) {
        throw new Error("invalid signer");
    }

    const signer = signers[i];
    if (!signer) {
        throw new Error("invalid signer");
    }

    return signer;
};

const setupTestEnv = async () =>
    deployments.createFixture(async ({ deployments, ethers }): Promise<TestEnv> => {
        await deployments.fixture();

        const signer = await getTestnetSignerBySender(Sender.AccountsDeployer);

        const deploy = (await ethers.getContractAt("DeployHelper", (await deployments.get("DeployHelper")).address)).connect(
            signer,
        ) as DeployHelper;

        const factory = (await ethers.getContractAt("Factory", await deploy.factory())).connect(signer) as Factory;

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

    const gnosisInterface = GnosisSafe__factory.createInterface();
    const changedGuard = res.events!.find((event: Event) => {
        const changedGuardEventTopic = gnosisInterface.getEventTopic("ChangedGuard");
        if (event.topics[0] === changedGuardEventTopic) {
            return true;
        }
    });

    let guard = ethers.constants.AddressZero;
    if (changedGuard) {
        const log = gnosisInterface.parseLog({
            topics: changedGuard.topics,
            data: changedGuard.data,
        });
        guard = log.args["guard"];
    }

    assert(sessionKey.toLowerCase() === accountDeivceKey.address.toLowerCase());

    const accountContract = (await ethers.getContractAt("GnosisSafe", accountCreatedEvent.account)) as GnosisSafe;
    const pluserModuleContract = (await ethers.getContractAt("PluserModule", accountCreatedEvent.pluserModule)) as PluserModule;

    return {
        account: accountContract,
        pluserModule: pluserModuleContract,
        accountCreatedEvent: accountCreatedEvent,
        guard: guard,
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

const getLastTimestamp = async (): Promise<number> => {
    const provider = (await getTestnetSignerBySender(Sender.User)).provider!;
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);

    return block.timestamp;
};

export {
    GnosisOperation,
    TestEnv,
    DeployedAccountInfo,
    concatSignatures,
    signGnosisSafe,
    deployAccount,
    setupTestEnv,
    setNextTime,
    getLastTimestamp,
};
