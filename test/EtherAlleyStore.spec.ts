import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { EtherAlleyStore } from "../typechain";

describe("EtherAlleyStore", () => {
  const uri: string = "https://api.etheralley.io/store/{id}";
  const tokenId1 = 123;
  const tokenId2 = 456;
  let store: EtherAlleyStore;
  let owner: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    user3: SignerWithAddress;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const Store = await ethers.getContractFactory("EtherAlleyStore");
    store = await Store.connect(owner).deploy(uri);
    await store.deployed();
  });

  describe("Owner Functionality", () => {
    it("Deployment should set signer as owner", async function () {
      expect(await store.owner()).to.equal(owner.address);
    });

    it("Ownly owner can transfer ownership", async () => {
      await expect(
        store.connect(user1).transferOwnership(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(await store.owner()).to.equal(owner.address);
    });

    it("Ownly owner can renounce ownership", async () => {
      await expect(store.connect(user1).renounceOwnership()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      expect(await store.owner()).to.equal(owner.address);
    });

    it("Owner can transfer ownership", async () => {
      await store.connect(owner).transferOwnership(user1.address);

      expect(await store.owner()).to.equal(user1.address);
    });

    it("Owner can revoke ownership", async () => {
      await store.connect(owner).renounceOwnership();

      expect(await store.owner()).to.equal(
        "0x0000000000000000000000000000000000000000"
      );
    });

    it("Owner skips price check", async () => {
      await store
        .connect(owner)
        .setListing(tokenId1, true, true, 1000, 1000, 1000);

      await store
        .connect(owner)
        .setListing(tokenId2, true, true, 1000, 1000, 1000);

      await store
        .connect(owner)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [1000, 1000], [], {
          value: 0,
        });

      const [tokenBalance1, tokenBalance2] = await store.balanceOfBatch(
        [user1.address, user1.address],
        [tokenId1, tokenId2]
      );

      expect(tokenBalance1.toNumber()).to.equal(1000);
      expect(tokenBalance2.toNumber()).to.equal(1000);

      const [[, , , , , token1Supply], [, , , , , token2Supply]] =
        await store.getListingBatch([tokenId1, tokenId2]);

      expect(token1Supply).to.equal(1000);
      expect(token2Supply).to.equal(1000);
    });

    it("Ownly owner can set listings", async () => {
      await expect(
        store.connect(user1).setListing(tokenId1, true, true, 1, 1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Transfer Balance", () => {
    it("Ownly owner transfer balance", async function () {
      expect(
        (await ethers.provider.getBalance(store.address)).toNumber()
      ).to.be.equal(0);

      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 999);

      await store
        .connect(user1)
        .purchase(user1.address, tokenId1, 5, [], { value: 50 });

      await expect(
        store.connect(user2).transferBalance(user2.address, 50)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(
        (await ethers.provider.getBalance(store.address)).toNumber()
      ).to.be.equal(50);
    });

    it("Owner can transfer balance", async () => {
      expect(
        (await ethers.provider.getBalance(store.address)).toNumber()
      ).to.be.equal(0);

      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 999);

      await store
        .connect(user1)
        .purchase(user1.address, tokenId1, 5, [], { value: 50 });

      await store
        .connect(user2)
        .purchase(user2.address, tokenId1, 5, [], { value: 50 });

      expect(
        (await ethers.provider.getBalance(store.address)).toNumber()
      ).to.be.equal(100);

      const ownerBalance = await owner.getBalance();
      const receiverBalance = await user3.getBalance();

      const tx = await store.connect(owner).transferBalance(user3.address, 50);
      const receipt = await tx.wait();

      // owner pays the transaction fee
      const gas = receipt.cumulativeGasUsed;
      const gasPrice = receipt.effectiveGasPrice;
      expect(await owner.getBalance()).to.be.equal(
        ownerBalance.sub(gas.mul(gasPrice))
      );

      // user3 gets the transfer amount
      expect(await user3.getBalance()).to.be.equal(receiverBalance.add(50));

      // contract loses the transfer amount
      expect(
        (await ethers.provider.getBalance(store.address)).toNumber()
      ).to.be.equal(50);
    });
  });

  describe("Pause Functionality", () => {
    it("Cannot pause as non owner", async () => {
      expect(await store.paused()).to.be.equal(false);

      await expect(store.connect(user1).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      expect(await store.paused()).to.be.equal(false);
    });

    it("Cannot unpause as non owner", async () => {
      expect(await store.paused()).to.be.equal(false);

      await store.connect(owner).pause();

      expect(await store.paused()).to.be.equal(true);

      await expect(store.connect(user1).unpause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      expect(await store.paused()).to.be.equal(true);
    });

    it("Purchase is blocked when paused and can proceed when unpaused", async () => {
      await store.connect(owner).pause();
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 999);

      expect(await store.paused()).to.be.equal(true);

      await expect(
        store
          .connect(owner)
          .purchase(user1.address, tokenId1, 1, [], { value: 5 })
      ).to.be.revertedWith("Pausable: paused");

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(0);

      await store.connect(owner).unpause();

      await store
        .connect(owner)
        .purchase(user1.address, tokenId1, 1, [], { value: 5 });

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(1);
    });

    it("Purchase Batch is blocked when paused and can proceed when unpaused", async () => {
      await store.connect(owner).pause();
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 999);
      await store.connect(owner).setListing(tokenId2, true, true, 5, 999, 999);

      expect(await store.paused()).to.be.equal(true);

      await expect(
        store
          .connect(owner)
          .purchaseBatch(user1.address, [tokenId2, tokenId2], [1, 1], [], {
            value: 10,
          })
      ).to.be.revertedWith("Pausable: paused");

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(0);
      expect(await store.balanceOf(user1.address, tokenId2)).to.be.equal(0);

      await store.connect(owner).unpause();

      await store
        .connect(owner)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [1, 1], [], {
          value: 10,
        });

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(1);
      expect(await store.balanceOf(user1.address, tokenId2)).to.be.equal(1);
    });

    it("Transfer is blocked when paused and can proceed when unpaused", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 999);
      await store
        .connect(owner)
        .purchase(user1.address, tokenId1, 1, [], { value: 5 });
      await store.connect(owner).pause();

      expect(await store.paused()).to.be.equal(true);
      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(1);

      await expect(
        store
          .connect(user1)
          .safeTransferFrom(user1.address, user2.address, tokenId1, 1, [])
      ).to.be.revertedWith("Pausable: paused");

      await store.connect(owner).unpause();

      await store
        .connect(user1)
        .safeTransferFrom(user1.address, user2.address, tokenId1, 1, []);

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(0);
      expect(await store.balanceOf(user2.address, tokenId1)).to.be.equal(1);
    });

    it("Transfer Batch is blocked when paused and can proceed when unpaused", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 999);
      await store.connect(owner).setListing(tokenId2, true, true, 5, 999, 999);
      await store
        .connect(owner)
        .purchase(user1.address, tokenId1, 1, [], { value: 5 });
      await store
        .connect(owner)
        .purchase(user1.address, tokenId2, 1, [], { value: 5 });
      await store.connect(owner).pause();

      expect(await store.paused()).to.be.equal(true);
      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(1);
      expect(await store.balanceOf(user1.address, tokenId2)).to.be.equal(1);

      await expect(
        store
          .connect(user1)
          .safeBatchTransferFrom(
            user1.address,
            user2.address,
            [tokenId1, tokenId2],
            [1, 1],
            []
          )
      ).to.be.revertedWith("Pausable: paused");

      await store.connect(owner).unpause();

      await store
        .connect(user1)
        .safeBatchTransferFrom(
          user1.address,
          user2.address,
          [tokenId1, tokenId2],
          [1, 1],
          []
        );

      expect(await store.balanceOf(user1.address, tokenId1)).to.be.equal(0);
      expect(await store.balanceOf(user2.address, tokenId1)).to.be.equal(1);

      expect(await store.balanceOf(user1.address, tokenId2)).to.be.equal(0);
      expect(await store.balanceOf(user2.address, tokenId2)).to.be.equal(1);
    });
  });

  describe("URI Functionality", () => {
    it("should set uri during deployment", async () => {
      expect(await store.uri(0)).to.equal(uri);
    });

    it("should update uri after setting", async () => {
      expect(await store.uri(0)).to.equal(uri);

      const newURI = "https://api.etheralley.io/v2/store/{id}";

      await store.setURI(newURI);

      expect(await store.uri(0)).to.equal(newURI);
    });

    it("only owner can set uri", async () => {
      expect(await store.uri(0)).to.equal(uri);

      await expect(
        store.connect(user1).setURI("https://api.etheralley.io/invalid")
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(await store.uri(0)).to.equal(uri);
    });
  });

  describe("Listing Functionality", () => {
    it("Cannot list an item as non-owner", async () => {
      await expect(
        store.connect(user1).setListing(123, true, true, 1, 1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const [
        purchasable,
        transferable,
        price,
        supplyLimit,
        balanceLimit,
        supply,
      ] = await store.connect(user1).getListing(tokenId1);

      expect(purchasable).to.equal(false);
      expect(transferable).to.equal(false);
      expect(price).to.equal(0);
      expect(supplyLimit).to.equal(0);
      expect(balanceLimit).to.equal(0);
      expect(supply).to.equal(0);
    });

    it("Supply/balance is not affected when listing is modified", async () => {
      const price = 5;
      const amount = 2;
      const supplyLimit = 3;
      const balanceLimit = 2;
      const increase = 1;

      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

      await store.connect(user1).purchase(user1.address, tokenId1, amount, [], {
        value: price * amount,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      let [
        resultPurchasable,
        resultTransferable,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);

      expect([
        resultPurchasable,
        resultTransferable,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([true, true, price, supplyLimit, balanceLimit, amount]);

      await store
        .connect(owner)
        .setListing(
          tokenId1,
          false,
          false,
          price + increase,
          supplyLimit + increase,
          balanceLimit + increase
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      [
        resultPurchasable,
        resultTransferable,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);

      expect([
        resultPurchasable,
        resultTransferable,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([
        false,
        false,
        price + increase,
        supplyLimit + increase,
        balanceLimit + increase,
        amount,
      ]);
    });

    it("Can get multiple listings in batch", async () => {
      await store.connect(owner).setListing(tokenId1, true, false, 3, 4, 5);

      await store.connect(owner).setListing(tokenId2, true, true, 6, 7, 8);

      await store.connect(user1).purchase(user1.address, tokenId1, 2, [], {
        value: 6,
      });

      await store.connect(user1).purchase(user1.address, tokenId2, 3, [], {
        value: 18,
      });

      const [
        [
          token1Purchasable,
          token1Transferable,
          token1Price,
          token1SupplyLimit,
          token1BalanceLimit,
          token1Supply,
        ],
        [
          token2Purchasable,
          token2Transferable,
          token2Price,
          token2SupplyLimit,
          token2BalanceLimit,
          token2Supply,
        ],
      ] = await store.getListingBatch([tokenId1, tokenId2]);
      expect([
        [
          token1Purchasable,
          token1Transferable,
          token1Price.toNumber(),
          token1SupplyLimit.toNumber(),
          token1BalanceLimit.toNumber(),
          token1Supply.toNumber(),
        ],
        [
          token2Purchasable,
          token2Transferable,
          token2Price.toNumber(),
          token2SupplyLimit.toNumber(),
          token2BalanceLimit.toNumber(),
          token2Supply.toNumber(),
        ],
      ]).to.deep.equal([
        [true, false, 3, 4, 5, 2],
        [true, true, 6, 7, 8, 3],
      ]);
    });
  });

  describe("Purchase Functionality", () => {
    it("Cannot purchase an unlisted item", async () => {
      await expect(
        store.connect(user1).purchase(user1.address, tokenId1, 1, [])
      ).to.be.revertedWith("Listing not purchasable");

      expect(await store.balanceOf(user1.address, tokenId1)).to.equal(0);
    });

    it("Cannot purchase a non purchasable item", async () => {
      await store.connect(owner).setListing(tokenId1, false, true, 5, 2, 1);

      await expect(
        store
          .connect(user1)
          .purchase(user1.address, tokenId1, 2, [], { value: 10 })
      ).to.be.revertedWith("Listing not purchasable");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
    });

    [0, 9, 11].forEach((value) => {
      it(`Value must be equal to listing price times amount: ${value}`, async () => {
        await store.connect(owner).setListing(tokenId1, true, true, 5, 2, 2);

        await expect(
          store
            .connect(user1)
            .purchase(user1.address, tokenId1, 2, [], { value })
        ).to.be.revertedWith("Invalid value sent");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    [
      [5, 2, 3, 3, 15],
      [5, 0, 1, 1, 5],
    ].forEach(([price, supplyLimit, balanceLimit, amount, value]) => {
      it(`Purchase must have enough stock. price: ${price}: supplyLimit: ${supplyLimit} balanceLimit: ${balanceLimit} amount: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

        await expect(
          store
            .connect(user1)
            .purchase(user1.address, tokenId1, amount, [], { value })
        ).to.be.revertedWith("Exceeds supply limit");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    [
      [5, 2, 2, 2, 10],
      [5, 2, 2, 1, 5],
      [5, 3, 3, 2, 10],
      [5, 1, 1, 0, 0],
    ].forEach(([price, supplyLimit, balanceLimit, amount, value]) => {
      it(`Purchase mints token to requester when valid amount/value sent for requesting id price: ${price}: supplyLimit: ${supplyLimit} balanceLimit: ${balanceLimit} requestedStock: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

        await store
          .connect(user1)
          .purchase(user1.address, tokenId1, amount, [], { value });

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(amount);

        const [
          resultPurchasable,
          resultTransferable,
          resultPrice,
          resultSupplyLimit,
          resultBalanceLimit,
          resultSupply,
        ] = await store.getListing(tokenId1);

        expect([
          resultPurchasable,
          resultTransferable,
          resultPrice.toNumber(),
          resultSupplyLimit.toNumber(),
          resultBalanceLimit.toNumber(),
          resultSupply.toNumber(),
        ]).to.deep.equal([
          true,
          true,
          price,
          supplyLimit,
          balanceLimit,
          amount,
        ]);
      });
    });

    [
      [5, 4, 3, 4, 20],
      [5, 2, 0, 1, 5],
    ].forEach(([price, supplyLimit, balanceLimit, amount, value]) => {
      it(`Address balance must not exceed limit when purchasing. price: ${price}: supplyLimit: ${supplyLimit} balanceLimit: ${balanceLimit} amount: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

        await expect(
          store
            .connect(user1)
            .purchase(user1.address, tokenId1, amount, [], { value })
        ).to.be.revertedWith("Exceeds balance limit");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    it("Purchases can continue to be made when stock increases", async () => {
      const price = 5;
      const amount = 2;
      const supplyLimit = 2;
      const balanceLimit = 4;
      const increase = 2;

      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

      // purchase all available stock
      await store.connect(user1).purchase(user1.address, tokenId1, amount, [], {
        value: price * amount,
      });

      // check supply/balances
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);
      let [
        resultPurchasable,
        resultTransferable,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);
      expect([
        resultPurchasable,
        resultTransferable,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([true, true, price, supplyLimit, balanceLimit, amount]);

      // try to purchase more.
      await expect(
        store
          .connect(user1)
          .purchase(user1.address, tokenId1, 1, [], { value: price })
      ).to.be.revertedWith("Exceeds supply limit");

      // increase stock
      await store
        .connect(owner)
        .setListing(
          tokenId1,
          true,
          true,
          price,
          supplyLimit + increase,
          balanceLimit
        );

      // purchase all new stock
      await store
        .connect(user1)
        .purchase(user1.address, tokenId1, increase, [], {
          value: price * increase,
        });

      // check supply/balances
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount + increase);
      [
        resultPurchasable,
        resultTransferable,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);
      expect([
        resultPurchasable,
        resultTransferable,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([
        true,
        true,
        price,
        supplyLimit + increase,
        balanceLimit,
        amount + increase,
      ]);
    });

    it("Purchases can continue when balance limit increases", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 5);

      store
        .connect(user1)
        .purchase(user1.address, tokenId1, 5, [], { value: 25 });

      await expect(
        store
          .connect(user1)
          .purchase(user1.address, tokenId1, 1, [], { value: 5 })
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 6);

      await store
        .connect(user1)
        .purchase(user1.address, tokenId1, 1, [], { value: 5 });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(6);
    });

    it("Purchases can continue when item is marked purchasable", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 5);

      store
        .connect(user1)
        .purchase(user1.address, tokenId1, 5, [], { value: 25 });

      await store.connect(owner).setListing(tokenId1, false, true, 5, 999, 999);

      await expect(
        store
          .connect(user1)
          .purchase(user1.address, tokenId1, 1, [], { value: 5 })
      ).to.be.revertedWith("Listing not purchasable");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await store.connect(owner).setListing(tokenId1, true, true, 5, 999, 999);

      await store
        .connect(user1)
        .purchase(user1.address, tokenId1, 1, [], { value: 5 });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(6);
    });

    it("Item is still purchasable when not transferable", async () => {
      await store.connect(owner).setListing(tokenId1, true, false, 5, 999, 5);

      store
        .connect(user1)
        .purchase(user2.address, tokenId1, 5, [], { value: 25 });

      await expect(
        store
          .connect(user2)
          .safeTransferFrom(user2.address, user3.address, tokenId1, 1, [])
      ).to.be.revertedWith("Listing not transferable");

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
    });
  });

  describe("Purchase Batch Functionality", () => {
    it("Can not avoid balance limit check by batch purchasing smaller amounts of the same id", async () => {
      const price = 12;
      const supplyLimit = 10;
      const balanceLimit = 3;
      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, supplyLimit, balanceLimit);

      await expect(
        store
          .connect(user1)
          .purchaseBatch(
            user1.address,
            [tokenId1, tokenId1],
            [balanceLimit - 1, balanceLimit - 1],
            [],
            {
              value: price * (balanceLimit - 1) * 2,
            }
          )
      ).to.be.revertedWith("Duplicate id detected");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(0);
    });

    it("Value sent can not differ from total price when requesting multiple ids with multiple amounts", async () => {
      const tokenId1Price = 10;
      const tokenId2Price = 43;
      const tokenId1Amount = 14;
      const tokenId2Amount = 673;

      await store
        .connect(owner)
        .setListing(tokenId1, true, true, tokenId1Price, 999, 999);

      await store
        .connect(owner)
        .setListing(tokenId2, true, true, tokenId2Price, 999, 999);

      await expect(
        store
          .connect(user1)
          .purchaseBatch(
            user1.address,
            [tokenId1, tokenId2],
            [tokenId1Amount, tokenId2Amount],
            [],
            {
              value:
                tokenId1Price * tokenId1Amount +
                (tokenId2Price * tokenId2Amount - 1),
            }
          )
      ).to.be.revertedWith("Invalid value sent");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(0);
      const [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(0);
    });

    it("No item in batch can be over supply limit", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 999, 999);

      await store.connect(owner).setListing(tokenId2, true, true, 1, 999, 999);

      await expect(
        store
          .connect(user1)
          .purchaseBatch(user1.address, [tokenId1, tokenId2], [999, 1000], [], {
            value: 1999,
          })
      ).to.be.revertedWith("Exceeds supply limit");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(0);
      const [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(0);
    });

    it("No item in batch can be over balance limit", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 9999, 999);

      await store.connect(owner).setListing(tokenId2, true, true, 1, 9999, 999);

      await expect(
        store
          .connect(user1)
          .purchaseBatch(user1.address, [tokenId1, tokenId2], [999, 1000], [], {
            value: 1999,
          })
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(0);
      const [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(0);
    });

    it("No item in batch can not be purchasable", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 1, 1);

      await store.connect(owner).setListing(tokenId2, false, true, 1, 1, 1);

      await expect(
        store
          .connect(user1)
          .purchaseBatch(user1.address, [tokenId1, tokenId2], [1, 1], [], {
            value: 2,
          })
      ).to.be.revertedWith("Listing not purchasable");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(0);
      const [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(0);
    });

    it("Any item in batch can be non transferable", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 1, 1);

      await store.connect(owner).setListing(tokenId2, true, false, 1, 1, 1);

      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [1, 1], [], {
          value: 2,
        });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(1);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(1);
    });

    it("Balance and supply are updated when all constraints are met and called multiple times", async () => {
      const token1Price = 12;
      const token2Price = 53;
      const token1Amount = 72;
      const token2Amount = 34;
      await store
        .connect(owner)
        .setListing(tokenId1, true, true, token1Price, 9999, 9999);

      await store
        .connect(owner)
        .setListing(tokenId2, true, true, token2Price, 9999, 9999);

      await store
        .connect(user1)
        .purchaseBatch(
          user1.address,
          [tokenId1, tokenId2],
          [token1Amount, token2Amount],
          [],
          {
            value: token1Price * token1Amount + token2Price * token2Amount,
          }
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(token1Amount);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(token2Amount);
      let [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(token1Amount);
      let [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(token2Amount);

      await store
        .connect(user1)
        .purchaseBatch(
          user1.address,
          [tokenId1, tokenId2],
          [token1Amount, token2Amount],
          [],
          {
            value: token1Price * token1Amount + token2Price * token2Amount,
          }
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(token1Amount * 2);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(token2Amount * 2);
      [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(token1Amount * 2);
      [, , , , , token2Supply] = await store.getListing(tokenId2);
      expect(token2Supply).to.equal(token2Amount * 2);
    });

    it("Purchasing on behalf of someone does not avoid the balance check", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 1);

      await expect(
        store.connect(user1).purchase(user2.address, tokenId1, 2, [], {
          value: 2,
        })
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(0);
    });
  });

  describe("Transfer Functionality", () => {
    it("Address balance must not exceed limit when transfering", async () => {
      const price = 10;
      const amount = 9;
      const balanceLimit = 10;
      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, 999, balanceLimit);

      await store.connect(user1).purchase(user1.address, tokenId1, amount, [], {
        value: amount * price,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      await store.connect(user1).purchase(user2.address, tokenId1, amount, [], {
        value: amount * price,
      });

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(amount);

      await store
        .connect(user1)
        .safeTransferFrom(
          user1.address,
          user3.address,
          tokenId1,
          amount,
          [],
          {}
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(9);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(9);

      await expect(
        store
          .connect(user2)
          .safeTransferFrom(
            user2.address,
            user3.address,
            tokenId1,
            amount,
            [],
            {}
          )
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(9);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(9);
    });

    it("Transfers can continue when address limit increases", async () => {
      const price = 10;
      const amount = 9;
      const balanceLimit = 10;
      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, 999, balanceLimit);

      await store.connect(user1).purchase(user1.address, tokenId1, amount, [], {
        value: amount * price,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      await store.connect(user1).purchase(user2.address, tokenId1, amount, [], {
        value: amount * price,
      });

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(amount);

      await store
        .connect(user1)
        .safeTransferFrom(
          user1.address,
          user3.address,
          tokenId1,
          amount,
          [],
          {}
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(9);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(9);

      await expect(
        store
          .connect(user2)
          .safeTransferFrom(
            user2.address,
            user3.address,
            tokenId1,
            amount,
            [],
            {}
          )
      ).to.be.revertedWith("Exceeds balance limit");

      await store
        .connect(owner)
        .setListing(tokenId1, true, true, price, 999, balanceLimit * 2);

      await store
        .connect(user2)
        .safeTransferFrom(
          user2.address,
          user3.address,
          tokenId1,
          amount,
          [],
          {}
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(18);
    });

    it("Can not transfer more balance than owned", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 999);

      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await expect(
        store
          .connect(user1)
          .safeTransferFrom(user1.address, user3.address, tokenId1, 6, [], {})
      ).to.be.revertedWith("ERC1155: insufficient balance for transfer");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(0);
    });

    it("Can not transfer a non transferable item", async () => {});

    it("Can transfer a non purchasable item", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 999);

      await store.connect(user1).purchase(user1.address, tokenId1, 1, [], {
        value: 10,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(1);

      await store
        .connect(owner)
        .setListing(tokenId1, false, true, 10, 999, 999);

      await store
        .connect(user1)
        .safeTransferFrom(user1.address, user3.address, tokenId1, 1, [], {});

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(1);
    });

    it("Can transfer an item at max supply", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 10, 999);

      await store.connect(user1).purchase(user1.address, tokenId1, 10, [], {
        value: 100,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(10);

      await store
        .connect(user1)
        .safeTransferFrom(user1.address, user3.address, tokenId1, 10, [], {});

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(10);
      const [, , , , , token1Supply] = await store.getListing(tokenId1);
      expect(token1Supply).to.equal(10);
    });

    it("Can continue with transfers when balance limit increases", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 2);

      await store.connect(user1).purchase(user2.address, tokenId1, 2, [], {
        value: 2,
      });

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(2);

      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 1);

      await expect(
        store
          .connect(user2)
          .safeTransferFrom(user2.address, user3.address, tokenId1, 2, [])
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(2);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);

      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 2);

      await store
        .connect(user2)
        .safeTransferFrom(user2.address, user3.address, tokenId1, 2, []);

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(2);
    });

    it("Can continue with transfers when item is marked transferable", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 2);

      await store.connect(user1).purchase(user2.address, tokenId1, 2, [], {
        value: 2,
      });

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(2);

      await store.connect(owner).setListing(tokenId1, true, false, 1, 2, 2);

      await expect(
        store
          .connect(user2)
          .safeTransferFrom(user2.address, user3.address, tokenId1, 2, [])
      ).to.be.revertedWith("Listing not transferable");

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(2);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);

      await store.connect(owner).setListing(tokenId1, true, true, 1, 2, 2);

      await store
        .connect(user2)
        .safeTransferFrom(user2.address, user3.address, tokenId1, 2, []);

      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(2);
    });
  });

  describe("Transfer Batch Functionality", () => {
    it("Can not avoid balance limit check by batch transfering small amounts of the same id", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 15);

      await store.connect(user1).purchase(user1.address, tokenId1, 10, [], {
        value: 100,
      });

      await store.connect(user1).purchase(user2.address, tokenId1, 10, [], {
        value: 100,
      });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(10);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(10);

      await store
        .connect(user1)
        .safeBatchTransferFrom(
          user1.address,
          user3.address,
          [tokenId1],
          [10],
          [],
          {}
        );
      await expect(
        store
          .connect(user2)
          .safeBatchTransferFrom(
            user2.address,
            user3.address,
            [tokenId1, tokenId1],
            [5, 5],
            [],
            {}
          )
      ).to.be.revertedWith("Duplicate id detected");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user2.getAddress(), tokenId1)
      ).to.equal(10);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(10);
    });

    it("Fails when one item is over balance limit", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, true, 10, 999, 6);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 6], [], {
          value: 110,
        });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(6);

      await store.connect(owner).setListing(tokenId2, true, true, 10, 999, 5);

      await expect(
        store
          .connect(user2)
          .safeBatchTransferFrom(
            user2.address,
            user3.address,
            [tokenId1, tokenId2],
            [5, 6],
            [],
            {}
          )
      ).to.be.revertedWith("Exceeds balance limit");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(6);
    });

    it("Fails when one item is non transferable", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, false, 10, 999, 5);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 5], [], {
          value: 100,
        });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      await expect(
        store
          .connect(user1)
          .safeBatchTransferFrom(
            user1.address,
            user3.address,
            [tokenId1, tokenId2],
            [5, 5],
            [],
            {}
          )
      ).to.be.revertedWith("Listing not transferable");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId2)
      ).to.equal(0);
    });

    it("Works when all constraints are met", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, true, 10, 999, 5);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 5], [], {
          value: 100,
        });

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      await store
        .connect(user1)
        .safeBatchTransferFrom(
          user1.address,
          user3.address,
          [tokenId1, tokenId2],
          [5, 5],
          [],
          {}
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);

      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId2)
      ).to.equal(5);
    });
  });

  describe("Approval For Functionality", () => {
    it("Cannot transfer when not approved", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await expect(
        store
          .connect(user3)
          .safeTransferFrom(user1.address, user3.address, tokenId1, 5, [], {})
      ).to.be.revertedWith("ERC1155: caller is not owner nor approved");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
    });

    it("Cannot batch transfer when not approved", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, false, 10, 999, 5);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 5], [], {
          value: 100,
        });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      await expect(
        store
          .connect(user3)
          .safeBatchTransferFrom(
            user1.address,
            user3.address,
            [tokenId1, tokenId2],
            [5, 5],
            [],
            {}
          )
      ).to.be.revertedWith(
        "ERC1155: transfer caller is not owner nor approved"
      );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId2)
      ).to.equal(0);
    });

    it("Cannot bypass balance limit when transfering on behalf of address", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await expect(
        store
          .connect(user3)
          .safeTransferFrom(user1.address, user3.address, tokenId1, 999, [], {})
      ).to.be.revertedWith("ERC1155: caller is not owner nor approved");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
    });

    it("Cannot bypass non transferable flag when transfering on behalf of address", async () => {
      await store.connect(owner).setListing(tokenId1, true, false, 10, 999, 5);
      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await expect(
        store
          .connect(user3)
          .safeTransferFrom(user1.address, user3.address, tokenId1, 5, [], {})
      ).to.be.revertedWith("ERC1155: caller is not owner nor approved");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
    });

    it("Can transfer when approved", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await store.connect(user1).setApprovalForAll(user3.address, true);

      await store
        .connect(user3)
        .safeTransferFrom(user1.address, user3.address, tokenId1, 5, [], {});

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(5);
    });

    it("Cannot transfer after losing approval", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(user1).purchase(user1.address, tokenId1, 5, [], {
        value: 50,
      });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);

      await store.connect(user1).setApprovalForAll(user3.address, true);

      expect(
        await store.isApprovedForAll(user1.address, user3.address)
      ).to.be.equal(true);

      await store.connect(user1).setApprovalForAll(user3.address, false);

      expect(
        await store.isApprovedForAll(user1.address, user3.address)
      ).to.be.equal(false);

      await expect(
        store
          .connect(user3)
          .safeTransferFrom(user1.address, user3.address, tokenId1, 5, [], {})
      ).to.be.revertedWith("ERC1155: caller is not owner nor approved");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
    });

    it("Can batch transfer when approved", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, true, 10, 999, 5);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 5], [], {
          value: 100,
        });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      await store.connect(user1).setApprovalForAll(user3.address, true);

      expect(
        await store.isApprovedForAll(user1.address, user3.address)
      ).to.be.equal(true);

      await store.connect(user1).setApprovalForAll(user3.address, false);

      expect(
        await store.isApprovedForAll(user1.address, user3.address)
      ).to.be.equal(false);

      await expect(
        store
          .connect(user3)
          .safeBatchTransferFrom(
            user1.address,
            user3.address,
            [tokenId1, tokenId2],
            [5, 5],
            [],
            {}
          )
      ).to.be.revertedWith("transfer caller is not owner nor approved");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId2)
      ).to.equal(0);
    });

    it("Cannot batch transfer after losing approval", async () => {
      await store.connect(owner).setListing(tokenId1, true, true, 10, 999, 5);
      await store.connect(owner).setListing(tokenId2, true, true, 10, 999, 5);
      await store
        .connect(user1)
        .purchaseBatch(user1.address, [tokenId1, tokenId2], [5, 5], [], {
          value: 100,
        });
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(5);

      await store.connect(user1).setApprovalForAll(user3.address, true);

      await store
        .connect(user3)
        .safeBatchTransferFrom(
          user1.address,
          user3.address,
          [tokenId1, tokenId2],
          [5, 5],
          [],
          {}
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId2)
      ).to.equal(0);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId1)
      ).to.equal(5);
      expect(
        await store.balanceOf(await user3.getAddress(), tokenId2)
      ).to.equal(5);
    });
  });
});
