const { ethers } = require('ethers');
const bundlerUrl = "https://public.pimlico.io/v2/sepolia/rpc";

async function run() {
  const op = {
    sender: "0x99374D278d4CFc212E8202729ad326b79d2dcF6b",
    nonce: "0x1",
    initCode: "0x",
    callData: "0x",
    callGasLimit: "0x10000",
    verificationGasLimit: "0x10000",
    preVerificationGas: "0x10000",
    maxFeePerGas: "0x10000",
    maxPriorityFeePerGas: "0x10000",
    paymasterAndData: "0x",
    signature: "0x"
  };

  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_estimateUserOperationGas",
      params: [op, "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"]
    })
  });
  console.log(await response.json());
}
run();
