import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'
import  Configs from './configs.json'

async function main() {
  await hre.run('verify:verify', {
    address: Configs['dtravel-config-contract'], // deployed DtravelConfig address
    constructorArguments: Configs['configs'],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
})
