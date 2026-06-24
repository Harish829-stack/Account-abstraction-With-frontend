import { WebAuthnP256 } from "ox";
import { ethers } from "ethers";
import { SmartAccountABI, IEntryPointABI } from "./abis";
import { getDynamicGasFees } from "./bundler";
import { encodeERC7579Single, buildAndSendAccountOp } from "./helpers";


const STORAGE_KEY = "webauthn_credential";


// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — REGISTER PASSKEY
// Call this when the user first sets up their account.
// It uses the browser's built-in WebAuthn API (via ox's WebAuthnP256 helper)
// to create a passkey (biometric/hardware key) and stores the credential in
// localStorage so we can use it for future signing.
// ─────────────────────────────────────────────────────────────────────────────
export async function registerPasskey(username) {
 const credential = await WebAuthnP256.createCredential({ name: username });


 // P256 public key — these go into the smart contract as the signer
 const qx = credential.publicKey.x.toString(16).padStart(64, "0");
 const qy = credential.publicKey.y.toString(16).padStart(64, "0");


 // Persist to localStorage (same pattern as session_burner_key in SessionKeyView)
 localStorage.setItem(STORAGE_KEY, JSON.stringify({
   id: credential.id,       // credential ID — needed for signing later
   publicKey: { qx, qy },  // P256 public key — needed for installModule
 }));


 return { credential, qx, qy };
}


// Helper: load saved credential from localStorage
export function loadPasskeyCredential() {
 const raw = localStorage.getItem(STORAGE_KEY);
 return raw ? JSON.parse(raw) : null;
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — INSTALL THE WEBAUTHN VALIDATOR MODULE
//
// This is a DIRECT EOA transaction — exactly like ProfileView's handleInstallRecovery().
// Your MetaMask/EOA wallet signs it and pays gas. No UserOp, no bundler needed.
//
// Parameters:
//   smartAccountAddress  — your deployed smart account (proxy)
//   webAuthnValidatorAddr — deployed WebAuthnValidator.sol address
//   qx, qy              — hex strings of the P256 public key from registerPasskey()
//   signer              — ethers.js signer from AppContext (your EOA wallet)
// ─────────────────────────────────────────────────────────────────────────────
export async function installWebAuthnValidator(
 smartAccountAddress,
 webAuthnValidatorAddr,
 qx,
 qy,
 signer,
 k1ValidatorAddr
) {
 const initData = ethers.AbiCoder.defaultAbiCoder().encode(
   ["bytes32", "bytes32"],
   [`0x${qx}`, `0x${qy}`]
 );

  const provider = signer.provider;
  const entryPoint = import.meta.env.VITE_ENTRY_POINT;

  const accountIface = new ethers.Interface(SmartAccountABI);
  const innerCallData = accountIface.encodeFunctionData("installModule", [1, webAuthnValidatorAddr, initData]);
  const callData = encodeERC7579Single(smartAccountAddress, 0n, innerCallData);

  const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, entryPoint, k1ValidatorAddr);

  return opHash;
}


// Helper: check if WebAuthn validator is already installed
export async function isWebAuthnInstalled(smartAccountAddress, webAuthnValidatorAddr, provider) {
 const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
 return account.isModuleInstalled(1, webAuthnValidatorAddr, "0x");
}


// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC: Compare on-chain stored public key vs locally saved credential
// Returns { match, onChain: {qx, qy}, local: {qx, qy} }
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyPublicKeyMatch(smartAccountAddress, webAuthnValidatorAddr, provider) {
  const validatorABI = [
    "function pubKeyX(address) view returns (bytes32)",
    "function pubKeyY(address) view returns (bytes32)",
  ];
  const validator = new ethers.Contract(webAuthnValidatorAddr, validatorABI, provider);
  const [onChainQx, onChainQy] = await Promise.all([
    validator.pubKeyX(smartAccountAddress),
    validator.pubKeyY(smartAccountAddress),
  ]);

  const local = loadPasskeyCredential();
  const localQx = local ? `0x${local.publicKey.qx}` : null;
  const localQy = local ? `0x${local.publicKey.qy}` : null;

  const match = (
    onChainQx.toLowerCase() === localQx?.toLowerCase() &&
    onChainQy.toLowerCase() === localQy?.toLowerCase()
  );

  return {
    match,
    onChain: { qx: onChainQx, qy: onChainQy },
    local: { qx: localQx, qy: localQy },
  };
}



// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — SIGN A USEROP WITH THE PASSKEY
//
// After installation, use this to sign any UserOperation with your passkey
// instead of your EOA. The browser will prompt biometric authentication.
//
// Parameters:
//   userOpHash      — bytes32 hash from entryPoint.getUserOpHash(userOp)
//   credentialId    — from loadPasskeyCredential().id
//   validatorAddress — WebAuthnValidator contract address
//
// Returns: packed bytes ready to set as userOp.signature
// ─────────────────────────────────────────────────────────────────────────────
export async function signUserOpWithPasskey(userOpHash, credentialId, validatorAddress) {
  const { signature, metadata } = await WebAuthnP256.sign({
    challenge: userOpHash,
    credentialId,
    userVerification: "required",
  });



  // OpenZeppelin P256 requires s <= N/2 to prevent signature malleability
  const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const HALF_N = N / 2n;
  let r = signature.r;
  let s = signature.s;
  if (s > HALF_N) {
    s = N - s;
  }

  // Encode the full WebAuthn assertion — must match WebAuthnValidator.sol's abi.decode()
  // Layout: (bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authData, string clientDataJSON)
  const webAuthnSig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "uint256", "uint256", "bytes", "string"],
    [
      `0x${r.toString(16).padStart(64, "0")}`,
      `0x${s.toString(16).padStart(64, "0")}`,
      BigInt(metadata.challengeIndex),
      BigInt(metadata.typeIndex),
      metadata.authenticatorData,
      metadata.clientDataJSON,
    ]
  );


 // In Nexus, the validator address is put in the nonce key, NOT in the signature prefix!
 // So we must return ONLY the raw ABI-encoded webAuthn assertion.
 return webAuthnSig;
}


// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: Send a full UserOp signed by passkey
// Mirrors handleExecuteSession() in SessionKeyView.jsx — builds + signs + submits
//
// Parameters:
//   smartAccountAddress   — the smart account address
//   callData              — encoded calldata for the operation (e.g. execute(...))
//   webAuthnValidatorAddr — deployed WebAuthnValidator address
//   credentialId          — from loadPasskeyCredential().id
//   env                   — AppContext env (ENTRY_POINT, BUNDLER_RPC, etc.)
//   provider              — ethers.js provider from AppContext
// ─────────────────────────────────────────────────────────────────────────────
export async function sendUserOpWithPasskey({
 smartAccountAddress,
 callData,
 webAuthnValidatorAddr,
 credentialId,
 env,
 provider,
}) {
 const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);

 const BUNDLER_URL = env.BUNDLER_RPC || import.meta.env.VITE_SKANDHA_RPC_URL;

 const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

 const accountGasLimits = ethers.concat([
   ethers.zeroPadValue(ethers.toBeHex(0), 16),
   ethers.zeroPadValue(ethers.toBeHex(0), 16),
 ]);


 const gasFees = ethers.concat([
   ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16),
   ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16),
 ]);


 const nonce = await entryPoint.getNonce(smartAccountAddress, 0);


 const userOp = {
   sender: smartAccountAddress,
   nonce,
   initCode: "0x",
   callData,
   accountGasLimits,
   preVerificationGas: "0x0",
   gasFees,
   paymasterAndData: "0x",
   signature: "0x", // placeholder — filled below
 };


 // Get hash → sign with passkey → pack signature
 const userOpHash = await entryPoint.getUserOpHash(userOp);
 userOp.signature = await signUserOpWithPasskey(userOpHash, credentialId, webAuthnValidatorAddr);


 // Submit to bundler (same RPC format as SessionKeyView)

 if (!BUNDLER_URL) throw new Error("Missing bundler URL in env");


 const rpcUserOp = {
   sender: userOp.sender,
   nonce: ethers.toBeHex(userOp.nonce),
   callData: userOp.callData,
   callGasLimit: "0x0",
   verificationGasLimit: "0x0",
   preVerificationGas: "0x0",
   maxFeePerGas: ethers.toBeHex(maxFeePerGas),
   maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
   signature: ethers.hexlify(userOp.signature),
 };


 const response = await fetch(BUNDLER_URL, {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({
     jsonrpc: "2.0",
     id: 1,
     method: "eth_sendUserOperation",
     params: [rpcUserOp, env.ENTRY_POINT],
   }),
 });


 const data = await response.json();
 if (data.error) throw new Error("Bundler rejected: " + (data.error.message || JSON.stringify(data.error)));


 return data.result; // userOpHash from bundler
}

