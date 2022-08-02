// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DtravelTokenTest is ERC20, Ownable {

    constructor(uint256 initialSupply) ERC20("USDT", "USDT") {
        _mint(msg.sender, initialSupply);
    }

    function mint(uint256 _amount) onlyOwner public {
        _mint(owner(), _amount);
    }

    function faucet(address _recipient, uint256 _amount) onlyOwner public {
        _mint(_recipient, _amount);
    }

    function burn(uint256 _amount) onlyOwner public {
        _burn(owner(), _amount);
    }
}
