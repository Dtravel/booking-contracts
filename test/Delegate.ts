import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  Management,
  EIP712,
  ERC20Test,
  Factory,
  Property,
  Delegate,
} from "../typechain";
import { BigNumber, constants, Contract, utils, Wallet } from "ethers";

describe("Delegate test", function () {
  let management: Management;
  let busd: ERC20Test;
  let factory: Factory;
  let eip712: EIP712;
  let delegate: Delegate;
  let property: Property;
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
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));
  const adminRole = constants.HashZero;
  const delegateRole = utils.keccak256(utils.toUtf8Bytes("DELEGATE_ROLE"));

  // typed data hash for eip-712
  const domain = {
    name: "DtravelBooking",
    version: "1",
    chainId: network.config.chainId,
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
      { name: "property", type: "address" },
      { name: "policies", type: "CancellationPolicy[]" },
    ],
    CancellationPolicy: [
      { name: "expireAt", type: "uint256" },
      { name: "refundAmount", type: "uint256" },
    ],
  };

  before(async () => {
    [admin, operator, verifier, treasury, host, ...users] =
      await ethers.getSigners();

    // deploy mock busd for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    busd = await mockErc20Factory.deploy("Binance USD", "BUSD");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      operator.address,
      treasury.address,
      verifier.address,
      [busd.address]
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

    // deploy EIP712
    const eip712Factory = await ethers.getContractFactory("EIP712");
    eip712 = (await upgrades.deployProxy(eip712Factory, [management.address], {
      initializer: "init",
    })) as EIP712;

    // update domain part
    domain.verifyingContract = eip712.address;

    // link created contracts
    await management.setFactory(factory.address);
    await management.setEIP712(eip712.address);

    // deploy delegate contract then grant delegate to operator by default
    const delegateFactory = await ethers.getContractFactory("Delegate");
    delegate = (await upgrades.deployProxy(
      delegateFactory,
      [operator.address],
      {
        initializer: "init",
      }
    )) as Delegate;

    // create a new property
    const inputPropertyId = 1;
    const tx = await factory
      .connect(operator)
      .createProperty(inputPropertyId, host.address, delegate.address);
    const receipt = await tx.wait();
    const events = await factory.queryFilter(
      factory.filters.NewProperty(),
      receipt.blockHash
    );

    const event = events.find((e) => e.event === "NewProperty");
    const createdProperty = event!.args.property;
    property = await ethers.getContractAt("Property", createdProperty);
  });

  it("operator should be a delegate", async () => {
    const res = await delegate.hasRole(delegateRole, operator.address);
    expect(res).deep.equal(true);
  });

  describe("Delegate functions", async () => {
    it("should revert when updating host if property address is zero", async () => {
      const newHost = users[10];
      await expect(
        delegate
          .connect(operator)
          .updateHost(constants.AddressZero, newHost.address)
      ).revertedWith("ZeroAddress");
    });

    it("should update host if caller has delegate role", async () => {
      const newHost = users[10];
      await expect(
        delegate.connect(operator).updateHost(property.address, newHost.address)
      )
        .emit(property, "NewHost")
        .withArgs(newHost.address);

      const res = await property.host();
      expect(res).deep.equal(newHost.address);
    });

    it("should revert when updating payment receiver if property address is zero", async () => {
      const newPaymentReceiver = users[10];
      await expect(
        delegate
          .connect(operator)
          .updatePaymentReceiver(
            constants.AddressZero,
            newPaymentReceiver.address
          )
      ).revertedWith("ZeroAddress");
    });

    it("should update payment receiver if caller has delegate role", async () => {
      const newPaymentReceiver = users[10];
      await expect(
        delegate
          .connect(operator)
          .updatePaymentReceiver(property.address, newPaymentReceiver.address)
      )
        .emit(property, "NewPaymentReceiver")
        .withArgs(newPaymentReceiver.address);

      const res = await property.paymentReceiver();
      expect(res).deep.equal(newPaymentReceiver.address);
    });

    it("should revert when canceling a booking if property address is zero", async () => {
      const bookingId = 1;
      await expect(
        delegate
          .connect(operator)
          .cancelByHost(constants.AddressZero, bookingId)
      ).revertedWith("ZeroAddress");
    });

    it("should cancel a booking if caller has delegate role", async () => {
      // mint tokens for users 1, 2, 3 then approve for property
      for (let i = 1; i < 4; i++) {
        await busd.mint(users[i].address, initialBalance);
        await busd.connect(users[i]).approve(property.address, initialBalance);
      }

      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 2,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
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

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      // should cancel booking
      await expect(
        delegate
          .connect(operator)
          .cancelByHost(property.address, setting.bookingId)
      ).emit(property, "HostCancelled");
    });
  });

  describe("Admin test", async () => {
    it("should revert when granting delegate role if caller is NOT ADMIN", async () => {
      await expect(
        delegate
          .connect(verifier)
          .grantRole(delegateRole, Wallet.createRandom().address)
      ).revertedWith(
        `AccessControl: account ${verifier.address.toLocaleLowerCase()} is missing role ${adminRole}`
      );
    });

    it("should grant delegate role to an address if caller is ADMIN", async () => {
      const newDelegate = users[3];
      await delegate
        .connect(admin)
        .grantRole(delegateRole, newDelegate.address);

      const res = await delegate.hasRole(delegateRole, newDelegate.address);
      expect(res).deep.equal(true);
    });
  });

  describe("Migrate to new operator without adding new authorized address on property contract", async () => {
    it("should update host if caller has delegate role", async () => {
      // now users[3] is new operator
      const newHost = users[9];
      await expect(
        delegate.connect(users[3]).updateHost(property.address, newHost.address)
      )
        .emit(property, "NewHost")
        .withArgs(newHost.address);

      const res = await property.host();
      expect(res).deep.equal(newHost.address);
    });

    it("should update payment receiver if caller has delegate role", async () => {
      const newPaymentReceiver = users[9];
      await expect(
        delegate
          .connect(users[3])
          .updatePaymentReceiver(property.address, newPaymentReceiver.address)
      )
        .emit(property, "NewPaymentReceiver")
        .withArgs(newPaymentReceiver.address);

      const res = await property.paymentReceiver();
      expect(res).deep.equal(newPaymentReceiver.address);
    });

    it("should cancel a booking if caller has delegate role", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 3,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
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

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      // should cancel booking
      await expect(
        delegate
          .connect(users[3])
          .cancelByHost(property.address, setting.bookingId)
      ).emit(property, "HostCancelled");
    });
  });
});
