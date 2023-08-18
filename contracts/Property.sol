//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/IManagement.sol";
import "./interfaces/IProperty.sol";
import "./interfaces/IEIP712.sol";

contract Property is IProperty, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 private constant FEE_DENOMINATOR = 10**4;

    // the property ID
    uint256 public propertyId;

    // list of booking indexes
    uint256[] public bookingIds;

    // host of the property
    address public host;

    // address of booking payment recipient
    address public paymentReceiver;

    // address of the property's factory
    address public factory;

    // mapping of addresses that have an authority to cancel a booking
    mapping(address => bool) public authorized;

    // returns the booking info for a given booking id
    mapping(uint256 => BookingInfo) private booking;

    // linked management instance
    IManagement public management;

    // returns the insurance info for a given booking id
    mapping(uint256 => InsuranceInfo) private insurance;

    // mapping of bookings that have pending insurance fees
    mapping(uint256 => bool) public isInsuranceFeePending;

    function init(
        uint256 _propertyId,
        address _host,
        address _management,
        address _delegate
    ) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        propertyId = _propertyId;
        host = _host;
        paymentReceiver = _host;
        factory = _msgSender();
        management = IManagement(_management);
        authorized[_delegate] = true;
    }

    /**
       @notice Grant authorized role
       @dev    Caller must be HOST or AUTHORIZED ADDRESS
       @param _addr authorized address
     */
    function grantAuthorized(address _addr) external {
        address sender = _msgSender();
        require(sender == host || authorized[sender], "Unauthorized");
        require(_addr != address(0), "ZeroAddress");
        require(!authorized[_addr], "GrantedAlready");

        authorized[_addr] = true;

        emit GrantAuthorized(_addr);
    }

    /**
       @notice Revoke authorized role
       @dev    Caller must be HOST or AUTHORIZED ADDRESS
       @param _addr authorized address
     */
    function revokeAuthorized(address _addr) external {
        address sender = _msgSender();
        require(sender == host || authorized[sender], "Unauthorized");
        require(_addr != address(0), "ZeroAddress");
        require(authorized[_addr], "NotYetGranted");

        authorized[_addr] = false;

        emit RevokeAuthorized(_addr);
    }

    /**
       @notice Update host wallet
       @dev    Caller must be HOST or AUTHORIZED ADDRESS
       @param _addr new host address
     */
    function updateHost(address _addr) external {
        address sender = _msgSender();
        require(sender == host || authorized[sender], "Unauthorized");
        require(_addr != address(0), "ZeroAddress");
        require(_addr != host, "HostExisted");

        host = _addr;

        emit NewHost(_addr);
    }

    /**
        @notice Update payment receiver wallet
        @dev    Caller must be HOST or AUTHORIZED ADDRESS
        @param _addr new payment receiver address
     */
    function updatePaymentReceiver(address _addr) external {
        address sender = _msgSender();
        require(sender == host || authorized[sender], "Unauthorized");
        require(_addr != address(0), "ZeroAddress");
        require(_addr != paymentReceiver, "PaymentReceiverExisted");

        paymentReceiver = _addr;

        emit NewPaymentReceiver(_addr);
    }

    /**
        @notice Update KYG status of the given booking ID
        @dev    Caller must be OPERATOR
        @param  _id booking ID
        @param  _status new KYG status
     */
    function updateKygStatusById(uint256 _id, KygStatus _status) external {
        require(_msgSender() == management.operator(), "OnlyOperator");
        BookingInfo memory info = booking[_id];
        require(info.guest != address(0), "BookingNotFound");
        require(
            info.balance > 0 || isInsuranceFeePending[_id],
            "BookingAlreadyFinalized"
        );

        InsuranceInfo storage insuranceInfo = insurance[_id];
        require(insuranceInfo.damageProtectionFee > 0, "InsuranceNotFound");

        // only accept to change status from IN_PROGRESS to PASSED/FAILED
        require(
            insuranceInfo.kygStatus == KygStatus.IN_PROGRESS,
            "StatusAlreadyFinalized"
        );
        require(
            _status == KygStatus.PASSED || _status == KygStatus.FAILED,
            "InvalidKYGStatus"
        );
        insuranceInfo.kygStatus = _status;
    }

    /**
        @notice Book a property
        @dev    Caller can be ANYONE
        @param  _setting booking input setting by user
        @param  _signature signed message using EIP712
     */
    function book(BookingSetting calldata _setting, bytes calldata _signature)
        external
        payable
        nonReentrant
    {
        _validateSetting(_setting);

        // verify signed message
        IEIP712(management.eip712()).verify(propertyId, _setting, _signature);

        // contract charges booking payment
        address sender = _msgSender();
        IERC20Upgradeable(_setting.paymentToken).safeTransferFrom(
            sender,
            address(this),
            _setting.bookingAmount
        );

        // Update a new booking record
        BookingInfo storage bookingInfo = booking[_setting.bookingId];
        bookingInfo.checkIn = _setting.checkIn;
        bookingInfo.checkOut = _setting.checkOut;
        bookingInfo.balance = _setting.bookingAmount;
        bookingInfo.feeNumerator = management.feeNumerator();
        bookingInfo.guest = sender;
        bookingInfo.paymentToken = _setting.paymentToken;
        bookingInfo.paymentReceiver = paymentReceiver;
        if (_setting.referrer != address(0)) {
            bookingInfo.referrer = _setting.referrer;
            bookingInfo.referralFeeNumerator = management
                .referralFeeNumerator();
        }

        if (_setting.insuranceInfo.damageProtectionFee > 0) {
            insurance[_setting.bookingId] = _setting.insuranceInfo;
        }

        uint256 n = _setting.policies.length;
        for (uint256 i; i < n; i++)
            bookingInfo.policies.push(_setting.policies[i]);

        bookingIds.push(_setting.bookingId);

        emit NewBooking(sender, _setting.bookingId, block.timestamp);
    }

    function _validateSetting(BookingSetting calldata _setting) private {
        uint256 current = block.timestamp;

        // validate input params
        require(_setting.guest == _msgSender(), "InvalidGuest");

        require(_setting.property == address(this), "InvalidProperty");

        require(_setting.expireAt > current, "RequestExpired");

        require(_setting.checkIn + 1 days >= current, "InvalidCheckIn");

        require(
            _setting.checkOut >= _setting.checkIn + 1 days,
            "InvalidCheckOut"
        );

        uint256 n = _setting.policies.length;
        require(n > 0, "EmptyPolicies");
        for (uint256 i = 0; i < n; i++) {
            require(
                _setting.bookingAmount >= _setting.policies[i].refundAmount,
                "InvalidBookingAmount"
            );

            if (i < n - 1)
                require(
                    _setting.policies[i].expireAt <
                        _setting.policies[i + 1].expireAt,
                    "InvalidPolicy"
                );
        }

        // validate states
        require(
            booking[_setting.bookingId].guest == address(0),
            "BookingExisted"
        );

        require(
            management.paymentToken(_setting.paymentToken),
            "InvalidPayment"
        );

        if (_setting.paymentToken == address(0)) {
            require(
                msg.value >= _setting.bookingAmount,
                "InvalidTransactionValue"
            );
        }

        // validate insurance fee
        require(
            _setting.insuranceInfo.damageProtectionFee <
                (_setting.bookingAmount *
                    (FEE_DENOMINATOR - management.feeNumerator())) /
                    FEE_DENOMINATOR,
            "InvalidInsuranceFee"
        );
        require(
            _setting.insuranceInfo.damageProtectionFee == 0 ||
                _setting.insuranceInfo.feeReceiver != address(0),
            "InvalidInsuranceFeeReceiver"
        );
    }

    /**
        @notice Cancel the booking for the given id
        @dev    Caller must be the booking owner
        @param  _bookingId the booking id to cancel
     */
    function cancel(uint256 _bookingId) external nonReentrant {
        BookingInfo memory info = booking[_bookingId];
        require(_msgSender() == info.guest, "InvalidGuest");
        require(info.balance > 0, "PaidOrCancelledAlready");

        uint256 refundAmount;
        uint256 n = info.policies.length;
        uint256 current = block.timestamp;
        for (uint256 i = 0; i < n; i++) {
            if (info.policies[i].expireAt >= current) {
                refundAmount = info.policies[i].refundAmount;
                break;
            }
        }

        // refund to the guest
        require(info.balance >= refundAmount, "InsufficientBalance");
        uint256 remainingAmount = info.balance - refundAmount;
        uint256 referralFee;
        if (info.referrer != address(0)) {
            referralFee = ((remainingAmount * info.referralFeeNumerator) /
                FEE_DENOMINATOR);
        }
        uint256 fee = (remainingAmount * info.feeNumerator) /
            FEE_DENOMINATOR -
            referralFee;
        uint256 hostRevenue = remainingAmount - fee - referralFee;

        // transfer payment and charge fee
        IERC20Upgradeable paymentToken = IERC20Upgradeable(info.paymentToken);
        paymentToken.safeTransfer(info.guest, refundAmount);
        paymentToken.safeTransfer(info.paymentReceiver, hostRevenue);
        paymentToken.safeTransfer(management.treasury(), fee);
        if (info.referrer != address(0)) {
            paymentToken.safeTransfer(info.referrer, referralFee);
        }

        // update booking storage
        booking[_bookingId].status = BookingStatus.GUEST_CANCELLED;
        booking[_bookingId].balance = 0;

        emit GuestCancelled(
            info.guest,
            _bookingId,
            current,
            refundAmount,
            hostRevenue,
            fee,
            referralFee
        );
    }

    /**
        @notice Pay out the booking
        @dev    Caller can be ANYONE
        @param  _bookingId the booking id to pay out
     */
    function payout(uint256 _bookingId) external nonReentrant {
        BookingInfo memory info = booking[_bookingId];

        require(info.guest != address(0), "BookingNotFound");

        bool pendingFee = isInsuranceFeePending[_bookingId];
        require(info.balance > 0 || pendingFee, "PaidOrCancelledAlready");

        if (info.balance == 0 && pendingFee) {
            _finalizeInsuranceFee(_bookingId);
            return;
        }

        uint256 toBePaid;
        uint256 current = block.timestamp;
        {
            uint256 n = info.policies.length;
            uint256 delay = management.payoutDelay();
            if (info.policies[n - 1].expireAt + delay < current) {
                toBePaid = info.balance;
            } else {
                for (uint256 i = 0; i < n; i++) {
                    if (info.policies[i].expireAt + delay >= current) {
                        require(
                            info.balance >= info.policies[i].refundAmount,
                            "InsufficientBalance"
                        );
                        // we allow guests to deposit funds in property contract even though these funds are insufficient to charge payment later.
                        // Guests have to ask host for refund. Therefore, the condition to check if info.balance >= sum of required refund in policies is ignored.
                        // This also saves us some gas to validate a new booking input in function `_validateSetting`.
                        toBePaid = info.balance - info.policies[i].refundAmount;
                        break;
                    }
                }
            }
        }

        require(toBePaid > 0, "NotPaidEnough");
        uint256 remain = info.balance - toBePaid;

        InsuranceInfo memory insuranceInfo = insurance[_bookingId];
        bool isInsuranceFeeActive = insuranceInfo.damageProtectionFee > 0 &&
            insuranceInfo.kygStatus != KygStatus.FAILED;
        // check insurance fee to decide the amount can be paid for this time
        // if it is not the final payout and insurance fee is active
        if (isInsuranceFeeActive && remain > 0) {
            uint256 netRemain = remain -
                (remain * info.feeNumerator) /
                FEE_DENOMINATOR;
            // if booking balance is not sufficient for insurance fee
            // then the payout will be suspended until the final payout,
            // in order to ensure that booking balance is enough to charge insurance fee
            if (netRemain < insuranceInfo.damageProtectionFee) {
                remain = remain + toBePaid;
                toBePaid = 0;
            }
        }

        BookingStatus status = remain == 0
            ? BookingStatus.FULLY_PAID
            : BookingStatus.PARTIAL_PAID;

        // update booking storage
        booking[_bookingId].balance = remain;
        booking[_bookingId].status = status;

        // split the payment
        uint256 referralFee;
        if (info.referrer != address(0)) {
            referralFee =
                (toBePaid * info.referralFeeNumerator) /
                FEE_DENOMINATOR;
        }
        uint256 fee = (toBePaid * info.feeNumerator) /
            FEE_DENOMINATOR -
            referralFee;
        uint256 hostRevenue = toBePaid - fee - referralFee;

        IERC20Upgradeable paymentToken = IERC20Upgradeable(info.paymentToken);

        // check logic to collect insurance fee in the final payout
        if (isInsuranceFeeActive && remain == 0) {
            // deduct insurance fee from host revenue
            // this subtraction won't be overflowed because remaining booking balance
            // is hold to ensure to be greater than insurance fee until the final payout
            hostRevenue = hostRevenue - insuranceInfo.damageProtectionFee;
            if (
                info.checkIn > current &&
                insuranceInfo.kygStatus != KygStatus.PASSED
            ) {
                // if it is the final payout but not reach check-in date and kyg status is not passed (still in progress)
                // then contract will continue holding insurance fee until check-in date
                isInsuranceFeePending[_bookingId] = true;
                // update booking storage
                status = BookingStatus.PENDING_INSURANCE_FEE;
                booking[_bookingId].status = status;
            } else {
                // collect insurance fee
                paymentToken.safeTransfer(
                    insuranceInfo.feeReceiver,
                    insuranceInfo.damageProtectionFee
                );
                emit InsuranceFeeCollected(
                    insuranceInfo.feeReceiver,
                    _bookingId,
                    current,
                    insuranceInfo.damageProtectionFee
                );
            }
        }

        // transfer payment and charge booking fee
        paymentToken.safeTransfer(info.paymentReceiver, hostRevenue);
        paymentToken.safeTransfer(management.treasury(), fee);
        if (info.referrer != address(0)) {
            paymentToken.safeTransfer(info.referrer, referralFee);
        }

        emit PayOut(
            info.guest,
            _bookingId,
            current,
            hostRevenue,
            fee,
            referralFee,
            status
        );
    }

    function _finalizeInsuranceFee(uint256 _bookingId) private {
        uint256 current = block.timestamp;
        BookingInfo memory info = booking[_bookingId];
        require(info.checkIn <= current, "CannotChargeInsuranceFee");

        // update storage
        booking[_bookingId].status = BookingStatus.FULLY_PAID;
        isInsuranceFeePending[_bookingId] = false;

        InsuranceInfo memory insuranceInfo = insurance[_bookingId];
        IERC20Upgradeable paymentToken = IERC20Upgradeable(info.paymentToken);
        uint256 refundAmount;
        if (insuranceInfo.kygStatus == KygStatus.FAILED) {
            refundAmount = insuranceInfo.damageProtectionFee;
            // refund insurance fee to host
            paymentToken.safeTransfer(info.paymentReceiver, refundAmount);
        } else {
            // collect pending insurance fee
            paymentToken.safeTransfer(
                insuranceInfo.feeReceiver,
                insuranceInfo.damageProtectionFee
            );
            emit InsuranceFeeCollected(
                insuranceInfo.feeReceiver,
                _bookingId,
                current,
                insuranceInfo.damageProtectionFee
            );
        }
        emit PayOut(
            info.guest,
            _bookingId,
            current,
            refundAmount,
            0,
            0,
            BookingStatus.FULLY_PAID
        );
    }

    /**
        @notice Cancel the booking
        @dev    Caller must be the host or authorized addresses
        @param  _bookingId the booking id to cancel
     */
    function cancelByHost(uint256 _bookingId) external nonReentrant {
        address sender = _msgSender();
        require(sender == host || authorized[sender], "Unauthorized");

        BookingInfo memory info = booking[_bookingId];
        require(info.guest != address(0), "BookingNotFound");
        require(info.balance > 0, "PaidOrCancelledAlready");

        // refund to the guest
        IERC20Upgradeable(info.paymentToken).safeTransfer(
            info.guest,
            info.balance
        );

        // update booking storage
        booking[_bookingId].status = BookingStatus.HOST_CANCELLED;
        booking[_bookingId].balance = 0;

        emit HostCancelled(sender, _bookingId, block.timestamp, info.balance);
    }

    /**
        @notice Get a booking info by given ID
        @param _id booking ID
     */
    function getBookingById(uint256 _id)
        external
        view
        returns (BookingInfo memory)
    {
        return booking[_id];
    }

    /**
        @notice Get the total number of bookings
     */
    function totalBookings() external view returns (uint256) {
        return bookingIds.length;
    }

    /**
        @notice Get insurance info of given booking ID
        @param _id booking ID
     */
    function getInsuranceInfoById(uint256 _id)
        external
        view
        returns (InsuranceInfo memory)
    {
        return insurance[_id];
    }

    // solhint-disable-next-line
    receive() external payable {}
}
