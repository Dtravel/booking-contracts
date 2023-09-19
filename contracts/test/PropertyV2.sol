//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IManagement.sol";
import "../interfaces/IProperty.sol";

contract PropertyV2 is
    IProperty,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

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
        address _management,
        address _delegate
    ) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        propertyId = _propertyId;
        host = _host;
        paymentReceiver = _host;
        factory = _msgSender();
        _delegate;
        management = IManagement(_management);
    }

    /**
       @notice Grant authorized role
       @dev    Caller must be Owner
       @param _addr authorized address
     */
    function grantAuthorized(address _addr) external pure {
        _addr;
        revert("grantAuthorized() upgraded!");
    }

    /**
       @notice Revoke authorized role
       @dev    Caller must be Owner
       @param _addr authorized address
     */
    function revokeAuthorized(address _addr) external pure {
        _addr;
        revert("revokeAuthorized() upgraded!");
    }

    /**
       @notice Update host wallet
       @dev    Caller must be HOST or AUTHORIZED
       @param _newWallet new wallet address
     */
    function updateHost(address _newWallet) external pure {
        _newWallet;
        // solhint-disable-next-line
        revert("updateHost() upgraded!");
    }

    /**
        @notice Update payment receiver wallet
        @dev    Caller must be HOST or DELEGATOR
        @param _addr new payment receiver address
     */
    function updatePaymentReceiver(address _addr) external pure {
        _addr;
        // solhint-disable-next-line
        revert("updatePaymentReceiver() upgraded!");
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
    function cancel(uint256 _bookingId) external pure {
        _bookingId;
        revert("cancel() upgraded!");
    }

    /**
        @notice Pay out the booking
        @dev    Caller must be the booking owner
        @param  _bookingId the booking id to pay out
     */
    function payout(uint256 _bookingId) external pure {
        _bookingId;
        revert("payout() upgraded!");
    }

    /**
        @notice Cancel the booking
        @dev    Caller must be the host or authorized addresses
        @param  _bookingId the booking id to cancel
     */
    function cancelByHost(uint256 _bookingId) external pure {
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
        returns (BookingInfo memory)
    {
        require(_id == 0, "getBookingById() upgraded!");
        return booking[_id];
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
        require(_id == 0, "getInsuranceInfoById() upgraded!");
        return insurance[_id];
    }

    /**
        @notice Get the total number of bookings
     */
    function totalBookings() external view returns (uint256) {
        require(bookingIds.length > 100, "totalBookings() upgraded!");
        return bookingIds.length;
    }
}
