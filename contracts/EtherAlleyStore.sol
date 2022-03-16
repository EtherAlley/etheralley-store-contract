// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

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

    function purchase(uint256 id, uint256 amount) external payable;

    function setListing(
        uint256 id,
        uint256 price,
        uint256 supplyLimit,
        uint256 addressLimit
    ) external;

    function getListing(uint256 id) external view returns (uint256[4] memory);

    function getListingBatch(uint256[] memory ids)
        external
        view
        returns (uint256[4][] memory);

    function transferBalance(uint256 amount) external;

    event ListingChange(
        uint256 id,
        uint256 price,
        uint256 supplyLimit,
        uint256 addressLimit,
        uint256 supply
    );
}

// TODO:
// - support erc20 transfer?
contract EtherAlleyStore is IEtherAlleyStore, ERC1155, Ownable, Pausable {
    struct TokenListing {
        uint256 price;
        uint256 supplyLimit;
        uint256 addressLimit;
        uint256 supply;
    }

    mapping(uint256 => TokenListing) private _tokenListings;

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

    // TODO:
    function transferBalance(uint256 amount) public override onlyOwner {
        payable(owner()).transfer(amount);
    }

    // TODO:
    function setListing(
        uint256 id,
        uint256 price,
        uint256 supplyLimit,
        uint256 addressLimit
    ) public override onlyOwner {
        TokenListing storage listing = _tokenListings[id];
        require(supplyLimit >= listing.supply, "Listing: invalid supplyLimit");
        listing.price = price;
        listing.supplyLimit = supplyLimit;
        listing.addressLimit = addressLimit;
        emit ListingChange(
            id,
            price,
            supplyLimit,
            addressLimit,
            listing.supply
        );
    }

    // TODO:
    function getListing(uint256 id)
        public
        view
        override
        returns (uint256[4] memory)
    {
        TokenListing memory listing = _tokenListings[id];
        return [
            listing.price,
            listing.supplyLimit,
            listing.addressLimit,
            listing.supply
        ];
    }

    // TODO:
    function getListingBatch(uint256[] memory ids)
        public
        view
        override
        returns (uint256[4][] memory)
    {
        uint256[4][] memory listings = new uint256[4][](ids.length);
        for (uint256 i = 0; i < ids.length; ++i) {
            listings[i] = getListing(ids[i]);
        }
        return listings;
    }

    // TODO:
    function purchase(uint256 id, uint256 amount)
        public
        payable
        override
        whenNotPaused
    {
        TokenListing memory listing = _tokenListings[id];
        require(listing.price > 0, "Purchase: no price set");
        require(amount > 0, "Purchase: invalid amount");
        require(
            msg.value == amount * listing.price,
            "Purchase: not enough value sent"
        );
        require(
            listing.supply + amount <= listing.supplyLimit,
            "Purchase: not enough stock"
        );
        _mint(_msgSender(), id, amount, "");
    }

    // TODO:
    // You can avoid the address limit guard technically by passing multiples
    // of the same id with small amounts that in sum exceed the limit.
    // Although this is not technically possible for any user facing external functions,
    // as there is no batch purchase that accepts multiple ids
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155) whenNotPaused {
        if (to != address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                require(
                    balanceOf(to, ids[i]) + amounts[i] <=
                        _tokenListings[ids[i]].addressLimit,
                    "Transfer: invalid new balance"
                );
            }
        }

        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        if (from == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                _tokenListings[ids[i]].supply += amounts[i];
            }
        }

        if (to == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                _tokenListings[ids[i]].supply -= amounts[i];
            }
        }
    }
}
