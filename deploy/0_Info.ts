import type { HardhatRuntimeEnvironment } from "hardhat/types";
import "@safe-global/safe-service-client";
import { ethers } from "hardhat";
import { Sender, getSignerAddressBySender } from "../utils/tests";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const deployer = await getSignerAddressBySender(Sender.ContractsDeployer, hre);

    console.log(`Deployer address: ${deployer}`);
    const nonce = await (await ethers.getSigner(deployer)).getNonce();
    console.log(`Nonce: ${nonce}`);
};

module.exports.tags = ["common"];
