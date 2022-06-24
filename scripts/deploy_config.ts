import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'

async function main() {
  const DtravelConfig = await ethers.getContractFactory('DtravelConfig')

  const configArgs = [
    0, // fee percentage 5% -> 500, 0.1% -> 10
    0, // payout delay time in seconds
    '?????', // Dtravel treasury address
    [
      '?????', // supported token
    ]
  ]

  // If we had constructor arguments, they would be passed into deploy()
  const dtravelConfig = await DtravelConfig.deploy(configArgs)

  // The address the Contract WILL have once mined
  console.log(dtravelConfig.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(dtravelConfig.deployTransaction.hash)

  // The contract is NOT deployed yet; we must wait until it is mined
  await dtravelConfig.deployed()

  // await hre.run('verify:verify', {
  //   address: dtravelConfig.address,
  //   constructorArguments: configArgs,
  // })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
