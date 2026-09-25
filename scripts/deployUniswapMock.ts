import hre from "hardhat";

async function main() {
  // @ts-ignore
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const CREATE3_FACTORY_ADDRESS = process.env.CREATE3_FACTORY || "0xb31fd259D799Fa4AdAdc64726B75E6195D635C59";

  console.log("Deploying Uniswap Mocks via CREATE3 deterministically with account:", deployer.address);

  const create3Factory = await ethers.getContractAt("CREATE3Factory", CREATE3_FACTORY_ADDRESS, deployer);

  // Helper function to deploy and/or get address
  async function deployViaCreate3(contractName: string, saltString: string, args: any[] = []) {
    const salt = ethers.id(saltString);
    const expectedAddress = await create3Factory.getDeployed(deployer.address, salt);
    
    // Check if deployed
    const code = await ethers.provider.getCode(expectedAddress);
    if (code === "0x") {
      const Factory = await ethers.getContractFactory(contractName);
      const tx = await Factory.getDeployTransaction(...args);
      const creationCode = tx.data;
      
      console.log(`Deploying ${contractName} to ${expectedAddress}...`);
      const deployTx = await create3Factory.deploy(salt, creationCode, { gasLimit: 8000000 });
      await deployTx.wait();
      console.log(`${contractName} deployed successfully!`);
    } else {
      console.log(`${contractName} already exists at ${expectedAddress}`);
    }
    
    return expectedAddress;
  }

  // 1. Deploy CustomPriceFeed (Initial price e.g., $2500 per ETH -> 2500 * 10^8)
  const initialPrice = 250000000000;
  const priceFeedSalt = "CUSTOM_PRICE_FEED_V1";
  const priceFeedAddress = await deployViaCreate3("CustomPriceFeed", priceFeedSalt, [
    initialPrice
  ]);

  // 2. Deploy MockUSDC
  const usdcSalt = "MOCK_USDC_V1";
  const usdcAddress = await deployViaCreate3("MockUSDC", usdcSalt, []);

  // 3. Deploy MockUniswapRouter
  const routerSalt = "MOCK_UNISWAP_ROUTER_V1";
  const routerAddress = await deployViaCreate3("MockUniswapRouter", routerSalt, [
    priceFeedAddress,
    usdcAddress
  ]);

  console.log("\n=================================");
  console.log("Deterministic Addresses:");
  console.log("CustomPriceFeed:", priceFeedAddress);
  console.log("MockUSDC:", usdcAddress);
  console.log("MockUniswapRouter:", routerAddress);
  console.log("=================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
