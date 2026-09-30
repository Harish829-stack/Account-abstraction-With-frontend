const fs = require('fs');

let content = fs.readFileSync('src/views/UnifiedAgentView.jsx', 'utf8');

// Replace imports
content = content.replace("import { useChatbotContext } from '../context/ChatbotContext';", "");
content = content.replace("import { useAppContext } from '../context/AppContext';", "");
content = content.replace("import { buildAndSendAccountOp, encodeERC7579Single, encodeERC7579Batch, getActiveSessionKeysOnChain, getPrevValidator } from '../utils/helpers';", "");
content = content.replace("import { estimateUserOperationGas, sendUserOperation, getUserOpReceipt, getDynamicGasFees, applyBufferedGasEstimate } from '../utils/bundler';", "");

// Create Mock Context
const mockContextStr = `
// --- Mock Context ---
const useChatbotContext = () => {
    // We will pass these via props or state inside the component
    return {};
};
const useAppContext = () => {
    return {};
};
// --------------------
`;

// Modify UnifiedAgentView definition
content = content.replace("export default function UnifiedAgentView() {", `export default function AgentDemoView() {
    // --- Mock State ---
    const [mockBalances, setMockBalances] = useState({ eth: 2.4, usdc: 4700 });
    const [mockAgents, setMockAgents] = useState([]);
    const [mockActiveAgent, setMockActiveAgent] = useState('financial');
    const [mockMessages, setMockMessages] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    
    // Derived context
    const smartAccountAddress = "0xDemoSmartAccount1234567890abcdef12345678";
    const eoaAddress = "0xDemoUser1234567890abcdef1234567890abcdef";
    const chainId = 11155111;
    const provider = {}; 
    const signer = {};
    const env = { ENTRY_POINT: '0x' };
    const trackOp = () => {};
    const financeAgentMessages = mockMessages;
    const setFinanceAgentMessages = setMockMessages;
    const financeAgentHistory = [];
    const setFinanceAgentHistory = () => {};
    
    const isAgentConfigured = mockAgents.length > 0;
    const agentStatus = mockAgents[0];
    const agents = mockAgents;
    const activeAgentAddress = mockActiveAgent;
    const setActiveAgentAddress = setMockActiveAgent;
    const chatbotMessages = mockMessages;
    const isChatLoading = false;
    
    const sendChatbotMessage = (text) => {
        const userMsg = { id: Date.now(), role: 'user', content: text, time: new Date().toLocaleTimeString() };
        setMockMessages(prev => [...prev, userMsg]);
        
        setTimeout(() => {
            let amount = 0;
            const match = text.match(/(\\d+(\\.\\d+)?)/);
            if (match) amount = parseFloat(match[0]);
            
            const currentAgent = agents.find(a => a.agentAddress === activeAgentAddress);
            const limit = currentAgent ? parseFloat(currentAgent.maxAmount) : 0;
            
            let reply = "";
            let newEth = mockBalances.eth;
            let newUsdc = mockBalances.usdc;
            
            if (amount > limit && currentAgent) {
                reply = \`Blocked: Your request to move \${amount} exceeds this agent's policy limit of \${limit}.\`;
            } else if (amount > mockBalances.usdc) {
                reply = \`Blocked: Insufficient balance. You only have \${mockBalances.usdc} USDC.\`;
            } else if (amount > 0) {
                reply = \`Executed successfully! Moved \${amount} as requested.\`;
                newUsdc -= amount;
                setMockBalances({ eth: newEth, usdc: newUsdc });
            } else {
                reply = "I'm ready. What would you like to do?";
            }
            
            setMockMessages(prev => [...prev, { id: Date.now()+1, role: 'agent', content: reply, time: new Date().toLocaleTimeString() }]);
        }, 1000);
    };
    
    const generateAgent = async (scope, limit, name) => "0xAgent" + Math.random().toString(16).slice(2,8);
    const authorizeAgent = async (agent) => {
        setMockAgents(prev => [...prev, agent]);
    };
    const deleteAgent = async () => {};
    const clearAgents = async () => setMockAgents([]);
    const refreshAgents = async () => {};
    const refreshInstalledModules = async () => {};
`);

