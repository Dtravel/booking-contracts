// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IDtravelConfig.sol";
import "./DtravelProperty.sol";
import "./DtravelStructs.sol";
import { DtravelEIP712 } from "./DtravelEIP712.sol";

contract DtravelFactory is Ownable {
  DtravelProperty[] private properties;

  event PropertyCreated(uint256 _id, address _property);

  function deployProperty(uint256 _id, address _config, address _host) public onlyOwner {
    DtravelProperty property = new DtravelProperty(_id, _config, _host);
    properties.push(property);
    emit PropertyCreated(_id, address(property));
  }
}
