import { ethers } from "ethers";

async function main() {
    const payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_estimateUserOperationGas",
        "params": [
            {
                "sender": "0x68b70CD8277b3379931c222282F9F78831076363",
                "nonce": "0x3",
                "callData": "0xe9ae5c53010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000034878344af84a404439ea37cfb9b30defd7938741c00000000000000000000000000000000000000000000000000005af3107a4000000000000000000000000000",
                "callGasLimit": "0x1d4c0",
                "verificationGasLimit": "0x1d4c0",
                "preVerificationGas": "0xc350",
                "maxFeePerGas": "0x120d059f8",
                "maxPriorityFeePerGas": "0x59682f00",
                "signature": "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
            },
            "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
        ]
    };

    const res = await fetch("https://eth-sepolia.g.alchemy.com/v2/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
main();
