import { ethers, upgrades, network } from "hardhat";

import * as dotenv from "dotenv";
import { BigNumber, utils } from "ethers";
dotenv.config();

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * max);
};

async function main() {
  if (network.name !== "localhost") return;

  const [admin, operator, treasury, verifier, host, ...users] =
    await ethers.getSigners();
  console.log("=========== Imported addresses ========");
  console.log("- Admin           : ", admin.address);
  console.log("- Operator        : ", operator.address);
  console.log("- Treasury        : ", treasury.address);
  console.log("- Verifier        : ", verifier.address);

  console.log("\n=========== START DEPLOYING ===========");
  const feeNumerator = 1000;
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
  console.log("=========== DEPLOY COMPLETE ===========\n");

  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));

  // typed data hash for eip-712
  const domain = {
    name: "Booking_Property",
    version: "1",
    chainId: network.config.chainId || 31337,
    verifyingContract: "",
  };

  const types = {
    Msg: [
      { name: "bookingId", type: "uint256" },
      { name: "checkIn", type: "uint256" },
      { name: "checkOut", type: "uint256" },
      { name: "expireAt", type: "uint256" },
      { name: "bookingAmount", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "referrer", type: "address" },
      { name: "guest", type: "address" },
      { name: "policies", type: "CancellationPolicy[]" },
    ],
    CancellationPolicy: [
      { name: "expireAt", type: "uint256" },
      { name: "refundAmount", type: "uint256" },
    ],
  };

  // generate property data
  for (let i = 0; i < 4; i++) {
    const propertyId = i;
    const tx = await factory
      .connect(operator)
      .createProperty(propertyId, host.address);
    const receipt = await tx.wait();
    const events = await factory.queryFilter(
      factory.filters.NewProperty(),
      receipt.blockHash
    );

    const event = events.find((e) => e.event === "NewProperty");
    const createdProperty = event!.args!.property;
    const property = await ethers.getContractAt("Property", createdProperty);
    domain.verifyingContract = property.address;

    console.log(`------> Created property id ${i} at ${property.address}`);

    for (let i = 0; i < 3; i++) {
      await busd.mint(users[i].address, initialBalance);
      await busd.connect(users[i]).approve(property.address, initialBalance);

      await trvl.mint(users[i].address, initialBalance);
      await trvl.connect(users[i]).approve(property.address, initialBalance);
    }

    // generate booking data
    for (let j = 0; j < 3; j++) {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const guest = users[getRandomInt(3)];

      const setting = {
        bookingId: i * 3 + j,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000 + getRandomInt(30) * 1000,
        paymentToken: i % 2 === 0 ? busd.address : trvl.address,
        referrer: ethers.constants.AddressZero,
        policies: [
          {
            expireAt: now,
            refundAmount: 48000,
          },
          {
            expireAt: now + 1 * days,
            refundAmount: 35000,
          },
        ],
      };

      const value = {
        bookingId: setting.bookingId,
        checkIn: setting.checkIn,
        checkOut: setting.checkOut,
        expireAt: setting.expireAt,
        bookingAmount: setting.bookingAmount,
        paymentToken: setting.paymentToken,
        referrer: setting.referrer,
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      await property.connect(guest).book(setting, signature);
      console.log(
        `----> Generate booking id ${setting.bookingId} for guest ${guest.address}`
      );

      if (getRandomInt(10) % 2 === 0)
        await property.connect(guest).payout(setting.bookingId);
    }
  }
  console.log("\n-------------> COMPLETE <------------\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
