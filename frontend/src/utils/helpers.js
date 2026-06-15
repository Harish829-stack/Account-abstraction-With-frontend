import { ethers } from 'ethers';

export function toHex(value) {
  return "0x" + BigInt(value).toString(16);
}

export async function getEthPriceInUsd(provider, priceFeedAddress) {
  try {
    if (!provider || !priceFeedAddress) return 3300;
    const priceFeed = new ethers.Contract(
      priceFeedAddress,
      ["function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"],
      provider
    );
    const data = await priceFeed.latestRoundData();
    const price = Number(data.answer) / 100000000;
    return price > 0 ? price : 3300;
  } catch (e) {
    console.warn("Failed to fetch price from Chainlink feed, using fallback 3300:", e);
    return 3300;
  }
}

export function formatNum(value, decimals = 18) {
  if (!value) return "0.0";
  const num = Number(value) / (10 ** decimals);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function shortenAddress(address) {
  if (!address) return "0x000...0000";
  return address.slice(0, 6) + "..." + address.slice(-4);
}

export function packUserOp(userOp) {
  const accountGasLimits = ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(userOp.verificationGasLimit || 0), 16),
    ethers.zeroPadValue(ethers.toBeHex(userOp.callGasLimit || 0), 16)
  ]);
  
  const gasFees = ethers.concat([
    ethers.zeroPadValue(ethers.toBeHex(userOp.maxPriorityFeePerGas || 0), 16),
    ethers.zeroPadValue(ethers.toBeHex(userOp.maxFeePerGas || 0), 16)
  ]);

  let paymasterAndData = "0x";
  if (userOp.paymaster && userOp.paymaster !== "0x") {
    const pmVerificationGasLimit = ethers.zeroPadValue(ethers.toBeHex(userOp.paymasterVerificationGasLimit || 0), 16);
    const pmPostOpGasLimit = ethers.zeroPadValue(ethers.toBeHex(userOp.paymasterPostOpGasLimit || 0), 16);
    const pmData = userOp.paymasterData && userOp.paymasterData !== "0x" ? userOp.paymasterData : "0x";
    
    paymasterAndData = ethers.concat([
      userOp.paymaster,
      pmVerificationGasLimit,
      pmPostOpGasLimit,
      pmData
    ]);
  }

  let initCode = "0x";
  if (userOp.factory && userOp.factory !== "0x") {
    initCode = ethers.concat([
      userOp.factory,
      userOp.factoryData || "0x"
    ]);
  }

  return {
    sender: userOp.sender,
    nonce: userOp.nonce || "0x0",
    initCode,
    callData: userOp.callData || "0x",
    accountGasLimits,
    preVerificationGas: userOp.preVerificationGas || "0x0",
    gasFees,
    paymasterAndData,
    signature: userOp.signature || "0x"
  };
}

export function encodeERC7579Single(target, value, callData) {
    const EXEC_MODE_DEFAULT = "0x0100000000000000000000000000000000000000000000000000000000000000";
    const abiCoder = new ethers.AbiCoder();
    const executionCalldata = abiCoder.encode(
        ["address", "uint256", "bytes"],
        [target, value, callData]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_DEFAULT, executionCalldata]);
}

export function encodeERC7579Batch(targets, values, callDatas) {
    const EXEC_MODE_BATCH = "0x0100000000000000000000000000000000000000000000000000000000000001";
    const abiCoder = new ethers.AbiCoder();
    const executions = targets.map((target, i) => ({
        target,
        value: values[i],
        callData: callDatas[i]
    }));
    // Execution[] is tuple(address target, uint256 value, bytes callData)[]
    const executionCalldata = abiCoder.encode(
        ["tuple(address target, uint256 value, bytes callData)[]"],
        [executions]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_BATCH, executionCalldata]);
}
