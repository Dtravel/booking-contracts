import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { Contract, Wallet } from 'ethers'

const propertyIds = [1, 2, 3, 4]

describe('DtravelFactory', function () {
  let dtravelFactory: Contract
  let properties: string[]

  beforeEach(async function () {
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    let dtravelConfig = await DtravelConfig.deploy(
      500,
      60 * 60 * 24 * 2,
      '0x8d64B57C74ba7536a99606057E18DdDAF6bfa667',
      [
        '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec', // BUSD
        '0x7D08A9f17179670582C6b7983c94b6e2c218a612', // USDC
        '0x0062fC7642E7BD9b4685901258207A6e22E23378', // USDT
        '0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8', // TRVL
      ],
    )
    await dtravelConfig.deployed()

    const DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
    const dtravelEIP712 = await DtravelEIP712.deploy()
    await dtravelEIP712.deployed()

    let DtravelFactory = await ethers.getContractFactory('DtravelFactory', {
      libraries: {
        DtravelEIP712: dtravelEIP712.address,
      },
    })
    dtravelFactory = await DtravelFactory.deploy(dtravelConfig.address)
    await dtravelFactory.deployed()
  })

  it('Should deploy batch properties and emit an event', async function () {
    const [owner, host] = await ethers.getSigners()

    expect(await dtravelFactory.deployProperty(propertyIds, host.address)).to.emit(dtravelFactory, 'PropertyCreated')
    properties = await dtravelFactory.getProperties()
    console.log({ properties })
    expect(properties.length).to.equal(propertyIds.length)

    // let DtravelProperty = await ethers.getContractFactory('DtravelProperty')

    // for (let i = 0; i < propertyIds.length; i++) {
    //   const propertyAddress = await dtravelFactory.propertyMapping(propertyIds[i])
    //   const property = await DtravelProperty.attach(propertyAddress)
    //   expect(propertyAddress).to.equal(properties[i])
    //   expect(await property.owner()).to.equal(dtravelFactory.address)
    //   expect(await property.host()).to.equal(host.address)
    //   expect(await property.id()).to.equal(propertyIds[i])
    // }
  })
})
