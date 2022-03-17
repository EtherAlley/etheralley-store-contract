import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { EtherAlleyStore } from "../typechain";

describe("EtherAlleyStore", () => {
  const uri: string = "https://api.etheralley.io/store/{id}";
  const tokenId1 = 123;
  let store: EtherAlleyStore;
  let owner: SignerWithAddress, user1: SignerWithAddress;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();

    const Store = await ethers.getContractFactory("EtherAlleyStore");
    store = await Store.connect(owner).deploy(uri);
    await store.deployed();
  });

  describe("Owner Functionality", () => {
    it("Should set the right owner", async function () {
      expect(await store.owner()).to.equal(owner.address);
    });
  });

  describe("Pause Functionality", () => {
    it("Purchase is blocked when paused and can proceed when unpaused", () => {});

    it("Purchase Batch is blocked when paused and can proceed when unpaused", () => {});

    it("Transfer is blocked when paused and can proceed when unpaused", () => {});

    it("Transfer Batch is blocked when paused and can proceed when unpaused", () => {});
  });

  describe("URI Functionality", () => {
    it("should return uri after deployment", async () => {
      expect(await store.uri(0)).to.equal(uri);
    });

    it("should update uri after setting", async () => {
      expect(await store.uri(0)).to.equal(uri);

      const newURI = "https://api.etheralley.io/v2/store/{id}";

      const tx = await store.setURI(newURI);

      await tx.wait();

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
        store.connect(user1).setListing(123, true, 1, 1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const [enabled, price, supplyLimit, balanceLimit, supply] = await store
        .connect(user1)
        .getListing(tokenId1);

      expect(enabled).to.equal(false);
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
        .setListing(tokenId1, true, price, supplyLimit, balanceLimit);

      const tx = await store
        .connect(user1)
        .purchase(user1.address, tokenId1, amount, [], {
          value: price * amount,
        });
      await tx.wait();

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      let [
        resultEnabled,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);

      expect([
        resultEnabled,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([true, price, supplyLimit, balanceLimit, amount]);

      await store
        .connect(owner)
        .setListing(
          tokenId1,
          false,
          price + increase,
          supplyLimit + increase,
          balanceLimit + increase
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      [
        resultEnabled,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);

      expect([
        resultEnabled,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([
        false,
        price + increase,
        supplyLimit + increase,
        balanceLimit + increase,
        amount,
      ]);
    });
  });

  describe("Purchase Functionality", () => {
    it("Cannot purchase an unlisted item", async () => {
      await expect(
        store.connect(user1).purchase(user1.address, tokenId1, 1, [])
      ).to.be.revertedWith("Listing not enabled");

      expect(await store.balanceOf(user1.address, tokenId1)).to.equal(0);
    });

    it("Cannot purchase a non enabled item", async () => {
      await store.connect(owner).setListing(tokenId1, false, 5, 2, 1);

      await expect(
        store
          .connect(user1)
          .purchase(user1.address, tokenId1, 2, [], { value: 10 })
      ).to.be.revertedWith("Listing not enabled");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
    });

    [0, 9, 11].forEach((value) => {
      it(`Value must be equal to item price times amount: ${value}`, async () => {
        await store.connect(owner).setListing(tokenId1, true, 5, 2, 2);

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
          .setListing(tokenId1, true, price, supplyLimit, balanceLimit);

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
          .setListing(tokenId1, true, price, supplyLimit, balanceLimit);

        const tx = await store
          .connect(user1)
          .purchase(user1.address, tokenId1, amount, [], { value });
        await tx.wait();

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(amount);

        const [
          resultEnabled,
          resultPrice,
          resultSupplyLimit,
          resultBalanceLimit,
          resultSupply,
        ] = await store.getListing(tokenId1);

        expect([
          resultEnabled,
          resultPrice.toNumber(),
          resultSupplyLimit.toNumber(),
          resultBalanceLimit.toNumber(),
          resultSupply.toNumber(),
        ]).to.deep.equal([true, price, supplyLimit, balanceLimit, amount]);
      });
    });

    [
      [5, 4, 3, 4, 20],
      [5, 2, 0, 1, 5],
    ].forEach(([price, supplyLimit, balanceLimit, amount, value]) => {
      it(`Address balance must not exceed limit when purchasing. price: ${price}: supplyLimit: ${supplyLimit} balanceLimit: ${balanceLimit} amount: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, true, price, supplyLimit, balanceLimit);

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
        .setListing(tokenId1, true, price, supplyLimit, balanceLimit);

      // purchase all available stock
      let tx = await store
        .connect(user1)
        .purchase(user1.address, tokenId1, amount, [], {
          value: price * amount,
        });
      await tx.wait();

      // check supply/balances
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);
      let [
        resultEnabled,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);
      expect([
        resultEnabled,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([true, price, supplyLimit, balanceLimit, amount]);

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
          price,
          supplyLimit + increase,
          balanceLimit
        );

      // purchase all new stock
      tx = await store
        .connect(user1)
        .purchase(user1.address, tokenId1, increase, [], {
          value: price * increase,
        });
      await tx.wait();

      // check supply/balances
      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount + increase);
      [
        resultEnabled,
        resultPrice,
        resultSupplyLimit,
        resultBalanceLimit,
        resultSupply,
      ] = await store.getListing(tokenId1);
      expect([
        resultEnabled,
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultBalanceLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([
        true,
        price,
        supplyLimit + increase,
        balanceLimit,
        amount + increase,
      ]);
    });

    it("Purchases can continue when address limit increases", () => {});

    it("Purchases can continue when item is re-enabled", () => {});
  });

  describe("Purchase Batch Functionality", () => {
    it("Value sent can not exceed total price when requesting multiple ids with multiple amounts", () => {});

    it("Fails when one item is over supply limit", () => {});

    it("Fails when one item is over address limit", () => {});

    it("Fails when one item is not enabled", () => {});

    it("Works when all contraints are met", () => {});

    it("", () => {});

    it("", () => {});

    it("", () => {});
  });

  describe("Transfer Functionality", () => {
    it("Address balance must not exceed limit when transfering", () => {});

    it("Transfers can continue when address limit increases", () => {});

    it("Can not transfer more balance than owned", () => {});

    it("Can not avoid address limit check by batch transfering small amounts of the same id", () => {});

    it("Works when all contraints are met", () => {});

    it("", () => {});

    it("", () => {});

    it("", () => {});
  });

  describe("Transfer Batch Functionality", () => {
    it("Can not avoid address limit check by batch transfering small amounts of the same id", () => {});

    it("Fails when one item is over supply limit", () => {});

    it("Fails when one item is over address limit", () => {});

    it("Fails when one item is not enabled", () => {});

    it("Works when all contraints are met", () => {});

    it("", () => {});

    it("", () => {});

    it("", () => {});
  });
});
