import { ethers } from "hardhat";
import { Factory__factory } from "../typechain-types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const accounts = await hre.getUnnamedAccounts();
    const deployer = accounts[0]!;

    const guard = await hre.deployments.get("TwoFactorGuard");

    await hre.upgrades.validateImplementation(await ethers.getContractFactory("Factory"));

    const factoryImplementation = await hre.deployments.deploy("Factory_Implementation", {
        from: deployer,
        contract: "Factory",
        args: [],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });

    const singleton = await hre.deployments.get("Singleton");

    const factory = await hre.deployments.deploy("Factory", {
        from: deployer,
        contract: "ERC1967Proxy",
        args: [
            factoryImplementation.address,
            new Factory__factory().interface.encodeFunctionData("initialize", [
                guard.address,
                singleton.address,
                ethers.constants.AddressZero, //TODO: use a real trusted forwarder
            ]),
        ],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });

    if (factory.newlyDeployed) {
        await hre.deployments.rawTx({
            from: deployer,
            to: factory.address,
            data: (
                await ethers.getContractFactory("Factory")
            ).interface.encodeFunctionData("addDeployer", [hre.network.name === "hardhat" ? deployer : process.env["ACCOUNT_DEPLOYER"]!]),
        });
    }
};
