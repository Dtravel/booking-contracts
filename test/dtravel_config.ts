import { expect } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { Contract } from 'ethers'

describe('DtravelConfig', function () {
  let dtravelConfig: Contract

  beforeEach(async function () {
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(500, '0x8d64B57C74ba7536a99606057E18DdDAF6bfa667', [
      '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
    ])
    await dtravelConfig.deployed()
  })

  it('Should return correct configuration', async function () {
    const fee = await dtravelConfig.fee()
    expect(fee).to.equal(500)
    const dtravelTreasury = await dtravelConfig.dtravelTreasury()
    expect(dtravelTreasury).to.equal('0x8d64B57C74ba7536a99606057E18DdDAF6bfa667')
  })

  it('Should allow owners to modify the configuration', async function () {
    await dtravelConfig.updateFee(600)
    const fee = await dtravelConfig.fee()
    expect(fee).to.equal(600)
  })
})
