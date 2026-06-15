import hre from "hardhat";
async function main() {
  const provider = hre.ethers.provider;
  const sa = "0x660C572C77897dcD1A0fdc27E84f3a1FE7fa28C0";
  const code = await provider.getCode(sa);
  console.log("Code length:", code.length);
  const slot = await provider.getStorage(sa, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
  console.log("Implementation slot EIP-1967:", slot);
}
main().catch(console.error);
