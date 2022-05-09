// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DtravelProperty.sol";
import "./DtravelStructs.sol";
import { DtravelEIP712 } from "./DtravelEIP712.sol";

contract DtravelFactory is Ownable {
    address public configContract;
    address[] properties;
    mapping(uint256 => address) public propertyMapping;

    event PropertyCreated(uint256[] ids, address[] properties, address host);
    event Book(address property, string bookingId, uint256 bookedTimestamp);
    event CancelByGuest(
        address property,
        string bookingId,
        uint256 guestAmount,
        uint256 hostAmount,
        uint256 treasuryAmount,
        uint256 cancelTimestamp
    );
    event CancelByHost(address property, string bookingId, uint256 guestAmount, uint256 cancelTimestamp);
    event Payout(
        address property,
        string bookingId,
        uint256 hostAmount,
        uint256 treasuryAmount,
        uint256 payoutTimestamp,
        uint8 payoutType // 1: full payout, 2: partial payout
    );

    constructor(address _config) {
        configContract = _config;
    }

    modifier onlyMatchingProperty(uint256 _propertyId) {
        require(propertyMapping[_propertyId] == msg.sender, "Not a property contract");
        _;
    }

    function deployProperty(uint256[] memory _ids, address _host) public onlyOwner {
        require(_ids.length > 0, "Invalid property ids");
        require(_host != address(0), "Host address is invalid");
        address[] memory newProperties = new address[](_ids.length);
        for (uint256 i = 0; i < _ids.length; i++) {
            require(propertyMapping[_ids[i]] == address(0), "Property with the same id already exists");
            DtravelProperty property = new DtravelProperty(_ids[i], configContract, address(this), _host);
            newProperties[i] = address(property);
            propertyMapping[_ids[i]] = newProperties[i];
            properties.push(newProperties[i]);
        }
        emit PropertyCreated(_ids, newProperties, _host);
    }

    function verifyBookingData(
        uint256 _propertyId,
        BookingParameters memory _params,
        bytes memory _signature
    ) external view onlyMatchingProperty(_propertyId) returns (bool) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DtravelConfig config = DtravelConfig(configContract);
        return DtravelEIP712.verify(_params, chainId, msg.sender, config.dtravelBackend(), _signature);
    }

    function book(uint256 _propertyId, string memory _bookingId) external onlyMatchingProperty(_propertyId) {
        emit Book(msg.sender, _bookingId, block.timestamp);
    }

    function cancelByGuest(
        uint256 _propertyId,
        string memory _bookingId,
        uint256 _guestAmount,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _cancelTimestamp
    ) external onlyMatchingProperty(_propertyId) {
        emit CancelByGuest(msg.sender, _bookingId, _guestAmount, _hostAmount, _treasuryAmount, _cancelTimestamp);
    }

    function cancelByHost(
        uint256 _propertyId,
        string memory _bookingId,
        uint256 _guestAmount,
        uint256 _cancelTimestamp
    ) external onlyMatchingProperty(_propertyId) {
        emit CancelByHost(msg.sender, _bookingId, _guestAmount, _cancelTimestamp);
    }

    function payout(
        uint256 _propertyId,
        string memory _bookingId,
        uint256 _hostAmount,
        uint256 _treasuryAmount,
        uint256 _payoutTimestamp,
        uint8 _payoutType
    ) external onlyMatchingProperty(_propertyId) {
        emit Payout(msg.sender, _bookingId, _hostAmount, _treasuryAmount, _payoutTimestamp, _payoutType);
    }

    function getProperties() public view returns (address[] memory) {
        return properties;
    }
}
