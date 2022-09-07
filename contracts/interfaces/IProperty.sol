// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IProperty {
    struct CancellationPolicy {
        uint256 expireAt;
        uint256 refundAmount;
    }

    struct BookingInfo {
        uint256 checkIn;
        uint256 checkOut;
        uint256 balance;
        address guest;
        address paymentToken;
        address referrer;
        BookingStatus status;
        CancellationPolicy[] policies;
    }

    enum BookingStatus {
        IN_PROGRESS,
        PARTIAL_PAID,
        FULLY_PAID,
        GUEST_CANCELLED,
        HOST_CANCELLED
    }

    struct BookingSetting {
        uint256 bookingId;
        uint256 checkIn;
        uint256 checkOut;
        uint256 expireAt;
        uint256 bookingAmount;
        address paymentToken;
        address referrer;
        CancellationPolicy[] policies;
    }

    function init(
        uint256 _propertyId,
        address _host,
        address _management
    ) external;

    function grantAuthorized(address _addr) external;

    function revokeAuthorized(address _addr) external;

    function book(BookingSetting calldata _setting, bytes calldata _signature)
        external;

    function cancel(uint256 _bookingId) external;

    function payout(uint256 _bookingId) external;

    function cancelByHost(uint256 _bookingId) external;

    function getBookingById(uint256 _id) external returns (BookingInfo memory);

    function totalBookings() external view returns (uint256);

    event NewBooking(
        address indexed guest,
        uint256 indexed bookingId,
        uint256 bookedAt
    );

    event GuestCancelled(
        address indexed guest,
        uint256 indexed bookingId,
        uint256 cancelledAt
    );

    event HostCancelled(
        address indexed host,
        uint256 indexed bookingId,
        uint256 cancelledAt
    );

    event PayOut(
        address indexed guest,
        uint256 indexed bookingId,
        uint256 payAt,
        BookingStatus status
    );
}