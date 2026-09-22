require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');
const { Groq } = require('groq-sdk');
const {
    toHex,
    packUserOp,
    encodeERC7579Single,
    getNonceForValidator,
    encodeUniswapSwap,
    encodeERC20Transfer,
    buildAndSendAgentOp,
    waitForUserOp
} = require('./userOpBuilder');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('/{*splat}', cors());app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const agentStoreApiUrl = (process.env.AGENT_STORE_API_URL || process.env.CONFIG_API_URL || '').replace(/\/$/, '');
const defaultChainId = Number(process.env.CHAIN_ID || process.env.DEFAULT_CHAIN_ID || 11155111);

// In-memory store: smartAccountAddress -> Array<{ privateKey, agentAddress, name, scope, maxAmount, authorized }>
const agentConfigs = new Map();

const normalizeAddress = (value) => {
    if (!value || !ethers.isAddress(value)) return null;
    return value.toLowerCase();
};

const getAgentRuntimeStatus = (agent) => {
    if (agent.revoked || agent.status === 'revoked') return 'revoked';
    if (Number(agent.validUntil || 0) > 0 && Number(agent.validUntil) < Math.floor(Date.now() / 1000)) {
        return 'expired';
    }
    if (agent.status) return agent.status;
    return agent.authorized === false ? 'pending' : 'active';
};

const publicAgentConfig = (agent) => {
    const status = getAgentRuntimeStatus(agent);
    return {
        agentAddress: agent.agentAddress || agent.keyAddress,
        name: agent.name,
        scope: agent.scope,
        maxAmount: agent.maxAmount,
        authorized: status === 'active',
        status,
        target: agent.target,
        selector: agent.selector,
        maxValueWei: agent.maxValueWei,
        validAfter: agent.validAfter,
        validUntil: agent.validUntil,
        revoked: status === 'revoked' || Boolean(agent.revoked),
        createdAt: agent.createdAt,
        authorizedAt: agent.authorizedAt || null
    };
};

const getRequestChainId = (req) => Number(req.query.chainId || req.body?.chainId || defaultChainId);

async function agentStoreRequest(method, path, data) {
    if (!agentStoreApiUrl) return null;
    const res = await axios({
        method,
        url: `${agentStoreApiUrl}${path}`,
        data,
        headers: { 'Content-Type': 'application/json' }
    });
    return res.data;
}

async function listStoredAgents(smartAccountAddress, chainId) {
    const stored = await agentStoreRequest(
        'get',
        `/agents?smartAccount=${smartAccountAddress}&chainId=${chainId}`
    );
    if (!stored) return null;
    return stored;
}

async function getStoredAgent(smartAccountAddress, chainId, agentAddress) {
    return agentStoreRequest(
        'get',
        `/agents/internal/${smartAccountAddress}/${agentAddress}?chainId=${chainId}`
    );
}

const getAgentsForAccount = (smartAccountAddress) => {
    const accountKey = normalizeAddress(smartAccountAddress);
    if (!accountKey) return null;
    return agentConfigs.get(accountKey) || [];
};

const setAgentsForAccount = (smartAccountAddress, agents) => {
    const accountKey = normalizeAddress(smartAccountAddress);
    if (!accountKey) return false;
    if (agents.length === 0) {
        agentConfigs.delete(accountKey);
    } else {
        agentConfigs.set(accountKey, agents);
    }
    return true;
};

const findAgentConfig = (smartAccountAddress, agentAddress) => {
    const accountKey = normalizeAddress(smartAccountAddress);
    const agentKey = normalizeAddress(agentAddress);
    if (!accountKey || !agentKey) return null;
    const agents = agentConfigs.get(accountKey) || [];
    return agents.find((agent) => normalizeAddress(agent.agentAddress) === agentKey) || null;
};


app.post('/health',(req,res)=>{
    res.send('OK');
})

