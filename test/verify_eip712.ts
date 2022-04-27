import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { Contract, Wallet } from 'ethers'

use(solidity)

// private key to sign data
const privateKey = '0x44d34f80e5de79ba6be6d2431216db30e5842f9a13907bf112496f3569aa48e2'
const types = {
  BookingParameters: [
    { name: 'token', type: 'address' },
    { name: 'bookingId', type: 'string' },
    { name: 'checkInTimestamp', type: 'uint256' },
    { name: 'checkOutTimestamp', type: 'uint256' },
    { name: 'bookingExpirationTimestamp', type: 'uint256' },
    { name: 'bookingAmount', type: 'uint256' },
    { name: 'cancellationPolicies', type: 'CancellationPolicy[]' },
  ],
  CancellationPolicy: [
    { name: 'expiryTime', type: 'uint256' },
    { name: 'refundAmount', type: 'uint256' },
  ],
}

let wallet: Wallet
let signerAddress: string
let dtravelEIP712: Contract
let dtravelEIP712Test: Contract

beforeEach(async function () {
  // initialize wallet
  wallet = new Wallet(privateKey)
  signerAddress = wallet.address

  let DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
  dtravelEIP712 = await DtravelEIP712.deploy()
  await dtravelEIP712.deployed()

  let DtravelEIP712Test = await ethers.getContractFactory('DtravelEIP712Test', {
    libraries: {
      DtravelEIP712: dtravelEIP712.address,
    },
  })
  dtravelEIP712Test = await DtravelEIP712Test.deploy(signerAddress)
  await dtravelEIP712Test.deployed()
})

describe('DtravelEIP712', function () {
  describe('Should verify eip712 signature successfully', function () {
    it('Valid data and signature', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 1,
        verifyingContract: dtravelEIP712Test.address,
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [
          {
            expiryTime: 1650773900,
            refundAmount: BigInt('50000000000000000000'),
          },
        ],
      }
      const generatedSignature = await wallet._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, 1, generatedSignature)

      expect(verifyResult).true
    })
  })
  describe('Should NOT verify eip712 signature successfully', function () {
    it('Wrong chainId', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 1,
        verifyingContract: dtravelEIP712Test.address,
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [
          {
            expiryTime: 1650773900,
            refundAmount: BigInt('50000000000000000000'),
          },
        ],
      }
      const generatedSignature = await wallet._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, 2, generatedSignature)

      expect(verifyResult).false
    })

    it('Wrong address of verifying contract', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 1,
        verifyingContract: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [
          {
            expiryTime: 1650773900,
            refundAmount: BigInt('50000000000000000000'),
          },
        ],
      }
      const generatedSignature = await wallet._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, 1, generatedSignature)

      expect(verifyResult).false
    })

    it('Re-generate signature with different wallet', async function () {
      const newPrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
      let newWalet = new Wallet(newPrivateKey)

      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 1,
        verifyingContract: dtravelEIP712Test.address,
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [
          {
            expiryTime: 1650773900,
            refundAmount: BigInt('50000000000000000000'),
          },
        ],
      }
      const generatedSignature = await newWalet._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, 1, generatedSignature)

      expect(verifyResult).false
    })

    it('Modify data passing into contract', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 1,
        verifyingContract: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [
          {
            expiryTime: 1650773900,
            refundAmount: BigInt('50000000000000000000'),
          },
        ],
      }
      const generatedSignature = await wallet._signTypedData(domain, types, data)

      const manipulatedData = { ...data, bookingAmount: BigInt('1000000000000000000') }

      let verifyResult = await dtravelEIP712Test.verify(manipulatedData, 1, generatedSignature)

      expect(verifyResult).false
    })
  })
})
