// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

interface IEtherAlleyStore is IERC1155 {
    function setURI(string memory newuri) external;

    function pause() external;

    function unpause() external;

    function mint(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external;
}

/**
 * TODO:
 * SetPrice/Supply:
 * - set price/supply on a token id
 * - mapping of token id to price/supply
 * - ownly owner
 * BuyToken:
 * - buy fixed amount of an id
 * - payable
 * - amount >= token quantity * price
 * Transfer Ether:
 * - also other erc20?
 * - transfers to owner address
 * - ownly owner
 */
contract EtherAlleyStore is
    IEtherAlleyStore,
    ERC1155,
    Ownable,
    Pausable,
    ERC1155Supply
{
    constructor(string memory uri)
        ERC1155(uri) // solhint-disable-next-line
    {}

    function setURI(string memory newuri) public override onlyOwner {
        _setURI(newuri);
    }

    function pause() public override onlyOwner {
        _pause();
    }

    function unpause() public override onlyOwner {
        _unpause();
    }

    function mint(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override onlyOwner {
        _mint(account, id, amount, data);
    }

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public override onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155, ERC1155Supply) whenNotPaused {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
