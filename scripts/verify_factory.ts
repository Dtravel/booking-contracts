import "@nomiclabs/hardhat-ethers"
import hre from "hardhat"
import  Configs from './configs.json'

async function main() {
  await hre.run('verify:verify', {
    address: Configs['dtravel-factory-contract'], // DtravelFactory address
    constructorArguments: [
      Configs['dtravel-config-contract']
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
})