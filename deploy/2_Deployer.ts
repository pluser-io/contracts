import { ethers } from "hardhat";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const accounts = await hre.getUnnamedAccounts();
    const deployer = accounts[0]!;

    await hre.upgrades.validateImplementation(await ethers.getContractFactory("Factory"));

    await hre.deployments.deploy("Deploy", {
        from: deployer,
        args: [(await hre.deployments.get("TwoFactorVerifyer")).address],
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
            await hre.deployments.getArtifact("RecoveryManager")
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
            await hre.deployments.getArtifact("TwoFactorGuard")
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
        "step4",
        (
            await hre.deployments.getArtifact("Factory")
        ).bytecode,
        process.env["ACCOUNT_DEPLOYER"]!,
    );
};
