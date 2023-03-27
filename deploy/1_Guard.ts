import { ethers } from "hardhat";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    const accounts = await hre.getUnnamedAccounts();
    const deployer = accounts[0]!;

    let twoFactorVerifyerOwner;
    if (hre.network.name === "hardhat") {
        twoFactorVerifyerOwner = accounts[1]!;
    } else {
        twoFactorVerifyerOwner = process.env["TWO_VERIFYER_ADDRESS"]!;
    }

    const twoFactorVerifyerContract = await hre.deployments.deploy("TwoFactorVerifyer", {
        from: deployer,
        contract: "GnosisSafeProxy",
        args: [(await hre.deployments.get("Singleton")).address],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
    });

    // TODO: only for testing
    if (twoFactorVerifyerContract.newlyDeployed) {
        await hre.deployments.rawTx({
            from: deployer,
            to: twoFactorVerifyerContract.address,
            data: (
                await ethers.getContractFactory("GnosisSafe")
            ).interface.encodeFunctionData("setup", [
                [twoFactorVerifyerOwner],
                1,
                "0x0000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000",
                0,
                "0000000000000000000000000000000000000000",
            ]),
            log: true,
            autoMine: true,
            waitConfirmations: 1,
        });
    }
};
