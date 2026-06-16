import hre from "hardhat";
import "dotenv/config";

async function main() {
  console.log("Starting Paymaster Funding Script...\n");

  const { ethers } = await (hre as any).network.connect();
  const signers = await ethers.getSigners();
  const owner = signers[0];

  console.log(`Using Owner/Deployer account: ${owner.address}`);

  // Fetch the Paymaster address from .env, or replace it manually here
  const PAYMASTER_ADDRESS = process.env.VITE_PAYMASTER || process.env.PAYMASTER;

  if (!PAYMASTER_ADDRESS || PAYMASTER_ADDRESS === "") {
    throw new Error("Paymaster address not found. Please set VITE_PAYMASTER in your .env file.");
  }

  console.log(`Connecting to ERC20Paymaster at: ${PAYMASTER_ADDRESS}\n`);

  // We can attach to either CustomPaymaster or ERC20Paymaster since they both have deposit/addStake
  // We'll use the MultiTokenPaymaster factory for the ABI
  const PaymasterFactory = await ethers.getContractFactory("contracts/Erc20Paymaster.sol:MultiTokenPaymaster");
  const paymaster = PaymasterFactory.attach(PAYMASTER_ADDRESS) as any;

  // Amount to deposit into the EntryPoint for gas fees (e.g. 0.05 ETH)
  const depositAmount = ethers.parseEther("0.05");
  // Amount to stake in the EntryPoint for reputation (e.g. 0.05 ETH)
  const stakeAmount = ethers.parseEther("0.05");
  // Unstake delay in seconds (e.g. 1 day = 86400)
  const unstakeDelay = 86400;

  // console.log(`1. Depositing ${ethers.formatEther(depositAmount)} ETH for gas fees...`);
  // const txDeposit = await paymaster.connect(owner).deposit({ value: depositAmount });
  // await txDeposit.wait();
  // console.log("✅ Deposit successful!\n");

  console.log(`2. Staking ${ethers.formatEther(stakeAmount)} ETH with a delay of ${unstakeDelay} seconds...`);
  const txStake = await paymaster.connect(owner).addStake(unstakeDelay, { value: stakeAmount });
  await txStake.wait();
  console.log("✅ Stake successful!\n");

  console.log("-------------------------------------------------");
  console.log("Paymaster is now fully funded and staked!");
  console.log("-------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
