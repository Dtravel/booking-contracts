// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IDtravelConfig.sol";
import "./interfaces/IDtravelFactory.sol";
import "./DtravelStructs.sol";

contract DtravelProperty is Ownable, ERC721Enumerable, ReentrancyGuard {
    using Strings for uint256;

    string private baseTokenURI;
    uint256 private currentIndex; /// @dev Current NFT index

    uint256 public id; // property id
    Booking[] public bookings; // bookings array
    mapping(string => uint256) public bookingsMap; // booking id to index + 1 in bookings array so the first booking has index 1
    IDtravelConfig configContract; // config contract
    IDtravelFactory factoryContract; // factory contract
    address host; // host address
    mapping(address => bool) public hostDelegates; // addresses authorized by the host to act in the host's behalf
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
    ) ERC721("Room Night NFT", "DNFT") {
        id = _id;
        configContract = IDtravelConfig(_config);
        factoryContract = IDtravelFactory(_factory);
        host = _host;
    }

    /// @dev Set BaseTokenURI
    function setBaseTokenURI(string memory _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");

        return bytes(baseTokenURI).length > 0 ? string(abi.encodePacked(baseTokenURI, tokenId.toString())) : "";
    }

    function mint(address _who, uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount should be greater than 0");

        for (uint256 i = 0; i < _amount; i++) {
            currentIndex++;
            _mint(_who, currentIndex);
        }
    }

    /**
    @notice Modifier to check if the caller is the Dtravel backend
    */
    modifier onlyBackend() {
        require(
            msg.sender == configContract.dtravelBackend(),
            "Property: Only Dtravel is authorized to call this action"
        );

        _;
    }

    /**
    @notice Modifier to check if the caller is the host or a delegate approved by the host
    */
    modifier onlyHostOrDelegate() {
        require(
            msg.sender == host || hostDelegates[msg.sender] == true,
            "Property: Only the host or a host's delegate is authorized to call this action"
        );

        _;
    }

    function approve(address delegate) external onlyHostOrDelegate {
        hostDelegates[delegate] = true;
    }

    function revoke(address delegate) external onlyHostOrDelegate {
        hostDelegates[delegate] = false;
    }

    function validateBookingParameters(BookingParameters memory _params, bytes memory _signature)
        public
        returns (bool)
    {
        require(bookingsMap[_params.bookingId] == 0, "Property: Booking already exists");
        require(block.timestamp < _params.bookingExpirationTimestamp, "Property: Booking data is expired");
        require(configContract.supportedTokens(_params.token) == true, "Property: Token is not whitelisted");
        require(_params.checkInTimestamp + oneDay >= block.timestamp, "Property: Booking for past date is not allowed");
        require(
            _params.checkOutTimestamp >= _params.checkInTimestamp + oneDay,
            "Property: Booking period should be at least one night"
        );
        require(
            _params.cancellationPolicies.length > 0,
            "Property: Booking should have at least one cancellation policy"
        );

        for (uint256 i = 0; i < _params.cancellationPolicies.length; i++) {
            require(
                _params.bookingAmount >= _params.cancellationPolicies[i].refundAmount,
                "Property: Refund amount is greater than booking amount"
            );
        }

        if (_params.cancellationPolicies.length > 1) {
            for (uint256 i = 0; i < _params.cancellationPolicies.length - 1; i++) {
                require(
                    _params.cancellationPolicies[i].expiryTime < _params.cancellationPolicies[i + 1].expiryTime,
                    "Property: Cancellation policies should be in chronological order"
                );
            }
        }

        require(factoryContract.verifyBookingData(_params, _signature), "Property: Invalid signature");

        return true;
    }

    /**
    @param _params Booking data provided by oracle backend
    @param _signature Signature of the transaction
    */
    function book(BookingParameters memory _params, bytes memory _signature) external nonReentrant {
        // Check if parameters are valid
        validateBookingParameters(_params, _signature);

        require(
            IERC20(_params.token).allowance(msg.sender, address(this)) >= _params.bookingAmount,
            "Property: Token allowance too low"
        );
        _safeTransferFrom(_params.token, msg.sender, address(this), _params.bookingAmount);

        bookings.push();
        uint256 bookingIndex = bookings.length - 1;
        for (uint256 i = 0; i < _params.cancellationPolicies.length; i++) {
            bookings[bookingIndex].cancellationPolicies.push(_params.cancellationPolicies[i]);
        }
        bookings[bookingIndex].id = _params.bookingId;
        bookings[bookingIndex].checkInTimestamp = _params.checkInTimestamp;
        bookings[bookingIndex].checkOutTimestamp = _params.checkOutTimestamp;
        bookings[bookingIndex].balance = _params.bookingAmount;
        bookings[bookingIndex].guest = msg.sender;
        bookings[bookingIndex].token = _params.token;
        bookings[bookingIndex].status = BookingStatus.InProgress;

        bookingsMap[_params.bookingId] = bookingIndex + 1;

        // emit Book event
        factoryContract.book(_params.bookingId);
    }

    function _updateBookingStatus(string memory _bookingId, BookingStatus _status) internal {
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

    function cancel(string memory _bookingId) public nonReentrant {
        Booking memory booking = bookings[getBookingIndex(_bookingId)];
        require(booking.guest != address(0), "Property: Booking does not exist");
        require(booking.guest == msg.sender, "Property: Only the guest can cancel the booking");
        require(booking.balance > 0, "Property: Booking is already cancelled or paid out");
        require(
            IERC20(booking.token).balanceOf(address(this)) >= booking.balance,
            "Property: Insufficient token balance"
        );

        uint256 guestAmount = 0;
        for (uint256 i = 0; i < booking.cancellationPolicies.length; i++) {
            if (booking.cancellationPolicies[i].expiryTime >= block.timestamp) {
                guestAmount = booking.cancellationPolicies[i].refundAmount;
                break;
            }
        }

        _updateBookingStatus(_bookingId, BookingStatus.CancelledByGuest);

        // Refund to the guest
        uint256 treasuryAmount = ((booking.balance - guestAmount) * configContract.fee()) / 10000;
        uint256 hostAmount = booking.balance - guestAmount - treasuryAmount;

        _safeTransfer(booking.token, booking.guest, guestAmount);
        _safeTransfer(booking.token, host, hostAmount);
        _safeTransfer(booking.token, configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.cancelByGuest(_bookingId, guestAmount, hostAmount, treasuryAmount, block.timestamp);
    }

    /**
    Anyone can call the `payout` function. When it is called, the difference between 
    the remaining balance and the amount due to the guest if the guest decides to cancel
    is split between the host and treasury.
    */
    function payout(string memory _bookingId) external nonReentrant {
        Booking storage booking = bookings[getBookingIndex(_bookingId)];
        require(booking.guest != address(0), "Property: Booking does not exist");
        require(booking.balance != 0, "Property: Booking is already cancelled or fully paid out");

        uint256 toBePaid = 0;

        if (booking.cancellationPolicies.length == 0) {
            toBePaid = booking.balance;
        } else if (
            booking.cancellationPolicies[booking.cancellationPolicies.length - 1].expiryTime +
                configContract.payoutDelayTime() <
            block.timestamp
        ) {
            toBePaid = booking.balance;
        } else {
            for (uint256 i = 0; i < booking.cancellationPolicies.length; i++) {
                if (booking.cancellationPolicies[i].expiryTime + configContract.payoutDelayTime() >= block.timestamp) {
                    require(
                        booking.balance >= booking.cancellationPolicies[i].refundAmount,
                        "Property: Insufficient booking balance"
                    );
                    toBePaid = booking.balance - booking.cancellationPolicies[i].refundAmount;
                    break;
                }
            }
        }

        require(toBePaid > 0, "Property: Invalid payout call");

        booking.balance -= toBePaid;

        _updateBookingStatus(
            _bookingId,
            booking.balance == 0 ? BookingStatus.FullyPaidOut : BookingStatus.PartialPayOut
        );

        // Split the payment
        uint256 treasuryAmount = (toBePaid * configContract.fee()) / 10000;
        uint256 hostAmount = toBePaid - treasuryAmount;

        _safeTransfer(booking.token, host, hostAmount);
        _safeTransfer(booking.token, configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.payout(_bookingId, hostAmount, treasuryAmount, block.timestamp, booking.balance == 0 ? 1 : 2);
    }

    /**
    When a booking is cancelled by the host, the whole remaining balance is sent to the guest.
    Any amount that has been paid out to the host or to the treasury through calls to `payout` will have to be refunded manually to the guest.
    */
    function cancelByHost(string memory _bookingId) public nonReentrant onlyHostOrDelegate {
        Booking memory booking = bookings[getBookingIndex(_bookingId)];
        require(booking.guest != address(0), "Property: Booking does not exist");
        require(
            (booking.status == BookingStatus.InProgress || booking.status == BookingStatus.PartialPayOut) &&
                booking.balance > 0,
            "Property: Booking is already cancelled or fully paid out"
        );

        // Refund to the guest
        uint256 guestAmount = booking.balance;

        _updateBookingStatus(_bookingId, BookingStatus.CancelledByHost);

        _safeTransfer(booking.token, booking.guest, guestAmount);

        factoryContract.cancelByHost(_bookingId, guestAmount, block.timestamp);
    }

    function totalBooking() external view returns (uint256) {
        return bookings.length;
    }

    function bookingHistory(uint256 _startIndex, uint256 _pageSize) external view returns (Booking[] memory) {
        require(_startIndex < bookings.length, "Property: Booking index is out of bounds");
        uint256 resultLength = _startIndex + _pageSize < bookings.length ? _pageSize : bookings.length - _startIndex;
        Booking[] memory result = new Booking[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = bookings[i + _startIndex];
        }
        return result;
    }

    function getBookingIndex(string memory _bookingId) public view returns (uint256) {
        uint256 bookingId = bookingsMap[_bookingId];
        require(bookingId > 0, "Property: Booking does not exist");
        return bookingId - 1;
    }

    function getBooking(string memory _bookingId) external view returns (Booking memory) {
        return bookings[getBookingIndex(_bookingId)];
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
