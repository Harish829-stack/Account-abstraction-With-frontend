import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  
  // The AaveYieldPool V2 is deployed deterministically at this address
  const expectedAddress = "0xAB49984529296Ead4dF03309BFeA6b273d9d34E4";

  const code = await ethers.provider.getCode(expectedAddress);
  if (code === "0x") {
    console.error(`AaveYieldPool not found at ${expectedAddress}. Please run the deployment script first.`);
    process.exit(1);
  }

  const aaveYieldPool = await ethers.getContractAt("AaveYieldPool", expectedAddress, deployer);

  const currentApy = await aaveYieldPool.apy();
  console.log(`Current APY is: ${currentApy} basis points (${Number(currentApy) / 100}%)`);

  console.log("Waiting 60 seconds before updating the APY...");
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Change APY slightly (random change between -50 and +50 basis points)
  const change = Math.floor(Math.random() * 101) - 50; 
  
  let newApy = Number(currentApy) + change;
  // Ensure APY doesn't go below 0
  if (newApy < 0) newApy = 0;

  console.log(`Updating APY to: ${newApy} basis points (${newApy / 100}%)`);
  
  const tx = await aaveYieldPool.setAPY(newApy);
  await tx.wait();
  
  console.log("APY updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
