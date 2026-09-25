import axios from "axios";
import { getBundlerUrl, getChainConfig, SHARED_CONTRACTS } from "../config/chains";

function getBundlerRequestConfig(chainId) {
  const rpcUrl = getBundlerUrl(chainId);
  const entryPoint = SHARED_CONTRACTS.ENTRY_POINT;

  if (!rpcUrl) throw new Error("Bundler RPC URL not found in env");
  if (!entryPoint) throw new Error("Entry Point missing in env");

  return { rpcUrl, entryPoint };
}

export const USER_OP_GAS_BUFFER_PERCENT = 10n;

function addGasBuffer(value, percent = USER_OP_GAS_BUFFER_PERCENT) {
  const parsed = BigInt(value || 0);
  return ((parsed * (100n + percent)) + 99n) / 100n;
}

function toHex(value) {
  return "0x" + BigInt(value).toString(16);
}

export function applyUserOpGasBuffer(est, percent = USER_OP_GAS_BUFFER_PERCENT) {
  return {
    ...est,
    callGasLimit: est.callGasLimit ? addGasBuffer(est.callGasLimit, percent).toString() : est.callGasLimit,
    verificationGasLimit: est.verificationGasLimit ? addGasBuffer(est.verificationGasLimit, percent).toString() : est.verificationGasLimit,
    preVerificationGas: est.preVerificationGas ? addGasBuffer(est.preVerificationGas, percent).toString() : est.preVerificationGas,
    paymasterVerificationGasLimit: est.paymasterVerificationGasLimit ? addGasBuffer(est.paymasterVerificationGasLimit, percent).toString() : est.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: est.paymasterPostOpGasLimit ? addGasBuffer(est.paymasterPostOpGasLimit, percent).toString() : est.paymasterPostOpGasLimit,
  };
}

export function applyBufferedGasEstimate(userOp, est, percent = USER_OP_GAS_BUFFER_PERCENT) {
  const buffered = applyUserOpGasBuffer(est, percent);
  
  let callGasLimit = BigInt(buffered.callGasLimit || 0);
  let verificationGasLimit = BigInt(buffered.verificationGasLimit || 0);
  let preVerificationGas = BigInt(buffered.preVerificationGas || 0);

  if (callGasLimit < 50000n) callGasLimit = 50000n;
  if (verificationGasLimit < 150000n) verificationGasLimit = 150000n;
  if (preVerificationGas < 50000n) preVerificationGas = 50000n;

  userOp.callGasLimit = toHex(callGasLimit);
  userOp.verificationGasLimit = toHex(verificationGasLimit);
  userOp.preVerificationGas = toHex(preVerificationGas);
  
  if (buffered.paymasterVerificationGasLimit) userOp.paymasterVerificationGasLimit = toHex(buffered.paymasterVerificationGasLimit);
  if (buffered.paymasterPostOpGasLimit) userOp.paymasterPostOpGasLimit = toHex(buffered.paymasterPostOpGasLimit);
  
  return {
    ...buffered,
    callGasLimit: callGasLimit.toString(),
    verificationGasLimit: verificationGasLimit.toString(),
    preVerificationGas: preVerificationGas.toString()
  };
}

export async function estimateUserOperationGas(userOp, chainId) {
  const { rpcUrl, entryPoint } = getBundlerRequestConfig(chainId);

  // Create a copy for estimation
  const opToEstimate = { ...userOp };

  // Provide dummy signature for estimation
  if (!opToEstimate.signature || opToEstimate.signature === "0x") {
    opToEstimate.signature = "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
  }

  // Clean up optional fields for v0.7 bundlers
  if (!opToEstimate.factory || opToEstimate.factory === "0x") {
    delete opToEstimate.factory;
    delete opToEstimate.factoryData;
  }
  if (!opToEstimate.paymaster || opToEstimate.paymaster === "0x") {
    delete opToEstimate.paymaster;
    delete opToEstimate.paymasterVerificationGasLimit;
    delete opToEstimate.paymasterPostOpGasLimit;
    delete opToEstimate.paymasterData;
  }

  try {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateUserOperationGas",
        params: [opToEstimate, entryPoint]
      };
    console.log("Estimating UserOp:", JSON.stringify(payload, null, 2));
    const res = await axios.post(
      rpcUrl,
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const data = res.data;
    if (data.error) {
      let msg = data.error.message || JSON.stringify(data.error);
      if (msg.includes("AA21")) {
        msg = "Insufficient balance: Smart Account doesn't have enough native tokens to pay for gas (AA21). Please fund it or use a Paymaster.";
      }
      throw new Error(msg);
    }
    return data.result;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

export async function sendUserOperation(userOp, chainId) {
  const { rpcUrl, entryPoint } = getBundlerRequestConfig(chainId);

  try {
    const opToSend = { ...userOp };
    
    // Clean up optional fields for v0.7 bundlers
    if (!opToSend.factory || opToSend.factory === "0x") {
      delete opToSend.factory;
      delete opToSend.factoryData;
    }
    if (!opToSend.paymaster || opToSend.paymaster === "0x") {
      delete opToSend.paymaster;
      delete opToSend.paymasterVerificationGasLimit;
      delete opToSend.paymasterPostOpGasLimit;
      delete opToSend.paymasterData;
    }

    const res = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [opToSend, entryPoint]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    const data = res.data;
    if (data.error) {
      let msg = data.error.message || JSON.stringify(data.error);
      if (msg.includes("AA21")) {
        msg = "Insufficient balance: Smart Account doesn't have enough native tokens to pay for gas (AA21). Please fund it or use a Paymaster.";
      }
      throw new Error(msg);
    }
    return data.result; // This is the userOpHash
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

export async function getUserOpReceipt(userOpHash, chainId) {
  const rpcUrl = getBundlerUrl(chainId);
  if (!rpcUrl) return null;

  try {
    const res = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [userOpHash]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    return res.data.result;
  } catch (error) {
    console.error("Error fetching UserOp receipt:", error);
    return null;
  }
}

export async function getDynamicGasFees(provider, chainId) {
  const chainConfig = getChainConfig(chainId);
  let maxPriorityFeePerGas = 1500000000n;
  let maxFeePerGas = 5000000000n;
  
  try {
    // 1. Fetch real-time gas prices directly from the blockchain node
    const feeData = await provider.getFeeData();
    const chainPriority = feeData.maxPriorityFeePerGas || 1500000000n;
    const chainMaxFee = feeData.maxFeePerGas || (feeData.gasPrice ? feeData.gasPrice * 2n : 5000000000n);
    
    // Mitigate gas price errors by strictly taking on-chain prices
    maxPriorityFeePerGas = chainPriority;
    maxFeePerGas = chainMaxFee;
    
    if (chainConfig) {
      const chainPriorityFloor = BigInt(chainConfig.minPriorityFeeWei || 0);
      const chainFeeFloor = BigInt(chainConfig.minFeeWei || 0);
      if (maxPriorityFeePerGas < chainPriorityFloor) maxPriorityFeePerGas = chainPriorityFloor;
      if (maxFeePerGas < chainFeeFloor) maxFeePerGas = chainFeeFloor;
    }

    // Add a 10% buffer to guarantee it doesn't get stuck pending, as requested
    maxPriorityFeePerGas = (maxPriorityFeePerGas * 11n) / 10n;
    maxFeePerGas = (maxFeePerGas * 11n) / 10n;
    
  } catch (e) {
    console.warn("Dynamic gas fetch failed completely, using fallbacks:", e);
  }
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}
