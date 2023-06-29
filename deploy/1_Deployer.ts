import { ethers } from "hardhat";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deploy__factory } from "../typechain-types";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const accounts = await hre.getUnnamedAccounts();
    const deployer = accounts[0]!;
    const verifyer = accounts[0]!;

    await hre.upgrades.validateImplementation(await ethers.getContractFactory("Factory"));

    const deploy = await hre.deployments.deploy("Deploy", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });

    await hre.deployments.execute(
        "Deploy",
        {
            from: deployer,
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        },
        "step1",
        (
            await hre.deployments.getArtifact("MinimalForwarder")
        ).bytecode,
        (
            await hre.deployments.getArtifact("PluserModule")
        ).bytecode,
    );

    await hre.deployments.execute(
        "Deploy",
        {
            from: deployer,
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        },
        "step2",
        (
            await hre.deployments.getArtifact("GnosisSafe")
        ).bytecode,
        (
            await hre.deployments.getArtifact("InitializationScriptV1")
        ).bytecode,
    );

    await hre.deployments.execute(
        "Deploy",
        {
            from: deployer,
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        },
        "step3",
        (
            await hre.deployments.getArtifact("Factory")
        ).bytecode,
        process.env["ACCOUNT_DEPLOYER"]!,
        verifyer,
    );

    console.log("Forwarder:", await Deploy__factory.connect(deploy.address, ethers.provider).forwarder());
};
