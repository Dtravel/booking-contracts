import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Management, ERC20Test, Factory } from "../typechain";
import { constants, Contract } from "ethers";
import {
  defaultAbiCoder,
  getAddress,
  keccak256,
  solidityPack,
  toUtf8Bytes,
} from "ethers/lib/utils";

const computeCreate2Address = (
  saltHex: string,
  bytecode: string,
  deployer: string
) => {
  return getAddress(
    "0x" +
      keccak256(
        solidityPack(
          ["bytes", "address", "bytes32", "bytes32"],
          ["0xff", deployer, saltHex, keccak256(bytecode)]
        )
      ).slice(-40)
  );
};

describe("Factory test", function () {
  let management: Management;
  let paymentToken: ERC20Test;
  let factory: Factory;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let delegate: SignerWithAddress;
  let users: SignerWithAddress[];
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;

  before(async () => {
    [operator, verifier, treasury, delegate, ...users] =
      await ethers.getSigners();

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

    it("should revert when deploy with management address equal to zero", async () => {
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

    it("should revert when deploy with beacon address equal to zero", async () => {
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
        factory
          .connect(verifier)
          .createProperty(propertyId, host.address, delegate.address)
      ).revertedWith("OnlyOperator");
    });

    it("should revert when creating property if host address is zero", async () => {
      const propertyId = 1;
      const host = constants.AddressZero;
      await expect(
        factory
          .connect(operator)
          .createProperty(propertyId, host, delegate.address)
      ).revertedWith("ZeroAddress");
    });

    it("should revert when creating property if delegate address is zero", async () => {
      const propertyId = 1;
      const host = constants.AddressZero;
      await expect(
        factory
          .connect(operator)
          .createProperty(propertyId, host, constants.AddressZero)
      ).revertedWith("ZeroAddress");
    });

    it("should create property if caller is OPERATOR", async () => {
      const inputPropertyId = 1;
      const inputHost = users[0];

      // compute offchain address before deploying a new property
      const salt = keccak256(
        solidityPack(
          ["uint256", "bytes32"],
          [inputPropertyId, keccak256(toUtf8Bytes("BOOKING_V2"))]
        )
      );

      const ABI = [
        "function init(uint256 _propertyId,address _host,address _management,address _delegate)",
      ];
      const functionSelector = new ethers.utils.Interface(ABI);
      const data = functionSelector.encodeFunctionData("init", [
        inputPropertyId,
        inputHost.address,
        management.address,
        delegate.address,
      ]);

      const encodedParams = defaultAbiCoder
        .encode(["address", "bytes"], [propertyBeacon.address, data])
        .slice(2);

      const BeaconProxyFactory = await ethers.getContractFactory("BeaconProxy");
      const constructorByteCode = `${BeaconProxyFactory.bytecode}${encodedParams}`;

      const offchainComputed = computeCreate2Address(
        salt,
        constructorByteCode,
        factory.address
      );

      // create new property
      const tx = await factory
        .connect(operator)
        .createProperty(inputPropertyId, inputHost.address, delegate.address);
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

      // compare off-chain computed address with on-chain address
      expect(offchainComputed).deep.equal(propertyAddr);
    });

    it("should revert when creating an existing property", async () => {
      const propertyId = 1;
      const host = users[2];
      await expect(
        factory
          .connect(operator)
          .createProperty(propertyId, host.address, delegate.address)
      ).revertedWith("PropertyExisted");
    });

    it("should able to create valid properties", async () => {
      for (let i = 2; i < 5; i++) {
        const inputPropertyId = i;
        const inputHost = users[i];

        // compute offchain address before deploying a new property
        const salt = keccak256(
          solidityPack(
            ["uint256", "bytes32"],
            [inputPropertyId, keccak256(toUtf8Bytes("BOOKING_V2"))]
          )
        );

        const ABI = [
          "function init(uint256 _propertyId,address _host,address _management,address _delegate)",
        ];
        const functionSelector = new ethers.utils.Interface(ABI);
        const data = functionSelector.encodeFunctionData("init", [
          inputPropertyId,
          inputHost.address,
          management.address,
          delegate.address,
        ]);

        const encodedParams = defaultAbiCoder
          .encode(["address", "bytes"], [propertyBeacon.address, data])
          .slice(2);

        const BeaconProxyFactory = await ethers.getContractFactory(
          "BeaconProxy"
        );
        const constructorByteCode = `${BeaconProxyFactory.bytecode}${encodedParams}`;

        const offchainComputed = computeCreate2Address(
          salt,
          constructorByteCode,
          factory.address
        );

        // create new property
        const tx = await factory
          .connect(operator)
          .createProperty(inputPropertyId, inputHost.address, delegate.address);
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

        // compare off-chain computed address with on-chain address
        expect(offchainComputed).deep.equal(propertyAddr);
      }
    });
  });
});
