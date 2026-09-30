const fs = require('fs');
const filePath = './src/views/HomeView.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace state
const stateInjection = `  const [demoChat, setDemoChat] = useState([]);
  const [demoInput, setDemoInput] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoTxConfirmed, setDemoTxConfirmed] = useState({});

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    if (!demoInput.trim() || demoLoading) return;
    
    const userText = demoInput.trim();
    setDemoChat(prev => [...prev, { id: Date.now(), role: "user", text: userText }]);
    setDemoInput("");
    setDemoLoading(true);
    
    setTimeout(() => {
      let amount = 0;
      const amountMatch = userText.match(/(\\d+(\\.\\d+)?)/);
      if (amountMatch) amount = parseFloat(amountMatch[0]);
      
      let replyText = "";
      let actionObj = null;
      const isAave = userText.toLowerCase().includes('aave');
      const isSwap = userText.toLowerCase().includes('swap');
      const actionName = isSwap ? 'Swap' : (isAave ? 'Supply' : 'Transfer');
      
      if (amount > 1000) {
        replyText = \`The requested amount (\${amount} USDC) exceeds your $1,000 policy cap.\`;
        actionObj = { type: 'blocked', amount, error: 'Policy cap exceeded', name: actionName };
      } else if (amount > 0) {
        replyText = \`Checked your smart account path, balances, and policy. I can draft this as a scoped UserOperation.\`;
        actionObj = { type: 'success', amount, name: actionName, id: Date.now() + 1 };
      } else {
        replyText = \`I didn't detect a valid amount. Try "Supply 500 USDC to Aave V3".\`;
      }
      
      setDemoChat(prev => [...prev, { id: Date.now() + 2, role: "agent", text: replyText, action: actionObj }]);
      setDemoLoading(false);
    }, 1200);
  };
`;

content = content.replace(/const \[activeTab, setActiveTab\] = useState\('agent'\);/, stateInjection + "\n  const [activeTab, setActiveTab] = useState('agent');");

// Replace demo UI
const demoRegex = /<div className="new-agent-grid" style={{ display: 'block', padding: '24px' }}>[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/section>)/;

const newDemoUi = `<div className="new-agent-grid" style={{ display: 'flex', flexDirection: 'column', height: '500px', backgroundColor: '#07090e', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {demoChat.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>
                    <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                      <Activity size={24} color="#00f59b" />
                    </div>
                    <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>How can I help?</h3>
                    <p style={{ fontSize: '13px', maxWidth: '300px', margin: '0 auto' }}>I'm connected to your smart account. Try asking me to execute a transaction.</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '20px' }}>
                      <button type="button" onClick={() => setDemoInput('Supply 100 USDC to Aave V3')} style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>"Supply 100 USDC"</button>
                      <button type="button" onClick={() => setDemoInput('Swap 500 USDC on Uniswap')} style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>"Swap 500 USDC"</button>
                      <button type="button" onClick={() => setDemoInput('Supply 2500 USDC to Aave')} style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>"Test limit block"</button>
                    </div>
                  </div>
                )}
                
                {demoChat.map((msg) => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: msg.role === 'user' ? '#1f2937' : 'rgba(0,245,155,0.1)', display: 'grid', placeItems: 'center', color: msg.role === 'user' ? '#fff' : '#00f59b', flexShrink: 0 }}>
                      {msg.role === 'user' ? <UserIcon /> : <BotIcon size={14} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '80%', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: msg.role === 'user' ? '#1f2937' : '#111827', border: '1px solid rgba(255,255,255,0.05)', color: '#f3f4f6', fontSize: '14px', lineHeight: '1.5' }}>
                        {msg.text}
                      </div>
                      
                      {msg.action && (
                        <div className={\`new-action-card \${msg.action.type === 'blocked' ? 'new-action-card--blocked' : ''}\`} style={{ width: '100%', maxWidth: '400px', margin: 0 }}>
                          <div className="new-action-title">
                            <span>{msg.action.name} {msg.action.amount} USDC</span>
                            <span className={msg.action.type === 'blocked' ? 'new-tag new-tag--danger' : 'new-tag'}>
                              {msg.action.type === 'blocked' ? 'Blocked' : 'Demo APY'}
                            </span>
                          </div>
                          <div className="new-action-meta">
                            <div><span>Session key:</span> <b>0x4a1…F2c9</b></div>
                            <div><span>Policy:</span> <b>$1,000 demo cap</b></div>
                          </div>
                          <div className="new-card-status">
                            {msg.action.type === 'blocked' ? (
                              <span className="new-status-danger">x {msg.action.error}</span>
                            ) : demoTxConfirmed[msg.action.id] ? (
                              <span className="new-status-ok"><Check size={14} /> UserOp confirmed.</span>
                            ) : (
                              <span className="new-status-ok"><Check size={14} /> Ready to request signature.</span>
                            )}
                          </div>
                          {msg.action.type !== 'blocked' && (
                            <div className="new-confirm" style={{ borderTop: 'none', paddingTop: 0, paddingBottom: '12px', paddingLeft: '12px' }}>
                              <button 
                                className="new-btn new-btn-mint" 
                                style={{ padding: '6px 12px', fontSize: '12px', minHeight: 'auto' }}
                                onClick={() => setDemoTxConfirmed(prev => ({ ...prev, [msg.action.id]: true }))} 
                                disabled={demoTxConfirmed[msg.action.id]}
                              >
                                {demoTxConfirmed[msg.action.id] ? 'Confirmed' : 'Confirm Action'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {demoLoading && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(0,245,155,0.1)', display: 'grid', placeItems: 'center', color: '#00f59b' }}>
                      <BotIcon size={14} />
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '4px' }}>
                      <span className="animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00f59b' }}></span>
                      <span className="animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00f59b', animationDelay: '150ms' }}></span>
                      <span className="animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00f59b', animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: '#0b0f19' }}>
                <form onSubmit={handleDemoSubmit} style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={demoInput} 
                    onChange={e => setDemoInput(e.target.value)} 
                    placeholder="Ask the agent to do something..." 
                    style={{ flex: 1, backgroundColor: '#07090e', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '14px' }}
                    disabled={demoLoading}
                  />
                  <button 
                    type="submit" 
                    disabled={!demoInput.trim() || demoLoading}
                    style={{ backgroundColor: demoInput.trim() && !demoLoading ? '#00f59b' : '#1f2937', color: demoInput.trim() && !demoLoading ? '#000' : '#9ca3af', border: 'none', borderRadius: '12px', width: '46px', display: 'grid', placeItems: 'center', cursor: demoInput.trim() && !demoLoading ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 21 4l-7 17-2.5-7.5L4 12z" /></svg>
                  </button>
                </form>
              </div>
            </div>`;

content = content.replace(demoRegex, newDemoUi);
fs.writeFileSync(filePath, content, 'utf8');
console.log('done');
