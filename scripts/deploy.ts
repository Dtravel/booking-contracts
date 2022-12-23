import { ethers, upgrades, network } from "hardhat";

import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  if (network.name === "testnet") {
    const [admin] = await ethers.getSigners();
    const operator = process.env.OPERATOR_ADDR!;
    const treasury = process.env.TREASURY_ADDR!;
    const verifier = process.env.VERIFIER_ADDR!;
    console.log("=========== Imported addresses ========");
    console.log("- Admin           : ", admin.address);
    console.log("- Operator        : ", operator);
    console.log("- Treasury        : ", treasury);
    console.log("- Verifier        : ", verifier);

    console.log("\n=========== START DEPLOYING ===========");
    const feeNumerator = 1000;
    const referralFeeNumerator = 500;
    const days = 24 * 3600;
    const payoutDelay = 1 * days;

    // deploy mock busd for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    const busd = await mockErc20Factory.deploy("Binance USD", "BUSD");
    console.log("- BUSD            : ", busd.address);

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    const management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator,
      treasury,
      verifier,
      [busd.address]
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

    // deploy EIP712
    const eip712Factory = await ethers.getContractFactory("EIP712");
    const eip712 = await upgrades.deployProxy(
      eip712Factory,
      [management.address],
      {
        initializer: "init",
      }
    );
    console.log("- EIP712          : ", eip712.address);

    // link created contracts
    await management.setFactory(factory.address);
    await management.setEIP712(eip712.address);

    // deploy delegate contract
    const delegateFactory = await ethers.getContractFactory("Delegate");
    const delegate = await upgrades.deployProxy(delegateFactory, [operator], {
      initializer: "init",
    });
    console.log("- Delegate        : ", delegate.address);
  } else if (network.name === "mainnet") {
    const [admin] = await ethers.getSigners();
    const operator = process.env.OPERATOR_ADDR!;
    const treasury = process.env.TREASURY_ADDR!;
    const verifier = process.env.VERIFIER_ADDR!;
    console.log("=========== Imported addresses ========");
    console.log("- Admin           : ", admin.address);
    console.log("- Operator        : ", operator);
    console.log("- Treasury        : ", treasury);
    console.log("- Verifier        : ", verifier);

    console.log("\n=========== START DEPLOYING ===========");
    const feeNumerator = 300;
    const referralFeeNumerator = 0;
    const days = 24 * 3600;
    const payoutDelay = 1 * days;
    const multisigWallet = "0xe2ee6cD549bc41A510Cd9DBd57b95344e9C3E095";
    const busd = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
    const usdt = "0x55d398326f99059ff775485246999027b3197955";
    const usdc = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
    const trvl = "0x6a8Fd46F88dBD7bdC2D536C604f811C63052ce0F";

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    const management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator,
      treasury,
      verifier,
      [busd, usdt, usdc, trvl]
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

    // deploy EIP712
    const eip712Factory = await ethers.getContractFactory("EIP712");
    const eip712 = await upgrades.deployProxy(
      eip712Factory,
      [management.address],
      {
        initializer: "init",
      }
    );
    console.log("- EIP712          : ", eip712.address);

    // link created contracts
    await management.setFactory(factory.address);
    await management.setEIP712(eip712.address);

    // deploy delegate contract
    const delegateFactory = await ethers.getContractFactory("Delegate");
    const delegate = await upgrades.deployProxy(delegateFactory, [operator], {
      initializer: "init",
    });
    console.log("- Delegate        : ", delegate.address);

    // transfer ownership to multisig wallet of dtravel governance
    await management.transferOwnership(multisigWallet);
    console.log("----> Transfered ownership to : ", multisigWallet);
  }

  console.log("\n-------------> COMPLETE <------------\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
