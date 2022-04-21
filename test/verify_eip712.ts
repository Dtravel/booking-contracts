import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { describe, it } from 'mocha'
import { solidity } from 'ethereum-waffle';

use(solidity);

describe("DtravelEIP712", function () {
    it("Should verify eip712 signature successfully", async function () {
        // private key to sign data
        const privateKey = '0xaf15de8539f55121e4410b0c27c0e0e6dd3d8c1645ea719826b43eae08da2caf';

        // initialize wallet
        let wallet = new ethers.Wallet(privateKey);
        let signerAddress = wallet.address;
        console.log("Signer address:", signerAddress);

        let DtravelEIP712 = await ethers.getContractFactory("DtravelEIP712");
        let dtravelEIP712 = await DtravelEIP712.deploy();
        await dtravelEIP712.deployed();

        let DtravelEIP712Test = await ethers.getContractFactory("DtravelEIP712Test", {
            libraries: {
                DtravelEIP712: dtravelEIP712.address
            }
        });
        let dtravelEIP712Test = await DtravelEIP712Test.deploy();
        await dtravelEIP712Test.deployed();

        const domain = {
            name: 'Dtravel Booking',
            version: '1',
            chainId: 1,
            verifyingContract: dtravelEIP712Test.address
        };
        const types = {
            BookingParameters: [
                { name: "signer", type: "address" },
                { name: "token", type: "address" },
                { name: "bookingId", type: "bytes" },
                { name: "checkInTimestamp", type: "uint256" },
                { name: "checkOutTimestamp", type: "uint256" },
                { name: "bookingExpirationTimestamp", type: "uint256" },
                { name: "bookingAmount", type: "uint256" },
                { name: "cancellationPolicies", type: "CancellationPolicy[]" }
            ],
            CancellationPolicy: [
                { name: "expiryTime", type: "uint256" },
                { name: "refundAmount", type: "uint256" }
            ]
        }
        const data = {
            signer: signerAddress,
            token: '0x9CAC127A2F2ea000D0AcBA03A2A52Be38F8ea3ec',
            bookingId: new TextEncoder().encode("2hB2o789n"),
            checkInTimestamp: 123543,
            checkOutTimestamp: 422343,
            bookingExpirationTimestamp: 335432,
            bookingAmount: 100000,
            cancellationPolicies: [
                {
                    expiryTime: 123220,
                    refundAmount: 10000,
                },
                {
                    expiryTime: 432434,
                    refundAmount: 13000,
                }
            ]
        };
        const generatedSignature = await wallet._signTypedData(domain, types, data);

        let verifyResult = await dtravelEIP712Test.verify(data, 1, generatedSignature);

        expect(verifyResult).true;
    });
});