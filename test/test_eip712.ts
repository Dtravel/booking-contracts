import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

use(solidity)

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

let signer: SignerWithAddress
let signerAddress: string
let dtravelEIP712: Contract
let dtravelEIP712Test: Contract
let chainId: number

beforeEach(async function () {
  let signers = await ethers.getSigners()
  signer = signers[1]
  signerAddress = signer.address

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

  chainId = (await ethers.provider.getNetwork()).chainId
})

describe('DtravelEIP712', function () {
  describe('Should verify eip712 signature successfully', function () {
    it('Valid data and signature with cancellation policy', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
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
      const generatedSignature = await signer._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, generatedSignature)

      expect(verifyResult).true
    })

    it('Valid data and signature without cancellation policy', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
        verifyingContract: dtravelEIP712Test.address,
      }

      const data = {
        token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
        bookingId: '2hB2o789n',
        checkInTimestamp: 1650687132,
        checkOutTimestamp: 1650860051,
        bookingExpirationTimestamp: 1650687132,
        bookingAmount: BigInt('100000000000000000000'),
        cancellationPolicies: [],
      }
      const generatedSignature = await signer._signTypedData(domain, types, data)

      let verifyResult = await dtravelEIP712Test.verify(data, generatedSignature)

      expect(verifyResult).true
    })
  })
  describe('Should NOT verify eip712 signature successfully', function () {
    it('Wrong chainId', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: 2,
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
      const generatedSignature = await signer._signTypedData(domain, types, data)

      await expect(dtravelEIP712Test.verify(data, generatedSignature)).to.be.revertedWith('EIP712: unauthorized signer')
    })

    it('Wrong address of verifying contract', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
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
      const generatedSignature = await signer._signTypedData(domain, types, data)

      await expect(dtravelEIP712Test.verify(data, generatedSignature)).to.be.revertedWith('EIP712: unauthorized signer')
    })

    it('Re-generate signature with different wallet', async function () {
      let signers = await ethers.getSigners()
      let newSigner = signers[2]

      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
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
      const generatedSignature = await newSigner._signTypedData(domain, types, data)

      await expect(dtravelEIP712Test.verify(data, generatedSignature)).to.be.revertedWith('EIP712: unauthorized signer')
    })

    it('Modify data passing into contract', async function () {
      const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
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
      const generatedSignature = await signer._signTypedData(domain, types, data)

      const manipulatedData = { ...data, bookingAmount: BigInt('1000000000000000000') }

      await expect(dtravelEIP712Test.verify(manipulatedData, generatedSignature)).to.be.revertedWith('EIP712: unauthorized signer')
    })
  })
})
