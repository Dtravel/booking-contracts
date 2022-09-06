// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IManagement.sol";

error ZeroAddress();
error InvalidFee();
error InvalidReferrerFee();
error PaymentNotFound();
error PaymentExisted();

contract Management is IManagement, Ownable {
    uint256 public constant FEE_DENOMINATOR = 10**4;

    // fee = feeNumerator / FEE_DENOMINATOR. Supposed the fee is 25% then feeNumerator is set to 2500
    uint256 public override feeNumerator;

    // referrer = referrerFeeNumerator / FEE_DENOMINATOR.
    uint256 public override referrerFeeNumerator;

    // the period of time a business between booking and paying it
    uint256 public override payoutDelay;

    // the address that have an authority to deploy Property contracts
    address public override operator;

    // the treasury address that receives fee and payments
    address public override treasury;

    // the verifier address to verify signatures
    address public override verifier;

    // list of supported payment ERC20 tokens
    mapping(address => bool) public override paymentToken;

    constructor(
        uint256 _feeNumerator,
        uint256 _paymentDelay,
        address _operator,
        address _treasury,
        address _verifier,
        address[] memory _tokens
    ) {
        feeNumerator = _feeNumerator;
        payoutDelay = _paymentDelay;
        operator = _operator;
        treasury = _treasury;
        verifier = _verifier;

        for (uint256 i = 0; i < _tokens.length; i++) {
            paymentToken[_tokens[i]] = true;
        }
    }

    /**
       @notice Get admin address or contract owner
       @dev    Caller can be ANYONE
     */
    function admin() external view override returns (address) {
        return owner();
    }

    /**
        @notice Set fee ratio
        @dev Caller must be ADMIN
        @param _feeNumerator the fee numerator
    */
    function setFeeRatio(uint256 _feeNumerator) external override onlyOwner {
        if (_feeNumerator > FEE_DENOMINATOR) revert InvalidFee();

        feeNumerator = _feeNumerator;

        emit NewFeeNumerator(_feeNumerator);
    }

    /**
        @notice Set referrer fee ratio
        @dev Caller must be ADMIN and the referrer fee must not be greater than the overall fee
        @param _feeNumerator the fee numerator
     */
    function setReferrerFeeRatio(uint256 _feeNumerator) external override onlyOwner {
        if (_feeNumerator > FEE_DENOMINATOR || _feeNumerator > feeNumerator) revert InvalidReferrerFee();

        referrerFeeNumerator = _feeNumerator;

        emit NewReferrerFeeNumerator(_feeNumerator);
    }

    /**
        @notice Set payment delay period
        @dev Caller must be ADMIN
        @param _period the payment delay period
    */
    function setPayoutDelay(uint256 _period) external override onlyOwner {
        payoutDelay = _period;

        emit NewPayoutDelay(_period);
    }

    /**
       @notice Set manager address
       @dev    Caller must be ADMIN
       @param _newOperator Address of new manager
     */
    function setOperator(address _newOperator) external override onlyOwner {
        if (_newOperator == address(0)) revert ZeroAddress();

        operator = _newOperator;

        emit NewOperator(_newOperator);
    }

    /**
       @notice Set treasury address
       @dev    Caller must be ADMIN
       @param _newTreasury Address of new treasury
     */
    function setTreasury(address _newTreasury) external override onlyOwner {
        if (_newTreasury == address(0)) revert ZeroAddress();

        treasury = _newTreasury;

        emit NewTreasury(_newTreasury);
    }

    /**
       @notice Set verifier address
       @dev    Caller must be ADMIN
       @param _newVerifier Address of new verifier
     */
    function setVerifier(address _newVerifier) external override onlyOwner {
        if (_newVerifier == address(0)) revert ZeroAddress();

        verifier = _newVerifier;

        emit NewVerifier(_newVerifier);
    }

    /**
       @notice add a new token/native coin to list of payment tokens
       @dev    Caller must be ADMIN
       @param _token new token address
     */
    function addPayment(address _token) external override onlyOwner {
        if (_token == address(0)) revert ZeroAddress();
        if (paymentToken[_token]) revert PaymentExisted();

        paymentToken[_token] = true;

        emit PaymentTokensAdd(_token);
    }

    /**
       @notice Remove a token/native coin from list of payment tokens
       @dev    Caller must be ADMIN
       @param _token token address to remove
     */
    function removePayment(address _token) external override onlyOwner {
        if (_token == address(0)) revert ZeroAddress();
        if (!paymentToken[_token]) revert PaymentNotFound();

        paymentToken[_token] = false;

        emit PaymentTokensRemove(_token);
    }
}
