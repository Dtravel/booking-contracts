import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { BigNumber, Contract, Wallet } from 'ethers'

use(solidity)

let dtravelConfig: Contract
let dtravelFactory: Contract
const hostAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const propertyId = BigNumber.from(1)

beforeEach(async function() {
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(
        500,
        24 * 60 * 60,
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        ['0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec']
    )
    await dtravelConfig.deployed()

    const DtravelEIP712 = await ethers.getContractFactory('DtravelEIP712')
    const dtravelEIP712 = await DtravelEIP712.deploy()
    await dtravelEIP712.deployed()

    let DtravelFactory = await ethers.getContractFactory('DtravelFactory', {
        libraries: {
        DtravelEIP712: dtravelEIP712.address
        }
    })
    dtravelFactory = await DtravelFactory.deploy(dtravelConfig.address)
    await dtravelFactory.deployed()
})

describe('DtravelFactory', function() {
    describe('Verify deploying new property', function() {
        it('should deploy new property successfully', async function() {
            let deployPropertyTx = await dtravelFactory.deployProperty([propertyId], hostAddress)
            let deployPropertyTxResult = await deployPropertyTx.wait()

            await verifyDeployPropertyTransaction(deployPropertyTxResult)
        })

        it('only owner or backend be able to deploy new property', async function() {
            let signers = await ethers.getSigners()
            let newSigner = signers[1]
            let newSignerDtravelFactory = dtravelFactory.connect(newSigner)

            await expect(newSignerDtravelFactory.deployProperty([propertyId], hostAddress)).to.be.revertedWith('Factory: caller is not the owner or backend')

            /// update new Dtravel backend address
            let updateBackendTx = await dtravelConfig.updateDtravelBackend(newSigner.address)
            await updateBackendTx.wait()

            let deployPropertyTx = await newSignerDtravelFactory.deployProperty([propertyId], hostAddress)
            let deployPropertyTxResult = await deployPropertyTx.wait()

            await verifyDeployPropertyTransaction(deployPropertyTxResult)
        })
    })
    describe('Verify emitting event', async function() {
        it('only matching property can emit event', async function() {
            const bookingId = '8NLm0Mtyojl'

            await expect(dtravelFactory.book(bookingId)).to.be.revertedWith('Factory: Property not found')
            
            await expect(dtravelFactory.cancelByGuest(bookingId, 0, 0, 0, 12345678)).to.be.revertedWith('Factory: Property not found')

            await expect(dtravelFactory.cancelByHost(bookingId, 0, 12345678)).to.be.revertedWith('Factory: Property not found')

            await expect(dtravelFactory.payout(bookingId, 0, 0, 12345678, 1)).to.be.revertedWith('Factory: Property not found')
        })
    })
})

async function verifyDeployPropertyTransaction(transaction: any) {
    let events = transaction.events;
    let propertyCreatedEvent: Map<string, any>
    for (let event of events) {
        if (event['event'] === 'PropertyCreated') {
            propertyCreatedEvent = event;
            break;
        }
    }

    /// verify the existence of PropertyCreated event
    expect(propertyCreatedEvent).exist

    /// verify data of PropertyCreated event
    let propertyEventArgs = propertyCreatedEvent['args'];
    expect(propertyEventArgs['host']).equal(hostAddress)
    expect(propertyEventArgs['ids'][0]).equal(propertyId)

    /// verify new deployed property contract
    let propertyAddress = propertyEventArgs['properties'][0]
    let DtravelProperty = await ethers.getContractFactory('DtravelProperty')
    let dtravelProperty = DtravelProperty.attach(propertyAddress)
    expect(await dtravelProperty.id()).equal(propertyId)
}

async function getDeployedPropertyContractFromTransaction(transaction: any): Promise<Contract> {
    let events = transaction.events;
    let propertyCreatedEvent: Map<string, any>
    for (let event of events) {
        if (event['event'] === 'PropertyCreated') {
            propertyCreatedEvent = event;
            break;
        }
    }
    let propertyEventArgs = propertyCreatedEvent['args'];
    let propertyAddress = propertyEventArgs['properties'][0]
    let DtravelProperty = await ethers.getContractFactory('DtravelProperty')
    let dtravelProperty = DtravelProperty.attach(propertyAddress)
    return dtravelProperty
}