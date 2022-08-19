// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.4 <0.9.0;

interface IDtravelConfig {
    function fee() external view returns (uint256);

    function referrerFee() external view returns (uint256);

    function payoutDelayTime() external view returns (uint256);

    function dtravelTreasury() external view returns (address);

    function dtravelBackend() external view returns (address);

    function supportedTokens(address) external view returns (bool);
}
