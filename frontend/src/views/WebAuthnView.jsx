import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { Fingerprint, ShieldCheck, Zap, Settings, ChevronRight, XCircle, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import { SmartAccountABI, IEntryPointABI } from '../utils/abis';
import {
  registerPasskey,
  loadPasskeyCredential,
  installWebAuthnValidator,
  isWebAuthnInstalled,
  signUserOpWithPasskey,
  verifyPublicKeyMatch,
} from '../utils/webauthn';
import { getDynamicGasFees, estimateUserOperationGas } from '../utils/bundler';
import { packUserOp, toHex, shortenAddress, buildAndSendAccountOp, encodeERC7579Single, getNonceForValidator } from '../utils/helpers';


export default function WebAuthnView() {
 const { eoaAddress, smartAccountAddress, signer, provider, env, setGlobalLoading, trackOp, chainId, isAmoy } = useAppContext();
 const toast = useToast();


 // ── Panel toggle ──
 const [showPanel, setShowPanel] = useState(false);
 const [activeTab, setActiveTab] = useState('setup'); // 'setup' | 'sign'


 // ── Module status ──
 const [isInstalled, setIsInstalled] = useState(false);
 const [checkingStatus, setCheckingStatus] = useState(true);


 // ── Passkey credential (from localStorage) ──
 const [savedCredential, setSavedCredential] = useState(null);


 // ── Setup form ──
 const [username, setUsername] = useState('');
 const [validatorAddr, setValidatorAddr] = useState(env.WEBAUTHN_VALIDATOR || "");

 useEffect(() => {
   setValidatorAddr(env.WEBAUTHN_VALIDATOR || "");
 }, [env.WEBAUTHN_VALIDATOR]);
 const [registering, setRegistering] = useState(false);
 const [installing, setInstalling] = useState(false);


 // ── Sign/Send form ──
 const [execTarget, setExecTarget] = useState('');
 const [execValue, setExecValue] = useState('0');
 const [execData, setExecData] = useState('0x');
 const [sending, setSending] = useState(false);


 // ─────────────────────────────────────────────────────────────────
 // Load credential + check module status
 // ─────────────────────────────────────────────────────────────────
 const refreshStatus = async () => {
   setSavedCredential(loadPasskeyCredential());


   if (!smartAccountAddress || !provider || !validatorAddr || validatorAddr === ethers.ZeroAddress) {
     setCheckingStatus(false);
     return;
   }
   setCheckingStatus(true);
   try {
     const installed = await isWebAuthnInstalled(smartAccountAddress, validatorAddr, provider);
     setIsInstalled(installed);
   } catch {
     setIsInstalled(false);
   } finally {
     setCheckingStatus(false);
   }
 };


 useEffect(() => {
   refreshStatus();
 }, [smartAccountAddress, provider, validatorAddr]);


 // ─────────────────────────────────────────────────────────────────
 // STEP 1 — Register Passkey
 // ─────────────────────────────────────────────────────────────────
 const handleRegister = async () => {
   if (!username.trim()) {
     toast.error('Please enter a username for your passkey.');
     return;
   }
   setRegistering(true);
   setGlobalLoading(true, 'Waiting for biometric prompt...');
   try {
     const { qx, qy } = await registerPasskey(username.trim());
     setSavedCredential(loadPasskeyCredential());
     toast.success(`Passkey registered! Public key saved. (qx: 0x${qx.slice(0, 8)}...)`);
   } catch (err) {
     console.error(err);
     toast.error(err.message || 'Passkey registration failed. Make sure your device supports WebAuthn.');
   } finally {
     setRegistering(false);
     setGlobalLoading(false);
   }
 };


 // ─────────────────────────────────────────────────────────────────
 // STEP 2 — Install Validator Module (direct EOA tx — same as ProfileView)
 // ─────────────────────────────────────────────────────────────────
 const handleInstall = async () => {
   if (!smartAccountAddress || !signer) {
     toast.error('Connect a smart account first.');
     return;
   }
   if (!savedCredential) {
     toast.error('Register a passkey first (Step 1).');
     return;
   }
   if (!validatorAddr || !ethers.isAddress(validatorAddr)) {
     toast.error('Enter a valid WebAuthn Validator contract address.');
     return;
   }


   const { qx, qy } = savedCredential.publicKey;
   setInstalling(true);
   setGlobalLoading(true, 'Installing WebAuthn Validator Module...');
   try {
     await installWebAuthnValidator(smartAccountAddress, validatorAddr, qx, qy, signer, env.K1_VALIDATOR);
     toast.success('WebAuthn Validator installed! Your smart account can now be controlled by your passkey.');
     await refreshStatus();
   } catch (err) {
     console.error(err);
     toast.error(err.reason || err.message || 'Installation failed.');
   } finally {
     setInstalling(false);
     setGlobalLoading(false);
   }
 };

 const handleUninstall = async () => {
    if (!smartAccountAddress || !signer || !validatorAddr) return;
    setInstalling(true);
    setGlobalLoading(true, 'Uninstalling WebAuthn Validator Module...');
    try {
      const accountIface = new ethers.Interface(SmartAccountABI);
      const innerCallData = accountIface.encodeFunctionData("uninstallModule", [1, validatorAddr, "0x"]);
      const callData = encodeERC7579Single(smartAccountAddress, 0n, innerCallData);

      const opHash = await buildAndSendAccountOp(signer, provider, smartAccountAddress, callData, env.ENTRY_POINT, env.K1_VALIDATOR);
      
      toast.success(`WebAuthn Validator uninstalled! OpHash: ${shortenAddress(opHash)}`);
      await refreshStatus();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || 'Uninstallation failed.');
    } finally {
      setInstalling(false);
      setGlobalLoading(false);
    }
  };


 // ─────────────────────────────────────────────────────────────────
 // STEP 3 — Send UserOp signed by passkey (biometric — no MetaMask)
 // ─────────────────────────────────────────────────────────────────
 const handleSendWithPasskey = async () => {
   if (!smartAccountAddress || !provider) {
     toast.error('Connect a smart account first.');
     return;
   }
   if (!savedCredential) {
     toast.error('No passkey found in this browser. Register one first.');
     return;
   }
   if (!isInstalled) {
     toast.error('Install the WebAuthn Validator module first.');
     return;
   }
   if (!execTarget || !ethers.isAddress(execTarget)) {
     toast.error('Enter a valid target address.');
     return;
   }

   // ── CRITICAL: Verify on-chain key matches local passkey before building UserOp ──
   try {
     const keyCheck = await verifyPublicKeyMatch(smartAccountAddress, validatorAddr, provider);
     if (!keyCheck.match) {
       console.error('[WebAuthn] Public key mismatch!', { onChain: keyCheck.onChain, local: keyCheck.local });
       toast.error(
         `Key mismatch! Your browser passkey doesn't match what's installed on-chain. ` +
         `Go to Setup → Uninstall → Register Passkey again → Install Module.`,
         { duration: 10000 }
       );
       return;
     }
   } catch (checkErr) {
     console.warn('[WebAuthn] Key check failed, proceeding anyway:', checkErr.message);
   }

   setSending(true);
   setGlobalLoading(true, 'Waiting for biometric sign...');

   try {
     const entryPoint = new ethers.Contract(env.ENTRY_POINT, IEntryPointABI, provider);
     const account = new ethers.Contract(smartAccountAddress, SmartAccountABI, provider);


     // Build callData using ERC-7579 format
     const value = ethers.parseEther(execValue || '0');
     const callData = encodeERC7579Single(execTarget, value, execData || '0x');


     // Build UserOp
     const { maxPriorityFeePerGas, maxFeePerGas } = await getDynamicGasFees(provider);

     let BUNDLER_URL = import.meta.env.VITE_SKANDHA_RPC_URL;
     if (isAmoy) {
       if (import.meta.env.VITE_PIMLICO_BUNDLER_URL) {
         BUNDLER_URL = import.meta.env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
       } else if (BUNDLER_URL) {
         BUNDLER_URL = BUNDLER_URL.replace("11155111", "80002");
       }
     }
     const nonce = await entryPoint.getNonce(smartAccountAddress, getNonceForValidator(validatorAddr));

     const unpackedUserOp = {
       sender: smartAccountAddress,
       nonce: toHex(nonce),
       factory: "0x",
       factoryData: "0x",
       callData: callData,
       callGasLimit: "0x0",
       verificationGasLimit: "0x0",
       preVerificationGas: "0x0",
       maxFeePerGas: toHex(maxFeePerGas),
       maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
       paymaster: "0x",
       paymasterVerificationGasLimit: "0x",
       paymasterPostOpGasLimit: "0x",
       paymasterData: "0x",
       signature: ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256", "uint256", "bytes", "string"],
        [
          0n, 0n, 0n, 0n,
          "0x00000000000000000000000000000000000000000000000000000000000000000000000000",
          '{"type":"webauthn.get","challenge":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","origin":"http://localhost:5173","crossOrigin":false}'
        ]
       )
     };

     try {
       const est = await estimateUserOperationGas(unpackedUserOp);
       
       const callGasWithMargin = (BigInt(est.callGasLimit) * 12n) / 10n;
       const vgfWithMargin = (BigInt(est.verificationGasLimit) * 12n) / 10n;
       const pvgWithMargin = (BigInt(est.preVerificationGas) * 12n) / 10n;

       unpackedUserOp.callGasLimit = toHex(callGasWithMargin);
       unpackedUserOp.verificationGasLimit = toHex(vgfWithMargin);
       unpackedUserOp.preVerificationGas = toHex(pvgWithMargin);
     } catch (err) {
       console.warn("WebAuthn estimation failed, using fallbacks:", err);
       unpackedUserOp.callGasLimit = toHex(200000);
       unpackedUserOp.verificationGasLimit = toHex(250000);
       unpackedUserOp.preVerificationGas = toHex(50000);
     }

     const packedOp = packUserOp(unpackedUserOp);

     // Get hash → sign with passkey (triggers biometric)
     const userOpHash = await entryPoint.getUserOpHash(packedOp);

     setGlobalLoading(true, 'Biometric authentication prompt...');
     const rawSignature = await signUserOpWithPasskey(
       userOpHash,
       savedCredential.id,
       validatorAddr
     );
     
     // Update both formats with signature
     unpackedUserOp.signature = rawSignature;
     packedOp.signature = rawSignature;

     setGlobalLoading(true, 'Submitting to bundler...');

     if (!BUNDLER_URL) throw new Error('Missing VITE_SKANDHA_RPC_URL in .env');

     // Pimlico v0.7 bundler expects unpacked fields
     const rpcUserOp = {
       sender: unpackedUserOp.sender,
       nonce: unpackedUserOp.nonce,
       callData: unpackedUserOp.callData,
       callGasLimit: unpackedUserOp.callGasLimit,
       verificationGasLimit: unpackedUserOp.verificationGasLimit,
       preVerificationGas: unpackedUserOp.preVerificationGas,
       maxFeePerGas: unpackedUserOp.maxFeePerGas,
       maxPriorityFeePerGas: unpackedUserOp.maxPriorityFeePerGas,
       signature: unpackedUserOp.signature,
     };


     const response = await fetch(BUNDLER_URL, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         jsonrpc: '2.0', id: 1,
         method: 'eth_sendUserOperation',
         params: [rpcUserOp, env.ENTRY_POINT],
       }),
     });


     const result = await response.json();
     if (result.error) throw new Error('Bundler rejected: ' + (result.error.message || JSON.stringify(result.error)));


     const opHash = result.result;
     trackOp(opHash, 'WebAuthn UserOp');
     toast.success(`Submitted via passkey! OpHash: ${opHash.slice(0, 12)}...`);
   } catch (err) {
     console.error(err);
     toast.error(err.message || 'Failed to send UserOp with passkey.');
   } finally {
     setSending(false);
     setGlobalLoading(false);
   }
 };


 // ─────────────────────────────────────────────────────────────────
 // RENDER
 // ─────────────────────────────────────────────────────────────────


 const StatusBadge = () => {
   if (checkingStatus) return <span className="text-xs text-slate-400">Checking status...</span>;
   if (!validatorAddr || validatorAddr === ethers.ZeroAddress)
     return <span className="text-xs text-amber-400">⚠ Enter validator address</span>;
   return isInstalled
     ? <span className="text-xs text-purple-400 font-medium flex items-center gap-1"><CheckCircle size={12} /> Module Active</span>
     : <span className="text-xs text-slate-400">Module Not Installed</span>;
 };


 return (
   <div className="flex flex-col gap-6 w-full animate-fade-in mt-6">


     {/* ── Entry Card (collapsed state) ── */}
     {!showPanel && (
       <button
         className="glass-card flex items-center justify-between hover:bg-white/5 transition-all cursor-pointer group border border-purple-500/20 shadow-xl hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] bg-gradient-to-r from-black/60 to-purple-950/20"
         onClick={() => setShowPanel(true)}
       >
         <div className="flex items-center gap-4">
           <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400 group-hover:bg-purple-500/20 group-hover:scale-110 transition-all border border-purple-500/10">
             <Fingerprint size={32} />
           </div>
           <div className="text-left">
             <h2 className="text-xl font-bold m-0 text-slate-100 group-hover:text-purple-400 transition-colors">
               WebAuthn Passkey
             </h2>
             <p className="text-sm text-slate-400 m-0 group-hover:text-slate-300">
               Control your smart account with biometric authentication — no private keys.
             </p>
           </div>
         </div>
         <ChevronRight className="text-slate-500 group-hover:text-purple-400 transition-colors" size={24} />
       </button>
     )}


     {/* ── Expanded Panel ── */}
     {showPanel && (
       <div className="glass-card border border-purple-500/30 flex flex-col gap-6 shadow-[0_0_50px_rgba(168,85,247,0.1)] relative overflow-hidden animate-slide-up bg-gradient-to-b from-black/80 to-slate-900/90">


         {/* Glow orb */}
         <div className="absolute top-0 right-0 w-72 h-72 bg-purple-500/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />


         {/* Header */}
         <div className="flex items-center justify-between z-10 border-b border-purple-500/20 pb-4">
           <div className="flex items-center gap-3">
             <Fingerprint className="text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" size={28} />
             <div>
               <h2 className="text-xl font-bold m-0 bg-gradient-to-r from-purple-400 to-pink-300 bg-clip-text text-transparent drop-shadow-sm">
                 WebAuthn Passkey
               </h2>
               <p className="text-sm text-purple-400/70 m-0 font-medium">
                 <StatusBadge />
               </p>
             </div>
           </div>
           <button
             onClick={() => setShowPanel(false)}
             className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-all"
           >
             <XCircle size={20} />
           </button>
         </div>


         {/* ── Passkey Credential Status Banner ── */}
         <div className={`z-10 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
           savedCredential
             ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
             : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
         }`}>
           {savedCredential ? (
             <>
               <ShieldCheck size={18} className="shrink-0 text-purple-400" />
               <span>
                 Passkey found in this browser.&nbsp;
                 <span className="opacity-70 font-normal">
                   ID: {savedCredential.id.slice(0, 16)}... &nbsp;|&nbsp;
                   qx: 0x{savedCredential.publicKey.qx.slice(0, 12)}...
                 </span>
               </span>
             </>
           ) : (
             <>
               <AlertTriangle size={18} className="shrink-0 text-amber-400" />
               <span>No passkey registered in this browser. Complete Step 1 below.</span>
             </>
           )}
         </div>


         {/* ── Tab Bar ── */}
         <div className="z-10 flex bg-black/60 rounded-lg border border-purple-500/20 p-1.5 gap-1.5 overflow-x-auto no-scrollbar">
           <button
             className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${
               activeTab === 'setup'
                 ? 'bg-gradient-to-r from-purple-500 to-pink-400 text-black shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                 : 'text-purple-400/70 hover:text-purple-300 hover:bg-purple-500/10'
             }`}
             onClick={() => setActiveTab('setup')}
           >
             <Settings size={15} /> Setup
           </button>
           <button
             className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all flex items-center gap-2 ${
               activeTab === 'sign'
                 ? 'bg-gradient-to-r from-indigo-500 to-blue-400 text-black shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                 : 'text-purple-400/70 hover:text-purple-300 hover:bg-purple-500/10'
             }`}
             onClick={() => setActiveTab('sign')}
           >
             <Zap size={15} /> Send with Passkey
           </button>
         </div>


         {/* ── Tab Content ── */}
         <div className="z-10 p-6 bg-black/40 rounded-xl border border-purple-500/10 min-h-[280px]">


           {/* ── SETUP TAB ── */}
           {activeTab === 'setup' && (
             <div className="flex flex-col gap-6 animate-fade-in">
               <div>
                 <h3 className="text-lg font-bold text-purple-400 drop-shadow-sm">Setup Passkey Authentication</h3>
                 <p className="text-xs text-purple-100/50 mt-1">
                   Register a passkey and install the validator module to your smart account.
                 </p>
               </div>


               {/* Validator Address */}
               <div>
                 <label className="text-xs text-slate-400 mb-1 block">WebAuthn Validator Contract Address</label>
                 <input
                   type="text"
                   className="input-field bg-slate-900/50 border-purple-500/20 text-slate-200 text-sm focus:border-purple-500"
                   placeholder="0x..."
                   value={validatorAddr}
                   onChange={(e) => setValidatorAddr(e.target.value)}
                 />
                 <p className="text-xs text-slate-500 mt-1">
                   Deploy <code className="text-purple-400">WebAuthnValidator.sol</code> and paste its address here.
                 </p>
               </div>


               {/* Step 1 — Register Passkey */}
               <div className="flex flex-col gap-3 p-4 rounded-xl border border-purple-500/20 bg-purple-950/20">
                 <div className="flex items-center gap-2">
                   <span className="w-6 h-6 rounded-full bg-purple-500 text-black text-xs font-black flex items-center justify-center shrink-0">1</span>
                   <h4 className="text-sm font-bold text-purple-300 m-0">Register Passkey (Browser)</h4>
                 </div>
                 <p className="text-xs text-slate-400 -mt-1">
                   Creates a P256 keypair using your device's biometric (Touch ID / Face ID / PIN). Stored locally — never leaves your device.
                 </p>
                 <input
                   type="text"
                   className="input-field bg-slate-900/50 border-purple-500/20 text-slate-200 text-sm focus:border-purple-500"
                   placeholder="Username (e.g. alice@myapp)"
                   value={username}
                   onChange={(e) => setUsername(e.target.value)}
                 />
                 <button
                   className="w-full py-2.5 rounded-lg font-bold text-black bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-400 hover:to-pink-300 shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all flex items-center justify-center gap-2 border-none disabled:opacity-50"
                   onClick={handleRegister}
                   disabled={registering}
                 >
                   {registering ? <Loader size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                   {registering ? 'Waiting for device...' : (savedCredential ? 'Re-Register Passkey' : 'Register Passkey')}
                 </button>
               </div>


               {/* Step 2 — Install Module */}
               <div className={`flex flex-col gap-3 p-4 rounded-xl border transition-all ${
                 savedCredential
                   ? 'border-purple-500/30 bg-purple-950/20'
                   : 'border-slate-700/30 bg-slate-900/20 opacity-50 pointer-events-none'
               }`}>
                 <div className="flex items-center gap-2">
                   <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${
                     savedCredential ? 'bg-purple-500 text-black' : 'bg-slate-600 text-slate-400'
                   }`}>2</span>
                   <h4 className="text-sm font-bold text-purple-300 m-0">Install/Uninstall Validator Module</h4>
                 </div>
                 <p className="text-xs text-slate-400 -mt-1">
                   Registers the passkey's P256 public key on-chain. MetaMask will ask you to sign <em>one transaction</em>. After this, MetaMask is no longer needed.
                 </p>


                 {savedCredential && (
                   <div className="text-xs font-mono bg-black/40 border border-purple-500/20 rounded-lg p-3 text-purple-300 break-all">
                     <span className="text-slate-500">qx: </span>0x{savedCredential.publicKey.qx}<br />
                     <span className="text-slate-500">qy: </span>0x{savedCredential.publicKey.qy}
                   </div>
                 )}


                 <button
                   className="w-full py-2.5 rounded-lg font-bold text-black bg-gradient-to-r from-purple-500 to-pink-400 hover:from-purple-400 hover:to-pink-300 shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all flex items-center justify-center gap-2 border-none disabled:opacity-50"
                   onClick={handleInstall}
                   disabled={installing || !savedCredential || isInstalled}
                 >
                   {installing ? <Loader size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                   {isInstalled
                     ? '✓ Module Already Installed'
                     : installing
                       ? 'Installing...'
                       : 'Install Module (MetaMask signs once)'}
                 </button>
                 {isInstalled && (
                   <button
                     className="w-full py-2.5 rounded-lg font-bold text-white bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 transition-all flex items-center justify-center gap-2"
                     onClick={handleUninstall}
                     disabled={installing}
                   >
                     Uninstall Module (Reset Passkey)
                   </button>
                 )}
               </div>


               {/* Success state */}
               {isInstalled && (
                 <div className="flex items-center gap-3 p-4 bg-purple-950/40 border border-purple-500/30 rounded-xl">
                   <CheckCircle size={20} className="text-purple-400 shrink-0" />
                   <div>
                     <p className="text-sm font-bold text-purple-300 m-0">Passkey Active!</p>
                     <p className="text-xs text-purple-400/60 m-0 mt-0.5">
                       Switch to the "Send with Passkey" tab to submit UserOps without MetaMask.
                     </p>
                   </div>
                 </div>
               )}
             </div>
           )}


           {/* ── SEND WITH PASSKEY TAB ── */}
           {activeTab === 'sign' && (
             <div className="flex flex-col gap-5 animate-fade-in">
               <div>
                 <h3 className="text-lg font-bold text-indigo-400 drop-shadow-sm">Send Operation via Passkey</h3>
                 <p className="text-xs text-indigo-100/50 mt-1">
                   Submit a transaction signed purely by your biometric — no MetaMask popup.
                 </p>
               </div>


               {/* Warning if not ready */}
               {(!savedCredential || !isInstalled) && (
                 <div className="flex items-start gap-3 p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl text-sm text-amber-300">
                   <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                   <div>
                     {!savedCredential && <p className="m-0">No passkey found. Go to <b>Setup</b> → Step 1.</p>}
                     {savedCredential && !isInstalled && <p className="m-0">Module not installed. Go to <b>Setup</b> → Step 2.</p>}
                   </div>
                 </div>
               )}


               <div className="flex flex-col gap-4 p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl">
                 <div>
                   <label className="text-xs text-indigo-300 mb-1 block">Target Address</label>
                   <input
                     type="text"
                     className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-indigo-500"
                     placeholder="0x..."
                     value={execTarget}
                     onChange={(e) => setExecTarget(e.target.value)}
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs text-indigo-300 mb-1 block">Value (ETH)</label>
                     <input
                       type="text"
                       className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-indigo-500"
                       placeholder="0.0"
                       value={execValue}
                       onChange={(e) => setExecValue(e.target.value)}
                     />
                   </div>
                   <div>
                     <label className="text-xs text-indigo-300 mb-1 block">Calldata (Hex)</label>
                     <input
                       type="text"
                       className="input-field bg-slate-900/50 border-slate-700 text-slate-200 text-sm focus:border-indigo-500"
                       placeholder="0x..."
                       value={execData}
                       onChange={(e) => setExecData(e.target.value)}
                     />
                   </div>
                 </div>
               </div>


               <button
                 className="w-full py-3.5 rounded-lg font-bold text-black bg-gradient-to-r from-indigo-500 to-blue-400 hover:from-indigo-400 hover:to-blue-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all flex items-center justify-center gap-2 border-none disabled:opacity-50 disabled:cursor-not-allowed"
                 onClick={handleSendWithPasskey}
                 disabled={sending || !savedCredential || !isInstalled}
               >
                 {sending
                   ? <><Loader size={18} className="animate-spin" /> Processing...</>
                   : <><Fingerprint size={18} /> Send with Biometric</>
                 }
               </button>


               <p className="text-xs text-center text-slate-500">
                 Your device will prompt Touch ID / Face ID / PIN — no MetaMask required.
               </p>
             </div>
           )}
         </div>
       </div>
     )}
   </div>
 );
}
