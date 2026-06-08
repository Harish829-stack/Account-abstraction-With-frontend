import hre from "hardhat";

async function main() {
  // Hardhat v3 — get ethers via hre.network.connect()
  const connection = await hre.network.connect();
  const ethers = connection.ethers;

  const [deployer] = await ethers.getSigners();

  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const NAME       = "My NFT Collection";
  const SYMBOL     = "MNFT";
  const MAX_SUPPLY = 100000n;

  const OpenMintNFT = await ethers.getContractFactory("OpenMintNFT");

  console.log("Deploying OpenMintNFT...");
  const nft = await OpenMintNFT.deploy(NAME, SYMBOL, MAX_SUPPLY);

  await nft.waitForDeployment();

  const address = await nft.getAddress();
  console.log("OpenMintNFT deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });


  /**
   *  npx hardhat run scripts/deployNFT.ts --network sepolia


Deploying with account: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Account balance: 2.836905565770843236 ETH
Deploying OpenMintNFT...
OpenMintNFT deployed to: 0x5Eac31208213f48AE26470F6F9c44e786C2aF4Cb
   */