// Replace the handleCreateAssistant logic completely to avoid ethers errors
const createLogicRegex = /const handleCreateAssistant = async[^{]*{([\s\S]*?)};\n/m;
const newCreateLogic = `
    const handleCreateAssistant = async ({ scopesConfig, validityDays }) => {
        setIsCreating(true);
        setTimeout(async () => {
            const selectedScopes = SCOPES.filter(s => scopesConfig[s.id].enabled);
            for (const scope of selectedScopes) {
                const limit = scopesConfig[scope.id].limit;
                const name = \`\${scope.name} Assistant\`;
                const addr = await generateAgent(scope.id, limit, name);
                await authorizeAgent({
                    agentAddress: addr,
                    name,
                    scope: scope.id,
                    maxAmount: limit,
                    maxValueWei: "0",
                    validUntil: Math.floor(Date.now() / 1000) + (validityDays * 86400),
                    authorized: true
                });
            }
            setIsCreating(false);
            go("workspace");
        }, 1500);
    };
`;
// content = content.replace(createLogicRegex, newCreateLogic);
// Actually, it's safer to just split by "const handleCreateAssistant" and replace manually

const lines = content.split('\\n');
let insideCreate = false;
let braceCount = 0;
let out = [];

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const handleCreateAssistant = async')) {
        insideCreate = true;
        out.push(newCreateLogic);
    }
    if (insideCreate) {
        if (lines[i].includes('{')) braceCount += (lines[i].match(/{/g) || []).length;
        if (lines[i].includes('}')) braceCount -= (lines[i].match(/}/g) || []).length;
        if (braceCount === 0 && lines[i].includes('};')) {
            insideCreate = false;
        }
        continue;
    }
    out.push(lines[i]);
}

content = out.join('\\n');

// Add balance overlay
content = content.replace('return (', \`
    return (
        <div style={{ position: 'relative', width: '100%', height: '600px' }}>
            <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 10, background: 'rgba(0,0,0,0.8)', padding: '16px', borderRadius: '12px', border: '1px solid #333', color: '#fff', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Hardcoded Demo Balances</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>ETH</span>
                    <span style={{ fontSize: '14px', color: '#00f59b' }}>{mockBalances.eth.toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>USDC</span>
                    <span style={{ fontSize: '14px', color: '#00f59b' }}>\${mockBalances.usdc.toFixed(2)}</span>
                </div>
            </div>
\`);

content = content.replace('</div>\\n        </div>\\n    );', '</div>\\n        </div>\\n        </div>\\n    );');

// Also remove delete/revoke logic and replace with mocks
content = content.replace(/const handleDeleteAgent = async[\\s\\S]*?finally {\\s*setIsDeleting\\(false\\);\\s*}\\s*};/g, 'const handleDeleteAgent = async () => {};');
content = content.replace(/const handleRevokeAllAgents = async[\\s\\S]*?finally {\\s*setIsRevokingAll\\(false\\);\\s*}\\s*};/g, 'const handleRevokeAllAgents = async () => {};');
content = content.replace(/const handleSyncAgents = async[\\s\\S]*?finally {\\s*setIsSyncing\\(false\\);\\s*}\\s*};/g, 'const handleSyncAgents = async () => {};');

// Ensure sendFinancialMessage doesn't throw because of context
content = content.replace(/const sendFinancialMessage = async[\\s\\S]*?finally {\\s*setIsFinancialLoading\\(false\\);\\s*}\\s*};/g, 'const sendFinancialMessage = async (text) => sendChatbotMessage(text);');

fs.writeFileSync('src/components/AgentDemoView.jsx', content);
console.log('Done creating AgentDemoView');
