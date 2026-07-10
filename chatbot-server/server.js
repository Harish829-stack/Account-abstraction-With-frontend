require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { Groq } = require('groq-sdk');
const {
    toHex,
    packUserOp,
    encodeERC7579Single,
    getNonceForValidator,
    encodeUniswapSwap,
    encodeERC20Transfer,
    buildAndSendAgentOp
} = require('./userOpBuilder');

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// In-memory store: smartAccountAddress -> { privateKey, agentAddress, scope, maxAmount }
const agentConfigs = new Map();

// Generate an agent keypair for a smart account and set its scope
app.post('/api/agent/generate', (req, res) => {
    try {
        const { smartAccountAddress, scope, maxAmount } = req.body;
        if (!smartAccountAddress || !scope) {
            return res.status(400).json({ error: 'Missing smartAccountAddress or scope' });
        }

        const wallet = ethers.Wallet.createRandom();
        
        agentConfigs.set(smartAccountAddress.toLowerCase(), {
            privateKey: wallet.privateKey,
            agentAddress: wallet.address,
            scope, // 'uniswap', 'erc20', or 'custom'
            maxAmount: maxAmount || '0'
        });

        console.log(`[Agent] Configured for ${smartAccountAddress} with scope ${scope}`);
        res.json({ agentAddress: wallet.address });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Check agent status
app.get('/api/agent/status/:smartAccountAddress', (req, res) => {
    const config = agentConfigs.get(req.params.smartAccountAddress.toLowerCase());
    if (config) {
        res.json({ configured: true, agentAddress: config.agentAddress, scope: config.scope, maxAmount: config.maxAmount });
    } else {
        res.json({ configured: false });
    }
});

// Main chat execution
app.post('/api/chat', async (req, res) => {
    const { message, smartAccountAddress, chainId } = req.body;
    if (!message || !smartAccountAddress) {
        return res.status(400).json({ error: 'Missing message or smartAccountAddress' });
    }

    const config = agentConfigs.get(smartAccountAddress.toLowerCase());
    if (!config) {
        return res.status(400).json({ error: 'Agent not configured. Please initialize agent first.' });
    }

    try {
        // 1. Setup tools based on scope
        let tools = [];
        let systemPrompt = `You are a helpful Web3 AI assistant. Your job is to translate user requests into function calls. 
        If the user asks to repeat an action, set the 'repeat' parameter to that number.`;

        if (config.scope === 'uniswap') {
            tools.push({
                type: 'function',
                function: {
                    name: 'uniswap_swap',
                    description: 'Swap exact input tokens for an output token on Uniswap V3 on Sepolia network',
                    parameters: {
                        type: 'object',
                        properties: {
                            tokenIn: { type: 'string', description: 'Address of input token (e.g., WETH address)' },
                            tokenOut: { type: 'string', description: 'Address of output token (e.g., USDC address)' },
                            amountIn: { type: 'string', description: 'Amount of input token (in Wei)' },
                            repeat: { type: 'string', description: 'Number of times to repeat this operation independently (e.g., "1")' }
                        },
                        required: ['tokenIn', 'tokenOut', 'amountIn']
                    }
                }
            });
        } else if (config.scope === 'erc20') {
            tools.push({
                type: 'function',
                function: {
                    name: 'erc20_transfer',
                    description: 'Transfer ERC20 tokens to a recipient',
                    parameters: {
                        type: 'object',
                        properties: {
                            tokenAddress: { type: 'string', description: 'Contract address of the ERC20 token' },
                            recipient: { type: 'string', description: 'Address of the recipient' },
                            amount: { type: 'string', description: 'Amount to transfer (in Wei)' },
                            repeat: { type: 'string', description: 'Number of times to repeat this operation independently (e.g., "1")' }
                        },
                        required: ['tokenAddress', 'recipient', 'amount']
                    }
                }
            });
        } else if (config.scope === 'custom') {
            tools.push({
                type: 'function',
                function: {
                    name: 'call_contract',
                    description: 'Call a generic smart contract',
                    parameters: {
                        type: 'object',
                        properties: {
                            target: { type: 'string', description: 'Contract address to call' },
                            calldata: { type: 'string', description: 'Hex-encoded calldata' },
                            value: { type: 'string', description: 'Native ETH value to send (in Wei)' },
                            repeat: { type: 'string', description: 'Number of times to repeat this operation independently (e.g., "1")' }
                        },
                        required: ['target', 'calldata', 'value']
                    }
                }
            });
        }

        // 2. Call Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            model: 'llama-3.3-70b-versatile',
            tools: tools,
            tool_choice: 'auto'
        });

        const responseMessage = chatCompletion.choices[0].message;
        
        if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
            return res.json({ reply: responseMessage.content, ops: [] });
        }

        // 3. Process Tool Call & Validate
        const toolCall = responseMessage.tool_calls[0];
        const args = JSON.parse(toolCall.function.arguments);
        const repeatCount = Math.min(args.repeat || 1, 5); // Hardcap at 5
        
        let target = "0x";
        let innerCallData = "0x";
        let value = "0";
        
        if (toolCall.function.name === 'uniswap_swap') {
            target = process.env.UNISWAP_ROUTER;
            // Simplified ExactInputSingle for demo (using 0.3% fee pool, amountOutMinimum = 0)
            innerCallData = encodeUniswapSwap(
                args.tokenIn.toLowerCase(), 
                args.tokenOut.toLowerCase(), 
                3000, 
                smartAccountAddress, 
                args.amountIn, 
                0n, 
                0n
            );
            value = args.tokenIn.toLowerCase() === process.env.WETH_SEPOLIA.toLowerCase() ? args.amountIn : "0";
            
            // Off-chain limit check
            if (BigInt(args.amountIn) > BigInt(ethers.parseEther(config.maxAmount))) {
                return res.json({ reply: `Rejected: Amount ${ethers.formatEther(args.amountIn)} exceeds max allowed (${config.maxAmount}).`, ops: [] });
            }

        } else if (toolCall.function.name === 'erc20_transfer') {
            target = args.tokenAddress;
            innerCallData = encodeERC20Transfer(args.recipient, args.amount);
            
            // Off-chain limit check
            if (BigInt(args.amount) > BigInt(ethers.parseUnits(config.maxAmount, 6))) { // Assuming USDC 6 decimals for demo maxAmount
                return res.json({ reply: `Rejected: Amount exceeds max allowed (${config.maxAmount}).`, ops: [] });
            }

        } else if (toolCall.function.name === 'call_contract') {
            target = args.target;
            innerCallData = args.calldata;
            value = args.value;
            
            // Block dangerous selectors off-chain
            const selector = innerCallData.length >= 10 ? innerCallData.slice(0, 10).toLowerCase() : "";
            const blocked = ['0x095ea7b3', '0x39509351', '0xa22cb465', '0xf2fde38b']; // approve, increaseAllowance, setApprovalForAll, transferOwnership
            if (blocked.includes(selector)) {
                return res.json({ reply: `Security restriction: Call rejected due to dangerous selector (${selector}).`, ops: [] });
            }
        }

        const callData = encodeERC7579Single(target, value, innerCallData);
        
        // 4. Build, Sign, and Submit Loop
        const entryPoint = new ethers.Contract(
            process.env.ENTRY_POINT,
            ['function getNonce(address sender, uint192 key) view returns (uint256)'],
            provider
        );
        
        let baseNonce;
        try {
            baseNonce = await entryPoint.getNonce(smartAccountAddress, getNonceForValidator(process.env.SESSION_KEY_VALIDATOR));
        } catch (e) {
            return res.status(500).json({ error: "Failed to fetch nonce", details: e.message });
        }

        const agentWallet = new ethers.Wallet(config.privateKey);
        let opsResults = [];
        
        // Fire sequentially but without waiting for block confirmation (using predicted nonces)
        for (let i = 0; i < repeatCount; i++) {
            const currentNonce = baseNonce + BigInt(i);
            
            try {
                const opHash = await buildAndSendAgentOp(
                    agentWallet,
                    provider,
                    smartAccountAddress,
                    callData,
                    process.env.ENTRY_POINT,
                    process.env.SESSION_KEY_VALIDATOR,
                    currentNonce
                );
                
                opsResults.push({
                    iteration: i + 1,
                    opHash: opHash,
                    txUrl: `https://jiffyscan.xyz/userOpHash/${opHash}?network=sepolia`
                });
                
                // Small delay to prevent rate limits
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error(`Error on iteration ${i}:`, err);
                return res.status(500).json({ error: err.message, opsResults });
            }
        }

        res.json({ 
            reply: `I have initiated ${repeatCount} operation(s) on your behalf.`, 
            ops: opsResults 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Chatbot backend listening on port ${PORT}`);
});
