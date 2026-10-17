// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AssetToken
/// @notice Універсальний ERC-20 токен для емісії цифрових активів
///         (власний студентський токен VertiiCoin, синтетичний фіат MockFiat тощо).
/// @dev Уся початкова емісія карбується на адресу того, хто розгортає контракт.
contract AssetToken is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        _mint(msg.sender, initialSupply);
    }
}
