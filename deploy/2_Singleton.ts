import type { HardhatRuntimeEnvironment } from "hardhat/types";
import "@safe-global/safe-service-client";
import { Sender, getSignerAddressBySender } from "../utils/tests";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = await getSignerAddressBySender(Sender.ContractsDeployer, hre);

    await hre.deployments.deploy("GnosisSingleton", {
        from: deployer,
        contract: "GnosisSafe",
        args: [],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });
};

module.exports.tags = ["localnet"];
