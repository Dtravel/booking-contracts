// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";
import "./DtravelFactory.sol";
import "./DtravelStructs.sol";

enum BookingStatus {
    InProgress,
    PartialPayOut,
    FullyPayOut,
    CancelledByGuest,
    CancelledByHost,
    EmergencyCancelled
}

struct Booking {
    string id;
    uint256 checkInTimestamp;
    uint256 checkOutTimestamp;
    uint256 balance;
    address guest;
    address token;
    BookingStatus status;
    CancellationPolicy[] cancellationPolicies;
}

contract DtravelProperty is Ownable, ReentrancyGuard {
    uint256 public id; // property id
    Booking[] public bookings; // bookings array
    mapping(string => uint256) public bookingsMap; // bookings map
    DtravelConfig configContract; // config contract
    DtravelFactory factoryContract; // factory contract
    address host; // host address
    uint256 private constant oneDay = 60 * 60 * 24; // one day in seconds

    /**
    @param _id Property Id
    @param _config Contract address of DtravelConfig
    @param _factory Contract address of DtravelFactory
    @param _host Wallet address of the owner of this property
    */
    constructor(
        uint256 _id,
        address _config,
        address _factory,
        address _host
    ) {
        id = _id;
        configContract = DtravelConfig(_config);
        factoryContract = DtravelFactory(_factory);
        host = _host;
    }

    /**
    @notice Modifier to check if the caller is the Dtravel backend
    */
    modifier onlyBackend() {
        require(msg.sender == configContract.dtravelBackend(), "Only Dtravel is authorized to call this action");

        _;
    }

    /**
    @notice Modifier to check if the caller is the host
    */
    modifier onlyHost() {
        require(msg.sender == host, "Only Host is authorized to call this action");

        _;
    }

    /**
    @param _params Booking data provided by oracle backend
    @param _signature Signature of the transaction
    */
    function book(BookingParameters memory _params, bytes memory _signature) external nonReentrant {
        require(bookingsMap[_params.bookingId] > 0, "Booking already exists");
        require(block.timestamp < _params.bookingExpirationTimestamp, "Booking data is expired");
        require(configContract.supportedTokens(_params.token) == true, "Token is not whitelisted");
        require(_params.checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
        require(
            _params.checkOutTimestamp >= _params.checkInTimestamp + oneDay,
            "Booking period should be at least one night"
        );
        require(_params.cancellationPolicies.length > 0, "Booking should have at least one cancellation policy");

        require(factoryContract.verifyBookingData(_params, _signature), "Invalid signature");

        require(
            IERC20(_params.token).allowance(msg.sender, address(this)) >= _params.bookingAmount,
            "Token allowance too low"
        );
        _safeTransferFrom(_params.token, msg.sender, address(this), _params.bookingAmount);

        bookings.push();
        uint256 bookingIndex = bookings.length; // index of the new booking starting from 1
        for (uint8 i = 0; i < _params.cancellationPolicies.length; i++) {
            bookings[bookingIndex].cancellationPolicies.push(_params.cancellationPolicies[i]);
        }
        bookings[bookingIndex].id = _params.bookingId;
        bookings[bookingIndex].checkInTimestamp = _params.checkInTimestamp;
        bookings[bookingIndex].checkOutTimestamp = _params.checkOutTimestamp;
        bookings[bookingIndex].balance = _params.bookingAmount;
        bookings[bookingIndex].guest = msg.sender;
        bookings[bookingIndex].token = _params.token;
        bookings[bookingIndex].status = BookingStatus.InProgress;

        bookingsMap[_params.bookingId] = bookingIndex;

        // emit Book event
        factoryContract.book(_params.bookingId);
    }

    function updateBookingStatus(string memory _bookingId, BookingStatus _status) internal {
        require(bookingsMap[_bookingId] > 0, "Booking does not exist");
        if (
            _status == BookingStatus.CancelledByGuest ||
            _status == BookingStatus.CancelledByHost ||
            _status == BookingStatus.FullyPayOut ||
            _status == BookingStatus.EmergencyCancelled
        ) {
            bookings[bookingsMap[_bookingId] - 1].balance = 0;
        }
        bookings[bookingsMap[_bookingId] - 1].status = _status;
    }

    function cancel(string memory _bookingId) public nonReentrant {
        require(bookingsMap[_bookingId] > 0, "Booking does not exist");
        Booking memory booking = bookings[bookingsMap[_bookingId] - 1];
        require(booking.guest != address(0), "Booking does not exist");
        require(booking.guest == msg.sender, "Only the guest can cancel the booking");
        require(
            booking.status == BookingStatus.InProgress && booking.balance > 0,
            "Booking is already cancelled or paid out"
        );

        uint256 guestAmount = 0;

        for (uint256 i = 0; i < booking.cancellationPolicies.length; i++) {
            if (booking.cancellationPolicies[i].expiryTime >= block.timestamp) {
                guestAmount = booking.cancellationPolicies[i].refundAmount;
                break;
            }
        }

        updateBookingStatus(_bookingId, BookingStatus.CancelledByGuest);

        // Refund to the guest
        uint256 treasuryAmount = ((booking.balance - guestAmount) * configContract.fee()) / 10000;
        uint256 hostAmount = booking.balance - guestAmount - treasuryAmount;

        _safeTransfer(booking.token, booking.guest, guestAmount);
        _safeTransfer(booking.token, host, hostAmount);
        _safeTransfer(booking.token, configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.cancelByGuest(_bookingId, guestAmount, hostAmount, treasuryAmount, block.timestamp);
    }

    // function emergencyCancel(string memory _bookingId) external onlyBackend nonReentrant {
    //     Booking memory booking = bookings[bookingsMap[_bookingId] - 1];
    //     require(booking.guest != address(0), "Booking does not exist");
    //     require(booking.status == BookingStatus.InProgress, "Booking is already cancelled or payout");

    //     updateBookingStatus(_bookingId, BookingStatus.EmergencyCancelled);

    //     // Refund to the guest

    //     IERC20(booking.token).transfer(booking.guest, booking.balance);
    // }

    /**
    Anyone can call the `payout` function. When it is called, the difference between 
    the remaining balance and the amount due to the guest if the guest decides to cancel
    is split between the host and treasury.
    */
    function payout(string memory _bookingId) external nonReentrant {
        require(bookingsMap[_bookingId] > 0, "Booking does not exist");
        Booking storage booking = bookings[bookingsMap[_bookingId] - 1];
        require(booking.guest != address(0), "Booking does not exist");
        require(booking.balance != 0, "Booking is already cancelled or fully paid out");

        uint256 toBePaid = 0;

        for (uint256 i = 0; i < booking.cancellationPolicies.length; i++) {
            if (booking.cancellationPolicies[i].expiryTime >= block.timestamp) {
                toBePaid = booking.balance - booking.cancellationPolicies[i].refundAmount;
                break;
            }
        }

        booking.balance -= toBePaid;

        if (booking.balance == 0) updateBookingStatus(_bookingId, BookingStatus.FullyPayOut);

        // Split the payment
        uint256 treasuryAmount = (toBePaid * configContract.fee()) / 10000;
        uint256 hostAmount = toBePaid - treasuryAmount;

        _safeTransfer(booking.token, host, hostAmount);
        _safeTransfer(booking.token, configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.payout(
            _bookingId,
            hostAmount,
            treasuryAmount,
            block.timestamp,
            toBePaid == booking.balance ? 1 : 2
        );
    }

    /**
    When a booking is cancelled by the host, the whole remaining balance is sent to the guest.
    Any amount that has been paid out to the host or to the treasury through calls to `FullyPaidOut` 
    will have to be refunded manually to the guest.
    */
    function cancelByHost(string memory _bookingId) public nonReentrant onlyHost {
        require(bookingsMap[_bookingId] > 0, "Booking does not exist");
        Booking storage booking = bookings[bookingsMap[_bookingId] - 1]; // TODO: check this line
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

    function bookingHistory() external view returns (Booking[] memory) {
        return bookings;
    }

    function getBooking(string memory _bookingId) external view returns (Booking memory) {
        require(bookingsMap[_bookingId] > 0, "Booking does not exist");
        return bookings[bookingsMap[_bookingId] - 1];
    }

    function _safeTransferFrom(
        address _token,
        address _sender,
        address _recipient,
        uint256 _amount
    ) internal returns (bool) {
        if (_amount > 0) {
            bool sent = IERC20(_token).transferFrom(_sender, _recipient, _amount);
            return sent;
        }
        return false;
    }

    function _safeTransfer(
        address _token,
        address _recipient,
        uint256 _amount
    ) internal returns (bool) {
        if (_amount > 0) {
            bool sent = IERC20(_token).transfer(_recipient, _amount);
            return sent;
        }
        return false;
    }
}
