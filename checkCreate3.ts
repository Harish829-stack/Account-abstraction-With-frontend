import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const code = await provider.getCode("0x9fBB3DF7C40Da2e5A0dE984fFE2CCB7C47cd0ABf");
  console.log("Sepolia Code length:", code.length);
}
main().catch(console.error);
