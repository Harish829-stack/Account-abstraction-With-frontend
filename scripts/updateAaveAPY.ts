import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  
  // The AaveYieldPool V3 is deployed deterministically at this address
  const expectedAddress = "0xd5263f6Bc6fcD4e969E5F4ffF89359989b52831A";

  const code = await ethers.provider.getCode(expectedAddress);
  if (code === "0x") {
    console.error(`AaveYieldPool not found at ${expectedAddress}. Please run the deployment script first.`);
    process.exit(1);
  }

  const aaveYieldPool = await ethers.getContractAt("AaveYieldPool", expectedAddress, deployer);

  const currentApy = await aaveYieldPool.apy();
  console.log(`Current APY is: ${currentApy} basis points (${Number(currentApy) / 100}%)`);

  console.log("Waiting 10 seconds before updating the APY...");
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Generate APY strictly between 400 (4.0%) and 500 (5.0%)
  // 80% chance to be in the 400-450 range (4.0% - 4.5%)
  let newApy;
  if (Math.random() < 0.8) {
    newApy = Math.floor(Math.random() * 51) + 400; // 400 to 450
  } else {
    newApy = Math.floor(Math.random() * 50) + 451; // 451 to 500
  }

  console.log(`Updating APY to: ${newApy} basis points (${newApy / 100}%)`);
  
  const tx = await aaveYieldPool.setAPY(newApy);
  await tx.wait();
  
  console.log("APY updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
