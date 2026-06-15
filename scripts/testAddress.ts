import hre from "hardhat";
async function main() {
  const { ethers } = await hre.network.connect();
  const CREATE2_FACTORY_ADDRESS = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
  const Create3FactoryArtifact = await ethers.getContractFactory("CREATE3Factory");
  const create3Salt = ethers.id("MULTI_TOKEN_CREATE3_FACTORY_V1");
  const create3FactoryAddress = ethers.getCreate2Address(
    CREATE2_FACTORY_ADDRESS,
    create3Salt,
    ethers.keccak256(Create3FactoryArtifact.bytecode)
  );
  console.log("Calculated Address:", create3FactoryAddress);
  const code = await ethers.provider.getCode("0xb31fd259D799Fa4AdAdc64726B75E6195D635C59");
  console.log("Code at hardcoded address:", code === "0x" ? "0x" : "Deployed");
  const codeCalc = await ethers.provider.getCode(create3FactoryAddress);
  console.log("Code at calculated address:", codeCalc === "0x" ? "0x" : "Deployed");
}
main();
