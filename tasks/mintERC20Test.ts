import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

const mintERC20Test = async (
  taskArgs: TaskArguments,
  hre: HardhatRuntimeEnvironment
) => {
  const { erc20, to, amount } = taskArgs;
  const erc20Contract = await hre.ethers.getContractAt("ERC20Test", erc20);
  let balance = await erc20Contract.balanceOf(to);
  console.log("- Before balance  : ", balance);

  await erc20Contract.mint(to, amount);
  console.log(`---> Minted ${amount} to ${to}`);

  balance = await erc20Contract.balanceOf(to);
  console.log("- Current balance : ", balance);
};

export default mintERC20Test;
