//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "../interfaces/IFactory.sol";
import "../interfaces/IManagement.sol";

contract FactoryV2 is IFactory, OwnableUpgradeable {
    // linked management instance
    IManagement public management;

    // the upgrage beacon address of property contracts
    address private propertyBeacon;

    // returns the deployed property address for a given ID
    mapping(uint256 => address) public property;

    modifier onlyOperator() {
        require(
            _msgSender() == management.operator(),
            "Factory: Only operator"
        );
        _;
    }

    modifier AddressZero(address _addr) {
        require(_addr != address(0), "Factory: Cannot be zero address");
        _;
    }

    function init(address _management, address _beacon)
        external
        initializer
        AddressZero(_management)
        AddressZero(_beacon)
    {
        __Ownable_init();
        management = IManagement(_management);
        propertyBeacon = _beacon;
    }

    function createProperty(
        uint256 _propertyId,
        address _host,
        address _delegate
    ) external pure returns (address _property) {
        _propertyId;
        _host;
        _property;
        _delegate;
        // solhint-disable-next-line
        revert("Factory has been upgraded successfully!");
    }
}
