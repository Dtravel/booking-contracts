import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const newFactory = await ethers.getContractFactory("Factory");
  const factoryProxy = await upgrades.upgradeProxy(
    process.env.FACTORY_PROXY_ADDRESS!,
    newFactory
  );
  console.log("Upgraded factory proxy at : ", factoryProxy.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
