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

  describe("Pause Functionality", () => {});

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
        store.connect(user1).setListing(123, 1, 1, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      const [price, supplyLimit, addressLimit, supply] = await store
        .connect(user1)
        .getListing(tokenId1);

      expect(price).to.equal(0);
      expect(supplyLimit).to.equal(0);
      expect(addressLimit).to.equal(0);
      expect(supply).to.equal(0);
    });

    it("Supply/balance is not affected when listing is modified", async () => {
      const price = 5;
      const amount = 2;
      const supplyLimit = 3;
      const addressLimit = 2;
      const increase = 1;

      await store
        .connect(owner)
        .setListing(tokenId1, price, supplyLimit, addressLimit);

      const tx = await store
        .connect(user1)
        .purchase(tokenId1, amount, { value: price * amount });
      await tx.wait();

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      let [resultPrice, resultSupplyLimit, resultAddressLimit, resultSupply] =
        await store.getListing(tokenId1);

      expect([
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultAddressLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([price, supplyLimit, addressLimit, amount]);

      await store
        .connect(owner)
        .setListing(
          tokenId1,
          price + increase,
          supplyLimit + increase,
          addressLimit + increase
        );

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(amount);

      [resultPrice, resultSupplyLimit, resultAddressLimit, resultSupply] =
        await store.getListing(tokenId1);

      expect([
        resultPrice.toNumber(),
        resultSupplyLimit.toNumber(),
        resultAddressLimit.toNumber(),
        resultSupply.toNumber(),
      ]).to.deep.equal([
        price + increase,
        supplyLimit + increase,
        addressLimit + increase,
        amount,
      ]);
    });
  });

  describe("Purchase Functionality", () => {
    it("Cannot purchase an unlisted item", async () => {
      await expect(
        store.connect(user1).purchase(tokenId1, 1)
      ).to.be.revertedWith("Purchase: no price set");

      expect(await store.balanceOf(user1.address, tokenId1)).to.equal(0);
    });

    it("Purchase amount must be greater than zero", async () => {
      await store.connect(owner).setListing(tokenId1, 1, 1, 1);

      await expect(
        store.connect(user1).purchase(tokenId1, 0)
      ).to.be.revertedWith("Purchase: invalid amount");

      expect(
        await store.balanceOf(await user1.getAddress(), tokenId1)
      ).to.equal(0);
    });

    [0, 9, 11].forEach((value) => {
      it(`Value must be equal to item price times amount: ${value}`, async () => {
        await store.connect(owner).setListing(tokenId1, 5, 2, 1);

        await expect(
          store.connect(user1).purchase(tokenId1, 2, { value })
        ).to.be.revertedWith("Purchase: not enough value sent");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    [
      [5, 2, 3, 3, 15],
      [5, 0, 1, 1, 5],
    ].forEach(([price, supplyLimit, addressLimit, amount, value]) => {
      it(`Purchase must have enough stock. price: ${price}: supplyLimit: ${supplyLimit} addressLimit: ${addressLimit} amount: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, price, supplyLimit, addressLimit);

        await expect(
          store.connect(user1).purchase(tokenId1, amount, { value })
        ).to.be.revertedWith("Purchase: not enough stock");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    [
      [5, 2, 2, 2, 10],
      [5, 2, 2, 1, 5],
      [5, 3, 3, 2, 10],
    ].forEach(([price, supplyLimit, addressLimit, amount, value]) => {
      it(`Purchase mints token to requester when valid amount/value sent for requesting id price: ${price}: supplyLimit: ${supplyLimit} addressLimit: ${addressLimit} requestedStock: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, price, supplyLimit, addressLimit);

        const tx = await store
          .connect(user1)
          .purchase(tokenId1, amount, { value });
        await tx.wait();

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(amount);

        const [
          resultPrice,
          resultSupplyLimit,
          resultAddressLimit,
          resultSupply,
        ] = await store.getListing(tokenId1);

        expect([
          resultPrice.toNumber(),
          resultSupplyLimit.toNumber(),
          resultAddressLimit.toNumber(),
          resultSupply.toNumber(),
        ]).to.deep.equal([price, supplyLimit, addressLimit, amount]);
      });
    });
  });

  it("Purchases can continue to be made when stock increases", async () => {
    const price = 5;
    const amount = 2;
    const supplyLimit = 2;
    const addressLimit = 4;
    const increase = 2;

    await store
      .connect(owner)
      .setListing(tokenId1, price, supplyLimit, addressLimit);

    // purchase all available stock
    let tx = await store
      .connect(user1)
      .purchase(tokenId1, amount, { value: price * amount });
    await tx.wait();

    // check supply/balances
    expect(await store.balanceOf(await user1.getAddress(), tokenId1)).to.equal(
      amount
    );
    let [resultPrice, resultSupplyLimit, resultAddressLimit, resultSupply] =
      await store.getListing(tokenId1);
    expect([
      resultPrice.toNumber(),
      resultSupplyLimit.toNumber(),
      resultAddressLimit.toNumber(),
      resultSupply.toNumber(),
    ]).to.deep.equal([price, supplyLimit, addressLimit, amount]);

    // try to purchase more.
    await expect(
      store.connect(user1).purchase(tokenId1, 1, { value: price })
    ).to.be.revertedWith("Purchase: not enough stock");

    // increase stock
    await store
      .connect(owner)
      .setListing(tokenId1, price, supplyLimit + increase, addressLimit);

    // purchase all new stock
    tx = await store
      .connect(user1)
      .purchase(tokenId1, increase, { value: price * increase });
    await tx.wait();

    // check supply/balances
    expect(await store.balanceOf(await user1.getAddress(), tokenId1)).to.equal(
      amount + increase
    );
    [resultPrice, resultSupplyLimit, resultAddressLimit, resultSupply] =
      await store.getListing(tokenId1);
    expect([
      resultPrice.toNumber(),
      resultSupplyLimit.toNumber(),
      resultAddressLimit.toNumber(),
      resultSupply.toNumber(),
    ]).to.deep.equal([
      price,
      supplyLimit + increase,
      addressLimit,
      amount + increase,
    ]);
  });

  describe("Transfer Functionality", () => {
    [
      [5, 4, 3, 4, 20],
      [5, 2, 0, 1, 5],
    ].forEach(([price, supplyLimit, addressLimit, amount, value]) => {
      it(`Address balance must not exceed limit when purchasing. price: ${price}: supplyLimit: ${supplyLimit} addressLimit: ${addressLimit} amount: ${amount} value: ${value}`, async () => {
        await store
          .connect(owner)
          .setListing(tokenId1, price, supplyLimit, addressLimit);

        await expect(
          store.connect(user1).purchase(tokenId1, amount, { value })
        ).to.be.revertedWith("Transfer: invalid new balance");

        expect(
          await store.balanceOf(await user1.getAddress(), tokenId1)
        ).to.equal(0);
      });
    });

    it("Address balance must not exceed limit when transfering", () => {});

    it("Purchases can continue when address limit increases", () => {});

    it("Transfers can continue when address limit increases", () => {});
  });
});

// TODO:
// - total supply check after multiple purchases of multiple tokens by multple users
// - transfer token test
// - transfer balance test
