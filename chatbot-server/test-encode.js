require('dotenv').config({ path: '/Users/jatinsharma/Desktop/AA-create3-multichain/Account-abstraction-With-frontend/chatbot-server/.env' });
const { encodeERC7579Single, encodeUniswapSwap } = require('./userOpBuilder');

const target = process.env.UNISWAP_ROUTER;
const innerCallData = encodeUniswapSwap(
    process.env.WETH_SEPOLIA, 
    process.env.USDC_SEPOLIA, 
    3000, 
    "0xF856b80CaeF9f3a5d942aA4526D72078E04fad2e", 
    "1000000000000000", 
    0n, 
    0n
);
const value = "1000000000000000";
const callData = encodeERC7579Single(target, value, innerCallData);
console.log("callData:", callData);
