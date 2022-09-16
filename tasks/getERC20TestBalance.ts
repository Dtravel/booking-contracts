import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

const getERC20TestBalance = async (
  taskArgs: TaskArguments,
  hre: HardhatRuntimeEnvironment
) => {
  const { erc20, holder } = taskArgs;
  const erc20Contract = await hre.ethers.getContractAt("ERC20Test", erc20);
  const balance = await erc20Contract.balanceOf(holder);
  console.log(balance);
};

export default getERC20TestBalance;
