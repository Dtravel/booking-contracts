// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelConfig.sol";

struct Booking {
  uint256 id;
  uint256 checkInTimestamp;
  uint256 checkOutTimestamp;
  uint256 paidAmount;
  address guest;
  address token;
}

contract DtravelProperty is Ownable {
  uint256 public id; // property id
  uint256 public price; // property price
  uint256 public cancelPeriod; // cancellation period
  Booking[] public bookings; // bookings array
  mapping(uint256 => bool) public filled; // timestamp => bool
  mapping(uint256 => uint8) public bookingStatus; // booking id => 0, 1, 2 0: open, 1: filled, 2: cancelled

  constructor(uint256 _id, uint256 _price, uint256 _cancelPeriod) {
    id = _id;
    price = _price;
    cancelPeriod = _cancelPeriod;
  }

  function updatePrice(uint256 _price) onlyOwner external {
    require(_price > 0, "Price must be over 0");
    price = _price;
  }

  function updateCancelPeriod(uint256 _cancelPeriod) onlyOwner external {
    require(_cancelPeriod > 0, "Cancel Period must be over 0");
    cancelPeriod = _cancelPeriod;
  }

  function propertyAvailable(uint256 _checkInTimestamp, uint256 _checkOutTimestamp ) view public returns(bool) {
    uint256 time = _checkInTimestamp;
    while (time < _checkOutTimestamp) {
      if (filled[time] == true)
        return false;
      time += 60 * 60 * 24;
    }
    return true;
  }

  function book(address _token, uint256 _checkInTimestamp, uint256 _checkOutTimestamp) external returns(bool, uint256) {
    require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
    require(_checkOutTimestamp >= _checkInTimestamp + 60 * 60 * 24, "Booking period should be at least one night");
    bool isPropertyAvailable = propertyAvailable(_checkInTimestamp, _checkOutTimestamp);
    require(isPropertyAvailable == true, "Property is not available");
    uint256 bookingAmount = price * (_checkOutTimestamp - _checkInTimestamp) / (60 * 60 * 24);
    require(
          IERC20(_token).allowance(msg.sender, address(this)) >= bookingAmount,
          "Token allowance too low"
      );
    bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), bookingAmount);
    require(isSuccess == true, "Payment failed");
    
    uint256 bookingId = bookings.length;
    uint256 time = _checkInTimestamp;
    while (time < _checkOutTimestamp) {
      filled[time] = true;
      time += 60 * 60 * 24;
    }
    bookingStatus[bookingId] = 0;
    bookings.push(Booking(bookingId, _checkInTimestamp, _checkOutTimestamp, bookingAmount, msg.sender, _token));

    return (isSuccess, bookingAmount);
  }

  function cancel(uint256 _bookingId, uint8 _cancelType) external returns(bool) {
    require(_bookingId <= bookings.length, "Booking not found");
    require(bookingStatus[_bookingId] == 0, "Booking is already cancelled or fulfilled");
    Booking memory booking = bookings[_bookingId];
    require(block.timestamp < booking.checkInTimestamp + cancelPeriod, "Booking has already expired the cancellation period");
    require(msg.sender == owner() || msg.sender == booking.guest, "You are not authorized to cancel this booking");
    
    bookingStatus[_bookingId] = _cancelType;

    uint256 time = booking.checkInTimestamp;
    uint256 checkOutTimestamp = booking.checkOutTimestamp;
    while (time < checkOutTimestamp) {
      filled[time] = false;
      time += 60 * 60 * 24;
    }

    // Refund to the guest

    bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
    require(isSuccess == true, "Refund failed");

    return (isSuccess);
  }

  function bookingHistory() external view returns(Booking[] memory) {
    return bookings;
  }

  function _safeTransferFrom(
      IERC20 token,
      address sender,
      address recipient,
      uint amount
  ) internal returns(bool){
      bool sent = token.transferFrom(sender, recipient, amount);
      return sent;
  }
}