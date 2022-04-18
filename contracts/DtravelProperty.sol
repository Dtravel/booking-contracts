// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";
import "./DtravelFactory.sol";

enum BookingStatus {
    InProgress,
    Fulfilled,
    Cancelled,
    EmergencyCancelled
}

struct CancellationPolicy {
    uint256 expiryTime;
    uint256 refundAmount;
}

struct Booking {
    uint256 id;
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
    @param _token Token address
    @param _checkInTimestamp Timestamp when the booking starts
    @param _checkOutTimestamp Timestamp when the booking ends
    @param _bookingAmount Amount of tokens to be paid
    @param _cancellationPolicies Cancellation policies
    @param _signature Signature of the transaction
    */
    function book(
        address _token,
        uint256 _checkInTimestamp,
        uint256 _checkOutTimestamp,
        uint256 _bookingAmount,
        CancellationPolicy[] memory _cancellationPolicies,
        bytes memory _signature
    ) external nonReentrant {
        require(configContract.supportedTokens(_token) == true, "Token is not whitelisted");
        require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
        require(_checkOutTimestamp >= _checkInTimestamp + oneDay, "Booking period should be at least one night");
        require(_cancellationPolicies.length > 0, "Booking should have at least one cancellation policy");

        // verify signature and parameters
        bytes32 messageHash = getBookingHash(
            configContract.dtravelBackend(),
            msg.sender,
            _checkInTimestamp,
            _checkOutTimestamp,
            _bookingAmount
        );
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        require(verify(configContract.dtravelBackend(), ethSignedMessageHash, _signature), "Invalid signature");

        require(IERC20(_token).allowance(msg.sender, address(this)) >= _bookingAmount, "Token allowance too low");
        bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), _bookingAmount);
        require(isSuccess == true, "Payment failed");

        bookings.push();
        uint256 bookingId = bookings.length - 1;
        for (uint8 i = 0; i < _cancellationPolicies.length; i++) {
            bookings[bookingId].cancellationPolicies.push(_cancellationPolicies[i]);
        }
        bookings[bookingId].id = bookingId;
        bookings[bookingId].checkInTimestamp = _checkInTimestamp;
        bookings[bookingId].checkOutTimestamp = _checkOutTimestamp;
        bookings[bookingId].balance = _bookingAmount;
        bookings[bookingId].guest = msg.sender;
        bookings[bookingId].token = _token;
        bookings[bookingId].status = BookingStatus.InProgress;

        // emit Book event
        factoryContract.book(bookingId);
    }

    function updateBookingStatus(uint256 _bookingId, BookingStatus _status) internal {
        if (
            _status == BookingStatus.Cancelled ||
            _status == BookingStatus.Fulfilled ||
            _status == BookingStatus.EmergencyCancelled
        ) {
            bookings[_bookingId].balance = 0;
        }
        bookings[_bookingId].status = _status;
    }

    function cancel(uint256 _bookingId) public nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == BookingStatus.InProgress, "Booking is already cancelled or fulfilled");

        uint256 guestAmount = 0;

        for (uint256 i = 0; i < booking.cancellationPolicies.length - 1; i++) {
            if (
                booking.cancellationPolicies[i].expiryTime <= block.timestamp &&
                booking.cancellationPolicies[i + 1].expiryTime > block.timestamp
            ) {
                guestAmount = booking.cancellationPolicies[i].refundAmount;
            }
        }

        updateBookingStatus(_bookingId, BookingStatus.Cancelled);

        // Refund to the guest
        uint256 treasuryAmount = ((booking.balance - guestAmount) * configContract.fee()) / 10000;
        uint256 hostAmount = booking.balance - guestAmount - treasuryAmount;

        IERC20(booking.token).transfer(booking.guest, guestAmount);
        IERC20(booking.token).transfer(host, hostAmount);
        IERC20(booking.token).transfer(configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.cancel(_bookingId, guestAmount, hostAmount, treasuryAmount, block.timestamp);
    }

    function emergencyCancel(uint256 _bookingId) external onlyBackend nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == BookingStatus.InProgress, "Booking is already cancelled or fulfilled");

        updateBookingStatus(_bookingId, BookingStatus.EmergencyCancelled);

        // Refund to the guest

        IERC20(booking.token).transfer(booking.guest, booking.balance);
    }

    function fulfill(uint256 _bookingId) external nonReentrant onlyBackend {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == BookingStatus.InProgress, "Booking is already cancelled or fulfilled");

        updateBookingStatus(_bookingId, BookingStatus.Fulfilled);

        // Split the payment
        uint256 hostAmount = (booking.balance * (10000 - configContract.fee())) / 10000;
        uint256 treasuryAmount = booking.balance - hostAmount;

        IERC20(booking.token).transfer(host, hostAmount);
        IERC20(booking.token).transfer(configContract.dtravelTreasury(), treasuryAmount);

        factoryContract.payout(_bookingId, hostAmount, treasuryAmount, block.timestamp);
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

    function getBookingHash(
        address _signer,
        address _guest,
        uint256 _checkInTimestamp,
        uint256 _checkOutTimestamp,
        uint256 _bookingAmount
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_signer, _guest, _checkInTimestamp, _checkOutTimestamp, _bookingAmount));
    }

    function getEthSignedMessageHash(bytes32 _messageHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }

    function verify(
        address _signer,
        bytes32 ethSignedMessageHash,
        bytes memory signature
    ) public pure returns (bool) {
        return recoverSigner(ethSignedMessageHash, signature) == _signer;
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        public
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "invalid signature length");
        assembly {
            /*
            First 32 bytes stores the length of the signature
            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature
            mload(p) loads next 32 bytes starting at the memory address p into memory
            */
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }
        return (r, s, v);
    }
}
