import { ethers } from "ethers";
import { task } from "hardhat/config";
import * as dotenv from "dotenv";
// eslint-disable-next-line node/no-extraneous-import
import { AlchemyProvider } from "@ethersproject/providers";

dotenv.config();

task("account", "Prints out account info").setAction(async function (
  taskArguments,
  hre
) {
  const account = getAccount();
  console.log(
    `Account balance for ${account.address}: ${await account.getBalance()}`
  );
});

task("deploy", "Deploys the EtherAlleyStore.sol contract").setAction(
  async function (taskArguments, hre) {
    const factory = await hre.ethers.getContractFactory(
      "EtherAlleyStore",
      getAccount()
    );
    const store = await factory.deploy(getEnvVariable("TOKEN_URI"));
    console.log(`Contract deployed to address: ${store.address}`);
  }
);

// Helper method for fetching a wallet account using an environment variable for the PK
export function getAccount() {
  return new ethers.Wallet(
    getEnvVariable("PRIVATE_KEY"),
    new AlchemyProvider(
      getEnvVariable("NETWORK"),
      getEnvVariable("ALCHEMY_KEY")
    )
  );
}

// Helper method for fetching environment variables from .env
export function getEnvVariable(key: string, defaultValue: string = ""): string {
  const val = process.env[key];
  if (val) {
    return val;
  }
  if (!defaultValue) {
    throw new Error(`${key} is not defined and no default value was provided`);
  }
  return defaultValue;
}
