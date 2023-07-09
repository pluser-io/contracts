import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { Sender, getSignerAddressBySender } from "../utils/tests";
import { DeployHelper__factory } from "../typechain-types";
import { ethers } from "hardhat";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = await getSignerAddressBySender(Sender.ContractsDeployer, hre);
    const verifyer = await getSignerAddressBySender(Sender.TwoFactorVerifyer, hre);
    const accountsDeployer = await getSignerAddressBySender(Sender.AccountsDeployer, hre);

    // TODO: test upgrade and validation
    // await hre.upgrades.validateImplementation(await ethers.getContractFactory("Factory"));

    const deployHelperRes = await hre.deployments.deploy("DeployHelper", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });

    await hre.deployments.execute(
        "DeployHelper",
        {
            from: deployer,
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        },
        "deployPluserModule",
        (await hre.deployments.getArtifact("PluserModule")).bytecode,
        (await hre.deployments.getArtifact("InitializationScriptV1")).bytecode,
    );

    await hre.deployments.execute(
        "DeployHelper",
        {
            from: deployer,
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        },
        "deployFactory",
        (await hre.deployments.getArtifact("Factory")).bytecode,
        (await hre.deployments.get("GnosisSingleton")).address,
        accountsDeployer,
        verifyer,
    );

    const factoryAddress = await hre.deployments.read("DeployHelper", "factory");
    console.log(`Factory address: ${factoryAddress}`);
};

module.exports.tags = ["common"];
