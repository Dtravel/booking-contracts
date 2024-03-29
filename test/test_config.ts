import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { Contract, Wallet } from 'ethers'

use(solidity)

let dtravelConfig: Contract
let treasuryAddress: string
const zeroAddress = '0x0000000000000000000000000000000000000000'
const tokenAddress = '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec'

beforeEach(async function() {
    let signers = await ethers.getSigners()
    treasuryAddress = signers[1].address

    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(
        500,
        24 * 60 * 60,
        treasuryAddress,
        [tokenAddress]
    )
    await dtravelConfig.deployed()
})

describe('DtravelConfig', function () {
    describe('Verify initial config', function() {
        it('initialize with valid fee', async function() {
            expect(await dtravelConfig.fee()).to.equal(500)
        })

        it('initialize with valid payout delay', async function() {
            expect(await dtravelConfig.payoutDelayTime()).to.equal(24 * 60 * 60)
        })

        it('intialize with valid Dtravel treasury address', async function() {
            expect(await dtravelConfig.dtravelTreasury()).to.equal(treasuryAddress)
        })

        it('initialize with valid supported token', async function() {
            expect(await dtravelConfig.supportedTokens(tokenAddress)).true
        })

        it('intialize with valid Dtravel backend address', async function() {
            let signers = await ethers.getSigners()
            let defaultSignerAddress = signers[0].address
            expect(await dtravelConfig.dtravelBackend()).to.equal(defaultSignerAddress)
        })
    })
    
    describe('Verify updating fee', function () {
        it('should update fee with valid value', async function ()  {
            let updateFeeTx = await dtravelConfig.updateFee(600)
            await updateFeeTx.wait()

            expect(await dtravelConfig.fee()).to.equal(600)
        })

        it('should not update fee with invalid value', async function() {
            await expect(dtravelConfig.updateFee(3000)).to.be.revertedWith('Config: Fee must be between 0 and 2000')
        })

        it('only owner be able to update fee', async function() {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateFee(600)).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })

    describe('Verify update deplay duration of payout', function() {
        it('should update deplay duration sucessfully', async function() {
            let updateDelayDurationTx = await dtravelConfig.updatePayoutDelayTime(2 * 24 * 60 * 60)
            await updateDelayDurationTx.wait()

            expect(await dtravelConfig.payoutDelayTime()).to.equal(2 * 24 * 60 * 60)
        })

        it('only owner be able to update deply duration', async function() {
            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updatePayoutDelayTime(24 * 60 * 60)).to.be.revertedWith('Ownable: caller is not the owner')
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
            let signers = await ethers.getSigners()
            const newTreasurAddress = signers[2].address

            let updateTreasuryTx = await dtravelConfig.updateTreasury(newTreasurAddress)
            await updateTreasuryTx.wait()

            expect(await dtravelConfig.dtravelTreasury()).to.equal(newTreasurAddress)
        })

        it('should not update Dtravel treasury address with zero address', async function() {
            await expect(dtravelConfig.updateTreasury(zeroAddress)).to.be.revertedWith('Config: treasury is zero address')
        })

        it('only owner be able to update Dtravel treasury address', async function() {
            let signers = await ethers.getSigners()
            const newTreasurAddress = signers[2].address

            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateTreasury(newTreasurAddress)).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })

    describe('Verify update Dtravel backend address', function() {
        it('should update Dtravel backend address with valid value', async function() {
            let signers = await ethers.getSigners()
            const newBackendAddress = signers[2].address

            let updateBackendTx = await dtravelConfig.updateDtravelBackend(newBackendAddress)
            await updateBackendTx.wait()

            expect(await dtravelConfig.dtravelBackend()).to.equal(newBackendAddress)
        })

        it('should not update Dtravel backend address with zero address', async function() {
            await expect(dtravelConfig.updateDtravelBackend(zeroAddress)).to.be.revertedWith('Config: backend is zero address')
        })

        it('only owner be able to update Dtravel backend address', async function() {
            let signers = await ethers.getSigners()
            const newBackendAddress = signers[2].address

            let newSignerDtravelConfig = await connectContractToNewSigner(dtravelConfig)

            await expect(newSignerDtravelConfig.updateDtravelBackend(newBackendAddress)).to.be.revertedWith('Ownable: caller is not the owner')
        })
    })
})

async function connectContractToNewSigner(contract: Contract): Promise<Contract> {
    let signers = await ethers.getSigners()
    let newSigner = signers[1]
    let newSignerContract = contract.connect(newSigner)
    return newSignerContract
}