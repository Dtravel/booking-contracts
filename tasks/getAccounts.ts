import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

const getAccounts = async (
  taskArgs: TaskArguments,
  hre: HardhatRuntimeEnvironment
) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(account.address);
  }
};

export default getAccounts;
