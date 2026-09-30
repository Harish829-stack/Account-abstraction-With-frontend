const fs = require('fs');
const filePath = './src/views/HomeView.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Inject new state variables and logic in LandingPage
const stateInjection = `  const [activeTab, setActiveTab] = useState('agent'); // 'agent', 'session', 'account'
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const agentId = "0x8f...3a21";
    const sessionKey = "0x4a1...F2c9";
    const eoaAddr = "0x7c...9b42";
    
    const agentPatterns = [
      \`\${agentId} executed swap on uniswap using \${sessionKey}\`,
      \`\${agentId} blocked for usdc transfer (reason - policy reached)\`,
      \`\${agentId} executed deposit on aave yield - +200$\`,
      \`\${agentId} executed 45$ transfer .\`
    ];
    
    const sessionPatterns = [
      \`session key activated for agent \${agentId}\`,
      \`session key revoked\`,
      \`agent \${agentId} executed deposit in aave yield using session key \${sessionKey}\`,
      \`agent \${agentId} executed swap on uniswap using session key \${sessionKey}\`
    ];
    
    const accountPatterns = [
      \`smart account created using eoa \${eoaAddr}\`,
      \`smart account approved agent \${agentId}\`,
      \`smart account revoked agent \${agentId}\`
    ];

    let patterns = [];
    if (activeTab === 'agent') patterns = agentPatterns;
    else if (activeTab === 'session') patterns = sessionPatterns;
    else if (activeTab === 'account') patterns = accountPatterns;

    const interval = setInterval(() => {
      const randomLog = patterns[Math.floor(Math.random() * patterns.length)];
      setLogs(prev => {
        const newLogs = [...prev, { id: Date.now(), text: randomLog }];
        if (newLogs.length > 10) return newLogs.slice(newLogs.length - 10);
        return newLogs;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    setLogs([]);
  }, [activeTab]);
`;

content = content.replace(/const \[mockTxError, setMockTxError\] = useState\(null\);/, "const [mockTxError, setMockTxError] = useState(null);\n" + stateInjection);

// Update sidebar tabs
const sidebarOriginal = `                  <div className="new-sidebar-label">Workspace</div>
                  <div className="new-side-tab new-side-tab--active"><Activity size={15} /> Agent stream</div>
                  <div className="new-side-tab"><Key size={15} /> Session key</div>
                  <div className="new-side-tab"><Box size={15} /> Smart account</div>`;

const sidebarNew = `                  <div className="new-sidebar-label">Workspace</div>
                  <div className={\`new-side-tab \${activeTab === 'agent' ? 'new-side-tab--active' : ''}\`} onClick={() => setActiveTab('agent')}><Activity size={15} /> Agent stream</div>
                  <div className={\`new-side-tab \${activeTab === 'session' ? 'new-side-tab--active' : ''}\`} onClick={() => setActiveTab('session')}><Key size={15} /> Session key</div>
                  <div className={\`new-side-tab \${activeTab === 'account' ? 'new-side-tab--active' : ''}\`} onClick={() => setActiveTab('account')}><Box size={15} /> Smart account</div>`;
content = content.replace(sidebarOriginal, sidebarNew);

// Update stream head
const streamHeadOriginal = `                <div className="new-stream-head">
                  <span>Execution Stream</span>
                  <span><span className="new-live-dot"></span> live intent parser</span>
                </div>`;
const streamHeadNew = `                <div className="new-stream-head">
                  <span>{activeTab === 'agent' ? 'Agent Stream' : activeTab === 'session' ? 'Session Key Logs' : 'Smart Account Logs'}</span>
                  <span><span className="new-live-dot"></span> live activity</span>
                </div>`;
content = content.replace(streamHeadOriginal, streamHeadNew);

// Update chat stack to show logs
const chatStackOriginal = `                <div className="new-chat-stack">
                  <div className="new-chat-line new-chat-line--user">
                    <span>YOU</span>
                    <p>Move {mockAmount} USDC from my Smart Vault into the Aave V3 USDC flow.</p>
                  </div>
                  <div className="new-chat-line new-chat-line--agent">
                    <span>AI</span>
                    <p>Checked your smart account path, USDC balance, paymaster option, and Aave widget route. I can draft this as a scoped UserOperation.</p>
                  </div>
                </div>`;

const chatStackNew = `                <div className="new-chat-stack" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {logs.map((log) => (
                    <div key={log.id} className="new-chat-line new-chat-line--agent" style={{ marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#00f59b' }}>LOG</span>
                      <p style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.text}</p>
                    </div>
                  ))}
                </div>`;

content = content.replace(chatStackOriginal, chatStackNew);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done replacing.');
