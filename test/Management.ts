import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Management, ERC20Test } from "../typechain";
import { constants, Wallet } from "ethers";

describe("Management test", function () {
  let management: Management;
  let paymentToken: ERC20Test;
  let trvl: ERC20Test;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let verifier: SignerWithAddress;
  let treasury: SignerWithAddress;
  let users: SignerWithAddress[];

  const feeNumerator = 1000; // 1000 / 10000 = 10%
  const referralFeeNumerator = 500; // 500 / 10000 = 5%
  const FEE_DENOMINATOR = 10000;
  const days = 24 * 3600;
  const payoutDelay = 2 * days;

  before(async () => {
    [admin, operator, verifier, treasury, ...users] = await ethers.getSigners();

    // deploy mock erc20 for payment
    const mockErc20Factory = await ethers.getContractFactory("ERC20Test");
    paymentToken = await mockErc20Factory.deploy("paymentToken", "PMT");

    // deploy mock trvl for payment
    trvl = await mockErc20Factory.deploy("Dtravel", "TRVL");

    // deploy management
    const managementFactory = await ethers.getContractFactory("Management");
    management = await managementFactory.deploy(
      feeNumerator,
      referralFeeNumerator,
      payoutDelay,
      constants.AddressZero,
      constants.AddressZero,
      constants.AddressZero,
      [paymentToken.address]
    );
  });

  it("should get admin - contract owner", async () => {
    const res = await management.admin();
    expect(res).deep.equal(admin.address);
  });

  describe("Update fee ratio", async () => {
    it("should get fee denominator", async () => {
      const feeDenominator = await management.FEE_DENOMINATOR();
      expect(feeDenominator).deep.equal(FEE_DENOMINATOR);
    });

    it("should get fee numerator", async () => {
      const currentfeeNumerator = await management.feeNumerator();
      expect(currentfeeNumerator).deep.equal(feeNumerator);
    });

    it("should set fee ratio if caller is ADMIN", async () => {
      const newFeeNumerator = 2000; // 2000 / 10000 = 20%
      await expect(management.setFeeRatio(newFeeNumerator))
        .emit(management, "NewFeeNumerator")
        .withArgs(newFeeNumerator);

      const currentfeeNumerator = await management.feeNumerator();
      expect(currentfeeNumerator).deep.equal(newFeeNumerator);
    });

    it("should revert when setting fee ratio if caller is not ADMIN", async () => {
      await expect(management.connect(operator).setFeeRatio(300)).revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert when setting incorrect fee ratio", async () => {
      await expect(management.setFeeRatio(20000)).revertedWith("InvalidFee");
    });
  });

  describe("Update referral fee ratio", async () => {
    it("should set referral fee ratio if caller is ADMIN", async () => {
      await expect(management.setReferralFeeRatio(referralFeeNumerator))
        .emit(management, "NewReferralFeeNumerator")
        .withArgs(referralFeeNumerator);
    });

    it("should get referral fee numerator", async () => {
      const currentReferralFeeDenominator =
        await management.referralFeeNumerator();
      expect(currentReferralFeeDenominator).deep.equal(referralFeeNumerator);
    });

    it("should revert when setting referral fee ratio if caller is not ADMIN", async () => {
      await expect(
        management.connect(operator).setReferralFeeRatio(100)
      ).revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when setting referral fee greater than treasury fee", async () => {
      const currentfeeNumerator = await management.feeNumerator();
      await expect(
        management.setReferralFeeRatio(currentfeeNumerator.add(100))
      ).revertedWith("InvalidReferralFee");
    });

    it("should revert when setting referral fee and treasury fee exceeding 100%", async () => {
      await management.setFeeRatio(6000);
      await expect(management.setReferralFeeRatio(3999))
        .emit(management, "NewReferralFeeNumerator")
        .withArgs(3999);
      await expect(management.setReferralFeeRatio(5000)).revertedWith(
        "InvalidReferralFee"
      );
    });
  });

  describe("Update payout delay", async () => {
    it("should get payout delay", async () => {
      const res = await management.payoutDelay();
      expect(res).deep.equal(payoutDelay);
    });

    it("should set payout deplay if caller is ADMIN", async () => {
      const newPayoutDelay = 1 * days;
      await expect(management.setPayoutDelay(newPayoutDelay))
        .emit(management, "NewPayoutDelay")
        .withArgs(newPayoutDelay);

      const res = await management.payoutDelay();
      expect(res).deep.equal(newPayoutDelay);
    });

    it("should revert when setting payout delay if caller is not ADMIN", async () => {
      await expect(
        management.connect(users[0]).setPayoutDelay(100)
      ).revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Update operator", async () => {
    it("should set operator if caller is ADMIN", async () => {
      await expect(management.setOperator(operator.address))
        .emit(management, "NewOperator")
        .withArgs(operator.address);
    });

    it("should get operator address", async () => {
      const res = await management.operator();
      expect(res).deep.equal(operator.address);
    });

    it("should revert when setting operator if caller is not ADMIN", async () => {
      await expect(
        management.connect(verifier).setOperator(Wallet.createRandom().address)
      ).revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when setting operator by address zero", async () => {
      await expect(management.setOperator(constants.AddressZero)).revertedWith(
        "ZeroAddress"
      );
    });
  });

  describe("Update treasury", async () => {
    it("should set treasury if caller is ADMIN", async () => {
      await expect(management.setTreasury(treasury.address))
        .emit(management, "NewTreasury")
        .withArgs(treasury.address);
    });

    it("should get treasury address", async () => {
      const res = await management.treasury();
      expect(res).deep.equal(treasury.address);
    });

    it("should revert when setting treasury if caller is not ADMIN", async () => {
      await expect(
        management.connect(users[1]).setTreasury(Wallet.createRandom().address)
      ).revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when setting treasury by address zero", async () => {
      await expect(management.setTreasury(constants.AddressZero)).revertedWith(
        "ZeroAddress"
      );
    });
  });

  describe("Update verifier", async () => {
    it("should set verifier if caller is ADMIN", async () => {
      await expect(management.setVerifier(verifier.address))
        .emit(management, "NewVerifier")
        .withArgs(verifier.address);
    });

    it("should get verifier address", async () => {
      const res = await management.verifier();
      expect(res).deep.equal(verifier.address);
    });

    it("should revert when setting verifier if caller is not ADMIN", async () => {
      await expect(
        management.connect(users[1]).setVerifier(Wallet.createRandom().address)
      ).revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when setting verifier by address zero", async () => {
      await expect(management.setVerifier(constants.AddressZero)).revertedWith(
        "ZeroAddress"
      );
    });
  });

  describe("Update payment", async () => {
    describe("Add a payment token", async () => {
      it("should check if payment token is supported", async () => {
        const res = await management.paymentToken(paymentToken.address);
        expect(res).deep.equal(true);
      });

      it("should add token address to payment tokens if caller is ADMIN", async () => {
        await expect(management.addPayment(trvl.address))
          .emit(management, "PaymentTokensAdd")
          .withArgs(trvl.address);

        const res = await management.paymentToken(trvl.address);
        expect(res).deep.equal(true);
      });

      it("should revert when adding a new payment token if caller is not ADMIN", async () => {
        await expect(
          management.connect(operator).addPayment(Wallet.createRandom().address)
        ).revertedWith("Ownable: caller is not the owner");
      });

      it("should revert when adding address zero to payment tokens", async () => {
        await expect(management.addPayment(constants.AddressZero)).revertedWith(
          "ZeroAddress"
        );
      });

      it("should revert when adding an existing payment token", async () => {
        await expect(management.addPayment(trvl.address)).revertedWith(
          "PaymentExisted"
        );
      });
    });

    describe("Remove a payment token", async () => {
      it("should remove a payment token if caller is ADMIN", async () => {
        await expect(management.removePayment(paymentToken.address))
          .emit(management, "PaymentTokensRemove")
          .withArgs(paymentToken.address);

        const res = await management.paymentToken(paymentToken.address);
        expect(res).deep.equal(false);
      });

      it("should revert when remove a payment token if caller is not ADMIN", async () => {
        await expect(
          management.connect(operator).removePayment(paymentToken.address)
        ).revertedWith("Ownable: caller is not the owner");
      });

      it("should revert when adding address zero to payment tokens", async () => {
        await expect(
          management.removePayment(constants.AddressZero)
        ).revertedWith("ZeroAddress");
      });

      it("should revert when remove an unsupported payment token", async () => {
        await expect(
          management.removePayment(paymentToken.address)
        ).revertedWith("PaymentNotFound");
      });
    });
  });
});
