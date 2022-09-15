import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  Management,
  ERC20Test,
  Factory,
  Property,
  PropertyV2,
} from "../typechain";
import { Contract, utils, constants } from "ethers";

describe("Property test", function () {
  let management: Management;
  let busd: ERC20Test;
  let trvl: ERC20Test;
  let factory: Factory;
  let property1: Property;
  let property2: Property;
  let upgradedProperty1: PropertyV2;
  let upgradedProperty2: PropertyV2;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let host: SignerWithAddress;
  let users: SignerWithAddress[];
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;

  before(async () => {
    [admin, operator, verifier, treasury, host, ...users] =
      await ethers.getSigners();

    // deploy mock busd for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    busd = await mockErc20Factory.deploy("Binance USD", "BUSD");

    // deploy mock trvl for payment
    trvl = await mockErc20Factory.deploy("Dtravel", "TRVL");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator.address,
      treasury.address,
      verifier.address,
      [trvl.address, busd.address]
    );

    // deploy property beacon
    const propertyFactory = await ethers.getContractFactory("Property");
    propertyBeacon = await upgrades.deployBeacon(propertyFactory);

    // deploy factory
    const factoryFactory = await ethers.getContractFactory("Factory");
    factory = (await upgrades.deployProxy(
      factoryFactory,
      [management.address, propertyBeacon.address],
      {
        initializer: "init",
      }
    )) as Factory;
  });

  describe("Deployment test", async () => {
    it("should deploy a property using beacon proxy pattern", async () => {
      // create a valid property No.1
      let inputPropertyId = 1;

      let tx = await factory
        .connect(operator)
        .createProperty(inputPropertyId, host.address);
      let receipt = await tx.wait();
      let events = await factory.queryFilter(
        factory.filters.NewProperty(),
        receipt.blockHash
      );

      let event = events.find((e: any) => e.event === "NewProperty");
      let propertyId = event!.args.propertyId;
      let createdProperty = event!.args.property;
      let hostAddress = event!.args.host;
      property1 = await ethers.getContractAt("Property", createdProperty);

      let id = await property1.propertyId();
      expect(id).deep.equal(propertyId);
      expect(hostAddress).deep.equal(host.address);

      // create a valid property No.2
      inputPropertyId = 2;

      tx = await factory
        .connect(operator)
        .createProperty(inputPropertyId, host.address);
      receipt = await tx.wait();
      events = await factory.queryFilter(
        factory.filters.NewProperty(),
        receipt.blockHash
      );

      event = events.find((e: any) => e.event === "NewProperty");
      propertyId = event!.args.propertyId;
      createdProperty = event!.args.property;
      hostAddress = event!.args.host;
      property2 = await ethers.getContractAt("Property", createdProperty);

      id = await property2.propertyId();
      expect(id).deep.equal(propertyId);
      expect(hostAddress).deep.equal(host.address);
    });
  });

  describe("Beacon upgradeable test", async () => {
    it("should upgrade property using Upgradeable Beacon", async () => {
      const propertyV2 = await ethers.getContractFactory("PropertyV2");
      await upgrades.upgradeBeacon(propertyBeacon.address, propertyV2);

      // Attach upgraded ABIs
      upgradedProperty1 = propertyV2.attach(property1.address);
      upgradedProperty2 = propertyV2.attach(property2.address);
    });

    it("should upgrade grantAuthorized()", async () => {
      await expect(
        upgradedProperty1.grantAuthorized(admin.address)
      ).revertedWith("grantAuthorized() upgraded!");

      await expect(
        upgradedProperty2.grantAuthorized(admin.address)
      ).revertedWith("grantAuthorized() upgraded!");
    });

    it("should upgrade revokeAuthorized()", async () => {
      await expect(
        upgradedProperty1.revokeAuthorized(users[1].address)
      ).revertedWith("revokeAuthorized() upgraded!");

      await expect(
        upgradedProperty2.revokeAuthorized(users[1].address)
      ).revertedWith("revokeAuthorized() upgraded!");
    });

    it("should upgrade updatePaymentReceiver()", async () => {
      await expect(
        upgradedProperty1.updatePaymentReceiver(users[3].address)
      ).revertedWith("updatePaymentReceiver() upgraded!");

      await expect(
        upgradedProperty2.updatePaymentReceiver(users[3].address)
      ).revertedWith("updatePaymentReceiver() upgraded!");
    });

    it("should upgrade book()", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 1,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now - 1 * days,
        bookingAmount: 55000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        policies: [
          {
            expireAt: now,
            refundAmount: 48000,
          },
        ],
      };

      const signature = utils.randomBytes(65);

      await expect(upgradedProperty1.book(setting, signature)).revertedWith(
        "book() upgraded!"
      );

      await expect(upgradedProperty2.book(setting, signature)).revertedWith(
        "book() upgraded!"
      );
    });

    it("should upgrade payout()", async () => {
      await expect(upgradedProperty1.payout(100)).revertedWith(
        "payout() upgraded!"
      );

      await expect(upgradedProperty2.payout(1010)).revertedWith(
        "payout() upgraded!"
      );
    });

    it("should upgrade cancel()", async () => {
      await expect(upgradedProperty1.cancel(9999)).revertedWith(
        "cancel() upgraded!"
      );

      await expect(upgradedProperty2.cancel(99991)).revertedWith(
        "cancel() upgraded!"
      );
    });

    it("should upgrade cancelByHost()", async () => {
      await expect(upgradedProperty1.cancelByHost(0)).revertedWith(
        "cancelByHost() upgraded!"
      );

      await expect(upgradedProperty2.cancelByHost(0)).revertedWith(
        "cancelByHost() upgraded!"
      );
    });

    it("should upgrade getBookingById()", async () => {
      await expect(upgradedProperty1.getBookingById(100)).revertedWith(
        "getBookingById() upgraded!"
      );

      await expect(upgradedProperty2.getBookingById(1300)).revertedWith(
        "getBookingById() upgraded!"
      );
    });

    it("should upgrade totalBookings()", async () => {
      await expect(upgradedProperty1.totalBookings()).revertedWith(
        "totalBookings() upgraded!"
      );

      await expect(upgradedProperty2.totalBookings()).revertedWith(
        "totalBookings() upgraded!"
      );
    });
  });
});
