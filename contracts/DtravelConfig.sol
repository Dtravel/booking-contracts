// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DtravelConfig is Ownable {
    uint256 fee;
    mapping(address => bool) public supportedTokens;

    constructor(uint256 _fee, address[] memory _tokens) {
        fee = _fee;
        for(uint i = 0;i < _tokens.length;i++) {
            supportedTokens[_tokens[i]] = true;
        }
    }

    function updateFee(uint256 _fee) public onlyOwner {
        fee = _fee;
    }

    function addSupportedToken(address _token) public onlyOwner {
        supportedTokens[_token] = true;
    }

    function removeSupportedToken(address _token) public onlyOwner {
        supportedTokens[_token] = false;
    }
}