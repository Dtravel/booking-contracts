# Dtravel Booking Smart Contracts

This repository contains the core smart contracts for Dtravel Booking Service.

## Prerequisites
Node >= 10.x && yarn > 1.x
```
$ node --version
v16.15.0

$ yarn --version
1.22.18
```

Install dependencies
```
$ yarn
```
## Unit test
1. Compile contract
```
$ yarn compile
```
2. Run tests
```
$ yarn test
```

## Solidity linter and prettiers
1. Run linter to analyze convention and security for smart contracts
```
$ yarn linter:sol
```
2. Format smart contracts
```
$ yarn prettier:sol
```
3. Run eslint for TS scripts
```
$ yarn linter:ts
```
4. Format TS scripts
```
$ yarn prettier:ts
```
* ***Note***: *Updated pre-commit hook*

## Test coverage
1. Run script
```
yarn test:coverage
```

## Testnet deployment
1. Config `.env`
```
ADMIN_PRIVATE_KEY=<admin private key>
OPERATOR_PRIVATE_KEY=<minter private key>
TREASURY_ADDR=<treasury address>
VERIFIER_ADDR=<treasury address>
```
2. Deploy on BSC Testnet
```
$ yarn deploy:testnet
```

***Note***: After the first deployment succeed, please save and keep file `.oppenzeppelin` private since it's important to upgrade contract later.

## Upgrade smart contract
1. Clean cache and precompiled folders to avoid conflict errors
```
$ rm -rf artifacts cache .oppenzeppelin
```
2. Put your folder `.oppenzeppelin` into root directory
3. Update your smart contracts
4. Update `.env`
```
BEACON_UPGRADE_ADDR=<beacon address>
```
5. Run upgrade via `UpgradeableBeacon` contract

```
$ yarn upgrade:testnet:property

$ yarn upgrade:mainnet:property
```