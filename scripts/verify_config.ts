import '@nomiclabs/hardhat-ethers'
import hre from 'hardhat'

async function main() {
  await hre.run('verify:verify', {
    address: '?????', // deployed DtravelConfig address
    constructorArguments: [
      0, // fee percentage 5% -> 500, 0.1% -> 10
      0, // payout delay time in seconds
      '?????', // Dtravel treasury address
      [
        '?????', // supported token
      ]
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
})
