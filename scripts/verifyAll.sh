#!/bin/bash
export ETHERSCAN_API_KEY="ZGTU23ACUKNDPTSCHBERX7RRTZHXM6FK18"
export POLYGONSCAN_API_KEY="721PJFHVKFJQSV6VIAFWN8SGHJ66WM84HV"

echo "Verifying CREATE3Factory on Sepolia..."
npx hardhat verify --network sepolia 0xb31fd259D799Fa4AdAdc64726B75E6195D635C59
echo "Verifying ProxyFactory on Sepolia..."
npx hardhat verify --network sepolia 0x333E1c74a84F321D5CDb6bBd79cb9deDE8036880 "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
echo "Verifying Paymaster on Sepolia..."
npx hardhat verify --network sepolia 0x9f6142e7212E73925bEC550F303Cd19d466C5a88 "0x878344AF84A404439Ea37cFB9b30DeFd7938741C" "0x0000000071727De22E5E9d8BAf0edAc6f37da032" "0x694AA1769357215DE4FAC081bf1f309aDC325306"

echo "Verifying MockAggregator on Amoy..."
npx hardhat verify --network amoy 0xBaF94f065D086BC9d961aBC25989501165A5Fd7c 50000000
echo "Verifying CREATE3Factory on Amoy..."
npx hardhat verify --network amoy 0xb31fd259D799Fa4AdAdc64726B75E6195D635C59
echo "Verifying ProxyFactory on Amoy..."
npx hardhat verify --network amoy 0x333E1c74a84F321D5CDb6bBd79cb9deDE8036880 "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
echo "Verifying Paymaster on Amoy..."
npx hardhat verify --network amoy 0x9f6142e7212E73925bEC550F303Cd19d466C5a88 "0x878344AF84A404439Ea37cFB9b30DeFd7938741C" "0x0000000071727De22E5E9d8BAf0edAc6f37da032" "0xBaF94f065D086BC9d961aBC25989501165A5Fd7c"
