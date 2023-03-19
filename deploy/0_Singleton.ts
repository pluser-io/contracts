import type { HardhatRuntimeEnvironment } from "hardhat/types";
import "@safe-global/safe-service-client";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const accounts = await hre.getUnnamedAccounts();
    const deployer = accounts[0]!;

    console.log(deployer);

    await hre.deployments.deploy("Singleton", {
        from: deployer,
        contract: "GnosisSafe",
        args: [],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });
};
