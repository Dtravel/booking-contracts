// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Test is ERC20 {
    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
    // solhint-disable-next-line
    {

    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
