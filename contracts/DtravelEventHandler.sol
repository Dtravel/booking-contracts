// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DtravelConfig.sol";

contract DtravelEventHandler {
    event Book(uint256 bookingId, uint256 bookedTimestamp);
    event Cancel(uint256 bookingId);
    event Payout(uint256 bookingId);

    function book(uint256 bookingId) external {
        emit Book(bookingId, block.timestamp);
    }

    function cancel(uint256 bookingId) external {
        emit Cancel(bookingId);
    }

    function payout(uint256 bookingId) external {
        emit Payout(bookingId);
    }
}
