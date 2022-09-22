import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const newPropertyFactory = await ethers.getContractFactory("Property");
  const propertyBeacon = await upgrades.upgradeBeacon(
    process.env.PROPERTY_BEACON_ADDRESS!,
    newPropertyFactory
  );
  console.log("Upgraded property beacon at : ", propertyBeacon.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
