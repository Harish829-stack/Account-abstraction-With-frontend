const fs = require('fs');
let content = fs.readFileSync('src/components/AgentDemoView.jsx', 'utf8');

const newMockCode = `export default function AgentDemoView() {
    // --- Mock State ---
    const [mockBalances, setMockBalances] = useState({ eth: 2.4, usdc: 4700 });
    const [mockAgents, setMockAgents] = useState([]);
    const [mockActiveAgent, setMockActiveAgent] = useState('financial');
    const [mockMessages, setMockMessages] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [isChatbotLoading, setIsChatbotLoading] = useState(false);
    
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
    
    const sendChatbotMessage = (text) => {
        const userMsg = { id: Date.now(), role: 'user', content: text, time: new Date().toLocaleTimeString() };
        setMockMessages(prev => [...prev, userMsg]);
        setIsChatbotLoading(true);
        
        setTimeout(() => {
            let amount = 0;
            const match = text.match(/(\\d+(\\.\\d+)?)/);
            if (match) amount = parseFloat(match[0]);
            
            const currentAgent = agents.find(a => a.agentAddress === activeAgentAddress);
            const limit = currentAgent ? parseFloat(currentAgent.maxAmount) : 0;
            
            let reply = "";
            let newEth = mockBalances.eth;
            let newUsdc = mockBalances.usdc;
            let actionObj = null;
            
            const isAave = text.toLowerCase().includes('aave') || text.toLowerCase().includes('supply');
            const actionName = isAave ? 'Supply' : 'Transfer';
            
            if (amount > limit && currentAgent) {
                reply = "Blocked: Your request to move " + amount + " exceeds this agent's policy limit of " + limit + ".";
            } else if (amount > mockBalances.usdc) {
                reply = "Blocked: Insufficient balance. You only have " + mockBalances.usdc + " USDC.";
            } else if (amount > 0) {
                reply = "Executed successfully! Checked policy & balance. Moved " + amount + " as requested.";
                newUsdc -= amount;
                setMockBalances({ eth: newEth, usdc: newUsdc });
                actionObj = { type: 'success', name: actionName, amount, id: Date.now()+1 };
            } else {
                reply = "I'm ready. What would you like to do? Try specifying an amount like 500 USDC.";
            }
            
            setMockMessages(prev => [...prev, { id: Date.now()+2, role: 'agent', content: reply, action: actionObj, time: new Date().toLocaleTimeString() }]);
            setIsChatbotLoading(false);
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

    const activeAgent = isFinancialAgent ? null : agents.find(a => a.agentAddress === activeAgentAddress);
    const isFinancialAgent = activeAgentAddress === 'financial';
    const [isFinancialLoading, setIsFinancialLoading] = useState(false);
    
    // Derived state
    const messages = isFinancialAgent ? financeAgentMessages : chatbotMessages;
    const isChatLoading = isFinancialAgent ? isFinancialLoading : isChatbotLoading;
    
    const FINANCIAL_API = (import.meta.env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003').replace(/\\/$/, '');
    const fmtTime = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
`;

// Extract from UnifiedAgentView function down to just before useEffect for portfolio
const startIdx = content.indexOf('export default function UnifiedAgentView() {');
const endIdx = content.indexOf('    const [portfolio, setPortfolio] = useState(null);');
content = content.slice(0, startIdx) + newMockCode + content.slice(endIdx);

// Replace handleCreateAssistant logic
const createStartIdx = content.indexOf('const handleCreateAssistant = async');
const createEndIdx = content.indexOf('const getAgentRule = ({ scope, limit }) =>');

const mockCreateLogic = `const handleCreateAssistant = async ({ scopesConfig, validityDays }) => {
        setIsCreating(true);
        setTimeout(async () => {
            const selectedScopes = SCOPES.filter(s => scopesConfig[s.id].enabled);
            for (const scope of selectedScopes) {
                const limit = scopesConfig[scope.id].limit;
                const name = scope.name + " Assistant";
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
content = content.slice(0, createStartIdx) + mockCreateLogic + content.slice(createEndIdx);

// Modify return block
const returnStart = content.lastIndexOf('return (');
content = content.slice(0, returnStart) + `return (
        <div style={{ position: 'relative', width: '100%', minHeight: '600px' }}>
            <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 10, background: 'rgba(0,0,0,0.8)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Demo Balances</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>ETH</span>
                    <span style={{ fontSize: '14px', color: '#00f59b' }}>{mockBalances.eth.toFixed(4)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>USDC</span>
                    <span style={{ fontSize: '14px', color: '#00f59b' }}>\${mockBalances.usdc.toFixed(2)}</span>
                </div>
            </div>
        <div className="stage">
` + content.slice(returnStart + 'return (\\n        <div className="stage">'.length);

content = content.replace('</div>\\n        </div>\\n    );', '</div>\\n        </div>\\n        </div>\\n    );');

// Replace sendFinancialMessage with the mocked one
content = content.replace(/const sendFinancialMessage = async[\\s\\S]*?finally {\\s*setIsFinancialLoading\\(false\\);\\s*}\\s*};/g, 'const sendFinancialMessage = async (text) => sendChatbotMessage(text);');

// Clean up unused handlers
content = content.replace(/const handleDeleteAgent = async[\\s\\S]*?finally {\\s*setIsDeleting\\(false\\);\\s*}\\s*};/g, 'const handleDeleteAgent = async () => {};');
content = content.replace(/const handleRevokeAllAgents = async[\\s\\S]*?finally {\\s*setIsRevokingAll\\(false\\);\\s*}\\s*};/g, 'const handleRevokeAllAgents = async () => {};');
content = content.replace(/const handleSyncAgents = async[\\s\\S]*?finally {\\s*setIsSyncing\\(false\\);\\s*}\\s*};/g, 'const handleSyncAgents = async () => {};');

// Ensure there is no trailing code for these deleted functions that I might have missed
fs.writeFileSync('src/components/AgentDemoView.jsx', content);