// Generate an agent keypair for a smart account and set its scope
app.post('/api/agent/generate', async (req, res) => {
    try {
        const { smartAccountAddress, ownerEoa, scope, maxAmount, name } = req.body;
        const chainId = getRequestChainId(req);
        if (!smartAccountAddress || !scope) {
            return res.status(400).json({ error: 'Missing smartAccountAddress or scope' });
        }

        const accountKey = normalizeAddress(smartAccountAddress);
        if (!accountKey) {
            return res.status(400).json({ error: 'Invalid smartAccountAddress' });
        }

        const wallet = ethers.Wallet.createRandom();
        const existingAgents = agentConfigs.get(accountKey) || [];
        const agentName = typeof name === 'string' && name.trim()
            ? name.trim().slice(0, 64)
            : `Agent ${existingAgents.length + 1}`;
        const agent = {
            privateKey: wallet.privateKey,
            agentAddress: wallet.address,
            name: agentName,
            scope, // 'uniswap', 'erc20', or 'custom'
            maxAmount: maxAmount || '0',
            authorized: false,
            createdAt: new Date().toISOString()
        };
        
        if (agentStoreApiUrl) {
            await agentStoreRequest('post', '/agents', {
                smartAccountAddress,
                ownerEoa,
                chainId,
                agentAddress: wallet.address,
                privateKey: wallet.privateKey,
                name: agentName,
                scope,
                maxAmount: maxAmount || '0'
            });
        } else {
            agentConfigs.set(accountKey, [...existingAgents, agent]);
        }

        console.log(`[Agent] Generated ${wallet.address} for ${smartAccountAddress} with scope ${scope}`);
        res.json(publicAgentConfig(agent));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Check agent status
app.get('/api/agent/status/:smartAccountAddress', async (req, res) => {
    const chainId = getRequestChainId(req);
    const agents = agentStoreApiUrl
        ? await listStoredAgents(req.params.smartAccountAddress, chainId)
        : getAgentsForAccount(req.params.smartAccountAddress);
    if (!agents) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress' });
    }

    if (agents.length === 0) {
        res.json({ configured: false });
    } else {
        const publicAgents = agents.map(publicAgentConfig);
        const firstAuthorized = publicAgents.find((agent) => agent.authorized) || publicAgents[0];
        res.json({
            configured: publicAgents.some((agent) => agent.authorized),
            agents: publicAgents,
            // Backward-compatible fields for older frontend code while Phase 3 UI migrates.
            agentAddress: firstAuthorized.agentAddress,
            scope: firstAuthorized.scope,
            maxAmount: firstAuthorized.maxAmount
        });
    }
});

app.patch('/api/agent/:smartAccountAddress/:agentAddress/authorize', async (req, res) => {
    const accountKey = normalizeAddress(req.params.smartAccountAddress);
    const agentKey = normalizeAddress(req.params.agentAddress);
    if (!accountKey || !agentKey) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress or agentAddress' });
    }

    if (agentStoreApiUrl) {
        try {
            const agent = await agentStoreRequest(
                'patch',
                `/agents/${req.params.smartAccountAddress}/${req.params.agentAddress}/authorize`,
                {
                    chainId: getRequestChainId(req),
                    target: req.body.target,
                    selector: req.body.selector,
                    maxValueWei: req.body.maxValueWei,
                    validAfter: req.body.validAfter,
                    validUntil: req.body.validUntil,
                    txHashInstall: req.body.txHashInstall
                }
            );
            const agents = await listStoredAgents(req.params.smartAccountAddress, getRequestChainId(req));
            return res.json({ agent, agents });
        } catch (error) {
            return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
        }
    }

    const agents = agentConfigs.get(accountKey) || [];
    const index = agents.findIndex((agent) => normalizeAddress(agent.agentAddress) === agentKey);
    if (index === -1) {
        return res.status(404).json({ error: 'Agent not found' });
    }

    const updatedAgent = {
        ...agents[index],
        authorized: true,
        authorizedAt: new Date().toISOString()
    };
    agents[index] = updatedAgent;
    agentConfigs.set(accountKey, agents);
    res.json({ agent: publicAgentConfig(updatedAgent), agents: agents.map(publicAgentConfig) });
});

app.patch('/api/agent/:smartAccountAddress/:agentAddress/revoke', async (req, res) => {
    const accountKey = normalizeAddress(req.params.smartAccountAddress);
    const agentKey = normalizeAddress(req.params.agentAddress);
    if (!accountKey || !agentKey) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress or agentAddress' });
    }

    if (agentStoreApiUrl) {
        try {
            const agent = await agentStoreRequest(
                'patch',
                `/agents/${req.params.smartAccountAddress}/${req.params.agentAddress}/revoke`,
                {
                    chainId: getRequestChainId(req),
                    txHashRevoke: req.body.txHashRevoke
                }
            );
            const agents = await listStoredAgents(req.params.smartAccountAddress, getRequestChainId(req));
            return res.json({ agent, agents });
        } catch (error) {
            return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
        }
    }

    const agents = agentConfigs.get(accountKey) || [];
    const index = agents.findIndex((agent) => normalizeAddress(agent.agentAddress) === agentKey);
    if (index === -1) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    agents[index] = {
        ...agents[index],
        privateKey: undefined,
        authorized: false,
        revoked: true,
        status: 'revoked',
        txHashRevoke: req.body.txHashRevoke,
        revokedAt: new Date().toISOString()
    };
    agentConfigs.set(accountKey, agents);
    res.json({ agent: publicAgentConfig(agents[index]), agents: agents.map(publicAgentConfig) });
});

