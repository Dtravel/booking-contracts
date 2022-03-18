import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'

async function main() {
  const configFactory = await ethers.getContractFactory('DtravelConfig')

  // If we had constructor arguments, they would be passed into deploy()
  const configContract = await configFactory.deploy(500, '0x7c477A59578710eC7bfD2bf29D7a24F53A33979a', [
    '0xc8A0dDCE71193D35a8adbE236EeED3ACd0B2c056',
    '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735',
  ])

  // The address the Contract WILL have once mined
  console.log(configContract.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(configContract.deployTransaction.hash)

  // The contract is NOT deployed yet; we must wait until it is mined
  await configContract.deployed()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
