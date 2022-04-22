//SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0;

import "../DtravelStructs.sol";
import { DtravelEIP712 } from "../DtravelEIP712.sol";

contract DtravelEIP712Test {
    function verify(
        BookingParameters memory parameters,
        uint256 chainId,
        bytes memory signature
    ) external view returns (bool) {
        return DtravelEIP712.verify(parameters, chainId, address(this), parameters.signer, signature);
    }
}