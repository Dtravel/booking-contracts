import { ethers, upgrades } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const newEIP712Factory = await ethers.getContractFactory("EIP712");
  const EIP712Proxy = await upgrades.upgradeProxy(
    process.env.EIP712_PROXY_ADDRESS!,
    newEIP712Factory
  );
  console.log("Upgraded beacon proxy at : ", EIP712Proxy.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
