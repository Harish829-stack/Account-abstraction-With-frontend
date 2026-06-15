import hre from "hardhat";
async function main() {
  const code = await hre.ethers.provider.getCode("0xD8dc08A009C845676832cba5dDD6b940ABF75E2f");
  console.log("Code length at 0xD8dc:", code.length);
}
main();
