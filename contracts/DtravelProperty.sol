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
    uint256 public price; // property price
    uint256 public cancelPeriod; // cancellation period
    Booking[] public bookings; // bookings array
    mapping(uint256 => bool) public propertyFilled; // timestamp => bool, false: vacant, true: filled
    DtravelConfig configContract;
    address host;

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

    constructor(
        uint256 _id,
        uint256 _price,
        uint256 _cancelPeriod,
        address _config,
        address _host
    ) {
        id = _id;
        price = _price;
        cancelPeriod = _cancelPeriod;
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

    function updatePrice(uint256 _price) external onlyHost {
        require(_price > 0, "Price must be over 0");
        price = _price;
    }

    function updateCancelPeriod(uint256 _cancelPeriod) external onlyHost {
        require(_cancelPeriod > 0, "Cancel Period must be over 0");
        cancelPeriod = _cancelPeriod;
    }

    function updatePropertyFilled(uint256[] memory _dates, bool _status) external onlyOwner {
        for (uint256 i = 0; i < _dates.length; i++) {
            propertyFilled[_dates[i]] = _status;
        }
    }

    /* @TODO: Add another method to update propertyFilled with start timestamp and number of days */

    function propertyAvailable(uint256 _checkInTimestamp, uint256 _checkOutTimestamp) public view returns (bool) {
        uint256 time = _checkInTimestamp;
        while (time < _checkOutTimestamp) {
            if (propertyFilled[time] == true) return false;
            time += 1 days;
        }
        return true;
    }

    function book(
        address _token,
        uint256 _checkInTimestamp,
        uint256 _checkOutTimestamp,
        uint256 _bookingAmount
    ) external nonReentrant {
        // Remove onlyBackend modifier for demo
        // ) external nonReentrant onlyBackend {
        require(configContract.supportedTokens(_token) == true, "Token is not whitelisted");
        require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
        require(_checkOutTimestamp >= _checkInTimestamp + 1 days, "Booking period should be at least one night");
        bool isPropertyAvailable = propertyAvailable(_checkInTimestamp, _checkOutTimestamp);
        require(isPropertyAvailable == true, "Property is not available");
        require(IERC20(_token).allowance(msg.sender, address(this)) >= _bookingAmount, "Token allowance too low");
        bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), _bookingAmount);
        require(isSuccess == true, "Payment failed");

        uint256 bookingId = bookings.length;
        bookings.push(Booking(bookingId, _checkInTimestamp, _checkOutTimestamp, _bookingAmount, msg.sender, _token, 0));
        updateBookingStatus(bookingId, 0);

        emit Book(bookingId, block.timestamp);
    }

    function updateBookingStatus(uint256 _bookingId, uint8 _status) internal {
        require(_status <= 3, "Invalid booking status");
        require(_bookingId >= 0 && _bookingId < bookings.length, "Booking not found");

        Booking memory booking = bookings[_bookingId];
        uint256 time = booking.checkInTimestamp;
        uint256 checkoutTimestamp = booking.checkOutTimestamp;
        while (time < checkoutTimestamp) {
            propertyFilled[time] = _status == 0;
            time += 1 days;
        }

        bookings[_bookingId].status = _status;
    }

    function cancel(uint256 _bookingId) external nonReentrant {
        require(_bookingId <= bookings.length, "Booking not found");
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
        require(_bookingId <= bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == 0, "Booking is already cancelled or fulfilled");

        updateBookingStatus(_bookingId, 3);

        // Refund to the guest

        bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
        require(isSuccess == true, "Refund failed");

        emit EmergencyCancel(_bookingId, block.timestamp);
    }

    function fulfill(uint256 _bookingId) external nonReentrant {
        require(_bookingId <= bookings.length, "Booking not found");
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
