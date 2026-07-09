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

function getNonceForValidator(validatorAddress) {
    return BigInt(validatorAddress);
}

function encodeUniswapSwap(tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96) {
    // exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
    const swapRouterIface = new ethers.Interface([
        "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
    ]);
    
    return swapRouterIface.encodeFunctionData("exactInputSingle", [{
        tokenIn,
        tokenOut,
        fee,
        recipient,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96
    }]);
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
    
    let pimlicoPriority = 0n;
    let pimlicoMaxFee = 0n;
    
    let rpcUrl = process.env.BUNDLER_URL;

    try {
      const gasRes = await axios.post(rpcUrl, {
        jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: []
      });
      
      if (gasRes.data.result && gasRes.data.result.fast) {
        pimlicoPriority = BigInt(gasRes.data.result.fast.maxPriorityFeePerGas);
        pimlicoMaxFee = BigInt(gasRes.data.result.fast.maxFeePerGas);
      }
    } catch (e) {
      console.warn("Bundler gas fee fetch failed, relying on node fees");
    }
    
    maxPriorityFeePerGas = pimlicoPriority > chainPriority ? pimlicoPriority : chainPriority;
    maxFeePerGas = pimlicoMaxFee > chainMaxFee ? pimlicoMaxFee : chainMaxFee;
    
    maxPriorityFeePerGas = (maxPriorityFeePerGas * 11n) / 10n;
    maxFeePerGas = (maxFeePerGas * 11n) / 10n;
    
  } catch (e) {
    console.warn("Dynamic gas fetch failed completely, using fallbacks");
  }
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

async function estimateUserOperationGas(userOp) {
  let rpcUrl = process.env.BUNDLER_URL;
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
    if (est) {
      if (est.callGasLimit) est.callGasLimit = ((BigInt(est.callGasLimit) * 120n) / 100n).toString();
      if (est.verificationGasLimit) est.verificationGasLimit = ((BigInt(est.verificationGasLimit) * 150n) / 100n).toString();
      if (est.preVerificationGas) est.preVerificationGas = (BigInt(est.preVerificationGas) + 5000n).toString();
    }
    return est;
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

async function sendUserOperation(userOp) {
  let rpcUrl = process.env.BUNDLER_URL;
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

module.exports = {
  toHex,
  packUserOp,
  encodeERC7579Single,
  getNonceForValidator,
  encodeUniswapSwap,
  encodeERC20Transfer,
  getDynamicGasFees,
  estimateUserOperationGas,
  sendUserOperation
};
