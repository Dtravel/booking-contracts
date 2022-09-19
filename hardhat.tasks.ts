import { task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

import getAccounts from "./tasks/getAccounts";
import mintERC20Test from "./tasks/mintERC20Test";
import getERC20TestBalance from "./tasks/getERC20TestBalance";
import setFeeRatio from "./tasks/setFeeRatio";
import setReferralFeeRatio from "./tasks/setReferralFeeRatio";

task("get-accounts", "Prints the list of accounts").setAction(getAccounts);

task("mint:testnet", "Mint tokens to a specific address on local/testnet")
  .addParam("erc20", "The address of ERC20 test token")
  .addParam("to", "The address to receive tokens")
  .addParam("amount", "Token amount to mint")
  .setAction(mintERC20Test);

task(
  "get-balance:testnet",
  "Get ERC20 balance by a given address on local/testnet"
)
  .addParam("erc20", "The address of ERC20 test token")
  .addParam("holder", "The holder's address")
  .setAction(getERC20TestBalance);

task("update-fee", "Update booking fee")
  .addParam("management", "The address of management contract")
  .addParam("fee", "The fee numerator")
  .setAction(setFeeRatio);

task("update-referral-fee", "Update referral fee")
  .addParam("management", "The address of management contract")
  .addParam("fee", "The referral fee numerator")
  .setAction(setReferralFeeRatio);
