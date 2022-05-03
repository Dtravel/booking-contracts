import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { Contract, Wallet } from 'ethers'

import constants from './constants'

const propertyIds = [1, 2, 3, 4]

describe('DtravelFactory', function () {
  let dtravelFactory: Contract
  let wallet: Wallet
  let signerAddress: string

  // wallet = new Wallet(process.env.PRIVATE_KEY)
  // signerAddress = wallet.address
  beforeEach(async function () {
    let DtravelFactory = await ethers.getContractFactory('DtravelFactory')
    dtravelFactory = await DtravelFactory.deploy('0x668eD30aAcC7C7c206aAF1327d733226416233E2')
    await dtravelFactory.deployed()
  })

  it('Should deploy batch properties', async function () {
    await dtravelFactory.deployProperty(propertyIds, constants.HOST_ADDRESS)
  })

  it('Should allow owners to modify the configuration', async function () {
    await dtravelFactory.updateFee(600)
    const fee = await dtravelFactory.fee()
    expect(fee).to.equal(600)
  })
})
