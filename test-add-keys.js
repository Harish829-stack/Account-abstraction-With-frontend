const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    // Connect to Polygon Amoy (or whatever RPC)
    const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/polygon_amoy");
    // Generate a random wallet just to act as the "smart account" calling the contract directly
    const wallet = ethers.Wallet.createRandom().connect(provider);
    
    // We don't have funds on random wallet, so let's use the local hardhat node instead?
    // Oh wait, I just want to see if the logic is broken. Let's do it on hardhat if we have one.
    // Is there a hardhat node running?
}
main();
