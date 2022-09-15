import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Management, ERC20Test, Factory } from "../typechain";
import { constants, Contract } from "ethers";

describe("Factory test", function () {
  let management: Management;
  let paymentToken: ERC20Test;
  let factory: Factory;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let users: SignerWithAddress[];
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;

  before(async () => {
    [operator, verifier, treasury, ...users] = await ethers.getSigners();

    // deploy mock erc20 for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    paymentToken = await mockErc20Factory.deploy("paymentToken", "PMT");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator.address,
      treasury.address,
      verifier.address,
      [paymentToken.address]
    );
  });

  describe("Deployment test", async () => {
    it("should deploy property beacon contract", async () => {
      const propertyFactory = await ethers.getContractFactory("Property");

      propertyBeacon = await upgrades.deployBeacon(propertyFactory);

      expect(propertyBeacon.address).not.deep.equal(constants.AddressZero);
    });

    it("should revert when deploy with management address is zero", async () => {
      const factoryFactory = await ethers.getContractFactory("Factory");
      await expect(
        upgrades.deployProxy(
          factoryFactory,
          [constants.AddressZero, propertyBeacon.address],
          {
            initializer: "init",
          }
        )
      ).revertedWith("ZeroAddress");
    });

    it("should revert when deploy with beacon address is zero", async () => {
      const factoryFactory = await ethers.getContractFactory("Factory");
      await expect(
        upgrades.deployProxy(
          factoryFactory,
          [management.address, constants.AddressZero],
          {
            initializer: "init",
          }
        )
      ).revertedWith("ZeroAddress");
    });

    it("should deploy factory contract using proxy pattern", async () => {
      const factoryFactory = await ethers.getContractFactory("Factory");
      factory = (await upgrades.deployProxy(
        factoryFactory,
        [management.address, propertyBeacon.address],
        {
          initializer: "init",
        }
      )) as Factory;
    });
  });

  describe("Create properties", async () => {
    it("should revert when creating property if caller is not OPERATOR", async () => {
      const propertyId = 1;
      const host = users[0];
      await expect(
        factory.connect(verifier).createProperty(propertyId, host.address)
      ).revertedWith("OnlyOperator");
    });

    it("should revert when creating property if host address is zero", async () => {
      const propertyId = 1;
      const host = constants.AddressZero;
      await expect(
        factory.connect(operator).createProperty(propertyId, host)
      ).revertedWith("ZeroAddress");
    });

    it("should create property if caller is OPERATOR", async () => {
      const inputPropertyId = 1;
      const inputHost = users[0];

      const tx = await factory
        .connect(operator)
        .createProperty(inputPropertyId, inputHost.address);
      const receipt = await tx.wait();
      const events = await factory.queryFilter(
        factory.filters.NewProperty(),
        receipt.blockHash
      );

      const event = events.find((e) => e.event === "NewProperty");

      // check events
      const { propertyId, property, host } = event!.args;
      expect(propertyId).deep.equal(inputPropertyId);
      expect(property).not.deep.equal(constants.AddressZero);
      expect(host).deep.equal(inputHost.address);

      // check created property
      const createdProperty = await ethers.getContractAt("Property", property);
      const owner = await createdProperty.owner();
      expect(owner).deep.equal(factory.address);

      // check on-chain states
      const propertyAddr = await factory.property(propertyId);
      expect(propertyAddr).deep.equal(createdProperty.address);
    });

    it("should revert when creating an existing property", async () => {
      const propertyId = 1;
      const host = users[2];
      await expect(
        factory.connect(operator).createProperty(propertyId, host.address)
      ).revertedWith("PropertyExisted");
    });

    it("should able to create valid properties", async () => {
      for (let i = 2; i < 5; i++) {
        const inputPropertyId = i;
        const inputHost = users[i];

        const tx = await factory
          .connect(operator)
          .createProperty(inputPropertyId, inputHost.address);
        const receipt = await tx.wait();
        const events = await factory.queryFilter(
          factory.filters.NewProperty(),
          receipt.blockHash
        );

        const event = events.find((e) => e.event === "NewProperty");

        // check events
        const { propertyId, property, host } = event!.args;
        expect(propertyId).deep.equal(inputPropertyId);
        expect(property).not.deep.equal(constants.AddressZero);
        expect(host).deep.equal(inputHost.address);

        // check created property
        const createdProperty = await ethers.getContractAt(
          "Property",
          property
        );
        const owner = await createdProperty.owner();
        expect(owner).deep.equal(factory.address);

        // check on-chain states
        const propertyAddr = await factory.property(propertyId);
        expect(propertyAddr).deep.equal(createdProperty.address);
      }
    });
  });
});
