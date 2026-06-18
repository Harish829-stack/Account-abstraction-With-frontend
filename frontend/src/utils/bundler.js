import axios from "axios";

export async function estimateUserOperationGas(userOp) {
  let rpcUrl = import.meta.env.VITE_SKANDHA_RPC_URL;
  if (window.ethereum) {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainId, 16) === 80002) {
        if (import.meta.env.VITE_PIMLICO_BUNDLER_URL) {
          rpcUrl = import.meta.env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
        } else {
          rpcUrl = rpcUrl.replace("11155111", "80002");
        }
      }
    } catch (e) { console.warn("Failed to get chainId", e); }
  }
  const entryPoint = import.meta.env.VITE_ENTRY_POINT;

  if (!rpcUrl) throw new Error("Bundler RPC URL not found in env");
  if (!entryPoint) throw new Error("Entry Point missing in env");

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
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    
    // Automatically pad the gas estimates to prevent AA26 errors across all views
    const est = data.result;
    if (est) {
      if (est.callGasLimit) {
        est.callGasLimit = ((BigInt(est.callGasLimit) * 120n) / 100n).toString();
      }
      if (est.verificationGasLimit) {
        est.verificationGasLimit = ((BigInt(est.verificationGasLimit) * 150n) / 100n).toString();
      }
      if (est.preVerificationGas) {
        est.preVerificationGas = (BigInt(est.preVerificationGas) + 5000n).toString();
      }
      if (est.paymasterVerificationGasLimit) {
        est.paymasterVerificationGasLimit = ((BigInt(est.paymasterVerificationGasLimit) * 150n) / 100n).toString();
      }
      if (est.paymasterPostOpGasLimit) {
        est.paymasterPostOpGasLimit = ((BigInt(est.paymasterPostOpGasLimit) * 150n) / 100n).toString();
      }
    }
    
    return est;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

export async function sendUserOperation(userOp) {
  let rpcUrl = import.meta.env.VITE_SKANDHA_RPC_URL;
  if (window.ethereum) {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainId, 16) === 80002) {
        if (import.meta.env.VITE_PIMLICO_BUNDLER_URL) {
          rpcUrl = import.meta.env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
        } else {
          rpcUrl = rpcUrl.replace("11155111", "80002");
        }
      }
    } catch (e) { console.warn("Failed to get chainId", e); }
  }
  const entryPoint = import.meta.env.VITE_ENTRY_POINT;

  if (!rpcUrl) throw new Error("Bundler RPC URL not found in env");
  if (!entryPoint) throw new Error("Entry Point missing in env");

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
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result; // This is the userOpHash
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

export async function getUserOpReceipt(userOpHash) {
  let rpcUrl = import.meta.env.VITE_SKANDHA_RPC_URL;
  if (window.ethereum) {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainId, 16) === 80002) {
        if (import.meta.env.VITE_PIMLICO_BUNDLER_URL) {
          rpcUrl = import.meta.env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
        } else {
          rpcUrl = rpcUrl.replace("11155111", "80002");
        }
      }
    } catch (e) { console.warn("Failed to get chainId", e); }
  }
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

export async function getDynamicGasFees(provider) {
  let maxPriorityFeePerGas = 1500000000n;
  let maxFeePerGas = 5000000000n;
  
  try {
    // 1. Fetch real-time gas prices directly from the blockchain node
    const feeData = await provider.getFeeData();
    const chainPriority = feeData.maxPriorityFeePerGas || 1500000000n;
    const chainMaxFee = feeData.maxFeePerGas || (feeData.gasPrice ? feeData.gasPrice * 2n : 5000000000n);
    
    // 2. Try fetching from Pimlico/Skandha bundler
    let pimlicoPriority = 0n;
    let pimlicoMaxFee = 0n;
    
    let rpcUrl = import.meta.env.VITE_SKANDHA_RPC_URL;
    let isAmoy = false;
    if (window.ethereum) {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (parseInt(chainId, 16) === 80002) {
          isAmoy = true;
          if (import.meta.env.VITE_PIMLICO_BUNDLER_URL) {
            rpcUrl = import.meta.env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
          } else {
            rpcUrl = rpcUrl.replace("11155111", "80002");
          }
        }
      } catch (e) { console.warn("Failed to get chainId in fee fetch", e); }
    }

    try {
      const gasRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] })
      }).then(r => r.json());
      
      if (gasRes.result && gasRes.result.fast) {
        pimlicoPriority = BigInt(gasRes.result.fast.maxPriorityFeePerGas);
        pimlicoMaxFee = BigInt(gasRes.result.fast.maxFeePerGas);
      }
    } catch (e) {
      console.warn("Bundler gas fee fetch failed, relying on node fees:", e.message);
    }
    
    // 3. Take the MAXIMUM of the chain's minimum and the bundler's estimate
    maxPriorityFeePerGas = pimlicoPriority > chainPriority ? pimlicoPriority : chainPriority;
    maxFeePerGas = pimlicoMaxFee > chainMaxFee ? pimlicoMaxFee : chainMaxFee;
    
    // 4. Apply Amoy minimums if necessary
    if (isAmoy || import.meta.env.VITE_ACTIVE_NETWORK === "amoy") {
        if (maxPriorityFeePerGas < 30000000000n) maxPriorityFeePerGas = 30000000000n;
        if (maxFeePerGas < 35000000000n) maxFeePerGas = 35000000000n;
    }

    // 5. Add a 10% buffer to prevent sudden block fluctuations from reverting the tx
    maxPriorityFeePerGas = (maxPriorityFeePerGas * 11n) / 10n;
    maxFeePerGas = (maxFeePerGas * 11n) / 10n;
    
  } catch (e) {
    console.warn("Dynamic gas fetch failed completely, using fallbacks:", e);
  }
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}
