import hre from "hardhat";
const { ethers } = await hre.network.connect();
import "dotenv/config"

async function main() {
  const [deployer] = await ethers.getSigners();


  const ENTRY_POINT = process.env.ENTRY_POINT;
  const TOKEN = process.env.USDC_TOKEN_ADDRESS;
  const PRICE_FEED = process.env.PRICE_FEED;
  const BACKEND_SIGNER = deployer;


  const Factory = await ethers.getContractFactory("ERC20Paymaster");
  const paymaster = await Factory.deploy(ENTRY_POINT!, TOKEN!, PRICE_FEED!, BACKEND_SIGNER);
  await paymaster.waitForDeployment();
  const address = await paymaster.getAddress();
  
  console.log(`✅ Paymaster deployed at: ${address}`);


  console.log("Staking and Depositing...");
  await (await paymaster.deposit({ value: ethers.parseEther("0.01") })).wait();
  await (await paymaster.addStake(86400, { value: ethers.parseEther("0.01") })).wait();
  
  console.log("✅ Paymaster is ready for Skandha!");
}

main().catch(console.error);


/**
  npx hardhat run scripts/deployERC20Paymaster.ts --network sepolia

✅ Paymaster deployed at: 0x3D6c43456Bb957F742173628b4eF94a2cc7958bD
Staking and Depositing...
✅ Paymaster is ready for Skandha!

 */