app.delete('/api/agent/:smartAccountAddress/:agentAddress', async (req, res) => {
    const accountKey = normalizeAddress(req.params.smartAccountAddress);
    const agentKey = normalizeAddress(req.params.agentAddress);
    if (!accountKey || !agentKey) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress or agentAddress' });
    }

    if (agentStoreApiUrl) {
        try {
            const agent = await agentStoreRequest(
                'patch',
                `/agents/${req.params.smartAccountAddress}/${req.params.agentAddress}/revoke`,
                {
                    chainId: getRequestChainId(req),
                    txHashRevoke: req.query.txHashRevoke
                }
            );
            const agents = await listStoredAgents(req.params.smartAccountAddress, getRequestChainId(req));
            return res.json({ removed: true, agent, agents });
        } catch (error) {
            return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
        }
    }

    const agents = agentConfigs.get(accountKey) || [];
    const remainingAgents = agents.filter((agent) => normalizeAddress(agent.agentAddress) !== agentKey);
    if (remainingAgents.length === agents.length) {
        return res.status(404).json({ error: 'Agent not found' });
    }

    setAgentsForAccount(accountKey, remainingAgents);
    res.json({ removed: true, agents: remainingAgents.map(publicAgentConfig) });
});

app.delete('/api/agent/:smartAccountAddress', async (req, res) => {
    const accountKey = normalizeAddress(req.params.smartAccountAddress);
    if (!accountKey) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress' });
    }

    if (agentStoreApiUrl) {
        try {
            const agents = await agentStoreRequest(
                'delete',
                `/agents/${req.params.smartAccountAddress}?chainId=${getRequestChainId(req)}${req.query.txHashRevoke ? `&txHashRevoke=${req.query.txHashRevoke}` : ''}`
            );
            return res.json({ removed: true, agents });
        } catch (error) {
            return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
        }
    }

    agentConfigs.delete(accountKey);
    res.json({ removed: true, agents: [] });
});

