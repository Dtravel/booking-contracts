// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";
import "./DtravelFactory.sol";

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
    DtravelFactory factoryContract;
    address host;
    uint256 private constant oneDay = 60 * 60 * 24;

    /**
    @param _id Property Id
    @param _config Contract address of DtravelConfig
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
        address _guest,
        uint256 _checkInTimestamp,
        uint256 _checkOutTimestamp,
        uint256 _bookingAmount,
        bytes memory signature
    ) external onlyBackend nonReentrant {
        require(configContract.supportedTokens(_token) == true, "Token is not whitelisted");
        require(_checkInTimestamp > block.timestamp, "Booking for past date is not allowed");
        require(_checkOutTimestamp >= _checkInTimestamp + oneDay, "Booking period should be at least one night");

        bytes32 messageHash = getBookingHash(
            configContract.dtravelBackend(),
            _guest,
            _checkInTimestamp,
            _checkOutTimestamp,
            _bookingAmount
        );
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        require(verify(configContract.dtravelBackend(), ethSignedMessageHash, signature), "Invalid signature");

        require(IERC20(_token).allowance(msg.sender, address(this)) >= _bookingAmount, "Token allowance too low");
        bool isSuccess = _safeTransferFrom(IERC20(_token), msg.sender, address(this), _bookingAmount);
        require(isSuccess == true, "Payment failed");

        uint256 bookingId = bookings.length;
        bookings.push(Booking(bookingId, _checkInTimestamp, _checkOutTimestamp, _bookingAmount, msg.sender, _token, 0));

        factoryContract.book(bookingId);
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

        factoryContract.cancel(_bookingId);
    }

    function emergencyCancel(uint256 _bookingId) external onlyBackend nonReentrant {
        require(_bookingId < bookings.length, "Booking not found");
        Booking memory booking = bookings[_bookingId];
        require(booking.status == 0, "Booking is already cancelled or fulfilled");

        updateBookingStatus(_bookingId, 3);

        // Refund to the guest

        bool isSuccess = IERC20(booking.token).transfer(booking.guest, booking.paidAmount);
        require(isSuccess == true, "Refund failed");
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

        factoryContract.payout(_bookingId);
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
