// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelConfig.sol";

struct Booking {
  address customer;
  uint256 checkInDate;
  uint256 checkOutDate;
  uint8 status; // 0: booked, 1: fulfilled, 2: cancelled
}

contract DtravelProperty is Ownable {
  uint256 public id; // property id
  uint256 public price; // property price
  uint256 public cancelPeriod; // cancellation period
  uint8 public status; // 0: open, 1: filled
  Booking[] public bookings;

  constructor(uint256 _id, uint256 _price, uint256 _cancelPeriod) {
    id = _id;
    price = _price;
    cancelPeriod = _cancelPeriod;
    status = 0;
  }

  function updatePrice(uint256 _price) onlyOwner external {
    require(_price > 0, "Price must be over 0");
    price = _price;
  }

  function updateCancelPeriod(uint256 _cancelPeriod) onlyOwner external {
    require(_cancelPeriod > 0, "Cancel Period must be over 0");
    price = _cancelPeriod;
  }

  function book(address _token) external {
    require(
          IERC20(_token).allowance(owner(), address(this)) >= price,
          "Token allowance too low"
      );
    require(status == 0, "Property is not available");
    bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), price);
    require(isSuccess == true, "Payment failed");
    
    status = 1;
    bookings.push(Booking(msg.sender, block.timestamp, 0, 0));
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