import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "./hardhat.tasks";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    testnet: {
      url: "https://data-seed-prebsc-2-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts:
        process.env.ADMIN_PRIVATE_KEY !== undefined
          ? [process.env.ADMIN_PRIVATE_KEY!]
          : [],
    },
    mainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 20000000000,
      accounts:
        process.env.ADMIN_PRIVATE_KEY !== undefined
          ? [process.env.ADMIN_PRIVATE_KEY!]
          : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY,
  },
};

export default config;
