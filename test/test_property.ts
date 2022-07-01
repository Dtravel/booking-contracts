import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle'
import { BigNumber, Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

use(solidity)

let dtravelProperty: Contract
let dtravelConfig: Contract
let dtravelFactory: Contract
let dtravelTokenTest: Contract
let chainId: number
let treasuryAddress: string
let hostAddress: string
const propertyId = BigNumber.from(1)

beforeEach(async function () {

    let signers = await ethers.getSigners()
    treasuryAddress = signers[1].address
    hostAddress = signers[2].address

    let DtravelTokenTest = await ethers.getContractFactory('DtravelTokenTest')
    dtravelTokenTest = await DtravelTokenTest.deploy(BigInt('1000000000000000000000000'))
    await dtravelTokenTest.deployed()

    let DtravelConfig = await ethers.getContractFactory('DtravelConfig')
    dtravelConfig = await DtravelConfig.deploy(
        500,
        24 * 60 * 60, // 1 day
        treasuryAddress,
        [dtravelTokenTest.address]
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

    let deployPropertyTx = await dtravelFactory.deployProperty([propertyId], hostAddress)
    let deployPropertyTxResult = await deployPropertyTx.wait()

    dtravelProperty = await getDeployedPropertyContractFromTransaction(deployPropertyTxResult)

    chainId = (await ethers.provider.getNetwork()).chainId
})

describe('DtravelProperty', function () {
    describe('Verify book function', function () {
        it('Should book successfully with valid data', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            let bookingData = await dtravelProperty.getBooking(bookingId)
            /// verify booking data on contract
            expect(bookingData).to.be.not.undefined
            expect(bookingData).to.be.not.null
            expect(bookingData.id).to.equal(bookingId)
            expect(bookingData.balance).to.equal(bookingAmount)
            expect(bookingData.token).to.equal(dtravelTokenTest.address)
            expect(bookingData.guest).to.equal(guestSigner.address)

            /// verify balance
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(bookingAmount)
        })
        it('should revert because of invalid signature', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[3]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            /// faucet to guest account
            let faucetTx = await dtravelTokenTest.faucet(guestSigner.address, bookingAmount)
            await faucetTx.wait()

            /// use guest account to approve spending bookingAmount
            let approveTx = await (dtravelTokenTest.connect(guestSigner)).approve(dtravelProperty.address, bookingAmount)
            await approveTx.wait()

            await expect(dtravelProperty.connect(guestSigner).book(param, signature)).to.be.revertedWith('EIP712: unauthorized signer')
        })
        it('should revert because token allowance is too low', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            /// faucet to guest account
            let faucetTx = await dtravelTokenTest.faucet(guestSigner.address, bookingAmount)
            await faucetTx.wait()

            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)

            /// use guest account to approve spending bookingAmount / 2
            let approveTx = await (dtravelTokenTest.connect(guestSigner)).approve(dtravelProperty.address, bookingAmount.div(2))
            await approveTx.wait()

            await expect(dtravelProperty.connect(guestSigner).book(param, signature)).to.be.revertedWith('Property: Token allowance too low')
        })
        it('should revert because booking data is expired', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            /// faucet to guest account
            let faucetTx = await dtravelTokenTest.faucet(guestSigner.address, bookingAmount)
            await faucetTx.wait()

            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)

            /// use guest account to approve spending bookingAmount
            let approveTx = await (dtravelTokenTest.connect(guestSigner)).approve(dtravelProperty.address, bookingAmount)
            await approveTx.wait()

            const oneDayDuration = 24 * 60 * 60 // second
            await increaseBlockTimestamp(2 * oneDayDuration)

            await expect(dtravelProperty.connect(guestSigner).book(param, signature)).to.be.revertedWith('Property: Booking data is expired')

            await resetBlockTimestamp()
        })
        it('should revert because token is not whitelisted', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner, '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec')
            let guestSigner = signers[3]

            /// faucet to guest account
            let faucetTx = await dtravelTokenTest.faucet(guestSigner.address, bookingAmount)
            await faucetTx.wait()

            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)

            /// use guest account to approve spending bookingAmount
            let approveTx = await (dtravelTokenTest.connect(guestSigner)).approve(dtravelProperty.address, bookingAmount)
            await approveTx.wait()

            await expect(dtravelProperty.connect(guestSigner).book(param, signature)).to.be.revertedWith('Property: Token is not whitelisted')
        })
    })
    describe('Verify cancel function', function () {
        it('should cancel successfully with full refund before free cancellation milestone', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// before cancel
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)

            /// call cancel
            let cancelTx = await (dtravelProperty.connect(guestSigner)).cancel(bookingId)
            await cancelTx.wait()

            /// after cancel, should be refunded all of bookingAmount
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify booking data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(3)
        })
        it('should cancel successfully with parital refund after first cancellation milestone', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// before cancel
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)

            const oneDayDuration = 24 * 60 * 60 // second
            await increaseBlockTimestamp(1.5 * oneDayDuration)

            /// call cancel
            let cancelTx = await (dtravelProperty.connect(guestSigner)).cancel(bookingId)
            await cancelTx.wait()

            /// after cancel
            let guestAmount = bookingAmount.div(2)
            let treasuryAmount = (bookingAmount.sub(guestAmount)).mul(500).div(10000)
            let hostAmount = bookingAmount.sub(guestAmount).sub(treasuryAmount)
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(guestAmount)
            expect(await dtravelTokenTest.balanceOf(treasuryAddress)).to.equal(treasuryAmount)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(hostAmount)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify booking data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(3)

            await resetBlockTimestamp()
        })
        it('should cancel successfully without refund after last cancellation milestone', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// before cancel
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)

            const oneDayDuration = 24 * 60 * 60 // second
            await increaseBlockTimestamp(2 * oneDayDuration)

            /// call cancel
            let cancelTx = await (dtravelProperty.connect(guestSigner)).cancel(bookingId)
            await cancelTx.wait()

            /// after cancel
            let guestAmount = BigNumber.from(0)
            let treasuryAmount = (bookingAmount.sub(guestAmount)).mul(500).div(10000)
            let hostAmount = bookingAmount.sub(guestAmount).sub(treasuryAmount)
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(treasuryAddress)).to.equal(treasuryAmount)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(hostAmount)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify booking data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(3)

            await resetBlockTimestamp()
        })
        it('should revert because only guest be able to call cancel', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// user new guest account to call cancel
            let newGuestSigner = signers[4]
            await expect(dtravelProperty.connect(newGuestSigner).cancel(bookingId)).to.be.revertedWith('Property: Only the guest can cancel the booking')
        })
        it('should revert because the booking is already cancelled', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// before cancel
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)

            /// call cancel
            let cancelTx = await (dtravelProperty.connect(guestSigner)).cancel(bookingId)
            await cancelTx.wait()

            /// call cancel again
            await expect(dtravelProperty.connect(guestSigner).cancel(bookingId)).to.be.revertedWith('Property: Booking is already cancelled or paid out')
        })
        it('should revert because the booking is not found', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// before cancel
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)

            /// call cancel
            await expect(dtravelProperty.connect(guestSigner).cancel('mY8tjKm02T')).to.be.revertedWith('Property: Booking does not exist')
        })
    })
    describe('Verify payout function', function () {
        it('should payout successfully with valid call', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            const oneDayDuration = 24 * 60 * 60 // second
            await increaseBlockTimestamp(2 * oneDayDuration)

            /// call partial payout
            let payoutTx = await dtravelProperty.payout(bookingId)
            await payoutTx.wait()

            /// verify balances
            let toBePaid = bookingAmount.div(2)
            let treasuryAmount = toBePaid.mul(500).div(10000)
            let hostAmount = toBePaid.sub(treasuryAmount)
            let remainBookingBalance = bookingAmount.sub(toBePaid)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(hostAmount)
            expect(await dtravelTokenTest.balanceOf(treasuryAddress)).to.equal(treasuryAmount)
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(remainBookingBalance)

            /// verify booking data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(remainBookingBalance)
            expect(bookingData.status).to.equal(1)

            await increaseBlockTimestamp(oneDayDuration)

            /// call full payout
            payoutTx = await dtravelProperty.payout(bookingId)
            payoutTx.wait()

            toBePaid = remainBookingBalance
            let newTreasuryAmount = toBePaid.mul(500).div(10000)
            let newHostAmount = toBePaid.sub(newTreasuryAmount)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(newHostAmount.add(hostAmount))
            expect(await dtravelTokenTest.balanceOf(treasuryAddress)).to.equal(newTreasuryAmount.add(treasuryAmount))
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify booking data
            bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(2)

            /// cannot call payout if the booking is fulfill
            await expect(dtravelProperty.payout(bookingId)).to.be.revertedWith('Property: Booking is already cancelled or fully paid out')

            await resetBlockTimestamp()
        })
        it('should revert because of calling before payout milestone', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            await expect(dtravelProperty.payout(bookingId)).to.be.revertedWith('Property: Invalid payout call')
        })
        it('should revert because of calling with wrong bookingId', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            await expect(dtravelProperty.payout('mY8tjKm02T')).to.be.revertedWith('Property: Booking does not exist')
        })
    })
    describe('Verify cancelByHost function', function () {
        it('should cancel by host successfully with valid call', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]
            let hostSigner = signers[2]

            await createBooking(guestSigner, bookingAmount, param, signature)

            let cancelByHostTx = await dtravelProperty.connect(hostSigner).cancelByHost(bookingId)
            await cancelByHostTx.wait()

            /// verify balances
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(4)
        })
        it("should cancel by host's delegator successfully with valid call", async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]
            let hostSigner = signers[2]
            let delegatorSigner = signers[4]

            await createBooking(guestSigner, bookingAmount, param, signature)

            /// approve delegator
            let approveDelegatorTx = await dtravelProperty.connect(hostSigner).approve(delegatorSigner.address)
            await approveDelegatorTx.wait()

            let cancelByHostTx = await dtravelProperty.connect(delegatorSigner).cancelByHost(bookingId)
            await cancelByHostTx.wait()

            /// verify balances
            expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)
            expect(await dtravelTokenTest.balanceOf(hostAddress)).to.equal(0)
            expect(await dtravelTokenTest.balanceOf(dtravelProperty.address)).to.equal(0)

            /// verify data
            let bookingData = await dtravelProperty.getBooking(bookingId)
            expect(bookingData.balance).to.equal(0)
            expect(bookingData.status).to.equal(4)
        })
        it('should revert because only host be able to call this function', async function () {
            const bookingId = '2hB2o789n'
            const bookingAmount = BigNumber.from('100000000000000000000')
            const signers = await ethers.getSigners()
            const backendSigner = signers[0]
            let { param, signature } = await generateBookingParam(bookingId, bookingAmount, backendSigner)
            let guestSigner = signers[3]

            await createBooking(guestSigner, bookingAmount, param, signature)

            await expect(dtravelProperty.connect(guestSigner).cancelByHost(bookingId)).to.be.revertedWith("Property: Only the host or a host's delegate is authorized to call this action")
        })
    })
})

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

