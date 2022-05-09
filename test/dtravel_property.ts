import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { Contract, ContractFactory, Wallet } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { TOKENS, GUEST_PRIVATE_KEYS, BOOKING_SIGNATURE_TYPE } from './constants'

const propertyIds = [1, 2, 3, 4]

describe('DtravelProperty', function () {
  let dtravelConfig: Contract
  let dtravelFactory: Contract
  let properties: string[]
  let owner: SignerWithAddress
  let host: SignerWithAddress
  let DtravelProperty: ContractFactory

  beforeEach(async function () {
    // Deploy config contract
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(500, 60 * 60 * 24 * 2, '0x8d64B57C74ba7536a99606057E18DdDAF6bfa667', [
      TOKENS.BUSD, // BUSD
      TOKENS.USDC, // USDC
      TOKENS.USDT, // USDT
      TOKENS.TRVL, // TRVL
    ])
    await dtravelConfig.deployed()

    const DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
    const dtravelEIP712 = await DtravelEIP712.deploy()
    await dtravelEIP712.deployed()

    // Deploy factory fonctract
    let DtravelFactory = await ethers.getContractFactory('DtravelFactory', {
      libraries: {
        DtravelEIP712: dtravelEIP712.address,
      },
    })
    dtravelFactory = await DtravelFactory.deploy(dtravelConfig.address)
    await dtravelFactory.deployed()

    // Deploy property contracts
    owner = (await ethers.getSigners())[0]
    host = (await ethers.getSigners())[1]
    await dtravelFactory.deployProperty(propertyIds, host.address)
    properties = await dtravelFactory.getProperties()

    DtravelProperty = await ethers.getContractFactory('DtravelProperty')

    // Mint test tokens to guest
  })

  it('Should return correct configuration variables', async function () {
    for (let i = 0; i < propertyIds.length; i++) {
      const propertyAddress = await dtravelFactory.propertyMapping(propertyIds[i])
      const property = await DtravelProperty.attach(propertyAddress)
      expect(await property.host()).to.equal(host.address)
      expect(await property.owner()).to.equal(dtravelFactory.address)
      expect(propertyAddress).to.equal(properties[i])
    }
  })

  it('Should allow booking if signature is correct', async function () {
    const wallet = new Wallet(GUEST_PRIVATE_KEYS[0])
    const signerAddress = wallet.address

    let DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
    let dtravelEIP712 = await DtravelEIP712.deploy()
    await dtravelEIP712.deployed()

    let DtravelEIP712Test = await ethers.getContractFactory('DtravelEIP712Test', {
      libraries: {
        DtravelEIP712: dtravelEIP712.address,
      },
    })
    let dtravelEIP712Test = await DtravelEIP712Test.deploy(signerAddress)
    await dtravelEIP712Test.deployed()

    const propertyAddress = await dtravelFactory.propertyMapping(propertyIds[0])
    const property = await DtravelProperty.attach(propertyAddress)

    const domain = {
      name: 'Dtravel Booking',
      version: '1',
      chainId: 1,
      verifyingContract: property.address,
    }

    const data = {
      token: TOKENS.BUSD,
      bookingId: '2hB2o789n',
      checkInTimestamp: 1655269737,
      checkOutTimestamp: 1657861737,
      bookingExpirationTimestamp: 1654060137,
      bookingAmount: BigInt('100000000000000000000'),
      cancellationPolicies: [
        {
          expiryTime: 1654664937,
          refundAmount: BigInt('50000000000000000000'),
        },
      ],
    }

    const generatedSignature = await wallet._signTypedData(domain, BOOKING_SIGNATURE_TYPE, data)

    let verifyResult = await dtravelEIP712Test.verify(data, 1, generatedSignature)

    expect(verifyResult).true

    // expect(await property.book(data, generatedSignature))
    //   .to.emit(dtravelFactory, 'Book')
    //   .withArgs([property.address, data.bookingId, new Date().getTime() / 1000])
    // const res = await property.book(data, generatedSignature)
    // console.log({ res })
    // const bookings = property.bookings()
    // console.log({ bookings })
  })
})
