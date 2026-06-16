import { WebAuthnP256 } from "ox";
import { ethers } from "ethers";
import { SmartAccountABI, IEntryPointABI } from "./abis";


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
 signer
) {
 // Encode qx + qy as bytes32 pair — matches WebAuthnValidator.sol's onInstall(data)
 const initData = ethers.AbiCoder.defaultAbiCoder().encode(
   ["bytes32", "bytes32"],
   [`0x${qx}`, `0x${qy}`]
 );


 // Direct EOA call — same as: account.installModule(1, validatorAddr, initData) in ProfileView
 const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, signer);
 const tx = await account.installModule(1, webAuthnValidatorAddr, initData);
 await tx.wait();


 return tx;
}


// Helper: check if WebAuthn validator is already installed
export async function isWebAuthnInstalled(smartAccountAddress, webAuthnValidatorAddr, provider) {
 const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);
 return account.isModuleInstalled(1, webAuthnValidatorAddr, "0x");
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
 // Sign the userOpHash with the passkey — browser prompts Touch ID / Face ID / PIN
 const { signature, metadata } = await WebAuthnP256.sign({
   challenge: userOpHash,   // the EntryPoint hash — becomes the WebAuthn challenge
   credentialId,
 });


 // Encode the full WebAuthn assertion — must match WebAuthnValidator.sol's abi.decode()
 // Layout: (bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authData, string clientDataJSON)
 const webAuthnSig = ethers.AbiCoder.defaultAbiCoder().encode(
   ["bytes32", "bytes32", "uint256", "uint256", "bytes", "string"],
   [
     `0x${signature.r.toString(16).padStart(64, "0")}`,
     `0x${signature.s.toString(16).padStart(64, "0")}`,
     BigInt(metadata.challengeIndex),
     BigInt(metadata.typeIndex),
     metadata.authenticatorData,
     metadata.clientDataJSON,
   ]
 );


 // Prepend the validator address (20 bytes) — Implementation.sol uses this to route to our validator
 // Same pattern as SessionKeyView: ethers.concat([validatorAddr, sessionKey, rawSig])
 return ethers.concat([validatorAddress, webAuthnSig]);
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


 const feeData = await provider.getFeeData();
 const verificationGasLimit = 1_000_000n; // High — P256 verification is expensive
 const callGasLimit = 300_000n;
 const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1_500_000_000n;
 const maxFeePerGas = feeData.maxFeePerGas || 5_000_000_000n;


 const accountGasLimits = ethers.concat([
   ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16),
   ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16),
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
   preVerificationGas: 100_000n,
   gasFees,
   paymasterAndData: "0x",
   signature: "0x", // placeholder — filled below
 };


 // Get hash → sign with passkey → pack signature
 const userOpHash = await entryPoint.getUserOpHash(userOp);
 userOp.signature = await signUserOpWithPasskey(userOpHash, credentialId, webAuthnValidatorAddr);


 // Submit to bundler (same RPC format as SessionKeyView)
 const BUNDLER_URL = env.BUNDLER_RPC || import.meta.env.VITE_SKANDHA_RPC_URL;
 if (!BUNDLER_URL) throw new Error("Missing bundler URL in env");


 const rpcUserOp = {
   sender: userOp.sender,
   nonce: ethers.toBeHex(userOp.nonce),
   callData: userOp.callData,
   callGasLimit: ethers.toBeHex(callGasLimit),
   verificationGasLimit: ethers.toBeHex(verificationGasLimit),
   preVerificationGas: ethers.toBeHex(100_000n),
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

