import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'

async function main() {
  const dtravelFactory = await ethers.getContractFactory('DtravelFactory')

  const factoryContract = await dtravelFactory.deploy()

  // The address the Contract WILL have once mined
  console.log(factoryContract.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(factoryContract.deployTransaction.hash)

  await factoryContract.deployed()

  await hre.run('verify:verify', {
    address: factoryContract.address,
    constructorArguments: [],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
