// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";

struct Booking {
    uint256 id;
    uint256 checkInTimestamp;
    uint256 checkOutTimestamp;
    uint256 paidAmount;
    address guest;
    address token;
    uint8 status; // 0: in_progress, 1: fulfilled, 2: cancelled, 3: emergency cancelled
}

contract DtravelProperty is Ownable, ReentrancyGuard {
    uint256 public id; // property id
    Booking[] public bookings; // bookings array
    DtravelConfig configContract;
    address host;
    uint256 private constant oneDay = 60 * 60 * 24;

    event Fulfilled(
        uint256 bookingId,
        address indexed host,
        address indexed dtravelTreasury,
        uint256 amountForHost,
        uint256 amountForDtravel,
        uint256 fulFilledTime
    );
    event Book(uint256 bookingId, uint256 bookedTimestamp);
    event Cancel(uint256 bookingId, bool isHost, uint256 cancelledTimestamp);
    event EmergencyCancel(uint256 bookingId, uint256 cancelledTimestamp);

    /**
    @param _id Property Id

    */
    constructor(
        uint256 _id,
        address _config,
        address _host
    ) {
        id = _id;
        configContract = DtravelConfig(_config);
        host = _host;
    }

    modifier onlyBackend() {
        require(msg.sender == configContract.dtravelBackend(), "Only Dtravel is authorized to call this action");

        _;
    }

    modifier onlyHost() {
        require(msg.sender == host, "Only Host is authorized to call this action");

        _;
    }

    function book(
        address _token,
        uint256 _checkInTimestamp,
        uint256 _checkOutTimestamp,
        uint256 _bookingAmount
    ) external onlyBackend nonReentrant {
        // Remove onlyBackend modifier for demo
        // ) external nonReentrant onlyBackend {
        require(configContract.supportedTokens(_token) == true, "Token is not whitelisted");
        require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
        require(_checkOutTimestamp >= _checkInTimestamp + oneDay, "Booking period should be at least one night");
        require(IERC20(_token).allowance(msg.sender, address(this)) >= _bookingAmount, "Token allowance too low");
        bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), _bookingAmount);
        require(isSuccess == true, "Payment failed");

        uint256 bookingId = bookings.length;
        bookings.push(Booking(bookingId, _checkInTimestamp, _checkOutTimestamp, _bookingAmount, msg.sender, _token, 0));
        updateBookingStatus(bookingId, 0);

        emit Book(bookingId, block.timestamp);
    }

    function updateBookingStatus(uint256 _bookingId, uint8 _status) internal {
        bookings[_bookingId].status = _status;
    }

    function cancel(uint256 _bookingId) external nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == 0, "Booking is already cancelled or fulfilled");
        require(
            msg.sender == host || msg.sender == booking.guest,
            "Only host or guest is authorized to call this action"
        );
        // require(block.timestamp < booking.checkInTimestamp - cancelPeriod, "Cancellation period is over"); @TODO: Uncomment this after demo

        updateBookingStatus(_bookingId, 2);

        // Refund to the guest

        bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
        require(isSuccess == true, "Refund failed");

        emit Cancel(_bookingId, msg.sender == host, block.timestamp);
    }

    function emergencyCancel(uint256 _bookingId) external onlyBackend nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == 0, "Booking is already cancelled or fulfilled");

        updateBookingStatus(_bookingId, 3);

        // Refund to the guest

        bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
        require(isSuccess == true, "Refund failed");

        emit EmergencyCancel(_bookingId, block.timestamp);
    }

    function fulfill(uint256 _bookingId) external nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == 0, "Booking is already cancelled or fulfilled");
        // require(block.timestamp >= booking.checkOutTimestamp, "Booking can be fulfilled only after the checkout date"); @TODO: Uncomment this after demo

        updateBookingStatus(_bookingId, 1);

        // Split the payment
        address dtravelTreasury = configContract.dtravelTreasury();
        uint256 paidAmount = booking.paidAmount;
        uint256 fee = configContract.fee();
        uint256 amountForHost = (paidAmount * (10000 - fee)) / 10000;
        uint256 amountForDtravel = paidAmount - amountForHost;

        IERC20(booking.token).transfer(host, amountForHost);
        IERC20(booking.token).transfer(dtravelTreasury, amountForDtravel);

        emit Fulfilled(_bookingId, host, dtravelTreasury, amountForHost, amountForDtravel, block.timestamp);
    }

    function bookingHistory() external view returns (Booking[] memory) {
        return bookings;
    }

    function _safeTransferFrom(
        IERC20 token,
        address sender,
        address recipient,
        uint256 amount
    ) internal returns (bool) {
        bool sent = token.transferFrom(sender, recipient, amount);
        return sent;
    }
}
