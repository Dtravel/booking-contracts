import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import hre from 'hardhat'

async function main() {
  await hre.run('verify:verify', {
    address: '0xfe1acF1898FFD3EC6ceb9C7BBA2ADf696C14Bd9c',
    constructorArguments: [
      500,
      '0x7c477A59578710eC7bfD2bf29D7a24F53A33979a',
      ['0xc8A0dDCE71193D35a8adbE236EeED3ACd0B2c056', '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735'],
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
