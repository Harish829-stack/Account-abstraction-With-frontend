import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [owner] = await ethers.getSigners();


  const PAYMASTER_ADDRESS ="0xe1a975AEe59fA274396A06C5dA8fF52C04109bAc"

  console.log(`Setting up Paymaster at ${PAYMASTER_ADDRESS}`);
  console.log(`Using account: ${owner.address}`);

  const paymaster = await ethers.getContractAt("contracts/Erc20Paymaster.sol:MultiTokenPaymaster", PAYMASTER_ADDRESS, owner);

  // Configure your amounts here
  const STAKE_AMOUNT = ethers.parseEther("0.01"); // 0.01 ETH/POL
  const UNSTAKE_DELAY_SEC = 86400; // 1 day delay
  const DEPOSIT_AMOUNT = ethers.parseEther("0.2"); // 0.05 ETH/POL for paying gas
  
  // 1. Add Stake
  // Staking is required by the bundler to prevent griefing.
  console.log(`\nAdding Stake of ${ethers.formatEther(STAKE_AMOUNT)} native tokens with a 1-day delay...`);
  const tx1 = await paymaster.addStake(UNSTAKE_DELAY_SEC, { value: STAKE_AMOUNT });
  await tx1.wait();
  console.log("✅ Stake added successfully!");

  // 2. Deposit to EntryPoint
  // This balance is actually used to pay for the UserOperations.
  console.log(`\nDepositing ${ethers.formatEther(DEPOSIT_AMOUNT)} native tokens for gas...`);
  const tx2 = await paymaster.deposit({ value: DEPOSIT_AMOUNT });
  await tx2.wait();
  console.log("✅ Deposit successful!");

  // Verify Final Balance
  const currentDeposit = await paymaster.getDeposit();
  console.log(`\nCurrent Paymaster Deposit Balance at EntryPoint: ${ethers.formatEther(currentDeposit)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
