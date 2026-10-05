const { ethers } = require('ethers');
const axios = require('axios');

function toHex(value) {
  return "0x" + BigInt(value).toString(16);
}

function packUserOp(userOp) {
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

function encodeERC7579Single(target, value, callData) {
    const EXEC_MODE_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const executionCalldata = ethers.concat([
        target,
        ethers.zeroPadValue(ethers.toBeHex(value), 32),
        callData
    ]);
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_DEFAULT, executionCalldata]);
}

function encodeERC7579Batch(targets, values, callDatas) {
    if (!Array.isArray(targets) || !Array.isArray(values) || !Array.isArray(callDatas)) {
        throw new Error("Batch execution inputs must be arrays");
    }
    if (targets.length === 0 || targets.length !== values.length || targets.length !== callDatas.length) {
        throw new Error("Batch execution arrays must be non-empty and the same length");
    }

    const EXEC_MODE_BATCH = "0x0100000000000000000000000000000000000000000000000000000000000000";
    const abiCoder = new ethers.AbiCoder();
    const executions = targets.map((target, i) => ({
        target,
        value: values[i],
        callData: callDatas[i]
    }));
    const executionCalldata = abiCoder.encode(
        ["tuple(address target, uint256 value, bytes callData)[]"],
        [executions]
    );
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_BATCH, executionCalldata]);
}

function getNonceForValidator(validatorAddress) {
    return BigInt(validatorAddress);
}

function encodeUniswapSwap(tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96) {
    // We are interacting with MockUniswapRouter which implements swapExactETHForTokens instead of exactInputSingle
    const swapRouterIface = new ethers.Interface([
        "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)"
    ]);
    
    const path = [tokenIn, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    return swapRouterIface.encodeFunctionData("swapExactETHForTokens", [
        amountOutMinimum,
        path,
        recipient,
        deadline
    ]);
}

function encodeERC20Transfer(recipient, amount) {
    const erc20Iface = new ethers.Interface([
        "function transfer(address to, uint256 amount) returns (bool)"
    ]);
    return erc20Iface.encodeFunctionData("transfer", [recipient, amount]);
}

async function getDynamicGasFees(provider) {
  let maxPriorityFeePerGas = 1500000000n;
  let maxFeePerGas = 5000000000n;
  
  try {
    const feeData = await provider.getFeeData();
    const chainPriority = feeData.maxPriorityFeePerGas || 1500000000n;
    const chainMaxFee = feeData.maxFeePerGas || (feeData.gasPrice ? feeData.gasPrice * 2n : 5000000000n);
    
    // Mitigate gas price errors by strictly taking on-chain prices + 100 percent margin (2x)
    maxPriorityFeePerGas = chainPriority * 2n;
    maxFeePerGas = chainMaxFee * 2n;
    
  } catch (e) {
    console.warn("Dynamic gas fetch failed completely, using fallbacks");
  }
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

async function estimateUserOperationGas(userOp, bundlerUrl) {
  let rpcUrl = bundlerUrl || process.env.BUNDLER_URL;
  const entryPoint = process.env.ENTRY_POINT;

  const opToEstimate = { ...userOp };

  if (!opToEstimate.signature || opToEstimate.signature === "0x") {
    opToEstimate.signature = "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
  }

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
    
    const res = await axios.post(rpcUrl, payload, { headers: { "Content-Type": "application/json" } });
    const data = res.data;
    
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    
    const est = data.result;
    // Removed internal buffers here; we apply them contextually in buildAndSendAgentOp
    return est;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

async function sendUserOperation(userOp, bundlerUrl) {
  let rpcUrl = bundlerUrl || process.env.BUNDLER_URL;
  const entryPoint = process.env.ENTRY_POINT;

  try {
    const opToSend = { ...userOp };
    
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
      { headers: { "Content-Type": "application/json" } }
    );

    const data = res.data;
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result; 
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

async function waitForUserOp(opHash, timeoutMs = 90000, bundlerUrl = null) {
  const rpcUrl = bundlerUrl || process.env.BUNDLER_URL;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await axios.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getUserOperationReceipt",
          params: [opHash]
        },
        { headers: { "Content-Type": "application/json" } }
      );
      
      if (res.data && res.data.result) {
        return res.data.result;
      }
    } catch (e) {
      // Ignore network errors during polling
    }
    
    // Wait 2 seconds before polling again
    await new Promise(r => setTimeout(r, 2000));
  }
  
  throw new Error(`Timeout waiting for UserOp ${opHash} to be mined`);
}

module.exports = {
  toHex,
  packUserOp,
  encodeERC7579Single,
  encodeERC7579Batch,
  getNonceForValidator,
  encodeUniswapSwap,
  encodeERC20Transfer,
  getDynamicGasFees,
  estimateUserOperationGas,
  sendUserOperation,
  buildAndSendAgentOp,
  waitForUserOp
};

