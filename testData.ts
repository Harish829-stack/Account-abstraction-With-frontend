import hre from "hardhat";
async function main() {
  const ProxyFactoryArtifact = await hre.ethers.getContractFactory("ProxyFactory");
  const tx = await ProxyFactoryArtifact.getDeployTransaction("0x0000000071727De22E5E9d8BAf0edAc6f37da032");
  console.log("type:", typeof tx.data);
  console.log("constructor name:", tx.data?.constructor?.name);
}
main();
