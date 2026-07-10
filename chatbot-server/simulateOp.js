const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    const userOp = {
      "sender": "0xF856b80CaeF9f3a5d942aA4526D72078E04fad2e",
      "nonce": "0x01",
      "callData": "0xe9ae5c530000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000178c578bf1899ff9e49d0fc65be5b1a0a26eb11af4400000000000000000000000000000000000000000000000000000000000000009a4c9a3f000000000000000000000000c1b3777b468c27453915422303b52f7c7310c4bf0000000000000000000000003bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e414bf3890000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000038d7ea4c680000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000008400000000000000000000000000000000000000000000000000038d7ea4c680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006a7874f600000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "callGasLimit": "0x0",
      "verificationGasLimit": "0x0",
      "preVerificationGas": "0x0",
      "maxFeePerGas": "0x8cb4cfd8",
      "maxPriorityFeePerGas": "0x10c8e0",
      "signature": "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    };

    try {
        const ep = new ethers.Contract("0x0000000071727De22E5E9d8BAf0edAc6f37da032", [
            "function simulateHandleOp(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) op, address target, bytes targetCallData) returns (bool)"
        ], provider);
        
        // Let's just try eth_call on entrypoint to simulate
        // Actually estimating via bundler might be easier.
        const res = await fetch("https://testnet-rpc.etherspot.io/v2/11155111?api-key=etherspot_FkifdLwcZbgBwJWD9PSC55", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1,
                method: "eth_estimateUserOperationGas",
                params: [userOp, "0x0000000071727De22E5E9d8BAf0edAc6f37da032"]
            })
        });
        const data = await res.json();
        console.log("Bundler Response:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error(e);
    }
}

main();
