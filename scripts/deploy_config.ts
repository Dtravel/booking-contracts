import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'

async function main() {
  const configFactory = await ethers.getContractFactory('DtravelConfig')

  // If we had constructor arguments, they would be passed into deploy()
  const configContract = await configFactory.deploy(500, '0x16641b7916606D7b13Eb8A415dEc0B39dA2CEdaD', [
    '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec', // BUSD
    '0x7D08A9f17179670582C6b7983c94b6e2c218a612', // USDC
    '0x0062fC7642E7BD9b4685901258207A6e22E23378', // USDT
    '0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8', // TRVL
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
