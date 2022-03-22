import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'
import PropertyConstants from '../constants/property.json'

async function main() {
  await hre.run('verify:verify', {
    address: '0x688273c098Fd74C7185E1979816151b9829800e1',
    constructorArguments: PropertyConstants[0],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
