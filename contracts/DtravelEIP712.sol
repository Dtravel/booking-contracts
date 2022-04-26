//SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0 <0.9.0;

import "./DtravelStructs.sol";

struct EIP712Domain {
    string name;
    string version;
    uint256 chainId;
    address verifyingContract;
}

library DtravelEIP712 {
    bytes32 constant EIP712DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant CANCELLATION_POLICY_TYPEHASH =
        keccak256("CancellationPolicy(uint256 expiryTime,uint256 refundAmount)");
    bytes32 constant BOOKING_PARAMETERS_TYPEHASH =
        keccak256(
            "BookingParameters(address signer,address token,bytes bookingId,uint256 checkInTimestamp,uint256 checkOutTimestamp,uint256 bookingExpirationTimestamp,uint256 bookingAmount,CancellationPolicy[] cancellationPolicies)CancellationPolicy(uint256 expiryTime,uint256 refundAmount)"
        );

    function verify(
        BookingParameters memory parameters,
        uint256 chainId,
        address verifyingContract,
        address authorizedSigner,
        bytes memory signature
    ) external pure returns (bool) {
        bytes32 domainSeperator = hashDomain(
            EIP712Domain({
                name: "Dtravel Booking",
                version: "1",
                chainId: chainId,
                verifyingContract: verifyingContract
            })
        );
        return recoverSigner(parameters, domainSeperator, signature) == authorizedSigner;
    }

    function hashDomain(EIP712Domain memory eip712Domain) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712DOMAIN_TYPEHASH,
                    keccak256(bytes(eip712Domain.name)),
                    keccak256(bytes(eip712Domain.version)),
                    eip712Domain.chainId,
                    eip712Domain.verifyingContract
                )
            );
    }

    function hashCancellationPolicy(CancellationPolicy memory cancellationPolicy) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(CANCELLATION_POLICY_TYPEHASH, cancellationPolicy.expiryTime, cancellationPolicy.refundAmount)
            );
    }

    function hashBookingParameters(BookingParameters memory bookingParameters) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BOOKING_PARAMETERS_TYPEHASH,
                    bookingParameters.signer,
                    bookingParameters.token,
                    keccak256(bookingParameters.bookingId),
                    bookingParameters.checkInTimestamp,
                    bookingParameters.checkOutTimestamp,
                    bookingParameters.bookingExpirationTimestamp,
                    bookingParameters.bookingAmount,
                    hashCancellationPolicyArray(bookingParameters.cancellationPolicies)
                )
            );
    }

    function hashCancellationPolicyArray(CancellationPolicy[] memory array) internal pure returns (bytes32) {
        bytes memory concatedHashArray = bytes.concat(hashCancellationPolicy(array[0]));
        for (uint256 i = 1; i < array.length; i++) {
            concatedHashArray = bytes.concat(concatedHashArray, hashCancellationPolicy(array[i]));
        }
        return keccak256(concatedHashArray);
    }

    function digest(BookingParameters memory parameters, bytes32 domainSeparator) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, hashBookingParameters(parameters)));
    }

    function recoverSigner(
        BookingParameters memory parameters,
        bytes32 domainSeparator,
        bytes memory signature
    ) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(digest(parameters, domainSeparator), v, r, s);
    }

    function splitSignature(bytes memory sig)
        internal
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "invalid signature length");
        assembly {
            /*
            First 32 bytes stores the length of the signature
            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature
            mload(p) loads next 32 bytes starting at the memory address p into memory
            */
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }
        return (r, s, v);
    }
}