app.post('/api/agent/sync/:smartAccountAddress', async (req, res) => {
    const accountKey = normalizeAddress(req.params.smartAccountAddress);
    if (!accountKey) {
        return res.status(400).json({ error: 'Invalid smartAccountAddress' });
    }

    const activeAgentAddresses = Array.isArray(req.body.activeAgentAddresses)
        ? req.body.activeAgentAddresses
        : [];
    const activeSet = new Set(activeAgentAddresses.map(normalizeAddress).filter(Boolean));
    const moduleInstalled = Boolean(req.body.moduleInstalled);

    if (agentStoreApiUrl) {
        try {
            const agents = await agentStoreRequest(
                'post',
                `/agents/${req.params.smartAccountAddress}/sync`,
                {
                    chainId: getRequestChainId(req),
                    moduleInstalled,
                    activeAgentAddresses
                }
            );
            return res.json({ agents });
        } catch (error) {
            return res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
        }
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const agents = (agentConfigs.get(accountKey) || []).map((agent) => {
        const agentKey = normalizeAddress(agent.agentAddress);
        const isActiveOnChain = agentKey && activeSet.has(agentKey);
        const isExpired = Number(agent.validUntil || 0) > 0 && Number(agent.validUntil) < nowSeconds;

        if (!moduleInstalled || (!isActiveOnChain && getAgentRuntimeStatus(agent) === 'active')) {
            return {
                ...agent,
                privateKey: undefined,
                authorized: false,
                revoked: true,
                status: 'revoked',
                revokedAt: agent.revokedAt || new Date().toISOString()
            };
        }

        if (isExpired) {
            return {
                ...agent,
                privateKey: undefined,
                authorized: false,
                status: 'expired'
            };
        }

        if (isActiveOnChain && getAgentRuntimeStatus(agent) !== 'active') {
            return {
                ...agent,
                authorized: true,
                revoked: false,
                status: 'active',
                authorizedAt: agent.authorizedAt || new Date().toISOString()
            };
        }

        return agent;
    });
    setAgentsForAccount(accountKey, agents);
    res.json({ agents: agents.map(publicAgentConfig) });
});

// Main chat execution
app.post('/api/chat', async (req, res) => {
    const { message, smartAccountAddress, agentAddress, chainId } = req.body;
    if (!message || !smartAccountAddress) {
        return res.status(400).json({ error: 'Missing message or smartAccountAddress' });
    }
    if (!agentAddress) {
        return res.status(400).json({ error: 'Missing agentAddress' });
    }

    const config = agentStoreApiUrl
        ? await getStoredAgent(smartAccountAddress, Number(chainId || defaultChainId), agentAddress).catch((error) => {
            console.error('[Agent] Failed to load persisted agent:', error.response?.data || error.message);
            return null;
        })
        : findAgentConfig(smartAccountAddress, agentAddress);
    if (!config) {
        return res.status(400).json({ error: 'Agent not configured. Please initialize agent first.' });
    }
    const runtimeStatus = getAgentRuntimeStatus(config);
    if (config.authorized === false || runtimeStatus === 'pending') {
        return res.status(400).json({ error: 'Agent is not authorized on-chain yet.' });
    }
    if (runtimeStatus === 'revoked') {
        return res.status(400).json({ error: 'Agent has been revoked. Create or select an active agent.' });
    }
    if (runtimeStatus === 'expired') {
        return res.status(400).json({ error: 'Agent access has expired. Create a new agent.' });
    }
    if (!config.privateKey) {
        return res.status(400).json({ error: 'Agent signing key is unavailable. Recreate the agent.' });
    }

    try {
        // 1. Setup tools based on scope
        let tools = [];
        let systemPrompt = `You are a helpful Web3 AI assistant. Your job is to translate user requests into function calls. 
        If the user asks to repeat an action, set the 'repeat' parameter to that number.
        CRITICAL: For token swaps, assume standard Sepolia token addresses if none are provided. Do NOT ask the user for contract addresses for WETH or USDC.
        CRITICAL: If the user does not specify a recipient address for a transfer, DO NOT hallucinate an address. You must return a normal text response asking them to provide the recipient address.`;

        if (config.scope === 'uniswap') {
            tools.push({
                type: 'function',
                function: {
                    name: 'uniswap_swap',
                    description: 'Swap exact input tokens for an output token on Uniswap V3 on Sepolia network',
                    parameters: {
                        type: 'object',
                        properties: {
                            tokenIn: { type: 'string', description: 'Address of input token (use "0xWETH" if not specified)' },
                            tokenOut: { type: 'string', description: 'Address of output token (use "0xUSDC" if not specified)' },
                            amountIn: { type: 'string', description: 'Amount of input token in human-readable format (e.g. "0.001")' },
                            repeat: { type: 'string', description: 'Number of times to repeat this operation independently (e.g., "1")' }
                        },
                        required: ['amountIn']
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
                            tokenAddress: { type: 'string', description: 'Address of ERC20 token to transfer. Must use 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 for USDC on Sepolia.' },
                            recipient: { type: 'string', description: 'Address of the recipient' },
                            amount: { type: 'string', description: 'Amount of tokens in human-readable format (e.g., "0.00005" or "1.5")' },
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
            model: 'openai/gpt-oss-120b',
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
            // Enforce WETH for tokenIn to avoid allowance issues and hallucinated addresses
            const safeTokenIn = process.env.WETH_SEPOLIA;
            const safeTokenOut = process.env.USDC_SEPOLIA; // Fallback to USDC if LLM hallucinates
            
            let amountInWei;
            try {
                amountInWei = ethers.parseEther(args.amountIn.toString());
            } catch (e) {
                return res.json({ reply: `Error parsing amount. Please use a valid number format like "0.001".`, ops: [] });
            }
            
            // Simplified ExactInputSingle for demo (using 0.3% fee pool, amountOutMinimum = 0)
            innerCallData = encodeUniswapSwap(
                safeTokenIn.toLowerCase(), 
                safeTokenOut.toLowerCase(), 
                3000, 
                smartAccountAddress, 
                amountInWei, 
                0n, 
                0n
            );
            value = amountInWei; // Always send ETH for WETH swaps
            
            // Off-chain limit check
            if (amountInWei > BigInt(ethers.parseEther(config.maxAmount))) {
                return res.json({ reply: `Rejected: Amount ${args.amountIn} exceeds max allowed (${config.maxAmount}).`, ops: [] });
            }

        } else if (toolCall.function.name === 'erc20_transfer') {
            // Enforce authorized USDC token to prevent SessionKey target mismatch
            target = process.env.USDC_SEPOLIA;
            
            // The LLM now provides a human-readable amount (e.g. "0.00005"). We convert it to base units using 6 decimals.
            let amountInWei;
            try {
                amountInWei = ethers.parseUnits(args.amount.toString(), 6);
            } catch (e) {
                return res.json({ reply: `Error parsing amount. Please use a valid number format like "0.00005".`, ops: [] });
            }
            
            innerCallData = encodeERC20Transfer(args.recipient, amountInWei);
            
            // Off-chain limit check
            if (amountInWei > BigInt(ethers.parseUnits(config.maxAmount, 6))) { // Assuming USDC 6 decimals for demo maxAmount
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
                
                // Wait for the UserOp to be completely mined before sending the next one
                // This prevents "AA25 invalid account nonce" errors from the bundler during estimation
                console.log(`Waiting for UserOp ${opHash} to be mined...`);
                await waitForUserOp(opHash);
                console.log(`UserOp ${opHash} mined successfully!`);
                
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chatbot backend listening on port ${PORT}`);
});

module.exports = app;
