import hre from "hardhat";
const { ethers } = await hre.network.connect()

async function main() {
  const factoryAddr = "0x6a113d0cb80f91f9D115d81E8267680B047f10A7"; // DeployFactory address from user's transcript
  const factory = await ethers.getContractAt("K1ValidatorFactory", factoryAddr);
  
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  console.log("Calling createAccount...");
  const tx = await factory.createAccount(signer.address, 0, [], 0);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Deployed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
