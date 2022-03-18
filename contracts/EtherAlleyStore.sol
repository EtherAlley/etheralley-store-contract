// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IEtherAlleyStore is IERC1155 {
    struct TokenListing {
        bool purchasable;
        bool transferable;
        uint256 price;
        uint256 supplyLimit;
        uint256 balanceLimit;
        uint256 supply;
    }

    function setURI(string memory newuri) external;

    function pause() external;

    function unpause() external;

    function transferBalance(address to, uint256 amount) external;

    function setListing(
        uint256 id,
        bool purchasable,
        bool transferable,
        uint256 price,
        uint256 supplyLimit,
        uint256 balanceLimit
    ) external;

    function getListing(uint256 id) external view returns (TokenListing memory);

    function getListingBatch(uint256[] memory ids)
        external
        view
        returns (TokenListing[] memory);

    function purchase(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external payable;

    function purchaseBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external payable;

    event ListingChange(
        uint256 id,
        bool purchasable,
        bool transferable,
        uint256 price,
        uint256 supplyLimit,
        uint256 balanceLimit,
        uint256 supply
    );
}

// TODO:
contract EtherAlleyStore is IEtherAlleyStore, ERC1155, Ownable, Pausable {
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

    // TODO:
    function transferBalance(address to, uint256 amount)
        public
        override
        onlyOwner
    {
        payable(to).transfer(amount);
    }

    // TODO:
    function setListing(
        uint256 id,
        bool purchasable,
        bool transferable,
        uint256 price,
        uint256 supplyLimit,
        uint256 balanceLimit
    ) public override onlyOwner {
        TokenListing storage listing = _tokenListings[id];

        listing.purchasable = purchasable;
        listing.transferable = transferable;
        listing.price = price;
        listing.supplyLimit = supplyLimit;
        listing.balanceLimit = balanceLimit;

        emit ListingChange(
            id,
            purchasable,
            transferable,
            price,
            supplyLimit,
            balanceLimit,
            listing.supply
        );
    }

    // TODO:
    function getListing(uint256 id)
        public
        view
        override
        returns (TokenListing memory)
    {
        return _tokenListings[id];
    }

    // TODO:
    function getListingBatch(uint256[] memory ids)
        public
        view
        override
        returns (TokenListing[] memory)
    {
        TokenListing[] memory listings = new TokenListing[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            listings[i] = getListing(ids[i]);
        }

        return (listings);
    }

    // TODO:
    function purchase(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public payable override whenNotPaused {
        _mint(to, id, amount, data);
    }

    // TODO:
    function purchaseBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public payable override whenNotPaused {
        _mintBatch(to, ids, amounts, data);
    }

    // TODO:
    // Checks already done in the prior call stack:
    // - ids and amounts have the same, non-zero length.
    // - to address is not zero address (burns not supported)
    // - from and to are never both zero.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory
    ) internal override(ERC1155) whenNotPaused {
        // Without this check you can avoid the balance limit by passing multiples
        // of the same id with small amounts that in sum exceed the limit.
        for (uint256 i = 0; i < ids.length; i++) {
            for (uint256 j = 0; j < ids.length; j++) {
                require(i == j || ids[i] != ids[j], "Duplicate id detected");
            }
        }

        uint256 totalPrice = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            TokenListing storage listing = _tokenListings[id];

            // Purchase specific logic
            if (from == address(0)) {
                require(listing.purchasable, "Listing not purchasable");

                require(
                    listing.supply + amount <= listing.supplyLimit,
                    "Exceeds supply limit"
                );

                // Update listing supply tracker
                listing.supply += amount;

                // Accumulate total price
                totalPrice += amount * listing.price;
            }

            // Transfer specific logic
            if (from != address(0)) {
                require(listing.transferable, "Listing not transferable");
            }

            require(
                balanceOf(to, id) + amount <= listing.balanceLimit,
                "Exceeds balance limit"
            );
        }

        // Skip payment check for owner address
        if (operator == owner()) {
            return;
        }

        require(msg.value == totalPrice, "Invalid value sent");
    }
}
