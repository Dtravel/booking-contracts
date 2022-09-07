import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Management, ERC20Test, Factory, Property } from "../typechain";
import { BigNumber, constants, Contract, utils, Wallet } from "ethers";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

describe("Property test", function () {
  let management: Management;
  let busd: ERC20Test;
  let trvl: ERC20Test;
  let fakeToken: ERC20Test;
  let factory: Factory;
  let property: Property;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let host: SignerWithAddress;
  let users: SignerWithAddress[];
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));

  // typed data hash for eip-712
  const domain = {
    name: "Booking_Property",
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
      { name: "guest", type: "address" },
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

    // deploy mock trvl for payment
    trvl = await mockErc20Factory.deploy("Dtravel", "TRVL");

    // deploy fake token for testing
    fakeToken = await mockErc20Factory.deploy("Fake Token", "FTK");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory.deploy(
      feeNumerator,
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

  describe("Get public states", async () => {
    it("should get property id", async () => {
      // create a valid property
      const inputPropertyId = 1;

      const tx = await factory
        .connect(operator)
        .createProperty(inputPropertyId, host.address);
      const receipt = await tx.wait();
      const events = await factory.queryFilter(
        factory.filters.NewProperty(),
        receipt.blockHash
      );

      const event = events.find((e) => e.event === "NewProperty");
      const propertyId = event!.args.propertyId;
      const createdProperty = event!.args.property;
      const hostAddress = event!.args.host;
      property = await ethers.getContractAt("Property", createdProperty);

      const id = await property.propertyId();
      expect(id).deep.equal(propertyId);
      expect(hostAddress).deep.equal(host.address);
    });

    it("should get property owner", async () => {
      const owner = await property.owner();
      expect(owner).deep.equal(factory.address);
    });

    it("should get property host", async () => {
      const res = await property.host();
      expect(res).deep.equal(host.address);
    });

    it("should get management", async () => {
      const res = await property.management();
      expect(res).deep.equal(management.address);
    });
  });

  describe("Grant authorized role", async () => {
    it("should grant authorized address if caller is HOST", async () => {
      const authorizedAddress = users[1].address;

      await property.connect(host).grantAuthorized(authorizedAddress);

      const res = await property.authorized(authorizedAddress);
      expect(res).deep.equal(true);
    });

    it("should revert when granting if caller is NOT HOST", async () => {
      const authorizedAddress = Wallet.createRandom().address;

      await expect(
        property.connect(admin).grantAuthorized(authorizedAddress)
      ).to.be.revertedWith("OnlyHost");
    });

    it("should revert when granting authorized role for zero address", async () => {
      await expect(
        property.connect(host).grantAuthorized(constants.AddressZero)
      ).to.be.revertedWith("ZeroAddress");
    });

    it("should revert when granting role for granted address", async () => {
      const gratedAddress = users[1].address;
      await expect(
        property.connect(host).grantAuthorized(gratedAddress)
      ).to.be.revertedWith("GrantedAlready");
    });
  });

  describe("Revoke authorized role", async () => {
    it("should revert when revoking if caller is NOT HOST", async () => {
      const authorizedAddress = users[1].address;

      await expect(
        property.connect(admin).revokeAuthorized(authorizedAddress)
      ).to.be.revertedWith("OnlyHost");
    });

    it("should revert when revoking authorized role for zero address", async () => {
      await expect(
        property.connect(host).revokeAuthorized(constants.AddressZero)
      ).to.be.revertedWith("ZeroAddress");
    });

    it("should revert when revoking role for ungranted address", async () => {
      const ungratedAddress = users[2].address;
      await expect(
        property.connect(host).revokeAuthorized(ungratedAddress)
      ).to.be.revertedWith("NotYetGranted");
    });

    it("should revoke authorized if caller is HOST", async () => {
      const authorizedAddress = users[1].address;

      await property.connect(host).revokeAuthorized(authorizedAddress);

      const res = await property.authorized(authorizedAddress);
      expect(res).deep.equal(false);
    });
  });

  describe("Book", async () => {
    describe("Validate setting", async () => {
      it("should revert if booking request is expired", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now - 1 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          guest: guest.address,
          policies: [
            {
              expireAt: now,
              refundAmount: 48000,
            },
          ],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("RequestExpired");
      });

      it("should revert if check in time is invalid", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now - 2 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          policies: [
            {
              expireAt: now,
              refundAmount: 48000,
            },
          ],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidCheckIn");
      });

      it("should revert if check out time is invalid", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 1.5 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          policies: [
            {
              expireAt: now,
              refundAmount: 48000,
            },
          ],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidCheckOut");
      });

      it("should revert if cancellation policies is empty", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          policies: [],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("EmptyPolicies");
      });

      it("should revert if booking amount is less than refund amount", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          policies: [
            {
              expireAt: now,
              refundAmount: 48000,
            },
            {
              expireAt: now + 1 * days,
              refundAmount: 75000,
            },
          ],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidBookingAmount");
      });

      it("should revert if policy has incorrect expiry", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
          policies: [
            {
              expireAt: now + 1 * days,
              refundAmount: 48000,
            },
            {
              expireAt: now,
              refundAmount: 75000,
            },
          ],
        };

        const signature = utils.randomBytes(65);
        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidPolicy");
      });

      it("should revert if booking id already exists", async () => {
        // mint tokens for users 1, 2, 3 then approve for property
        for (let i = 1; i < 4; i++) {
          await busd.mint(users[i].address, initialBalance);
          await busd
            .connect(users[i])
            .approve(property.address, initialBalance);

          await trvl.mint(users[i].address, initialBalance);
          await trvl
            .connect(users[i])
            .approve(property.address, initialBalance);
        }

        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 1,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 55000,
          paymentToken: busd.address,
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
          guest: guest.address,
          policies: setting.policies,
        };

        // generate a valid signature
        domain.verifyingContract = property.address;
        const signature = await verifier._signTypedData(domain, types, value);

        // create a valid booking in states
        await property.connect(guest).book(setting, signature);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("BookingExisted");
      });

      it("should revert if payment token is not supported", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: fakeToken.address,
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

        const signature = utils.randomBytes(65);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidPayment");
      });
    });

    describe("Verify EIP-712 data", async () => {
      it("should revert if signed message is empty", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const signature = utils.randomBytes(0);

        await expect(
          property.connect(guest).book(setting, signature)
        ).revertedWith("ECDSA: invalid signature length");
      });

      it("should revert if there's mismatch between signed message and params - bookingId", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          bookingId: 100,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - checkIn", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          checkIn: setting.checkIn - 1 * days,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - checkOut", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          checkOut: setting.checkOut + 1 * days,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - expireAt", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          expireAt: setting.expireAt + 4 * days,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - bookingAmount", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          bookingAmount: 2020,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - paymentToken", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          paymentToken: busd.address,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if there's mismatch between signed message and params - policies", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          guest: guest.address,
          policies: [setting.policies[0]],
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - bookingId", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - checkIn", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - checkOut", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - expireAt", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - bookingAmount", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - paymentToken", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "guest", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - guest", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "policies", type: "CancellationPolicy[]" },
          ],
          CancellationPolicy: [
            { name: "expireAt", type: "uint256" },
            { name: "refundAmount", type: "uint256" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message is missing params - policies", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongTypes = {
          Msg: [
            { name: "bookingId", type: "uint256" },
            { name: "checkIn", type: "uint256" },
            { name: "checkOut", type: "uint256" },
            { name: "expireAt", type: "uint256" },
            { name: "bookingAmount", type: "uint256" },
            { name: "paymentToken", type: "address" },
            { name: "guest", type: "address" },
          ],
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          domain,
          wrongTypes,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message with wrong domain data - name", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongDomain = {
          name: "IncorrectName",
          version: "1",
          chainId: network.config.chainId,
          verifyingContract: property.address,
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: [setting.policies[0]],
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          wrongDomain,
          types,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message with wrong domain data - version", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongDomain = {
          name: "Booking_Property",
          version: "v100",
          chainId: network.config.chainId,
          verifyingContract: property.address,
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: [setting.policies[0]],
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          wrongDomain,
          types,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message with wrong domain data - chainId", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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

        const wrongDomain = {
          name: "Booking_Property",
          version: "1",
          chainId: network.config.chainId! + 1,
          verifyingContract: property.address,
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: [setting.policies[0]],
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          wrongDomain,
          types,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signed message with wrong domain data - verifyingContract", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
          policies: [
            {
              expireAt: now,
              refundAmount: 48000,
            },
            {
              expireAt: now + 1,
              refundAmount: 35000,
            },
          ],
        };

        const wrongDomain = {
          name: "Booking_Property",
          version: "1",
          chainId: network.config.chainId,
          verifyingContract: constants.AddressZero,
        };

        const value = {
          bookingId: setting.bookingId,
          checkIn: setting.checkIn,
          checkOut: setting.checkOut,
          expireAt: setting.expireAt,
          bookingAmount: setting.bookingAmount,
          paymentToken: setting.paymentToken,
          guest: guest.address,
          policies: [setting.policies[0]],
        };

        // generate an invalid signature
        const signature = await verifier._signTypedData(
          wrongDomain,
          types,
          value
        );

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });

      it("should revert if signer of message is not VERIFIER", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          guest: guest.address,
          policies: setting.policies,
        };

        // generate an invalid signature
        const signature = await users[1]._signTypedData(domain, types, value);

        await expect(
          property.connect(guest).book(setting, signature)
        ).to.be.revertedWith("InvalidSignature");
      });
    });

    describe("Book a property", async () => {
      it("should book a property successfully", async () => {
        const guest = users[1];
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 2,
          checkIn: now + 1 * days,
          checkOut: now + 2 * days,
          expireAt: now + 3 * days,
          bookingAmount: 65000,
          paymentToken: trvl.address,
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
          guest: guest.address,
          policies: setting.policies,
        };

        // generate a valid signature
        const signature = await verifier._signTypedData(domain, types, value);

        const guestBalanceBefore = await trvl.balanceOf(guest.address);
        const contractBalanceBefore = await trvl.balanceOf(property.address);

        await expect(property.connect(guest).book(setting, signature)).emit(
          property,
          "NewBooking"
        );

        // check states in storage
        const res = await property.getBookingById(setting.bookingId);
        expect(res.checkIn).deep.equal(setting.checkIn);
        expect(res.checkOut).deep.equal(setting.checkOut);
        expect(res.balance).deep.equal(setting.bookingAmount);
        expect(res.guest).deep.equal(guest.address);
        expect(res.status).deep.equal(0); // IN_PROGRESS

        for (let i = 0; i < res.policies.length; i++) {
          expect(res.policies[i].expireAt).deep.equal(
            setting.policies[i].expireAt
          );
          expect(res.policies[i].refundAmount).deep.equal(
            setting.policies[i].refundAmount
          );
        }

        // check balance
        const userCurrentBalance = await trvl.balanceOf(guest.address);
        expect(userCurrentBalance).deep.equal(
          guestBalanceBefore.sub(setting.bookingAmount)
        );

        const contractCurrentBalance = await trvl.balanceOf(property.address);
        expect(contractCurrentBalance).deep.equal(
          contractBalanceBefore.add(setting.bookingAmount)
        );
      });
    });
  });

  describe("Payout", async () => {
    it("should make a full payment on booking without a refund", async () => {
      const bookingId = 2;
      // current setting:
      //    - bookingId: 2,
      //    - checkIn: now + 1 * days,
      //    - checkOut: now + 2 * days,
      //    - expireAt: now + 3 * days,
      //    - bookingAmount: 65000,
      //    - paymentToken: trvl.address,
      //    - policies: [
      //        {
      //          expireAt: now,
      //          refundAmount: 48000,
      //        },
      //        {
      //          expireAt: now + 1 * days,
      //          refundAmount: 35000,
      //        },
      //      ],
      const guest = users[1];

      // get balance before executing tx
      const guestBalanceBefore = await trvl.balanceOf(guest.address);
      const hostBalanceBefore = await trvl.balanceOf(host.address);
      const treasuryBalanceBefore = await trvl.balanceOf(treasury.address);
      const contractBalanceBefore = await trvl.balanceOf(property.address);

      // calculate fees and related amounts
      let bookingInfo = await property.getBookingById(bookingId);
      const toBePaid = bookingInfo.balance;
      const feeRatio = await management.feeNumerator();
      const feeDenominator = await management.FEE_DENOMINATOR();
      const fee = toBePaid.mul(feeRatio).div(feeDenominator);
      const hostRevenue = toBePaid.sub(fee);

      // checkout + payoutDelay = 2 + 1 = 3 days, so forward evm time to 4 days to exceed over the refund peroid
      await increaseTime(4 * days);

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const txExcecutionTime = now + 1;
      await expect(property.connect(guest).payout(bookingId))
        .emit(property, "PayOut")
        .withArgs(guest.address, bookingId, txExcecutionTime, 2); // 2 = BookingStatus.FULLY_PAID

      // restore EVM time
      await decreaseTime(4 * days + 1);

      // check balance after payout
      const guestBalance = await trvl.balanceOf(guest.address);
      const hostBalance = await trvl.balanceOf(host.address);
      const treasuryBalance = await trvl.balanceOf(treasury.address);
      const contractBalance = await trvl.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore);
      expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
      expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));

      // check on-chain states
      bookingInfo = await property.getBookingById(bookingId);
      expect(bookingInfo.balance).deep.equal(0);
    });

    it("should revert when paying for a fully-paid booking", async () => {
      const bookingId = 2;
      await expect(property.payout(bookingId)).to.be.revertedWith(
        "PaidOrCancelledAlready"
      );
    });

    it("should make a partial payout and get a refund", async () => {
      // make a booking
      const guest = users[1];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 3,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 65000,
        paymentToken: trvl.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 55000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      const bookingId = setting.bookingId;

      // get balance before executing tx
      const guestBalanceBefore = await trvl.balanceOf(guest.address);
      const hostBalanceBefore = await trvl.balanceOf(host.address);
      const treasuryBalanceBefore = await trvl.balanceOf(treasury.address);
      const contractBalanceBefore = await trvl.balanceOf(property.address);

      // calculate fees and related amounts
      let bookingInfo = await property.getBookingById(bookingId);
      const toBePaid = BigNumber.from(
        setting.bookingAmount - setting.policies[0].refundAmount
      );
      const feeRatio = await management.feeNumerator();
      const feeDenominator = await management.FEE_DENOMINATOR();
      const fee = toBePaid.mul(feeRatio).div(feeDenominator);
      const hostRevenue = toBePaid.sub(fee);
      const remain = BigNumber.from(setting.bookingAmount).sub(toBePaid);

      // 1st policy expireAt + payoutDelay = 1 + 1 = 2 days, so forward evm time to 1 days to exceed 1st refund peroid
      await increaseTime(1 * days);

      now = (await ethers.provider.getBlock("latest")).timestamp;
      const txExcecutionTime = now + 1;
      await expect(property.connect(guest).payout(bookingId))
        .emit(property, "PayOut")
        .withArgs(guest.address, bookingId, txExcecutionTime, 1); // 1 = BookingStatus.PARTIAL_PAID

      // skip restoring EVM time for the next test
      // await decreaseTime(1 * days + 1);

      // check balance after payout
      const guestBalance = await trvl.balanceOf(guest.address);
      const hostBalance = await trvl.balanceOf(host.address);
      const treasuryBalance = await trvl.balanceOf(treasury.address);
      const contractBalance = await trvl.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore);
      expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
      expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));

      // check on-chain states
      bookingInfo = await property.getBookingById(bookingId);
      expect(bookingInfo.balance).deep.equal(remain);
    });

    it("should revert when making the next payment if remaining balance is insufficient to charge", async () => {
      const bookingId = 3;
      // current setting:
      //    - bookingId: 3,
      //    - checkIn: now + 1 * days,
      //    - checkOut: now + 4 * days,
      //    - expireAt: now + 5 * days,
      //    - bookingAmount: 65000,
      //    - paymentToken: trvl.address,
      //    - policies: [
      //        {
      //          expireAt: now + 2 * days,
      //          refundAmount: 50000,
      //        },
      //        {
      //          expireAt: now + 3 * days,
      //          refundAmount: 55000,
      //        },
      //      ],
      const guest = users[1];

      // 2rd policy expiry + payoutDelay = 3 + 1 = 4 days, so forward evm time to 3.5 days to exceed 2rd refund peroid
      await increaseTime(2.5 * days);

      await expect(
        property.connect(guest).payout(bookingId)
      ).to.be.revertedWith("InsufficientBalance");

      // restore EVM time
      await decreaseTime(1 * days + 1 + 2.5 * days + 1); // previous test + this test evm time
    });

    it("should revert when paying out but host is not paid", async () => {
      // make a booking
      const guest = users[1];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 4,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 65000,
        paymentToken: trvl.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      const bookingId = setting.bookingId;

      await increaseTime(1 * days);
      now = (await ethers.provider.getBlock("latest")).timestamp;
      const txExcecutionTime = now + 1;
      await expect(property.connect(guest).payout(bookingId))
        .emit(property, "PayOut")
        .withArgs(guest.address, bookingId, txExcecutionTime, 1); // 1 = BookingStatus.PARTIAL_PAID

      await increaseTime(1 * days);
      await expect(
        property.connect(guest).payout(bookingId)
      ).to.be.revertedWith("NotPaidEnough");
    });

    it("should revert when paying out on booking that does not exist", async () => {
      const guest = users[1];
      const bookingId = 100;

      await expect(
        property.connect(guest).payout(bookingId)
      ).to.be.revertedWith("BookingNotFound");
    });
  });

  describe("Cancel by guest", async () => {
    it("should revert when guest cancels a non-existing booking", async () => {
      const guest = users[1];
      const bookingId = 101;

      await expect(
        property.connect(guest).cancel(bookingId)
      ).to.be.revertedWith("InvalidGuest");
    });

    it("should revert when guest cancels the other people's bookings", async () => {
      const guest = users[2];
      const bookingId = 1;

      await expect(
        property.connect(guest).cancel(bookingId)
      ).to.be.revertedWith("InvalidGuest");
    });

    it("should revert when guest cancels a fully-paid bookings", async () => {
      const guest = users[1];
      const bookingId = 2;

      await expect(
        property.connect(guest).cancel(bookingId)
      ).to.be.revertedWith("PaidOrCancelledAlready");
    });

    it("should revert when guest cancels a cancelled bookings", async () => {
      const guest = users[1];
      const bookingId = 1;

      await property.connect(guest).cancel(bookingId);
      await expect(
        property.connect(guest).cancel(bookingId)
      ).to.be.revertedWith("PaidOrCancelledAlready");
    });

    it("should cancel a booking when refund policies are available", async () => {
      // make a booking
      const guest = users[2];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 5,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 85000,
        paymentToken: busd.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      const bookingId = setting.bookingId;

      await increaseTime(1 * days);

      now = (await ethers.provider.getBlock("latest")).timestamp;
      let txExcecutionTime = now + 1;

      await expect(property.connect(guest).payout(bookingId))
        .emit(property, "PayOut")
        .withArgs(guest.address, bookingId, txExcecutionTime, 1); // 1 = BookingStatus.PARTIAL_PAID

      await increaseTime(1.5 * days);

      // get balance before executing cancel tx
      const guestBalanceBefore = await busd.balanceOf(guest.address);
      const hostBalanceBefore = await busd.balanceOf(host.address);
      const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
      const contractBalanceBefore = await busd.balanceOf(property.address);

      // calculate fees and related amounts
      let bookingInfo = await property.getBookingById(bookingId);
      const refund = setting.policies[1].refundAmount;
      const feeRatio = await management.feeNumerator();
      const feeDenominator = await management.FEE_DENOMINATOR();
      const fee = bookingInfo.balance
        .sub(refund)
        .mul(feeRatio)
        .div(feeDenominator);
      const hostRevenue = bookingInfo.balance.sub(refund).sub(fee);

      now = (await ethers.provider.getBlock("latest")).timestamp;
      txExcecutionTime = now + 1;

      await expect(property.connect(guest).cancel(bookingId))
        .emit(property, "GuestCancelled")
        .withArgs(guest.address, bookingId, txExcecutionTime);

      // check balance after guest cancelled
      const guestBalance = await busd.balanceOf(guest.address);
      const hostBalance = await busd.balanceOf(host.address);
      const treasuryBalance = await busd.balanceOf(treasury.address);
      const contractBalance = await busd.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore.add(refund));
      expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
      expect(contractBalance).deep.equal(
        contractBalanceBefore.sub(bookingInfo.balance)
      );

      // check booking states
      bookingInfo = await property.getBookingById(setting.bookingId);
      expect(bookingInfo.balance).deep.equal(0);
      expect(bookingInfo.status).deep.equal(3); // GUEST_CANCELLED
    });

    it("should cancel a booking when payout time is exceed but guest get no refund", async () => {
      // make a booking
      const guest = users[2];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 6,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 85000,
        paymentToken: busd.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      const bookingId = setting.bookingId;

      await increaseTime(1 * days);

      now = (await ethers.provider.getBlock("latest")).timestamp;
      let txExcecutionTime = now + 1;

      await expect(property.connect(guest).payout(bookingId))
        .emit(property, "PayOut")
        .withArgs(guest.address, bookingId, txExcecutionTime, 1); // 1 = BookingStatus.PARTIAL_PAID

      await increaseTime(5 * days);

      // get balance before executing cancel tx
      const guestBalanceBefore = await busd.balanceOf(guest.address);
      const hostBalanceBefore = await busd.balanceOf(host.address);
      const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
      const contractBalanceBefore = await busd.balanceOf(property.address);

      // calculate fees and related amounts
      let bookingInfo = await property.getBookingById(bookingId);
      const refund = 0;
      const feeRatio = await management.feeNumerator();
      const feeDenominator = await management.FEE_DENOMINATOR();
      const fee = bookingInfo.balance
        .sub(refund)
        .mul(feeRatio)
        .div(feeDenominator);
      const hostRevenue = bookingInfo.balance.sub(refund).sub(fee);

      now = (await ethers.provider.getBlock("latest")).timestamp;
      txExcecutionTime = now + 1;

      await expect(property.connect(guest).cancel(bookingId))
        .emit(property, "GuestCancelled")
        .withArgs(guest.address, bookingId, txExcecutionTime);

      // check balance after guest cancelled
      const guestBalance = await busd.balanceOf(guest.address);
      const hostBalance = await busd.balanceOf(host.address);
      const treasuryBalance = await busd.balanceOf(treasury.address);
      const contractBalance = await busd.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore);
      expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
      expect(contractBalance).deep.equal(
        contractBalanceBefore.sub(bookingInfo.balance)
      );

      // check booking states
      bookingInfo = await property.getBookingById(setting.bookingId);
      expect(bookingInfo.balance).deep.equal(0);
      expect(bookingInfo.status).deep.equal(3); // GUEST_CANCELLED
    });
  });

  describe("Cancel by host", async () => {
    it("should revert when cancelling a booking if caller is not HOST OR AUTHORIZED", async () => {
      const bookingId = 200;
      await expect(
        property.connect(users[3]).cancelByHost(bookingId)
      ).to.be.revertedWith("Unauthorized");
    });

    it("should revert when cancelling a non-existing booking", async () => {
      const bookingId = 200;
      await expect(
        property.connect(host).cancelByHost(bookingId)
      ).to.be.revertedWith("BookingNotFound");
    });

    it("should revert when cancelling a fully-paid booking", async () => {
      const bookingId = 2;
      await expect(
        property.connect(host).cancelByHost(bookingId)
      ).to.be.revertedWith("PaidOrCancelledAlready");
    });

    it("should revert when cancelling a cancelled booking", async () => {
      const bookingId = 6;
      await expect(
        property.connect(host).cancelByHost(bookingId)
      ).to.be.revertedWith("PaidOrCancelledAlready");
    });

    it("should cancelled by host", async () => {
      // make a booking
      const guest = users[2];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 7,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 85000,
        paymentToken: busd.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      let txExcecutionTime = now + 1;
      await expect(property.connect(guest).book(setting, signature))
        .emit(property, "NewBooking")
        .withArgs(guest.address, setting.bookingId, txExcecutionTime);

      // get balance before executing cancel tx
      const guestBalanceBefore = await busd.balanceOf(guest.address);
      const hostBalanceBefore = await busd.balanceOf(host.address);
      const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
      const contractBalanceBefore = await busd.balanceOf(property.address);
      const refund = setting.bookingAmount;

      now = (await ethers.provider.getBlock("latest")).timestamp;
      txExcecutionTime = now + 1;

      await expect(property.connect(host).cancelByHost(setting.bookingId))
        .emit(property, "HostCancelled")
        .withArgs(host.address, setting.bookingId, txExcecutionTime);

      // check balance after guest cancelled
      const guestBalance = await busd.balanceOf(guest.address);
      const hostBalance = await busd.balanceOf(host.address);
      const treasuryBalance = await busd.balanceOf(treasury.address);
      const contractBalance = await busd.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore.add(refund));
      expect(hostBalance).deep.equal(hostBalanceBefore);
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore);
      expect(contractBalance).deep.equal(
        contractBalanceBefore.sub(setting.bookingAmount)
      );

      const bookingInfo = await property.getBookingById(setting.bookingId);
      expect(bookingInfo.balance).deep.equal(0);
      expect(bookingInfo.status).deep.equal(4); // HOST_CANCELLED
    });

    it("should cancelled by authorized", async () => {
      // authorize users[5] to cancel a booking
      const authorized = users[5];
      await property.connect(host).grantAuthorized(authorized.address);

      // make a booking
      const guest = users[2];
      let now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 8,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 85000,
        paymentToken: busd.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      let txExcecutionTime = now + 1;
      await expect(property.connect(guest).book(setting, signature))
        .emit(property, "NewBooking")
        .withArgs(guest.address, setting.bookingId, txExcecutionTime);

      // get balance before executing cancel tx
      const guestBalanceBefore = await busd.balanceOf(guest.address);
      const hostBalanceBefore = await busd.balanceOf(host.address);
      const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
      const contractBalanceBefore = await busd.balanceOf(property.address);
      const refund = setting.bookingAmount;

      now = (await ethers.provider.getBlock("latest")).timestamp;
      txExcecutionTime = now + 1;

      await expect(property.connect(authorized).cancelByHost(setting.bookingId))
        .emit(property, "HostCancelled")
        .withArgs(authorized.address, setting.bookingId, txExcecutionTime);

      // check balance after guest cancelled
      const guestBalance = await busd.balanceOf(guest.address);
      const hostBalance = await busd.balanceOf(host.address);
      const treasuryBalance = await busd.balanceOf(treasury.address);
      const contractBalance = await busd.balanceOf(property.address);

      expect(guestBalance).deep.equal(guestBalanceBefore.add(refund));
      expect(hostBalance).deep.equal(hostBalanceBefore);
      expect(treasuryBalance).deep.equal(treasuryBalanceBefore);
      expect(contractBalance).deep.equal(
        contractBalanceBefore.sub(setting.bookingAmount)
      );

      const bookingInfo = await property.getBookingById(setting.bookingId);
      expect(bookingInfo.balance).deep.equal(0);
      expect(bookingInfo.status).deep.equal(4); // HOST_CANCELLED
    });
  });

  describe("View booking", async () => {
    it("should get booking by id", async () => {
      // make a booking
      const guest = users[2];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 9,
        checkIn: now + 1 * days,
        checkOut: now + 4 * days,
        expireAt: now + 5 * days,
        bookingAmount: 85000,
        paymentToken: busd.address,
        policies: [
          {
            expireAt: now + 2 * days,
            refundAmount: 50000,
          },
          {
            expireAt: now + 3 * days,
            refundAmount: 15000,
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
        guest: guest.address,
        policies: setting.policies,
      };

      // generate a valid signature
      const signature = await verifier._signTypedData(domain, types, value);

      const txExcecutionTime = now + 1;
      await expect(property.connect(guest).book(setting, signature))
        .emit(property, "NewBooking")
        .withArgs(guest.address, setting.bookingId, txExcecutionTime);

      const bookingInfo = await property.getBookingById(setting.bookingId);
      expect(bookingInfo.checkIn).deep.equal(setting.checkIn);
      expect(bookingInfo.checkOut).deep.equal(setting.checkOut);
      expect(bookingInfo.balance).deep.equal(setting.bookingAmount);
      expect(bookingInfo.guest).deep.equal(guest.address);
      expect(bookingInfo.paymentToken).deep.equal(setting.paymentToken);
      expect(bookingInfo.status).deep.equal(0); // IN_PROGRESS
      for (let i = 0; i < setting.policies.length; i++) {
        const { expireAt, refundAmount } = bookingInfo.policies[i];
        expect(expireAt).deep.equal(setting.policies[i].expireAt);
        expect(refundAmount).deep.equal(setting.policies[i].refundAmount);
      }
    });

    it("should get total bookings", async () => {
      const res = await property.totalBookings();
      expect(res).deep.equal(9);
    });
  });
});