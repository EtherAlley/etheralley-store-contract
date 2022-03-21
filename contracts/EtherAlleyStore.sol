// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/// @title The contract for the Ether Alley Store
/// @notice The Ether Alley Store allows for controlling the purchasing and transfering of Ether Alley tokens
interface IEtherAlleyStore is IERC1155, IERC1155MetadataURI {
    struct TokenListing {
        bool purchasable;
        bool transferable;
        uint256 price;
        uint256 supplyLimit;
        uint256 balanceLimit;
        uint256 supply;
    }

    /// @notice function that sets the uri returned when calling #uri
    /// @dev only the owner address can call this function
    /// @param newuri is used to set uri
    function setURI(string memory newuri) external;

    /// @notice function that disables any functions marked as whenNotPaused
    /// @dev only the owner address can call this function
    function pause() external;

    /// @notice function that enables any functions marked as whenNotPaused
    /// @dev only the owner address can call this function
    function unpause() external;

    /// @notice function that transfers the requested amount of wei from this contract to the requested address
    /// @dev only the owner address can call this function
    /// @param to the destination to send the requested amount of wei to
    /// @param amount the amount of wei to send to the to address
    function transferBalance(address to, uint256 amount) external;

    /// @notice function that sets the listing with the provided listing information
    /// @dev only the owner address can call this function
    /// @param id the id of the listing being modified
    /// @param purchasable whether the token can be purchased using one of purchase or purchaseBatch
    /// @param transferable whether the token can be transfered using one of safeTransferFrom or safeBatchTransferFrom
    /// @param price the value that must be sent along with the transaction per item amount being requested
    /// @param supplyLimit the total supply that can be in circulation at any time for the given id
    /// @param balanceLimit the number of tokens that an address can have both through purchasing and/or transfering at any given time
    function setListing(
        uint256 id,
        bool purchasable,
        bool transferable,
        uint256 price,
        uint256 supplyLimit,
        uint256 balanceLimit
    ) external;

    /// @notice function that provides the token listing for the requested id
    /// @param id the id to get a listing for
    /// @return listing the listing of the requested id
    function getListing(uint256 id)
        external
        view
        returns (TokenListing memory listing);

    /// @notice function that provides the token listings for the requested ids
    /// @param ids the ids to get listings for
    /// @return listings the listings of each id in ids
    function getListingBatch(uint256[] memory ids)
        external
        view
        returns (TokenListing[] memory listings);

    /// @notice payable function that provides the requested account with the requested amount of id
    /// @dev the value sent along with calling the purchase function must equal id's price * amount
    /// @dev this function is pausable by the owner address
    /// @param account the account that will receive amount of id
    /// @param id the id to mint the amount of
    /// @param amount the amount of id to mint
    /// @param data data that will be passed to the onERC1155Received of account if account is a contract
    function purchase(
        address account,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external payable;

    /// @notice payable function that provides the requested account with the requested amounts of ids
    /// @dev the value sent along with calling the purchase function must equal the aggregate of all id's price * amount
    /// @dev the index in ids will be the index used for amounts
    /// @dev duplicates of the same id will not be accepted
    /// @dev this function is pausable by the owner address
    /// @param to the account that will receive the amounts of ids
    /// @param ids the ids to mint the amounts of
    /// @param amounts the amounts of id to mint
    /// @param data data that will be passed to the onERC1155Received of account if account is a contract
    function purchaseBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external payable;

    /// @notice Emitted when #setListing is called
    /// @param id the id of the listing being modified
    /// @param purchasable whether the token can be purchased using one of purchase or purchaseBatch
    /// @param transferable whether the token can be transfered using one of safeTransferFrom or safeBatchTransferFrom
    /// @param price the value that must be sent along with the transaction per item amount being requested
    /// @param supplyLimit the total supply that can be in circulation at any time for the given id
    /// @param balanceLimit the number of tokens that an address can have both through purchasing and/or transfering at any given time
    /// @param supply the current total supply of the given id at the time the event was emitted
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

contract EtherAlleyStore is IEtherAlleyStore, ERC1155, Ownable, Pausable {
    mapping(uint256 => TokenListing) private _tokenListings;

    constructor(string memory uri)
        ERC1155(uri) // solhint-disable-next-line
    {}

    /// @inheritdoc IEtherAlleyStore
    function setURI(string memory newuri) public override onlyOwner {
        _setURI(newuri);
    }

    /// @inheritdoc IEtherAlleyStore
    function pause() public override onlyOwner {
        _pause();
    }

    /// @inheritdoc IEtherAlleyStore
    function unpause() public override onlyOwner {
        _unpause();
    }

    /// @inheritdoc IEtherAlleyStore
    function transferBalance(address to, uint256 amount)
        public
        override
        onlyOwner
    {
        payable(to).transfer(amount);
    }

    /// @inheritdoc IEtherAlleyStore
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

    /// @inheritdoc IEtherAlleyStore
    function getListing(uint256 id)
        public
        view
        override
        returns (TokenListing memory)
    {
        return _tokenListings[id];
    }

    /// @inheritdoc IEtherAlleyStore
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

    /// @inheritdoc IEtherAlleyStore
    function purchase(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public payable override whenNotPaused {
        _mint(to, id, amount, data);
    }

    /// @inheritdoc IEtherAlleyStore
    function purchaseBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public payable override whenNotPaused {
        _mintBatch(to, ids, amounts, data);
    }

    /// @notice This function is called internally by the OpenZeppelin ERC1155 implementation before a balance change occurs
    /// @dev Checks already done in the prior call stack:
    /// @dev - ids and amounts have the same, non-zero length.
    /// @dev - to address is not zero address (burns not supported)
    /// @dev - from and to are never both zero.
    /// @dev this function is pausable which will consequently pause all mint/burn/transfer calls
    /// @param operator the account that initiated this transaction
    /// @param from the account that is receiving the amounts of ids to its balance
    /// @param to the account that is sending the amounts of ids from its balance
    /// @param ids the ids to use the amounts of
    /// @param amounts the amounts of id to use
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
