const { ethers } = require('ethers');
require('dotenv').config();

const factoryAddress = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c"; // Uniswap V3 Factory on Sepolia
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

async function check() {
    const factoryIface = new ethers.Interface(["function getPool(address,address,uint24) view returns (address)"]);
    const factory = new ethers.Contract(factoryAddress, factoryIface, provider);
    const pool = await factory.getPool(process.env.WETH_SEPOLIA, process.env.USDC_SEPOLIA, 3000);
    console.log("Pool (3000):", pool);
    
    if (pool !== ethers.ZeroAddress) {
        const poolIface = new ethers.Interface(["function liquidity() view returns (uint128)"]);
        const poolContract = new ethers.Contract(pool, poolIface, provider);
        const liq = await poolContract.liquidity();
        console.log("Liquidity:", liq.toString());
    }
}
check().catch(console.error);