/**
 * Builds, signs, and sends a UserOp for an AI agent session key.
 *
 * @param {ethers.Wallet}   agentWallet
 * @param {ethers.Provider} provider
 * @param {string}          smartAccountAddress
 * @param {string}          callData          - ERC-7579 encoded callData
 * @param {string}          entryPointAddress
 * @param {string}          validatorAddress  - SessionKeyValidator address
 * @param {bigint}          nonce
 * @param {string}          bundlerUrl
 * @param {object|null}     paymasterRoute    - Result from paymasterRouter.resolvePaymasterRoute().
 *                                             Pass null to skip paymaster (pure native path).
 */
async function buildAndSendAgentOp(
  agentWallet,
  provider,
  smartAccountAddress,
  callData,
  entryPointAddress,
  validatorAddress,
  nonce,
  bundlerUrl,
  paymasterRoute = null
) {
    const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

    const rpcUserOp = {
        sender: smartAccountAddress,
        nonce: toHex(nonce),
        factory: "0x",
        factoryData: "0x",
        callData,
        callGasLimit: "0x0",
        verificationGasLimit: "0x0",
        preVerificationGas: "0x0",
        maxFeePerGas: toHex(maxFeePerGas),
        maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
        // Apply paymaster fields from the waterfall router (Route A = token, Route B/null = 0x)
        paymaster: paymasterRoute?.paymaster || "0x",
        paymasterVerificationGasLimit: paymasterRoute?.paymasterVerificationGasLimit || "0x",
        paymasterPostOpGasLimit: paymasterRoute?.paymasterPostOpGasLimit || "0x",
        paymasterData: paymasterRoute?.paymasterData || "0x",
        // This MUST be an 85-byte signature for the SessionKeyValidator
        signature: ethers.hexlify(ethers.concat([
            agentWallet.address,
            "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
        ]))
    };

    let usePaymaster = rpcUserOp.paymaster && rpcUserOp.paymaster !== "0x";
    let est;

    try {
        try {
            est = await estimateUserOperationGas(rpcUserOp, bundlerUrl);
        } catch (e) {
            if (usePaymaster) {
                console.warn("Paymaster estimation failed (possibly insufficient allowance/balance). Falling back to native gas.", e.message);
                usePaymaster = false;
                rpcUserOp.paymaster = "0x";
                rpcUserOp.paymasterVerificationGasLimit = "0x";
                rpcUserOp.paymasterPostOpGasLimit = "0x";
                rpcUserOp.paymasterData = "0x";
                // Retry estimation without paymaster
                est = await estimateUserOperationGas(rpcUserOp, bundlerUrl);
            } else {
                throw e; // Rethrow if native estimation fails
            }
        }
        
        if (usePaymaster) {
            // Apply buffers and minimums for paymaster approach
            let callGasWithMargin = (BigInt(est.callGasLimit) * 15n) / 10n;
            let vgfWithMargin = (BigInt(est.verificationGasLimit) * 15n) / 10n;
            let pvgWithMargin = (BigInt(est.preVerificationGas) * 15n) / 10n;

            if (callGasWithMargin < 500000n) callGasWithMargin = 500000n;
            if (vgfWithMargin < 500000n) vgfWithMargin = 500000n;

            rpcUserOp.callGasLimit = toHex(callGasWithMargin);
            rpcUserOp.verificationGasLimit = toHex(vgfWithMargin);
            rpcUserOp.preVerificationGas = toHex(pvgWithMargin);
        } else {
            // Normal native payment approach with no buffer and required gas fees only
            let nativeCallGas = BigInt(est.callGasLimit);
            let nativeVgf = BigInt(est.verificationGasLimit);
            let nativePvg = BigInt(est.preVerificationGas);

            // Bundlers often have strict floor rules, ensure we don't fall below them
            if (nativeVgf < 100000n) nativeVgf = 100000n;
            if (nativePvg < 50000n) nativePvg = 50000n;

            rpcUserOp.callGasLimit = toHex(nativeCallGas);
            rpcUserOp.verificationGasLimit = toHex(nativeVgf);
            rpcUserOp.preVerificationGas = toHex(nativePvg);
        }
    } catch (estErr) {
        console.error("Gas estimation failed:", estErr.message);
        throw new Error("Gas estimation failed: " + estErr.message);
    }

    const packedOp = packUserOp(rpcUserOp);
    const entryPoint = new ethers.Contract(
        entryPointAddress,
        ['function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)'],
        provider
    );
    const userOpHash = await entryPoint.getUserOpHash(packedOp);

    const rawSig = await agentWallet.signMessage(ethers.getBytes(userOpHash));
    
    // Pack the final 85-byte signature: [sessionKey(20)] + [sig(65)]
    const packedSignature = ethers.concat([ agentWallet.address, rawSig ]);
    rpcUserOp.signature = ethers.hexlify(packedSignature);

    try {
        const opHash = await sendUserOperation(rpcUserOp, bundlerUrl);
        return opHash;
    } catch (e) {
        if (usePaymaster && e.message && (e.message.includes("AA33") || e.message.toLowerCase().includes("paymaster"))) {
            console.warn("sendUserOperation failed with paymaster error. Falling back to native gas payment.", e.message);
            return await buildAndSendAgentOp(
                agentWallet,
                provider,
                smartAccountAddress,
                callData,
                entryPointAddress,
                validatorAddress,
                nonce,
                bundlerUrl,
                null // Force native path
            );
        }
        throw e;
    }
}
