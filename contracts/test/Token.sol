//SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _mint(msg.sender, 1000000000000000000000000000000);
    }

    function mint(address _to, uint256 _amount) public {
        require(_to != address(this));
        require(_amount > 0);
        require(msg.sender == address(this));
        _mint(_to, _amount);
    }
}
