import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'

async function main() {

  const DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
  const dtravelEIP712 = await DtravelEIP712.deploy()
  await dtravelEIP712.deployed()

  const dtravelConfig = '?????' // DtravelConfig address

  const DtravelFactory = await ethers.getContractFactory('DtravelFactory', {
    libraries: {
      DtravelEIP712: dtravelEIP712.address
    }
  })
  const dtravelFactory = await DtravelFactory.deploy(dtravelConfig)

  // The address the Contract WILL have once mined
  console.log(dtravelFactory.address)

  // The transaction that was sent to the network to deploy the Contract
  console.log(dtravelFactory.deployTransaction.hash)

  await dtravelFactory.deployed()

  // await hre.run('verify:verify', {
  //   address: dtravelFactory.address,
  //   constructorArguments: [dtravelConfig],
  // })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
