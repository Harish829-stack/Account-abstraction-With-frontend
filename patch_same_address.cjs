const fs = require('fs');

const envsToPatch = [
  '.env',
  'frontend/.env',
  'apps/backend/.env',
  'chatbot-server/.env',
  'financial-agent/.env'
];

const newValues = {
  // Deterministic exactly same across chains
  PRICE_FEED: "0x5e3075cbd05214408d32935D0f498b3B5676b280",
  ARBITRUM_PRICE_FEED: "0x5e3075cbd05214408d32935D0f498b3B5676b280",
  VITE_PRICE_FEED: "0x5e3075cbd05214408d32935D0f498b3B5676b280",

  MOCK_AGGREGATOR: "0x5e3075cbd05214408d32935D0f498b3B5676b280",
  ARBITRUM_MOCKAGG: "0x5e3075cbd05214408d32935D0f498b3B5676b280",

  USDC_TOKEN: "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E",
  ARBITRUM_USDC: "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E",
  SEPOLIA_USDC_TOKEN: "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E",
  USDC_SEPOLIA: "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E",
  VITE_USDC_TOKEN: "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E",

  UNISWAP_ROUTER: "0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F"
};

for (const envFile of envsToPatch) {
  if (!fs.existsSync(envFile)) continue;
  let content = fs.readFileSync(envFile, 'utf8');
  let lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#') || !line.includes('=')) continue;
    
    const [key, ...rest] = line.split('=');
    const actualKey = key.trim();
    
    if (newValues[actualKey] !== undefined) {
      lines[i] = `${actualKey}="${newValues[actualKey]}"`;
    }
  }
  
  fs.writeFileSync(envFile, lines.join('\n'), 'utf8');
  console.log(`Updated ${envFile}`);
}
