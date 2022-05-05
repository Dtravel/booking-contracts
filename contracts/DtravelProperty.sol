// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";

contract DtravelProperty is Ownable, ReentrancyGuard {
    uint256 public id; // property id
    Booking[] public bookings; // bookings array
    mapping(string => uint256) public bookingsMap; // booking id to index + 1 in bookings array so the first booking has index 1
    IDtravelConfig private configContract; // config contract
    IDtravelFactory private factoryContract; // factory contract
    address host; // host address
    mapping(address => bool) public hostDelegates; // addresses authorized by the host to act in the host's behalf

  event Fulfilled(uint256 bookingId, address indexed host, address indexed dtravelTreasury, uint256 amountForHost, uint256 amountForDtravel, uint256 fulFilledTime);
  event Book(uint256 bookingId, uint256 bookedTimestamp);
  event Cancel(uint256 bookingId, bool isHost, uint256 cancelledTimestamp);
  event EmergencyCancel(uint256 bookingId, uint256 cancelledTimestamp);

  constructor(uint256 _id, uint256 _price, uint256 _cancelPeriod, address _config) {
    id = _id;
    price = _price;
    cancelPeriod = _cancelPeriod;
    configContract = DtravelConfig(_config);
  }

  modifier onlyBackend() {
    require(msg.sender == configContract.dtravelBackend(), "Only Dtravel backend is authorized to call this action");

        _;
    }

  function updatePrice(uint256 _price) onlyOwner external {
    require(_price > 0, "Price must be over 0");
    price = _price;
  }

  function updateCancelPeriod(uint256 _cancelPeriod) onlyOwner external {
    require(_cancelPeriod > 0, "Cancel Period must be over 0");
    cancelPeriod = _cancelPeriod;
  }

  function updatePropertyFilled(uint256[] memory _dates, bool _status) onlyOwner external {
    for(uint i = 0;i < _dates.length;i++) {
      propertyFilled[_dates[i]] = _status;
    }
  }

        require(factoryContract.verifyBookingData(_params, _signature), "Property: Invalid signature");

        return true;
    }

  function book(address _token, uint256 _checkInTimestamp, uint256 _checkOutTimestamp, uint256 _bookingAmount) nonReentrant onlyBackend external {
    require(configContract.supportedTokens(_token) == true, "Token is not whitelisted");
    require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
    require(_checkOutTimestamp >= _checkInTimestamp + 1 days, "Booking period should be at least one night");
    bool isPropertyAvailable = propertyAvailable(_checkInTimestamp, _checkOutTimestamp);
    require(isPropertyAvailable == true, "Property is not available");
    require(
          IERC20(_token).allowance(msg.sender, address(this)) >= _bookingAmount,
          "Token allowance too low"
      );
    bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), _bookingAmount);
    require(isSuccess == true, "Payment failed");
    
    uint256 bookingId = bookings.length;
    bookings.push(Booking(bookingId, _checkInTimestamp, _checkOutTimestamp, _bookingAmount, msg.sender, _token));
    updateBookingStatus(bookingId, 0);

        // emit Book event
        factoryContract.book(_params.bookingId);
    }

    function _updateBookingStatus(string calldata _bookingId, BookingStatus _status) internal {
        if (
            _status == BookingStatus.CancelledByGuest ||
            _status == BookingStatus.CancelledByHost ||
            _status == BookingStatus.FullyPaidOut ||
            _status == BookingStatus.EmergencyCancelled
        ) {
            bookings[getBookingIndex(_bookingId)].balance = 0;
        }
        bookings[getBookingIndex(_bookingId)].status = _status;
    }

    bookingStatus[_bookingId] = _status;
  }

        _updateBookingStatus(_bookingId, BookingStatus.CancelledByGuest);

    // Refund to the guest

        _safeTransfer(booking.token, booking.guest, guestAmount);
        _safeTransfer(booking.token, host, hostAmount);
        _safeTransfer(booking.token, configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.cancelByGuest(_bookingId, guestAmount, hostAmount, treasuryAmount, block.timestamp);
    }

  function emergencyCancel(uint256 _bookingId) onlyBackend nonReentrant external {
    require(_bookingId <= bookings.length, "Booking not found");
    require(bookingStatus[_bookingId] == 0, "Booking is already cancelled or fulfilled");
    Booking memory booking = bookings[_bookingId];
    
    updateBookingStatus(_bookingId, 3);

    // Refund to the guest

    bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
    require(isSuccess == true, "Refund failed");

    emit EmergencyCancel(_bookingId, block.timestamp);
  }

        require(toBePaid > 0, "Property: Invalid payout call");

        uint256 currentBalance = booking.balance - toBePaid;
        bookings[idx].balance = currentBalance;

    updateBookingStatus(_bookingId, 1);

    // Split the payment
    
    address host = owner();
    address dtravelTreasury = configContract.dtravelTreasury();
    uint256 paidAmount = booking.paidAmount;
    uint256 fee = configContract.fee();
    uint256 amountForHost = paidAmount * (100 - fee) / 100;
    uint256 amountForDtravel = paidAmount - amountForHost;

    function totalBooking() external view returns (uint256) {
        return bookings.length;
    }

    /**
    When a booking is cancelled by the host, the whole remaining balance is sent to the guest.
    Any amount that has been paid out to the host or to the treasury through calls to `payout` 
    will have to be refunded manually to the guest.
    */
    function cancelByHost(string memory _bookingId) public nonReentrant onlyHostOrDelegate {
        Booking storage booking = bookings[getBookingIndex(_bookingId)];
        require(booking.guest != address(0), "Booking does not exist");
        require(
            booking.status == BookingStatus.InProgress && booking.balance > 0,
            "Booking is already cancelled or fully paid out"
        );

        updateBookingStatus(_bookingId, BookingStatus.CancelledByHost);

        // Refund to the guest
        uint256 guestAmount = booking.balance;

        booking.balance = 0;

        _safeTransfer(booking.token, booking.guest, guestAmount);

        factoryContract.cancelByHost(_bookingId, guestAmount, block.timestamp);
    }

    emit Fulfilled(_bookingId, host, dtravelTreasury, amountForHost, amountForDtravel, block.timestamp);
  }

  function bookingHistory() external view returns(Booking[] memory) {
    return bookings;
  }

    function getBooking(string memory _bookingId) external view returns (Booking memory) {
        return bookings[getBookingIndex(_bookingId)];
    }
}
