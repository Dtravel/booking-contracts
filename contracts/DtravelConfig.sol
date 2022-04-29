// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DtravelConfig is Ownable {
    uint256 public fee; // fee percentage 5% -> 500, 0.1% -> 10
    uint256 public payoutDelayTime; // payout delay time in seconds
    address public dtravelTreasury;
    address public dtravelBackend;
    mapping(address => bool) public supportedTokens;

    constructor(
        uint256 _fee,
        uint256 _payoutDelayTime,
        address _treasury,
        address[] memory _tokens
    ) {
        fee = _fee;
        payoutDelayTime = _payoutDelayTime;
        dtravelTreasury = _treasury;
        dtravelBackend = msg.sender;
        for (uint256 i = 0; i < _tokens.length; i++) {
            supportedTokens[_tokens[i]] = true;
        }
    }

    function updateFee(uint256 _fee) public onlyOwner {
        require(_fee >= 0 && _fee <= 10000, "Fee must be between 0 and 10000");
        fee = _fee;
    }

    function updatePayoutDelayTime(uint256 _payoutDelayTime) public onlyOwner {
        payoutDelayTime = _payoutDelayTime;
    }

    function addSupportedToken(address _token) public onlyOwner {
        supportedTokens[_token] = true;
    }

    function removeSupportedToken(address _token) public onlyOwner {
        supportedTokens[_token] = false;
    }

    function updateTreasury(address _treasury) public onlyOwner {
        dtravelTreasury = _treasury;
    }
}
