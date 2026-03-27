import hre from "hardhat";
const { ethers } = await hre.network.connect();

async function main() {
  const [deployer] = await ethers.getSigners();


  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  const TOKEN = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; 
  const PRICE_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  const BACKEND_SIGNER = deployer;


  const Factory = await ethers.getContractFactory("ERC20Paymaster");
  const paymaster = await Factory.deploy(ENTRY_POINT, TOKEN, PRICE_FEED, BACKEND_SIGNER);
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