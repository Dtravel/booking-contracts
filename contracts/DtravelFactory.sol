// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelProperty.sol";

contract DtravelFactory is Ownable {
    address public configContract;
    mapping(address => bool) private properties;

    event PropertyCreated(uint256 _id, address _property);
    event Book(uint256 bookingId, uint256 bookedTimestamp);
    event Cancel(uint256 bookingId);
    event Payout(uint256 bookingId);

    constructor(address _config) {
        configContract = _config;
    }

    function deployProperty(uint256 _id, address _host) public onlyOwner {
        DtravelProperty property = new DtravelProperty(_id, configContract, address(this), _host);
        properties[address(property)] = true;
        emit PropertyCreated(_id, address(property));
    }

    function book(uint256 bookingId) external {
        emit Book(bookingId, block.timestamp);
    }

    function cancel(uint256 bookingId) external {
        emit Cancel(bookingId);
    }

    function payout(uint256 bookingId) external {
        emit Payout(bookingId);
    }
}
