import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  
  const CREATE3_FACTORY_ADDRESS = process.env.CREATE3_FACTORY || "0x220FF47e4E2094857e7e4FF4a5069fad5367EA3C";
  const create3Factory = await ethers.getContractAt("CREATE3Factory", CREATE3_FACTORY_ADDRESS, deployer);
  
  const priceFeedSalt = ethers.id("CUSTOM_PRICE_FEED_V1");
  const expectedAddress = await create3Factory.getDeployed(deployer.address, priceFeedSalt);

  const code = await ethers.provider.getCode(expectedAddress);
  if (code === "0x") {
    console.error(`CustomPriceFeed not found at ${expectedAddress}. Please run the deployment script first.`);
    process.exit(1);
  }

  const priceFeed = await ethers.getContractAt("CustomPriceFeed", expectedAddress, deployer);

  // Example: Setting price to $3000 (3000 * 10^8)
  const newPrice = 300000000000;
  console.log(`Setting new ETH price to: $${newPrice / 1e8}`);
  
  const tx = await priceFeed.setPrice(newPrice);
  await tx.wait();
  
  console.log("Price updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
