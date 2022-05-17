// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "../DtravelStructs.sol";

interface IDtravelFactory {
    function deployProperty(uint256[] memory _ids, address _host) external;

    function verifyBookingData(BookingParameters memory _params, bytes memory _signature) external returns (bool);

    function book(string memory _bookingId) external;

    function cancelByGuest(
        string memory _bookingId,
        uint256 _guestAmount,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _cancelTimestamp
    ) external;

    function cancelByHost(
        string memory _bookingId,
        uint256 _guestAmount,
        uint256 _cancelTimestamp
    ) external;

    function payout(
        string memory _bookingId,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _payoutTimestamp,
        uint8 _payoutType
    ) external;
}
