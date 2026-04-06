import axios from "axios";

async function run() {
    const rpcUrl = "http://127.0.0.1:14337/rpc"; // or wherever it is
    const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
    const smartAccountAddress = "0xD73e74C58C6593B1070bA4561b2fbd2746b3d29b"; // from env
    const paymasterAddress = "0x21C6A7B49080e077B8703518504c98f7A5BF4eec";

    const userOp = {
        sender: smartAccountAddress,
        nonce: "0x00", // Just dummy for estimation
        initCode: "0x",
        callData: "0x", // Empty call data
        callGasLimit: "0x7a120", // 500k
        verificationGasLimit: "0x7a120", // 500k
        preVerificationGas: "0x186a0", // 100k
        maxFeePerGas: "0x3b9aca00", // 1 Gwei
        maxPriorityFeePerGas: "0x3b9aca00", // 1 Gwei
        paymasterAndData: paymasterAddress,
        signature: "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
    };

    console.log("Estimating with limits...");
    try {
        const res = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_estimateUserOperationGas",
            params: [userOp, entryPoint]
        });
        console.log("With Limits:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("Error:", e.response?.data || e.message);
    }
}
run();
