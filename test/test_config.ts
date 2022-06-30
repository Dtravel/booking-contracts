import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { Contract, Wallet } from 'ethers'

use(solidity)

let dtravelConfig: Contract
const zeroAddress = '0x0000000000000000000000000000000000000000'

beforeEach(async function() {
    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(
        500,
        24 * 60 * 60,
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        ['0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec']
    )
    await dtravelConfig.deployed()
})

describe('DtravelConfig', function () {
    describe('Verify initial config', function() {
        it('initialize with valid fee', async function() {
            expect(await dtravelConfig.fee()).equal(500)
        })

        it('initialize with valid payout delay', async function() {
            expect(await dtravelConfig.payoutDelayTime()).equal(24 * 60 * 60)
        })

        it('intialize with valid Dtravel treasury address', async function() {
            expect(await dtravelConfig.dtravelTreasury()).equal('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
        })

        it('initialize with valid supported token', async function() {
            expect(await dtravelConfig.supportedTokens('0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec')).true
        })

        it('intialize with valid Dtravel backend address', async function() {
            let signers = await ethers.getSigners()
            let defaultSignerAddress = signers[0].address
            expect(await dtravelConfig.dtravelBackend()).equal(defaultSignerAddress)
        })
    })
    describe('Verify updating fee', function () {
        it('should update fee with valid value', async function ()  {
            let updateFeeTx = await dtravelConfig.updateFee(600)
            await updateFeeTx.wait()

            expect(await dtravelConfig.fee()).equal(600)
        })

        it('should not update fee with invalid value', async function() {
            await expect(dtravelConfig.updateFee(3000)).to.be.revertedWith('Config: Fee must be between 0 and 2000')
        })

        it('only owner be able to update fee', async function() {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateFee(600)).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })

    describe('Verify updating supported tokens', function() {
        it('should update supported token with valid value', async function() {
            const tokenAddress = '0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8'
            let updateTokenTx = await dtravelConfig.addSupportedToken(tokenAddress)
            await updateTokenTx.wait()

            expect(await dtravelConfig.supportedTokens(tokenAddress)).true
        })

        it('should not update token with zero address', async function() {
            await expect(dtravelConfig.addSupportedToken(zeroAddress)).to.be.revertedWith('Config: token is zero address')
        })

        it('remove a supported token', async function() {
            const tokenAddress = '0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8'
            let updateTokenTx = await dtravelConfig.addSupportedToken(tokenAddress)
            await updateTokenTx.wait()

            expect(await dtravelConfig.supportedTokens(tokenAddress)).true

            let removeTokenTx = await dtravelConfig.removeSupportedToken(tokenAddress)
            await removeTokenTx.wait()

            expect(await dtravelConfig.supportedTokens(tokenAddress)).false
        })

        it('only owner be able to update supported token', async function () {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.addSupportedToken('0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8')).to.be.revertedWith('Ownable: caller is not the owner')

            await expect(newSignerDtravelConfig.removeSupportedToken('0x8Daeff86528910afaB7fBF5b6287360d33aAFDC8')).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })

    describe('Verify updating Dtravel treasury address', function() {
        it('should update Dtravel treasury address with valid value', async function() {
            const newTreasurAddress = '0x8Ad046a7a8f5F1843dB504b739eFC70B819b25E8'
            let updateTreasuryTx = await dtravelConfig.updateTreasury(newTreasurAddress)
            await updateTreasuryTx.wait()

            expect(await dtravelConfig.dtravelTreasury()).equal(newTreasurAddress)
        })

        it('should not update Dtravel treasury address with zero address', async function() {
            await expect(dtravelConfig.updateTreasury(zeroAddress)).to.be.revertedWith('Config: treasury is zero address')
        })

        it('only owner be able to update Dtravel treasury address', async function() {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateTreasury('0x8Ad046a7a8f5F1843dB504b739eFC70B819b25E8')).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })

    describe('Verify update Dtravel backend address', function() {
        it('should update Dtravel backend address with valid value', async function() {
            const newBackendAddress = '0x8Ad046a7a8f5F1843dB504b739eFC70B819b25E8'
            let updateBackendTx = await dtravelConfig.updateDtravelBackend(newBackendAddress)
            await updateBackendTx.wait()

            expect(await dtravelConfig.dtravelBackend()).equal(newBackendAddress)
        })

        it('should not update Dtravel backend address with zero address', async function() {
            await expect(dtravelConfig.updateDtravelBackend(zeroAddress)).to.be.revertedWith('Config: backend is zero address')
        })

        it('only owner be able to update Dtravel backend address', async function() {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateDtravelBackend('0x8Ad046a7a8f5F1843dB504b739eFC70B819b25E8')).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })
})

async function connectContractToNewSigner(contract: Contract): Promise<Contract> {
    let signers = await ethers.getSigners()
    let newSigner = signers[1]
    let newSignerContract = contract.connect(newSigner)
    return newSignerContract
}