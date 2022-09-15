import { ethers, upgrades, network } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  if (network.name === "testnet") {
    const [admin, operator, treasury, verifier] = await ethers.getSigners();
    console.log("=========== Imported addresses ========");
    console.log("- Admin           : ", admin.address);
    console.log("- Operator        : ", operator.address);
    console.log("- Treasury        : ", treasury.address);
    console.log("- Verifier        : ", verifier.address);

    console.log("\n=========== START DEPLOYING ===========");
    const feeNumerator = 1000;
    const referralFeeNumerator = 500;
    const days = 24 * 3600;
    const payoutDelay = 1 * days;

    // deploy mock busd for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    const busd = await mockErc20Factory.deploy("Binance USD", "BUSD");
    console.log("- BUSD            : ", busd.address);

    // deploy mock trvl for payment
    const trvl = await mockErc20Factory.deploy("Dtravel", "TRVL");
    console.log("- TRVL            : ", trvl.address);

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    const management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator.address,
      treasury.address,
      verifier.address,
      [trvl.address, busd.address]
    );
    console.log("- Management      : ", management.address);

    // deploy property beacon
    const propertyFactory = await ethers.getContractFactory("Property");
    const propertyBeacon = await upgrades.deployBeacon(propertyFactory);
    console.log("- Property Beacon : ", propertyBeacon.address);

    // deploy factory
    const factoryFactory = await ethers.getContractFactory("Factory");
    const factory = await upgrades.deployProxy(
      factoryFactory,
      [management.address, propertyBeacon.address],
      {
        initializer: "init",
      }
    );
    console.log("- Factory         : ", factory.address);
  } else if (network.name === "mainnet") {
    // TODO
  }

  console.log("\n-------------> COMPLETE <------------\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
