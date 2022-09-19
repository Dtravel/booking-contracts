import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

const setFeeRatio = async (
  taskArgs: TaskArguments,
  hre: HardhatRuntimeEnvironment
) => {
  const { management, fee } = taskArgs;
  const managementContract = await hre.ethers.getContractAt(
    "Management",
    management
  );
  const tx = await managementContract.setFeeRatio(fee);
  await tx.wait();
};

export default setFeeRatio;
