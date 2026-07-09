import React, { useState } from 'react';
import { useChatbotContext } from '../context/ChatbotContext';
import { useAppContext } from '../context/AppContext';
import { Send, Bot, User, CheckCircle2, Loader2, Key, Settings, Shield, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { SessionKeyValidatorABI } from '../utils/abis';
import { encodeERC7579Single, getNonceForValidator } from '../utils/helpers';
import { estimateUserOperationGas, sendUserOperation, getUserOpReceipt, getDynamicGasFees } from '../utils/bundler';

const ChatbotView = () => {
    const { isAgentConfigured, agentStatus, setIsAgentConfigured, setAgentStatus, messages, sendMessage, generateAgent, isChatLoading } = useChatbotContext();
    const { smartAccountAddress, provider, signer, eoaAddress, installedModules } = useAppContext();
    
    const [setupStep, setSetupStep] = useState(1);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    
    // Setup form state
    const [selectedScope, setSelectedScope] = useState('uniswap');
    const [maxAmount, setMaxAmount] = useState('0.01'); // In human readable (e.g., ETH)
    const [customTarget, setCustomTarget] = useState('');
    const [customSelector, setCustomSelector] = useState('');
    const [generatedAgentAddress, setGeneratedAgentAddress] = useState('');
    
    // Chat state
    const [input, setInput] = useState('');

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const addr = await generateAgent(selectedScope, maxAmount);
            setGeneratedAgentAddress(addr);
            setSetupStep(3);
        } catch (e) {
            alert("Failed to generate agent: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleInstall = async () => {
        setIsInstalling(true);
        try {
            const SESSION_KEY_VALIDATOR = "0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44";
            const validUntil = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
            
            let target = "0x0000000000000000000000000000000000000000";
            let selector = "0x00000000";
            let checkAmount = false;
            let amountOffset = 0;
            let maxAmountWei = 0n;
            let maxValue = 0n;

            if (selectedScope === 'uniswap') {
                target = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48"; // Sepolia SwapRouter02
                selector = "0x414bf389"; // exactInputSingle
                checkAmount = true;
                amountOffset = 132;
                maxAmountWei = ethers.parseEther(maxAmount);
                maxValue = maxAmountWei; // native value might also be sent
            } else if (selectedScope === 'erc20') {
                target = customTarget || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Default USDC Sepolia
                selector = "0xa9059cbb"; // transfer
                checkAmount = true;
                amountOffset = 36;
                maxAmountWei = ethers.parseUnits(maxAmount, 6); // Assuming 6 decimals for USDC demo
                maxValue = 0n;
            } else if (selectedScope === 'custom') {
                target = customTarget;
                selector = customSelector;
                maxValue = ethers.parseEther(maxAmount);
            }

            const keyData = [
                generatedAgentAddress,
                target,
                selector,
                maxValue,
                checkAmount,
                amountOffset,
                maxAmountWei,
                0,
                validUntil,
                0 // unlimited uses
            ];

            const validatorIface = new ethers.Interface(SessionKeyValidatorABI);
            const innerCallData = validatorIface.encodeFunctionData("addSessionKey", [keyData]);
            
            // Encode the installation through the account
            const callData = encodeERC7579Single(SESSION_KEY_VALIDATOR, "0x0", innerCallData);
            
            const entryPoint = new ethers.Contract(
                import.meta.env.VITE_ENTRY_POINT,
                ["function getNonce(address sender, uint192 key) view returns (uint256)"],
                provider
            );
            
            const nonce = await entryPoint.getNonce(smartAccountAddress, 0); // Key 0 for EOA signer
            const { maxFeePerGas, maxPriorityFeePerGas } = await getDynamicGasFees(provider);
            
            const userOp = {
                sender: smartAccountAddress,
                nonce: ethers.toBeHex(nonce),
                factory: "0x",
                factoryData: "0x",
                callData,
                callGasLimit: "0x0",
                verificationGasLimit: "0x0",
                preVerificationGas: "0x0",
                maxFeePerGas: ethers.toBeHex(maxFeePerGas),
                maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
                paymaster: "0x",
                paymasterVerificationGasLimit: "0x",
                paymasterPostOpGasLimit: "0x",
                paymasterData: "0x",
                signature: "0x"
            };

            const est = await estimateUserOperationGas(userOp);
            userOp.callGasLimit = ethers.toBeHex(BigInt(est.callGasLimit));
            userOp.verificationGasLimit = ethers.toBeHex(BigInt(est.verificationGasLimit));
            userOp.preVerificationGas = ethers.toBeHex(BigInt(est.preVerificationGas));

            const packUserOp = (op) => {
                const accountGasLimits = ethers.concat([
                    ethers.zeroPadValue(ethers.toBeHex(op.verificationGasLimit), 16),
                    ethers.zeroPadValue(ethers.toBeHex(op.callGasLimit), 16)
                ]);
                const gasFees = ethers.concat([
                    ethers.zeroPadValue(ethers.toBeHex(op.maxPriorityFeePerGas), 16),
                    ethers.zeroPadValue(ethers.toBeHex(op.maxFeePerGas), 16)
                ]);
                return {
                    sender: op.sender,
                    nonce: op.nonce,
                    initCode: "0x",
                    callData: op.callData,
                    accountGasLimits,
                    preVerificationGas: op.preVerificationGas,
                    gasFees,
                    paymasterAndData: "0x",
                    signature: op.signature
                };
            };
            
            const packedForHash = packUserOp(userOp);
            
            const epHashContract = new ethers.Contract(
                import.meta.env.VITE_ENTRY_POINT,
                ["function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)"],
                provider
            );
            
            const userOpHash = await epHashContract.getUserOpHash(packedForHash);
            
            const sig = await signer.signMessage(ethers.getBytes(userOpHash));
            const wrappedSig = ethers.concat([
                "0x0000000000000000000000000000000000000000", // EOA owns the account
                sig
            ]);
            userOp.signature = ethers.hexlify(wrappedSig);
            
            const returnedHash = await sendUserOperation(userOp);
            console.log("Tx Hash:", returnedHash);
            
            // Wait for receipt
            let receipt = null;
            let retries = 20;
            while (!receipt && retries > 0) {
                await new Promise(r => setTimeout(r, 2000));
                receipt = await getUserOpReceipt(returnedHash);
                retries--;
            }
            
            if (receipt && receipt.success) {
                setIsAgentConfigured(true);
                setAgentStatus({
                    agentAddress: generatedAgentAddress,
                    scope: selectedScope,
                    maxAmount: maxAmount
                });
            } else {
                alert("Agent installation failed or timed out.");
            }
        } catch (e) {
            console.error(e);
            alert("Error installing agent: " + e.message);
        } finally {
            setIsInstalling(false);
        }
    };

    const handleChatSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isChatLoading) {
            sendMessage(input);
            setInput('');
        }
    };

    if (!eoaAddress || !smartAccountAddress) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh]">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl shadow-slate-950/50">
                    <Shield className="w-16 h-16 text-slate-500 mx-auto mb-4 opacity-50" />
                    <h2 className="text-xl font-medium text-slate-200 mb-2">Connect Your Account</h2>
                    <p className="text-slate-400">Please connect your EOA and initialize your Smart Account to use the AI Agent.</p>
                </div>
            </div>
        );
    }

    const hasSessionKeyValidator = installedModules?.rawValidators?.some(v => v.toLowerCase() === "0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44".toLowerCase());
    if (!hasSessionKeyValidator) {
         return (
            <div className="flex flex-col items-center justify-center h-[70vh]">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-xl shadow-slate-950/50">
                    <Key className="w-16 h-16 text-yellow-500/80 mx-auto mb-4" />
                    <h2 className="text-xl font-medium text-slate-200 mb-2">Missing Validator Module</h2>
                    <p className="text-slate-400 text-sm">
                        You need to install the SessionKeyValidator on your account first. Head over to the Modules section to install it.
                    </p>
                </div>
            </div>
        );
    }

    // Setup Flow
    if (!isAgentConfigured) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
                    
                    <h1 className="text-2xl font-semibold text-slate-100 mb-2 flex items-center gap-3">
                        <Bot className="text-blue-400" /> Initialize AI Agent
                    </h1>
                    <p className="text-slate-400 mb-8 text-sm">Create an ephemeral session key for the chatbot server to act on your behalf.</p>
                    
                    {setupStep === 1 && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-slate-300 block">1. Select Capability Scope</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <button 
                                        onClick={() => setSelectedScope('uniswap')}
                                        className={`p-4 rounded-xl border text-left transition-all ${selectedScope === 'uniswap' ? 'border-blue-500 bg-blue-500/10 shadow-inner' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                                    >
                                        <div className="font-medium text-slate-200 mb-1">🦄 Uniswap V3</div>
                                        <div className="text-xs text-slate-500">Allow exactInputSingle swaps on Sepolia</div>
                                    </button>
                                    <button 
                                        onClick={() => setSelectedScope('erc20')}
                                        className={`p-4 rounded-xl border text-left transition-all ${selectedScope === 'erc20' ? 'border-blue-500 bg-blue-500/10 shadow-inner' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                                    >
                                        <div className="font-medium text-slate-200 mb-1">💸 ERC-20</div>
                                        <div className="text-xs text-slate-500">Allow ERC-20 transfers (USDC)</div>
                                    </button>
                                    <button 
                                        onClick={() => setSelectedScope('custom')}
                                        className={`p-4 rounded-xl border text-left transition-all ${selectedScope === 'custom' ? 'border-blue-500 bg-blue-500/10 shadow-inner' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                                    >
                                        <div className="font-medium text-slate-200 mb-1">⚙️ Custom</div>
                                        <div className="text-xs text-slate-500">Specific contract and selector</div>
                                    </button>
                                </div>
                            </div>

                            {selectedScope === 'custom' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-400 font-medium">Target Contract</label>
                                        <input 
                                            value={customTarget} onChange={e => setCustomTarget(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-400 font-medium">Function Selector</label>
                                        <input 
                                            value={customSelector} onChange={e => setCustomSelector(e.target.value)}
                                            placeholder="0x..."
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300 block flex justify-between">
                                    <span>2. Set Hard Limit</span>
                                    <span className="text-xs text-slate-500">(enforced on-chain)</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number" step="0.01"
                                        value={maxAmount} onChange={e => setMaxAmount(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-4 pr-16 py-3 text-slate-200 outline-none focus:border-blue-500 font-mono"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium pointer-events-none">
                                        {selectedScope === 'erc20' ? 'USDC' : 'ETH'}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-800/50">
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : 'Generate Secure Server Key'}
                                </button>
                                <p className="text-center text-xs text-slate-500 mt-3 flex items-center justify-center gap-1">
                                    <Shield className="w-3 h-3" /> Key is stored securely in backend memory.
                                </p>
                            </div>
                        </div>
                    )}

                    {setupStep === 3 && (
                        <div className="space-y-6">
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <h3 className="text-emerald-400 font-medium mb-1 flex items-center gap-2">
                                    <CheckCircle2 size={18} /> Backend Configured
                                </h3>
                                <p className="text-sm text-slate-300 mb-3">
                                    The backend is ready to act on your behalf. Now, you must authorize its public address on-chain.
                                </p>
                                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/50">
                                    <div className="text-xs text-slate-500 mb-1">Agent Address</div>
                                    <div className="font-mono text-sm text-slate-300 break-all">{generatedAgentAddress}</div>
                                </div>
                            </div>
                            
                            <button
                                onClick={handleInstall}
                                disabled={isInstalling}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isInstalling ? <Loader2 className="animate-spin w-5 h-5" /> : 'Sign & Install Agent on-chain'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Chat Interface
    return (
        <div className="max-w-4xl mx-auto h-[calc(100vh-80px)] p-4 md:p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl h-full flex flex-col shadow-xl overflow-hidden relative">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <Bot className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-medium text-slate-200 leading-tight">Agent Workspace</h2>
                            <div className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Connected & Authorized
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800/50">
                        <span className="flex items-center gap-1.5">
                            <Settings size={14} className="text-slate-400" /> {agentStatus?.scope.toUpperCase()}
                        </span>
                        <div className="w-px h-3 bg-slate-800"></div>
                        <span>Max: <span className="text-slate-300">{agentStatus?.maxAmount}</span></span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-950/30">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mb-6">
                                <Bot className="text-slate-400 w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-200 mb-2">How can I help you?</h3>
                            <p className="text-slate-400 text-sm">
                                Describe what you want me to do. I will translate it into actions and execute them using my session key.
                            </p>
                            {agentStatus?.scope === 'uniswap' && (
                                <div className="mt-8 grid gap-2 w-full text-left">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-2 mb-1">Try saying</div>
                                    <button onClick={() => setInput("Swap 0.001 ETH for USDC")} className="p-3 text-sm text-slate-300 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/50 hover:bg-slate-800 transition-colors">
                                        "Swap 0.001 ETH for USDC"
                                    </button>
                                    <button onClick={() => setInput("Swap 0.001 ETH for USDC 3 times")} className="p-3 text-sm text-slate-300 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/50 hover:bg-slate-800 transition-colors">
                                        "Swap 0.001 ETH for USDC 3 times"
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                            <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-800 text-slate-400' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'}`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-800 text-slate-200 rounded-tr-sm' : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-sm'}`}>
                                        {msg.content}
                                    </div>
                                    
                                    {msg.ops && msg.ops.length > 0 && (
                                        <div className="flex flex-col gap-2 w-full mt-1">
                                            {msg.ops.map((op, idx) => (
                                                <div key={idx} className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between group">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${op.error ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                            {op.error ? <span className="font-bold text-xs">!</span> : <CheckCircle2 size={14} />}
                                                        </div>
                                                        <div className="text-sm font-medium text-slate-300">
                                                            Operation {op.iteration}
                                                        </div>
                                                    </div>
                                                    {op.txUrl ? (
                                                        <a href={op.txUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors">
                                                            View Tx <ExternalLink size={12} />
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{op.error}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="flex justify-start">
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                                    <Bot size={16} />
                                </div>
                                <div className="px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm flex items-center gap-2">
                                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-800 bg-slate-900 z-10">
                    <form onSubmit={handleChatSubmit} className="relative max-w-3xl mx-auto">
                        <input 
                            type="text" 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isChatLoading}
                            placeholder="Ask the agent to do something..." 
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-5 pr-14 py-4 text-[15px] text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                        />
                        <button 
                            type="submit"
                            disabled={!input.trim() || isChatLoading}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
                        >
                            <Send size={18} className={input.trim() && !isChatLoading ? "opacity-100" : "opacity-50"} />
                        </button>
                    </form>
                    <div className="text-center mt-3 text-xs text-slate-500 font-medium tracking-wide">
                        Powered by Llama 3.3 70B & Nexus Account Abstraction
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatbotView;
