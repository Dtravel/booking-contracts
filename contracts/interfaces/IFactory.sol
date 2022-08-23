// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IFactory {
    function createProperty(uint256 _propertyId, address _host)
        external
        returns (address _property);

    event NewProperty(
        uint256 indexed propertyId,
        address indexed property,
        address indexed host
    );
}
