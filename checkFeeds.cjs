const { ethers } = require('ethers');

async function check() {
  const provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
  
  const addrs = {
    'ETH_USD_provided': '0xd30e2101a97dccb435ecb1245642a537f7a7ba2d',
    'ETH_USD_official': '0x639F6410c55aE61a12361093121F7730e060a612',
    'USDC_USD': '0x011e525c56c2d1323b73373fa9f993d6b0521e8e',
    'USDC_USD_try2': '0xe020601d0ea1ae21e5e04ebc45a6c0bd40e0bcba' // A random Chainlink USDC address on some network? No I shouldn't guess.
  };

  const abi = ['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'];
  
  for (const [name, addr] of Object.entries(addrs)) {
    try {
      const contract = new ethers.Contract(addr, abi, provider);
      const res = await contract.latestRoundData();
      console.log(`[SUCCESS] ${name} @ ${addr}: ${res[1].toString()}`);
    } catch (e) {
      console.log(`[FAIL] ${name} @ ${addr}: ${e.message}`);
    }
  }
}
check();
