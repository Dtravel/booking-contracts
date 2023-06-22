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
import { BigNumber, constants, Contract, utils } from "ethers";

async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

async function decreaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration * -1]);
  ethers.provider.send("evm_mine", []);
}

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
  let feeHolder: SignerWithAddress;
  let host: SignerWithAddress;
  let users: SignerWithAddress[];
  let propertyBeacon: Contract;

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const days = 24 * 3600;
  const payoutDelay = 1 * days;
  const initialBalance = BigNumber.from(utils.parseEther("1000000000000"));

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
      { name: "insuranceInfo", type: "InsuranceInfo" },
      { name: "policies", type: "CancellationPolicy[]" },
    ],
    CancellationPolicy: [
      { name: "expireAt", type: "uint256" },
      { name: "refundAmount", type: "uint256" },
    ],
    InsuranceInfo: [
      { name: "damageProtectionFee", type: "uint256" },
      { name: "feeReceiver", type: "address" },
      { name: "kygStatus", type: "uint8" },
    ],
  };

  before(async () => {
    [admin, operator, verifier, treasury, host, feeHolder, ...users] =
      await ethers.getSigners();

    // deploy mock busd for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    busd = await mockErc20Factory.deploy("Binance USD", "BUSD");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory
      .connect(admin)
      .deploy(
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

    // mint tokens for users then approve for property
    for (let i = 1; i < 5; i++) {
      await busd.mint(users[i].address, initialBalance);
      await busd.connect(users[i]).approve(property.address, initialBalance);
    }
  });

  describe("Make a booking", async () => {
    it("should revert if insurance fee is invalid", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 1,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
        insuranceInfo: {
          damageProtectionFee: 58500, // = 65000 * 90%
          feeReceiver: feeHolder.address,
          kygStatus: 0,
        },
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

      // generate signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(
        property.connect(guest).book(setting, signature)
      ).revertedWith("InvalidInsuranceFee");
    });

    it("should revert if fee receiver is zero address but dmg protection fee is valid", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 1,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
        insuranceInfo: {
          damageProtectionFee: 5500,
          feeReceiver: constants.AddressZero,
          kygStatus: 0,
        },
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

      // generate signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(
        property.connect(guest).book(setting, signature)
      ).revertedWith("InvalidInsuranceFeeReceiver");
    });

    it("should book without insurance", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 1,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 65000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
        insuranceInfo: {
          damageProtectionFee: 0,
          feeReceiver: constants.AddressZero,
          kygStatus: 0,
        },
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

      // generate signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      // check states in storage
      const res = await property.getInsuranceInfoById(setting.bookingId);
      expect(res.damageProtectionFee).deep.equal(
        setting.insuranceInfo.damageProtectionFee
      );
      expect(res.feeReceiver).deep.equal(setting.insuranceInfo.feeReceiver);
      expect(res.kygStatus).deep.equal(setting.insuranceInfo.kygStatus);
    });

    it("should book with valid insurance setting", async () => {
      const guest = users[1];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 2,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 100000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
        insuranceInfo: {
          damageProtectionFee: 12000,
          feeReceiver: feeHolder.address,
          kygStatus: 0,
        },
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

      // generate signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );

      // check states in storage
      const res = await property.getInsuranceInfoById(setting.bookingId);
      expect(res.damageProtectionFee).deep.equal(
        setting.insuranceInfo.damageProtectionFee
      );
      expect(res.feeReceiver).deep.equal(setting.insuranceInfo.feeReceiver);
      expect(res.kygStatus).deep.equal(setting.insuranceInfo.kygStatus);
    });

    it("should get insurance info by booking id", async () => {
      const { damageProtectionFee, feeReceiver, kygStatus } =
        await property.getInsuranceInfoById(2);
      expect(damageProtectionFee).deep.equal(12000);
      expect(feeReceiver).deep.equal(feeHolder.address);
      expect(kygStatus).deep.equal(0);
    });
  });

  describe("Update KYG status", async () => {
    it("should revert if caller is not OPERATOR", async () => {
      const bookingId = 1;
      await expect(
        property.connect(verifier).updateKygStatusById(bookingId, 1)
      ).revertedWith("OnlyOperator");
    });

    it("should revert if booking does not exist", async () => {
      const bookingId = 100;
      await expect(
        property.connect(operator).updateKygStatusById(bookingId, 2)
      ).revertedWith("BookingNotFound");
    });

    it("should revert if booking does not have issurance", async () => {
      const bookingId = 1;
      await expect(
        property.connect(operator).updateKygStatusById(bookingId, 2)
      ).revertedWith("InsuranceNotFound");
    });

    it("should revert if payment status is fully paid", async () => {
      const bookingId = 1;
      const guest = users[1];
      // checkout + payoutDelay = 2 + 1 = 3 days, so forward evm time to 4 days to exceed over the refund period
      await increaseTime(4 * days);

      await expect(property.connect(guest).payout(bookingId)).emit(
        property,
        "PayOut"
      );

      // restore EVM time
      await decreaseTime(4 * days + 1);

      await expect(
        property.connect(operator).updateKygStatusById(bookingId, 2)
      ).revertedWith("BookingAlreadyFinalized");
    });

    it("should revert if status param is IN_PROGRESS", async () => {
      const bookingId = 2;
      await expect(
        property.connect(operator).updateKygStatusById(bookingId, 0)
      ).revertedWith("InvalidKYGStatus");
    });

    it("should update KYG status to FAILED", async () => {
      const bookingId = 2;
      await property.connect(operator).updateKygStatusById(bookingId, 2);

      const res = await property.getInsuranceInfoById(bookingId);
      expect(res.kygStatus).deep.equal(2);
    });

    it("should update KYG status to PASSED", async () => {
      const guest = users[2];
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const setting = {
        bookingId: 3,
        checkIn: now + 1 * days,
        checkOut: now + 2 * days,
        expireAt: now + 3 * days,
        bookingAmount: 90000,
        paymentToken: busd.address,
        referrer: constants.AddressZero,
        guest: guest.address,
        property: property.address,
        insuranceInfo: {
          damageProtectionFee: 12000,
          feeReceiver: feeHolder.address,
          kygStatus: 0,
        },
        policies: [
          {
            expireAt: now,
            refundAmount: 48000,
          },
          {
            expireAt: now + 1 * days,
            refundAmount: 30000,
          },
        ],
      };

      // generate signature
      const signature = await verifier._signTypedData(domain, types, setting);

      await expect(property.connect(guest).book(setting, signature)).emit(
        property,
        "NewBooking"
      );
      await property
        .connect(operator)
        .updateKygStatusById(setting.bookingId, 1);

      const res = await property.getInsuranceInfoById(setting.bookingId);
      expect(res.kygStatus).deep.equal(1);
    });

    it("should revert if KYG status is not IN_PROGRESS", async () => {
      const bookingId = 2;
      await expect(
        property.connect(operator).updateKygStatusById(bookingId, 0)
      ).revertedWith("StatusAlreadyFinalized");
    });
  });

  describe("Payout", async () => {
    describe("KYG status is PASSED and remaining balance > damage protection fee", async () => {
      it("should charge a partial payment ", async () => {
        const bookingId = 3;
        const guest = users[2];

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = BigNumber.from(
          bookingInfo.balance.sub(bookingInfo.policies[0].refundAmount)
        );
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid.sub(fee);
        const remain = bookingInfo.balance.sub(toBePaid);

        await increaseTime(0.5 * days);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            hostRevenue,
            fee,
            0,
            1
          ); // 1 = BookingStatus.PARTIAL_PAID;

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(remain);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });

      it("should make a final payout and collect damage protection fee", async () => {
        const bookingId = 3;
        const guest = users[2];
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);
        await increaseTime(2 * days);

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = bookingInfo.balance;
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid
          .sub(fee)
          .sub(insuranceInfo.damageProtectionFee);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        const tx = await property.connect(guest).payout(bookingId);
        const receipt = await tx.wait();
        let events: any = await property.queryFilter(
          property.filters.InsuranceFeeCollected(),
          receipt.blockHash
        );

        let res = events.find((e: any) => e.event === "InsuranceFeeCollected");
        expect(res!.args.receiver).deep.equal(feeHolder.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.collectAt).deep.equal(txExecutionTime);
        expect(res!.args.feeAmount).deep.equal(
          insuranceInfo.damageProtectionFee
        );

        events = await property.queryFilter(
          property.filters.PayOut(),
          receipt.blockHash
        );

        res = events.find((e: any) => e.event === "PayOut");
        expect(res!.args.guest).deep.equal(guest.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.payAt).deep.equal(txExecutionTime);
        expect(res!.args.hostAmount).deep.equal(hostRevenue);
        expect(res!.args.treasuryAmount).deep.equal(fee);
        expect(res!.args.referrerAmount).deep.equal(0);
        expect(res!.args.status).deep.equal(2); // 2 = BookingStatus.FULLY_PAID

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));
        expect(feeReceiverBalance).deep.equal(
          feeReceiverBalanceBefore.add(insuranceInfo.damageProtectionFee)
        );

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });
    });

    describe("KYG status is PASSED but remaining balance < damage protection fee", async () => {
      it("should charge a partial payment ", async () => {
        const guest = users[2];
        const bookingId = 4;

        let now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 4,
          checkIn: now + 1 * days,
          checkOut: now + 4 * days,
          expireAt: now + 7 * days,
          bookingAmount: 70000,
          paymentToken: busd.address,
          referrer: constants.AddressZero,
          guest: guest.address,
          property: property.address,
          insuranceInfo: {
            damageProtectionFee: 10000,
            feeReceiver: feeHolder.address,
            kygStatus: 0,
          },
          policies: [
            {
              expireAt: now + 2,
              refundAmount: 30000,
            },
            {
              expireAt: now + 3 * days,
              refundAmount: 11000,
            },
          ],
        };

        // generate signature
        const signature = await verifier._signTypedData(domain, types, setting);

        await expect(property.connect(guest).book(setting, signature)).emit(
          property,
          "NewBooking"
        );

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = BigNumber.from(
          bookingInfo.balance.sub(bookingInfo.policies[0].refundAmount)
        );
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid.sub(fee);
        const remain = bookingInfo.balance.sub(toBePaid);

        // Update KYG status
        await property
          .connect(operator)
          .updateKygStatusById(setting.bookingId, 1);

        await increaseTime(0.5 * days);

        now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            hostRevenue,
            fee,
            0,
            1
          ); // 1 = BookingStatus.PARTIAL_PAID;

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(remain);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });

      it("should suspend payment if booking balance is insufficient to charge insurance fee", async () => {
        const guest = users[2];
        const bookingId = 4;

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        let bookingInfo = await property.getBookingById(bookingId);

        // remaining balanace is insufficient to charge damage protection fee
        const fee = 0;
        const hostRevenue = 0;
        const remain = bookingInfo.balance;

        await increaseTime(2 * days);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            hostRevenue,
            fee,
            0,
            1
          ); // 1 = BookingStatus.PARTIAL_PAID;

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore);
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore);
        expect(contractBalance).deep.equal(contractBalanceBefore);
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(remain);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });

      it("should make a final payout and collect damage protection fee", async () => {
        const guest = users[2];
        const bookingId = 4;
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);
        await increaseTime(2 * days);

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = bookingInfo.balance;
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid
          .sub(fee)
          .sub(insuranceInfo.damageProtectionFee);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        const tx = await property.connect(guest).payout(bookingId);
        const receipt = await tx.wait();
        let events: any = await property.queryFilter(
          property.filters.InsuranceFeeCollected(),
          receipt.blockHash
        );

        let res = events.find((e: any) => e.event === "InsuranceFeeCollected");
        expect(res!.args.receiver).deep.equal(feeHolder.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.collectAt).deep.equal(txExecutionTime);
        expect(res!.args.feeAmount).deep.equal(
          insuranceInfo.damageProtectionFee
        );

        events = await property.queryFilter(
          property.filters.PayOut(),
          receipt.blockHash
        );

        res = events.find((e: any) => e.event === "PayOut");
        expect(res!.args.guest).deep.equal(guest.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.payAt).deep.equal(txExecutionTime);
        expect(res!.args.hostAmount).deep.equal(hostRevenue);
        expect(res!.args.treasuryAmount).deep.equal(fee);
        expect(res!.args.referrerAmount).deep.equal(0);
        expect(res!.args.status).deep.equal(2); // 2 = BookingStatus.FULLY_PAID

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(contractBalanceBefore.sub(toBePaid));
        expect(feeReceiverBalance).deep.equal(
          feeReceiverBalanceBefore.add(insuranceInfo.damageProtectionFee)
        );

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });
    });

    describe("KYG status is IN PROGRESS and make a payout before check in", async () => {
      it("should charge a partial payment and update pending insurance fee", async () => {
        const guest = users[3];
        const bookingId = 5;

        let now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 5,
          checkIn: now + 10 * days,
          checkOut: now + 11 * days,
          expireAt: now + 15 * days,
          bookingAmount: 80000,
          paymentToken: busd.address,
          referrer: constants.AddressZero,
          guest: guest.address,
          property: property.address,
          insuranceInfo: {
            damageProtectionFee: 10000,
            feeReceiver: feeHolder.address,
            kygStatus: 0,
          },
          policies: [
            {
              expireAt: now + 2,
              refundAmount: 30000,
            },
            {
              expireAt: now + 3 * days,
              refundAmount: 20000,
            },
          ],
        };

        // generate signature
        const signature = await verifier._signTypedData(domain, types, setting);

        await expect(property.connect(guest).book(setting, signature)).emit(
          property,
          "NewBooking"
        );

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = bookingInfo.balance;
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid
          .sub(fee)
          .sub(insuranceInfo.damageProtectionFee);

        await increaseTime(5 * days);

        now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            hostRevenue,
            fee,
            0,
            5
          ); // 5 = BookingStatus.PENDING_INSURANCE_FEE;

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(
          contractBalanceBefore.sub(hostRevenue).sub(fee)
        );
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(true);
      });

      it("should revert when unlocking pending insurance fee - make a payout before check in", async () => {
        const guest = users[3];
        const bookingId = 5;
        await expect(property.connect(guest).payout(bookingId)).revertedWith(
          "CannotChargeInsuranceFee"
        );
      });

      it("should revert when canceling booking in status of pending insurance fee", async () => {
        const guest = users[3];
        const bookingId = 5;
        await expect(property.connect(guest).cancel(bookingId)).revertedWith(
          "PaidOrCancelledAlready"
        );
        await expect(
          property.connect(host).cancelByHost(bookingId)
        ).revertedWith("PaidOrCancelledAlready");
      });

      it("should unlock pending insurance fee - make a payout after check in", async () => {
        const guest = users[3];
        const bookingId = 5;
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        await increaseTime(5 * days);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        const tx = await property.connect(guest).payout(bookingId);
        const receipt = await tx.wait();
        let events: any = await property.queryFilter(
          property.filters.InsuranceFeeCollected(),
          receipt.blockHash
        );

        let res = events.find((e: any) => e.event === "InsuranceFeeCollected");
        expect(res!.args.receiver).deep.equal(feeHolder.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.collectAt).deep.equal(txExecutionTime);
        expect(res!.args.feeAmount).deep.equal(
          insuranceInfo.damageProtectionFee
        );

        events = await property.queryFilter(
          property.filters.PayOut(),
          receipt.blockHash
        );

        res = events.find((e: any) => e.event === "PayOut");
        expect(res!.args.guest).deep.equal(guest.address);
        expect(res!.args.bookingId).deep.equal(bookingId);
        expect(res!.args.payAt).deep.equal(txExecutionTime);
        expect(res!.args.hostAmount).deep.equal(0);
        expect(res!.args.treasuryAmount).deep.equal(0);
        expect(res!.args.referrerAmount).deep.equal(0);
        expect(res!.args.status).deep.equal(2); // 2 = BookingStatus.FULLY_PAID

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore);
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore);
        expect(contractBalance).deep.equal(
          contractBalanceBefore.sub(insuranceInfo.damageProtectionFee)
        );
        expect(feeReceiverBalance).deep.equal(
          feeReceiverBalanceBefore.add(insuranceInfo.damageProtectionFee)
        );

        // check on-chain states
        const bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);
        expect(bookingInfo.status).deep.equal(2); // 2 = BookingStatus.FULLY_PAID

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });
    });

    describe("KYG status is FAILED and make a payout before check in", async () => {
      it("should charge a partial payment and update pending insurance fee", async () => {
        const guest = users[4];
        const bookingId = 6;

        let now = (await ethers.provider.getBlock("latest")).timestamp;
        const setting = {
          bookingId: 6,
          checkIn: now + 10 * days,
          checkOut: now + 11 * days,
          expireAt: now + 15 * days,
          bookingAmount: 80000,
          paymentToken: busd.address,
          referrer: constants.AddressZero,
          guest: guest.address,
          property: property.address,
          insuranceInfo: {
            damageProtectionFee: 10000,
            feeReceiver: feeHolder.address,
            kygStatus: 0,
          },
          policies: [
            {
              expireAt: now + 2,
              refundAmount: 30000,
            },
            {
              expireAt: now + 3 * days,
              refundAmount: 20000,
            },
          ],
        };

        // generate signature
        const signature = await verifier._signTypedData(domain, types, setting);

        await expect(property.connect(guest).book(setting, signature)).emit(
          property,
          "NewBooking"
        );

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        // calculate fees and related amounts
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);
        let bookingInfo = await property.getBookingById(bookingId);
        const toBePaid = bookingInfo.balance;
        const feeRatio = await management.feeNumerator();
        const feeDenominator = await management.FEE_DENOMINATOR();
        const fee = toBePaid.mul(feeRatio).div(feeDenominator);
        const hostRevenue = toBePaid
          .sub(fee)
          .sub(insuranceInfo.damageProtectionFee);

        await increaseTime(5 * days);

        now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            hostRevenue,
            fee,
            0,
            5
          ); // 5 = BookingStatus.PENDING_INSURANCE_FEE;

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(hostBalanceBefore.add(hostRevenue));
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore.add(fee));
        expect(contractBalance).deep.equal(
          contractBalanceBefore.sub(hostRevenue).sub(fee)
        );
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(true);
      });

      it("should revert when refunding insurance fee to host - make a payout before check in", async () => {
        const guest = users[4];
        const bookingId = 6;

        await property.connect(operator).updateKygStatusById(bookingId, 2); // KYG status = FAILED

        await expect(property.connect(guest).payout(bookingId)).revertedWith(
          "CannotChargeInsuranceFee"
        );
      });

      it("should revert when canceling booking in status of pending insurance fee", async () => {
        const guest = users[4];
        const bookingId = 6;
        await expect(property.connect(guest).cancel(bookingId)).revertedWith(
          "PaidOrCancelledAlready"
        );
        await expect(
          property.connect(host).cancelByHost(bookingId)
        ).revertedWith("PaidOrCancelledAlready");
      });

      it("should refund insurance fee to host - make a payout after check in", async () => {
        const guest = users[4];
        const bookingId = 6;
        const insuranceInfo = await property.getInsuranceInfoById(bookingId);

        // get balance before executing tx
        const guestBalanceBefore = await busd.balanceOf(guest.address);
        const hostBalanceBefore = await busd.balanceOf(host.address);
        const treasuryBalanceBefore = await busd.balanceOf(treasury.address);
        const contractBalanceBefore = await busd.balanceOf(property.address);
        const feeReceiverBalanceBefore = await busd.balanceOf(
          feeHolder.address
        );

        await increaseTime(5 * days);
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const txExecutionTime = now + 1;
        await expect(property.connect(guest).payout(bookingId))
          .emit(property, "PayOut")
          .withArgs(
            guest.address,
            bookingId,
            txExecutionTime,
            insuranceInfo.damageProtectionFee,
            0,
            0,
            2 // 2 = BookingStatus.FULLY_PAID
          );

        // check balance after payout
        const guestBalance = await busd.balanceOf(guest.address);
        const hostBalance = await busd.balanceOf(host.address);
        const treasuryBalance = await busd.balanceOf(treasury.address);
        const contractBalance = await busd.balanceOf(property.address);
        const feeReceiverBalance = await busd.balanceOf(feeHolder.address);

        expect(guestBalance).deep.equal(guestBalanceBefore);
        expect(hostBalance).deep.equal(
          hostBalanceBefore.add(insuranceInfo.damageProtectionFee)
        );
        expect(treasuryBalance).deep.equal(treasuryBalanceBefore);
        expect(contractBalance).deep.equal(
          contractBalanceBefore.sub(insuranceInfo.damageProtectionFee)
        );
        expect(feeReceiverBalance).deep.equal(feeReceiverBalanceBefore);

        // check on-chain states
        const bookingInfo = await property.getBookingById(bookingId);
        expect(bookingInfo.balance).deep.equal(0);
        expect(bookingInfo.status).deep.equal(2); // 2 = BookingStatus.FULLY_PAID

        const pendingStatus = await property.isInsuranceFeePending(bookingId);
        expect(pendingStatus).deep.equal(false);
      });
    });
  });
});
