import { ethers } from 'ethers';
import { sendUserOperation, estimateUserOperationGas, getDynamicGasFees } from './bundler';

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
    const EXEC_MODE_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const executionCalldata = ethers.concat([
        target,
        ethers.zeroPadValue(ethers.toBeHex(value), 32),
        callData
    ]);
    const nexusIface = new ethers.Interface(["function execute(bytes32 mode, bytes calldata executionCalldata)"]);
    return nexusIface.encodeFunctionData("execute", [EXEC_MODE_DEFAULT, executionCalldata]);
}

export function encodeERC7579Batch(targets, values, callDatas) {
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

export function getNonceForValidator(validatorAddress) {
    // Nexus nonce key layout: [3 bytes empty][1 byte mode][20 bytes validator]
    // For default execution mode (0x00), the key is exactly the validator address.
    return BigInt(validatorAddress);
}

export async function buildAndSendAccountOp(
  signer, 
  provider, 
  smartAccountAddress, 
  callData, 
  entryPointAddress, 
  validatorAddress
) {
    const entryPoint = new ethers.Contract(
      entryPointAddress, 
      [
        "function getNonce(address sender, uint192 key) view returns (uint256)", 
        "function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)) view returns (bytes32)"
      ], 
      provider
    );
    
    let nonce;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        nonce = await entryPoint.getNonce(smartAccountAddress, getNonceForValidator(validatorAddress, 0));
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

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
        paymaster: "0x",
        paymasterVerificationGasLimit: "0x",
        paymasterPostOpGasLimit: "0x",
        paymasterData: "0x",
        // This MUST be a mathematically valid ECDSA signature, otherwise ECDSA.recover reverts!
        signature: "0xb4a4a8d05903b41bf3ec2f1fbf2a2753a80db61b8f041498801ceb3252a1baea26e3863a35bce34c1184d0ef620e7f78083c27e8a93e36eab0f2bc0da26427a11c",
    };

    try {
        const est = await estimateUserOperationGas(rpcUserOp);
        
        // Add a 20% margin to all gas limits to prevent execution reverts due to minor state fluctuations
        const callGasWithMargin = (BigInt(est.callGasLimit) * 12n) / 10n;
        const vgfWithMargin = (BigInt(est.verificationGasLimit) * 12n) / 10n;
        const pvgWithMargin = (BigInt(est.preVerificationGas) * 12n) / 10n;

        rpcUserOp.callGasLimit = toHex(callGasWithMargin);
        rpcUserOp.verificationGasLimit = toHex(vgfWithMargin);
        rpcUserOp.preVerificationGas = toHex(pvgWithMargin);
    } catch (estErr) {
        console.error("Gas estimation failed:", estErr.message);
        throw new Error("Gas estimation failed: " + estErr.message);
    }

    const packedOp = packUserOp(rpcUserOp);
    const userOpHash = await entryPoint.getUserOpHash(packedOp);

    const rawSig = await signer.signMessage(ethers.getBytes(userOpHash));
    rpcUserOp.signature = rawSig;

    const opHash = await sendUserOperation(rpcUserOp);
    return opHash;
}

export async function getPrevValidator(accountAddr, targetValidator, provider) {
    try {
        const abi = ["function getValidatorsPaginated(address cursor, uint256 size) view returns (address[] memory array, address next)"];
        const account = new ethers.Contract(accountAddr, abi, provider);
        const res = await account.getValidatorsPaginated("0x0000000000000000000000000000000000000001", 100);
        const validators = res[0];
        let prev = "0x0000000000000000000000000000000000000001";
        for (let v of validators) {
            if (v.toLowerCase() === targetValidator.toLowerCase()) return prev;
            prev = v;
        }
        return prev;
    } catch(e) {
        console.warn("Failed to get prev validator, defaulting to SENTINEL", e);
        return "0x0000000000000000000000000000000000000001";
    }
}

/**
 * Fetches all installed validator modules from the smart account using
 * getValidatorsPaginated (one call per page), then compares the results
 * against known module addresses from the env config.
 *
 * Returns an object: { hasSessionKey, hasSocialRecovery, hasWebAuthn, rawValidators }
 * Store this in AppContext so all views read from it without individual isModuleInstalled() calls.
 */
export async function getInstalledModules(smartAccountAddress, provider, env) {
    const SENTINEL = "0x0000000000000000000000000000000000000001";
    const abi = ["function getValidatorsPaginated(address cursor, uint256 size) view returns (address[] memory array, address next)"];
    const account = new ethers.Contract(smartAccountAddress, abi, provider);

    let allValidators = [];
    let cursor = SENTINEL;
    const PAGE_SIZE = 10;

    try {
        while (true) {
            const [page, next] = await account.getValidatorsPaginated(cursor, PAGE_SIZE);
            allValidators.push(...page);
            // When next == SENTINEL we have fetched every page
            if (next.toLowerCase() === SENTINEL.toLowerCase()) break;
            cursor = next;
        }
    } catch (e) {
        console.warn("getValidatorsPaginated failed:", e);
        return { hasSessionKey: false, hasSocialRecovery: false, hasWebAuthn: false, rawValidators: [] };
    }

    const lower = (addr) => (addr || "").toLowerCase();

    return {
        hasSessionKey:     allValidators.some(v => lower(v) === lower(env.SESSION_KEY_VALIDATOR)),
        hasSocialRecovery: allValidators.some(v => lower(v) === lower(env.SOCIAL_RECOVERY_VALIDATOR)),
        hasWebAuthn:       allValidators.some(v => lower(v) === lower(env.WEBAUTHN_VALIDATOR)),
        rawValidators:     allValidators,
    };
}

/**
 * Fetches the list of active session key addresses directly from the contract.
 * Then fetches the full details for each key from the sessionKeys mapping.
 * No event log scanning needed.
 */
export async function getActiveSessionKeysOnChain(validatorAddr, smartAccountAddress, provider) {
    const abi = [
        "function getActiveSessionKeys(address smartAccount) external view returns (address[] memory)",
        "function sessionKeys(address sessionKey, address smartAccount) view returns (address target, bytes4 selector, uint256 maxValue, uint48 validAfter, uint48 validUntil, bool enabled, uint256 maxUses, uint256 uses)"
    ];
    try {
        const skValidator = new ethers.Contract(validatorAddr, abi, provider);
        const keyAddresses = await skValidator.getActiveSessionKeys(smartAccountAddress);

        const activeKeys = [];
        for (const keyAddr of keyAddresses) {
            try {
                const skData = await skValidator.sessionKeys(keyAddr, smartAccountAddress);
                if (skData.enabled) {
                    activeKeys.push({
                        address: keyAddr,
                        target: skData.target,
                        selector: skData.selector,
                        maxValue: ethers.formatEther(skData.maxValue),
                        validUntil: Number(skData.validUntil),
                        validAfter: Number(skData.validAfter),
                        maxUses: Number(skData.maxUses),
                        uses: Number(skData.uses),
                    });
                }
            } catch (e) {
                console.warn("Failed to fetch details for session key:", keyAddr, e);
            }
        }
        return activeKeys;
    } catch (e) {
        console.error("getActiveSessionKeysOnChain failed:", e);
        return [];
    }
}

