//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IManagement.sol";
import "../interfaces/IProperty.sol";

// common custom errors
error ZeroAddress();
error OnlyHost();
error GrantedAlready();
error NotYetGranted();

// service custom errors
error Unauthorized();
error BookingNotFound();
error PaidOrCancelledAlready();

// booking() custom errors
error RequestExpired();
error InvalidCheckIn();
error InvalidCheckOut();
error EmptyPolicies();
error InvalidBookingAmount();
error InvalidPolicy();
error BookingExisted();
error InvalidPayment();
error InvalidSignature();

// payout() custom errors
error InsufficientBalance();
error NotPaidEnough();

// cancel custom errors
error InvalidGuest();

contract Property is
    IProperty,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using ECDSAUpgradeable for bytes32;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 private constant FEE_DENOMINATOR = 10**4;
    // keccak256("CancellationPolicy(uint256 expireAt,uint256 refundAmount)");
    bytes32 private constant CANCELLATION_POLICY_TYPEHASH =
        0x71ed7adc2b3cc6f42e80ad08652651cbc6e0fd93b50d04298efafcfb6570f246;
    // keccak256("Msg(uint256 bookingId,uint256 checkIn,uint256 checkOut,uint256 expireAt,uint256 bookingAmount,address paymentToken,address guest, address referrer, CancellationPolicy[] policies)CancellationPolicy(uint256 expireAt,uint256 refundAmount)");
    bytes32 private constant BOOKING_SETTING_TYPEHASH =
        0x760410127243be04d933d6c42bbf5bbfcccacabca8fe488f2211edfc1fdca5f6;

    // the property ID
    uint256 public propertyId;

    // list of booking indexes
    uint256[] public bookingIds;

    // host of the property
    address public host;

    // address of the property's factory
    address public factory;

    // mapping of addresses that have an authority to cancel a booking
    mapping(address => bool) public authorized;

    // returns the booking info for a given booking id
    mapping(uint256 => BookingInfo) private booking;

    // linked management instance
    IManagement public management;

    function init(
        uint256 _propertyId,
        address _host,
        address _management
    ) external override initializer {
        __Ownable_init();
        __EIP712_init("Booking_Property", "1");
        __ReentrancyGuard_init();

        propertyId = _propertyId;
        host = _host;
        factory = _msgSender();
        management = IManagement(_management);
    }

    /**
       @notice Grant authorized role
       @dev    Caller must be Owner
       @param _addr authorized address
     */
    function grantAuthorized(address _addr) external override {
        if (_msgSender() != host) revert OnlyHost();
        if (_addr == address(0)) revert ZeroAddress();
        if (authorized[_addr]) revert GrantedAlready();

        authorized[_addr] = true;
    }

    /**
       @notice Revoke authorized role
       @dev    Caller must be Owner
       @param _addr authorized address
     */
    function revokeAuthorized(address _addr) external override {
        if (_msgSender() != host) revert OnlyHost();
        if (_addr == address(0)) revert ZeroAddress();
        if (!authorized[_addr]) revert NotYetGranted();

        authorized[_addr] = false;
    }

    /**
        @notice Book a property
        @dev    Caller can be ANYONE
        @param  _setting booking input setting by user
        @param  _signature signed message using EIP712
     */
    function book(BookingSetting calldata _setting, bytes calldata _signature)
        external
        override
        nonReentrant
    {
        _validateSetting(_setting);

        // verify signed message
        _checkSignature(_setting, _signature);

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
        bookingInfo.guest = sender;
        bookingInfo.paymentToken = _setting.paymentToken;
        bookingInfo.referrer = _setting.referrer;
        bookingInfo.status = BookingStatus.IN_PROGRESS;

        uint256 n = _setting.policies.length;
        for (uint256 i; i < n; i++)
            bookingInfo.policies.push(_setting.policies[i]);

        bookingIds.push(_setting.bookingId);

        emit NewBooking(sender, _setting.bookingId, block.timestamp);
    }

    function _checkSignature(
        BookingSetting calldata _setting,
        bytes calldata _signature
    ) private {
        uint256 n = _setting.policies.length;
        bytes32[] memory policiesHashes = new bytes32[](n);
        for (uint256 i; i < n; i++) {
            policiesHashes[i] = keccak256(
                abi.encode(
                    CANCELLATION_POLICY_TYPEHASH,
                    _setting.policies[i].expireAt,
                    _setting.policies[i].refundAmount
                )
            );
        }

        address signer = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    BOOKING_SETTING_TYPEHASH,
                    _setting.bookingId,
                    _setting.checkIn,
                    _setting.checkOut,
                    _setting.expireAt,
                    _setting.bookingAmount,
                    _setting.paymentToken,
                    _msgSender(),
                    _setting.referrer,
                    keccak256(abi.encodePacked(policiesHashes))
                )
            )
        ).recover(_signature);
        if (signer != management.verifier()) revert InvalidSignature();
    }

    function _validateSetting(BookingSetting calldata _setting) private {
        uint256 current = block.timestamp;

        // validate input params
        if (_setting.expireAt <= current) revert RequestExpired();

        if (_setting.checkIn + 1 days < current) revert InvalidCheckIn();

        if (_setting.checkOut < _setting.checkIn + 1 days)
            revert InvalidCheckOut();

        uint256 n = _setting.policies.length;
        if (n == 0) revert EmptyPolicies();
        for (uint256 i = 0; i < n; i++) {
            if (_setting.bookingAmount < _setting.policies[i].refundAmount)
                revert InvalidBookingAmount();

            if (i < n - 1)
                if (
                    _setting.policies[i].expireAt >=
                    _setting.policies[i + 1].expireAt
                ) revert InvalidPolicy();
        }

        // validate states
        if (booking[_setting.bookingId].guest != address(0))
            revert BookingExisted();

        if (!management.paymentToken(_setting.paymentToken))
            revert InvalidPayment();
    }

    /**
        @notice Cancel the booking for the given id
        @dev    Caller must be the booking owner
        @param  _bookingId the booking id to cancel
     */
    function cancel(uint256 _bookingId) external override nonReentrant {
        BookingInfo memory info = booking[_bookingId];
        if (_msgSender() != info.guest) revert InvalidGuest();
        if (info.balance == 0) revert PaidOrCancelledAlready();

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
        uint256 fee = ((info.balance - refundAmount) *
            management.feeNumerator()) / FEE_DENOMINATOR;
        uint256 hostRevenue = info.balance - refundAmount - fee;

        // transfer payment and charge fee
        IERC20Upgradeable(info.paymentToken).safeTransfer(
            info.guest,
            refundAmount
        );
        IERC20Upgradeable(info.paymentToken).safeTransfer(host, hostRevenue);
        IERC20Upgradeable(info.paymentToken).safeTransfer(
            management.treasury(),
            fee
        );

        // update booking storage
        booking[_bookingId].status = BookingStatus.GUEST_CANCELLED;
        booking[_bookingId].balance = 0;

        emit GuestCancelled(info.guest, _bookingId, current);
    }

    /**
        @notice Pay out the booking
        @dev    Caller can be ANYONE
        @param  _bookingId the booking id to pay out
     */
    function payout(uint256 _bookingId) external override nonReentrant {
        BookingInfo memory info = booking[_bookingId];
        if (info.guest == address(0)) revert BookingNotFound();
        if (info.balance == 0) revert PaidOrCancelledAlready();

        uint256 toBePaid;
        uint256 n = info.policies.length;
        uint256 delay = management.payoutDelay();
        uint256 current = block.timestamp;
        if (
            info.policies[info.policies.length - 1].expireAt + delay < current
        ) {
            toBePaid = info.balance;
        } else {
            for (uint256 i = 0; i < n; i++) {
                if (info.policies[i].expireAt + delay >= current) {
                    if (info.balance < info.policies[i].refundAmount)
                        revert InsufficientBalance();
                    toBePaid = info.balance - info.policies[i].refundAmount;
                    break;
                }
            }
        }

        if (toBePaid == 0) revert NotPaidEnough();

        // update booking storage
        uint256 remain = info.balance - toBePaid;
        BookingStatus status = remain == 0
            ? BookingStatus.FULLY_PAID
            : BookingStatus.PARTIAL_PAID;
        booking[_bookingId].balance = remain;
        booking[_bookingId].status = status;

        // split the payment
        uint256 fee = (toBePaid * management.feeNumerator()) / FEE_DENOMINATOR;
        uint256 hostRevenue = toBePaid - fee;

        // transfer payment and charge fee
        IERC20Upgradeable(info.paymentToken).safeTransfer(host, hostRevenue);
        IERC20Upgradeable(info.paymentToken).safeTransfer(
            management.treasury(),
            fee
        );

        emit PayOut(info.guest, _bookingId, current, status);
    }

    /**
        @notice Cancel the booking
        @dev    Caller must be the host or authorized addresses
        @param  _bookingId the booking id to cancel
     */
    function cancelByHost(uint256 _bookingId) external override nonReentrant {
        address sender = _msgSender();
        if (sender != host && !authorized[sender]) revert Unauthorized();

        BookingInfo memory info = booking[_bookingId];
        if (info.guest == address(0)) revert BookingNotFound();
        if (info.balance == 0) revert PaidOrCancelledAlready();

        // refund to the guest
        IERC20Upgradeable(info.paymentToken).safeTransfer(
            info.guest,
            info.balance
        );

        // update booking storage
        booking[_bookingId].status = BookingStatus.HOST_CANCELLED;
        booking[_bookingId].balance = 0;

        emit HostCancelled(sender, _bookingId, block.timestamp);
    }

    /**
        @notice Get a booking info by given ID
        @param _id booking ID
     */
    function getBookingById(uint256 _id)
        external
        view
        override
        returns (BookingInfo memory)
    {
        return booking[_id];
    }

    /**
        @notice Get the total number of bookings
     */
    function totalBookings() external view override returns (uint256) {
        return bookingIds.length;
    }
}
