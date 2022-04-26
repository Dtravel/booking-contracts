// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelProperty.sol";
import "./DtravelStructs.sol";
import { DtravelEIP712 } from "./DtravelEIP712.sol";

contract DtravelFactory is Ownable {
    address public configContract;
    mapping(address => bool) private propertyMapping;

    event PropertyCreated(uint256[] ids, address[] properties, address host);
    event Book(address property, bytes bookingId, uint256 bookedTimestamp);
    event Cancel(
        address property,
        bytes bookingId,
        uint256 guestAmount,
        uint256 hostAmount,
        uint256 treasuryAmount,
        uint256 cancelTimestamp
    );
    event Payout(
        address property,
        bytes bookingId,
        uint256 hostAmount,
        uint256 treasuryAmount,
        uint256 payoutTimestamp,
        uint8 payoutType // 1: full payout, 2: partial payout
    );

    constructor(address _config) {
        configContract = _config;
    }

    modifier onlyMatchingProperty() {
        require(propertyMapping[msg.sender] == true, "Property not found");
        _;
    }

    function deployProperty(uint256[] memory _ids, address _host) public onlyOwner {
        require(_ids.length > 0, "Invalid property ids");
        require(_host != address(0), "Host address is invalid");
        address[] memory properties = new address[](_ids.length);
        for (uint256 i = 0; i < _ids.length; i++) {
            DtravelProperty property = new DtravelProperty(_ids[i], configContract, address(this), _host);
            propertyMapping[address(property)] = true;
            properties[i] = address(property);
        }
        emit PropertyCreated(_ids, properties, _host);
    }

    function verifyBookingData(BookingParameters memory _params, bytes memory _signature) external view onlyMatchingProperty returns (bool) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        require(_params.cancellationPolicies.length > 0, "Invalid cancellation policy array");
        return DtravelEIP712.verify(_params, chainId, msg.sender, _signature);
    }

    function book(bytes memory _bookingId) external onlyMatchingProperty {
        emit Book(msg.sender, _bookingId, block.timestamp);
    }

    function cancel(
        bytes memory _bookingId,
        uint256 _guestAmount,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _cancelTimestamp
    ) external onlyMatchingProperty {
        emit Cancel(msg.sender, _bookingId, _guestAmount, _hostAmount, _treasuryAmount, _cancelTimestamp);
    }

    function payout(
        bytes memory _bookingId,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _payoutTimestamp,
        uint8 _payoutType
    ) external  {
        emit Payout(msg.sender, _bookingId, _hostAmount, _treasuryAmount, _payoutTimestamp, _payoutType);
    }
}