import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { Contract, ContractFactory, Wallet } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { TOKENS, GUEST_PRIVATE_KEYS, BOOKING_SIGNATURE_TYPE } from './constants'

const propertyIds = [1, 2, 3, 4]
const initialBalance = ethers.BigNumber.from('1000000000000000000000000000000')

describe('DtravelProperty', function () {
  let dtravelConfig: Contract
  let dtravelFactory: Contract
  let properties: string[]
  let owner: SignerWithAddress
  let host: SignerWithAddress
  let guest: SignerWithAddress
  let DtravelProperty: ContractFactory
  let tokens: string[]

  beforeEach(async function () {
    // Deploy config contract
    owner = (await ethers.getSigners())[0]
    host = (await ethers.getSigners())[1]
    guest = (await ethers.getSigners())[2]

    // Mint test tokens to guest
    tokens = await Promise.all(
      Object.keys(TOKENS).map(async (token) => {
        const TokenFactory = await ethers.getContractFactory('Token')
        const tokenContract = await TokenFactory.connect(guest).deploy(token, token)
        await tokenContract.deployed()
        return tokenContract.address
      }),
    )

    // Deploy config contract
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.connect(owner).deploy(500, 60 * 60 * 24 * 2, owner.address, tokens)
    await dtravelConfig.deployed()
    expect(await dtravelConfig.dtravelBackend()).to.equal(owner.address)

    // Deploy EIP712 contract
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
    await dtravelFactory.deployProperty(propertyIds, host.address)
    properties = await dtravelFactory.getProperties()

    DtravelProperty = await ethers.getContractFactory('DtravelProperty')
  })

  it('Should mint correct amount to guest', async function () {
    for (let i = 0; i < tokens.length; i++) {
      const tokenContract = (await ethers.getContractFactory('Token')).attach(tokens[i])
      expect(ethers.BigNumber.from(await tokenContract.balanceOf(guest.address))).to.equal(initialBalance)
    }
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
    let DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
    let dtravelEIP712 = await DtravelEIP712.deploy()
    await dtravelEIP712.deployed()

    let DtravelEIP712Test = await ethers.getContractFactory('DtravelEIP712Test', {
      libraries: {
        DtravelEIP712: dtravelEIP712.address,
      },
    })
    let dtravelEIP712Test = await DtravelEIP712Test.deploy(owner.address)
    await dtravelEIP712Test.deployed()

    const propertyAddress = await dtravelFactory.propertyMapping(propertyIds[0])
    const property = await DtravelProperty.attach(propertyAddress)
    const chainId = await (await ethers.provider.getNetwork()).chainId
    const domain = {
      name: 'Dtravel Booking',
      version: '1',
      chainId,
      verifyingContract: propertyAddress,
    }

    const data = {
      token: tokens[0],
      bookingId: '2hB2o789n',
      checkInTimestamp: 1655269737,
      checkOutTimestamp: 1657861737,
      bookingExpirationTimestamp: 1654060137,
      bookingAmount: ethers.BigNumber.from('100000000000000000000'),
      cancellationPolicies: [
        {
          expiryTime: 1654664937,
          refundAmount: ethers.BigNumber.from('50000000000000000000'),
        },
      ],
    }

    const generatedSignature = await owner._signTypedData(domain, BOOKING_SIGNATURE_TYPE, data)

    const TokenFactory = await ethers.getContractFactory('Token')
    const tokenContract = await TokenFactory.attach(tokens[0])
    const tx = await tokenContract.connect(guest).approve(propertyAddress, data.bookingAmount)
    await tx.wait()

    // let verifyResult = await dtravelEIP712Test.verify(data, chainId, generatedSignature)
    // console.log(verifyResult)
    // expect(verifyResult).true
    expect(await tokenContract.allowance(guest.address, propertyAddress)).to.equal(data.bookingAmount)

    expect(await property.connect(guest).book(data, generatedSignature)).to.emit(dtravelFactory, 'Book')
    // .withArgs(property.address, data.bookingId, Math.ceil(Date.now() / 1000))

    const bookings = await property.bookingHistory()
    console.log(bookings)
  })
})
