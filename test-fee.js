import { ethers } from "ethers";

async function run() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    const fee = await provider.getFeeData();
    console.log("maxFeePerGas (Gwei):", ethers.formatUnits(fee.maxFeePerGas, "gwei"));
    console.log("maxPriorityFeePerGas (Gwei):", ethers.formatUnits(fee.maxPriorityFeePerGas, "gwei"));
}
run();
