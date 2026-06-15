import hre from "hardhat";
const { ethers } = hre;
async function main() {
  const CREATE2_FACTORY_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
  const Create3FactoryArtifact = await ethers.getContractFactory("CREATE3Factory");
  const create3Bytecode = Create3FactoryArtifact.bytecode;
  const create3Salt = ethers.id("MULTI_TOKEN_CREATE3_FACTORY_V1");
  const expectedAddr = ethers.getCreate2Address(CREATE2_FACTORY_ADDRESS, create3Salt, ethers.keccak256(create3Bytecode));
  console.log("Expected:", expectedAddr);
  console.log("Code length:", (await ethers.provider.getCode(expectedAddr)).length);
}
main();
