import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'
import PropertyConstants from '../constants/property.json'

async function main() {
  const propertyFactory = await ethers.getContractFactory('DtravelProperty')

  // If we had constructor arguments, they would be passed into deploy()
  for (let i = 0; i < PropertyConstants.length; i++) {
    const propertyContract = await propertyFactory.deploy(...PropertyConstants[i])

    // The address the Contract WILL have once mined
    console.log(propertyContract.address)

    // The transaction that was sent to the network to deploy the Contract
    console.log(propertyContract.deployTransaction.hash)

    // The contract is NOT deployed yet; we must wait until it is mined
    await propertyContract.deployed()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
