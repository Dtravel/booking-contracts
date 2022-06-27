import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import  Configs from './configs.json'

async function main() {
  const DtravelConfig = await ethers.getContractFactory('DtravelConfig')

  // If we had constructor arguments, they would be passed into deploy()
  const dtravelConfig = await DtravelConfig.deploy(Configs['configs'])

  // The address the Contract WILL have once mined
  console.log(dtravelConfig.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(dtravelConfig.deployTransaction.hash)

  // The contract is NOT deployed yet; we must wait until it is mined
  await dtravelConfig.deployed()

  // await hre.run('verify:verify', {
  //   address: dtravelConfig.address,
  //   constructorArguments: Configs['configs'],
  // })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
