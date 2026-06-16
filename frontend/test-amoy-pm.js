import { ethers } from "ethers";
const provider = new ethers.JsonRpcProvider("https://polygon-amoy.infura.io/v3/86b7c03e8d49460ca30a6845f81a6c80");
const pmAddress = "0x7d045fA2F7DE36fB537852442bb2693D2a6b5Aa3";
async function check() {
  try {
    const code = await provider.getCode(pmAddress);
    console.log("Code length on Amoy:", code.length);
    if (code.length <= 2) {
        console.log("NO CODE AT ADDRESS!");
    } else {
        console.log("CODE DEPLOYED!");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
check();
