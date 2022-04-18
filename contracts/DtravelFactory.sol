// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelProperty.sol";

contract DtravelFactory is Ownable {
    address public configContract;
    mapping(address => bool) private properties;

    event PropertyCreated(uint256 _id, address _property);
    event Book(uint256 bookingId, uint256 bookedTimestamp);
    event Cancel(
        uint256 bookingId,
        uint256 guestAmount,
        uint256 hostAmount,
        uint256 treasuryAmount,
        uint256 cancelTimestamp
    );
    event Payout(uint256 bookingId, uint256 hostAmount, uint256 treasuryAmount, uint256 payoutTimestamp);

    constructor(address _config) {
        configContract = _config;
    }

    function deployProperty(uint256 _id, address _host) public onlyOwner {
        DtravelProperty property = new DtravelProperty(_id, configContract, address(this), _host);
        properties[address(property)] = true;
        emit PropertyCreated(_id, address(property));
    }

    function book(uint256 _bookingId) external {
        emit Book(_bookingId, block.timestamp);
    }

    function cancel(
        uint256 _bookingId,
        uint256 _guestAmount,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _cancelTimestamp
    ) external {
        emit Cancel(_bookingId, _guestAmount, _hostAmount, _treasuryAmount, _cancelTimestamp);
    }

    function payout(
        uint256 _bookingId,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _payoutTimestamp
    ) external {
        emit Payout(_bookingId, _hostAmount, _treasuryAmount, _payoutTimestamp);
    }
}
