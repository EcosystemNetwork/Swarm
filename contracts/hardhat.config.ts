import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const HEDERA_TESTNET_RPC_URL = process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api";

// Security: Fail fast if deployer key is missing - never use fallback keys
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error(
    "DEPLOYER_PRIVATE_KEY must be set in .env file. Never deploy with a fallback key!"
  );
}
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },
    hederaTestnet: {
      url: HEDERA_TESTNET_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 296,
      gas: 10_000_000, // 10M gas limit for Hedera
      gasPrice: 100_000_000_000, // 100 Gwei
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
