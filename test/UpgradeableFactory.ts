import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Management, ERC20Test, Factory, FactoryV2 } from "../typechain";
import { constants, Contract, Wallet } from "ethers";

describe("Upgradeable factory test", function () {
  let management: Management;
  let paymentToken: ERC20Test;
  let factory: Factory;
  let factoryV2: FactoryV2;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let host: SignerWithAddress;
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;

  before(async () => {
    [operator, verifier, treasury, host] = await ethers.getSigners();

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

  describe("Upgradeable test", async () => {
    it("should upgrade factory contract to FactoryV2 using proxy pattern", async () => {
      const factoryV2Factory = await ethers.getContractFactory("FactoryV2");
      factoryV2 = (await upgrades.upgradeProxy(
        factory.address,
        factoryV2Factory
      )) as FactoryV2;
    });

    it("should interact with new createProperty implementation", async () => {
      const propertyId = 1;
      await expect(
        factoryV2.createProperty(
          propertyId,
          host.address,
          Wallet.createRandom().address
        )
      ).revertedWith("Factory has been upgraded successfully!");
    });
  });
});
