//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IManagement.sol";
import "../interfaces/IProperty.sol";

contract PropertyV2 is
    IProperty,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable
{
    using ECDSAUpgradeable for bytes32;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 private constant FEE_DENOMINATOR = 10**4;
    bytes32 private constant CANCELLATION_POLICY_TYPEHASH =
        keccak256("CancellationPolicy(uint256 expireAt,uint256 refundAmount)");
    bytes32 private constant BOOKING_SETTING_TYPEHASH =
        keccak256(
            "Msg(uint256 bookingId,uint256 checkIn,uint256 checkOut,uint256 expireAt,uint256 bookingAmount,address paymentToken,address guest,CancellationPolicy[] policies)CancellationPolicy(uint256 expireAt,uint256 refundAmount)"
        );

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

    modifier AddressZero(address _addr) {
        require(_addr != address(0), "Property: Cannot be zero address");
        _;
    }

    modifier onlyHost() {
        require(_msgSender() == host, "Property: Only host");
        _;
    }

    function init(
        uint256 _propertyId,
        address _host,
        address _management
    ) external initializer {
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
    function grantAuthorized(address _addr) external pure override {
        _addr;
        revert("grantAuthorized() upgraded!");
    }

    /**
       @notice Revoke authorized role
       @dev    Caller must be Owner
       @param _addr authorized address
     */
    function revokeAuthorized(address _addr) external pure override {
        _addr;
        revert("revokeAuthorized() upgraded!");
    }

    /**
        @notice Book a property
        @dev    Caller can be ANYONE
        @param  _setting booking input setting by user
        @param  _signature signed message using EIP712
     */
    function book(BookingSetting calldata _setting, bytes calldata _signature)
        external
        pure
        override
    {
        _setting;
        _signature;
        revert("book() upgraded!");
    }

    /**
        @notice Cancel the booking for the given id
        @dev    Caller must be the booking owner
        @param  _bookingId the booking id to cancel
     */
    function cancel(uint256 _bookingId) external pure override {
        _bookingId;
        revert("cancel() upgraded!");
    }

    /**
        @notice Pay out the booking
        @dev    Caller must be the booking owner
        @param  _bookingId the booking id to pay out
     */
    function payout(uint256 _bookingId) external pure override {
        _bookingId;
        revert("payout() upgraded!");
    }

    /**
        @notice Cancel the booking
        @dev    Caller must be the host or authorized addresses
        @param  _bookingId the booking id to cancel
     */
    function cancelByHost(uint256 _bookingId) external pure override {
        _bookingId;
        revert("cancelByHost() upgraded!");
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
        require(_id == 0, "getBookingById() upgraded!");
        return booking[_id];
    }

    /**
        @notice Get the total number of bookings
     */
    function totalBookings() external view override returns (uint256) {
        require(bookingIds.length > 100, "totalBookings() upgraded!");
        return bookingIds.length;
    }
}
