import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-tracer";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 10000,
            },
        },
    },
    networks: {
        hardhat: {
            saveDeployments: false,
        },
        sepolia: {
            url: "https://rpc2.sepolia.org",
            accounts: [process.env["PRIVATE_KEY"]!],
            saveDeployments: true,
        },
        mumbai: {
            url: "https://polygon-testnet.public.blastapi.io",
            accounts: [process.env["PRIVATE_KEY"]!],
            saveDeployments: true,
        },
        bscTestnet: {
            url: "https://bsc-testnet.public.blastapi.io",
            accounts: [process.env["PRIVATE_KEY"]!],
            saveDeployments: true,
        },
    },
};

export default config;
