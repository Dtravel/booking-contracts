import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

const setReferralFeeRatio = async (
  taskArgs: TaskArguments,
  hre: HardhatRuntimeEnvironment
) => {
  const { management, fee } = taskArgs;
  const managementContract = await hre.ethers.getContractAt(
    "Management",
    management
  );
  const tx = await managementContract.setReferralFeeRatio(fee);
  await tx.wait();
};

export default setReferralFeeRatio;