async function generateBookingParam(bookingId: string, bookingAmount: BigNumber, signer: SignerWithAddress, token?: string): Promise<any> {
    const oneDayDuration = 24 * 60 * 60 * 1000 // millisecond

    let now = new Date()
    now.setUTCHours(0, 0, 0, 0)

    let freeCancellationDate = new Date()
    freeCancellationDate.setTime(now.getTime() + oneDayDuration) // free cancallation milestone
    let freeCancellationTimestamp = Math.round(freeCancellationDate.getTime() / 1000)

    let checkInDate = new Date()
    checkInDate.setTime(now.getTime() + 2 * oneDayDuration)
    let checkInTimestamp = Math.round(checkInDate.getTime() / 1000)

    let checkOutDate = new Date()
    checkOutDate.setDate(checkInDate.getDate() + 1)
    let checkOutTimestamp = Math.round(checkOutDate.getTime() / 1000)

    const domain = {
        name: 'Dtravel Booking',
        version: '1',
        chainId: chainId,
        verifyingContract: dtravelProperty.address,
    }

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

    const data = {
        token: token ?? dtravelTokenTest.address,
        bookingId: bookingId,
        checkInTimestamp: checkInTimestamp,
        checkOutTimestamp: checkOutTimestamp,
        bookingExpirationTimestamp: checkInTimestamp,
        bookingAmount: bookingAmount,
        cancellationPolicies: [
            {
                expiryTime: freeCancellationTimestamp,
                refundAmount: bookingAmount,
            },
            {
                expiryTime: checkInTimestamp,
                refundAmount: bookingAmount.div(2),
            },
        ],
    }

    let signature = await signer._signTypedData(domain, types, data)

    return { param: data, signature: signature }
}

async function createBooking(guestSigner: SignerWithAddress, bookingAmount: BigNumber, param: any, signature: string) {
    /// faucet to guest account
    let faucetTx = await dtravelTokenTest.faucet(guestSigner.address, bookingAmount)
    await faucetTx.wait()

    expect(await dtravelTokenTest.balanceOf(guestSigner.address)).to.equal(bookingAmount)

    /// use guest account to approve spending bookingAmount
    let approveTx = await (dtravelTokenTest.connect(guestSigner)).approve(dtravelProperty.address, bookingAmount)
    await approveTx.wait()

    /// use guest account to call booking
    let bookingTx = await (dtravelProperty.connect(guestSigner)).book(param, signature)
    await bookingTx.wait()
}

async function increaseBlockTimestamp(duration: number) {
    await ethers.provider.send('evm_increaseTime', [duration])
    await ethers.provider.send("evm_mine", [])
}

async function resetBlockTimestamp() {
    const blockNumber = ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    const currentTimestamp = Math.floor(new Date().getTime() / 1000);
    const secondsDiff = currentTimestamp - block.timestamp;
    await ethers.provider.send('evm_increaseTime', [secondsDiff]);
    await ethers.provider.send('evm_mine', []);
}