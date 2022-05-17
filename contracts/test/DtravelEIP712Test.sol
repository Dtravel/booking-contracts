//SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "../DtravelStructs.sol";
import { DtravelEIP712 } from "../DtravelEIP712.sol";

contract DtravelEIP712Test {
    address authorizedAddress;

    constructor (address _authorizedAddress) {
        authorizedAddress = _authorizedAddress;
    }

    function verify(
        BookingParameters memory parameters,
        bytes memory signature
    ) external view returns (bool) {
        return DtravelEIP712.verify(parameters, address(this), authorizedAddress, signature);
    }
}