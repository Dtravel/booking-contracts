// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DtravelConfig is Ownable {
    uint256 public fee; // fee percentage 5% -> 500, 0.1% -> 10
    uint256 public payoutDelayTime; // payout delay time in seconds
    address public dtravelTreasury;
    address public dtravelBackend;
    mapping(address => bool) public supportedTokens;

    event UpdatedFee(uint256 oldFee, uint256 newFee);
    event UpdatedPayoutDelayTime(uint256 oldPayoutDelayTime, uint256 newPayoutDelayTime);
    event UpdatedTreasury(address oldTreasury, address newTreasury);
    event UpdatedBackend(address oldBackend, address newBackend);
    event AddedSupportedToken(address token);
    event RemovedSupportedToken(address token);

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
        supportedTokens[address(0)] = true; // Support for native coin
        for (uint256 i = 0; i < _tokens.length; i++) {
            supportedTokens[_tokens[i]] = true;
        }
    }

    function updateFee(uint256 _fee) public onlyOwner {
        require(_fee >= 0 && _fee <= 2000, "Config: Fee must be between 0 and 2000");
        uint256 oldFee = fee;
        fee = _fee;
        emit UpdatedFee(oldFee, _fee);
    }

    function updatePayoutDelayTime(uint256 _payoutDelayTime) public onlyOwner {
        uint256 oldPayoutDelayTime = payoutDelayTime;
        payoutDelayTime = _payoutDelayTime;
        emit UpdatedPayoutDelayTime(oldPayoutDelayTime, _payoutDelayTime);
    }

    function addSupportedToken(address _token) public onlyOwner {
        require(!supportedTokens[_token], "Config: token is already whitelisted");
        supportedTokens[_token] = true;
        emit AddedSupportedToken(_token);
    }

    function removeSupportedToken(address _token) public onlyOwner {
        require(supportedTokens[_token], "Config: token is not whitelisted");
        supportedTokens[_token] = false;
        emit RemovedSupportedToken(_token);
    }

    function updateTreasury(address _treasury) public onlyOwner {
        require(_treasury != address(0), "Config: treasury is zero address");
        address oldTreasury = dtravelTreasury;
        dtravelTreasury = _treasury;
        emit UpdatedTreasury(oldTreasury, _treasury);
    }
}
