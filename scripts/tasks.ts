import { task } from "hardhat/config";
import * as dotenv from "dotenv";
import { LedgerSigner } from "@anders-t/ethers-ledger";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract, ContractFactory } from "ethers";

dotenv.config();

task("deploy").setAction(async function (_, hre) {
  let contractFactory = await hre.ethers.getContractFactory("EtherAlleyStore");

  contractFactory = await connectSigner(hre, contractFactory);

  const gasPrice = await contractFactory.signer.getGasPrice();

  const contract = await contractFactory.deploy(
    getEnvVariable("TOKEN_URI"),
    getEnvVariable("CONTRACT_URI"),
    {
      gasLimit: "10000000",
      gasPrice,
    }
  );

  await contract.deployed();

  console.log(`Contract deployed to address: ${contract.address}`);
});

task("geturi").setAction(async function (taskArgs, hre) {
  const contract = await hre.ethers.getContractAt(
    "EtherAlleyStore",
    getEnvVariable("CONTRACT_ADDRESS")
  );

  await connectSigner(hre, contract);

  const uri = await contract.uri(BigInt("0"));

  console.log(`the current uri is: ${uri}`);
});

task("setlisting").setAction(async function (taskArgs, hre) {
  let contract = await hre.ethers.getContractAt(
    "EtherAlleyStore",
    getEnvVariable("CONTRACT_ADDRESS")
  );

  contract = await connectSigner(hre, contract);

  const gasPrice = await contract.signer.getGasPrice();

  await contract.setListing(
    BigInt("2"),
    true,
    false,
    BigInt("0"),
    BigInt("10000"),
    BigInt("1"),
    {
      gasLimit: "500000",
      gasPrice,
    }
  );

  console.log("listing set");
});

async function connectSigner<T extends Contract | ContractFactory>(
  hre: HardhatRuntimeEnvironment,
  contract: T
): Promise<T> {
  const ledger = new LedgerSigner(
    hre.ethers.provider,
    getEnvVariable("HID_PATH")
  );

  const connectedContract = contract.connect(ledger);

  const address = await connectedContract.signer.getAddress();
  const balance = await connectedContract.signer.getBalance();
  const chainId = await connectedContract.signer.getChainId();

  console.log(`Connected with address: ${address}`);
  console.log(`Connected with balance: ${balance}`);
  console.log(`Connected on chain: ${chainId}`);

  return connectedContract as any;
}

// Helper method for fetching environment variables from .env
function getEnvVariable(key: string, defaultValue: string = ""): string {
  const val = process.env[key];
  if (val) {
    return val;
  }
  if (!defaultValue) {
    throw new Error(`${key} is not defined and no default value was provided`);
  }
  return defaultValue;
}
