const fs = require('fs');

const envsToPatch = [
  '.env',
  'frontend/.env',
  'apps/backend/.env',
  'chatbot-server/.env',
  'financial-agent/.env'
];

const newValues = {
  CREATE3_FACTORY: "0x220FF47e4E2094857e7e4FF4a5069fad5367EA3C",
  PAYMASTER: "0x505Ff509afb5b3a269D1bF504b8803acfFc0F55b",
  MULTITOKEN_PAYMASTER: "0x505Ff509afb5b3a269D1bF504b8803acfFc0F55b",
  ERC20PAYMASTER: "0x505Ff509afb5b3a269D1bF504b8803acfFc0F55b",
  NEXUS_IMPLEMENTATION: "0x33Dde3E3E83592870b174e8857029736EAB8F0Fd",
  NEXUS_BOOTSTRAP: "0xa0F851A57b3C5b1A1Ad457e4b820cdDCd99F1bE7",
  K1_VALIDATOR_FACTORY: "0xEaa1ae3Ad4B332eF702ab230211f6E3CdbcC9C35",
  K1_VALIDATOR: "0x98a813a311f5Cc64719809311D15626138997Cbf",
  SESSION_KEY_VALIDATOR: "0x9B7Fd296B6b332b525Bd6AD65f621D25C0060323",
  SOCIAL_RECOVERY_VALIDATOR: "0x655cED72A817629d9c641D5D70615ab360D9796c",
  WEBAUTHN_VALIDATOR: "0xB32e09e7f02e15168C2b21bbB5b387356AA4B5B4",
  ARBITRUM_RPC_URL: "https://arbitrum-sepolia.infura.io/v3/a710f8c2379a44fda67fce69cf197679",
  ARBITRUM_MOCKAGG: "0x65941BB1608FBbcD49fd640150b0B181a904461A",
  ARBITRUM_PRICE_FEED: "0x65941BB1608FBbcD49fd640150b0B181a904461A",
  ARBITRUM_USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  SEPOLIA_USDC_TOKEN: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  SEPOLIA_EURC_TOKEN: "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4"
};

// Aliases based on typical vite .env prefixing
const aliases = {
  VITE_CREATE3FACTORY: 'CREATE3_FACTORY',
  VITE_PAYMASTER: 'PAYMASTER',
  VITE_NEXUS_IMPLEMENTATION: 'NEXUS_IMPLEMENTATION',
  VITE_NEXUS_BOOTSTRAP: 'NEXUS_BOOTSTRAP',
  VITE_K1_VALIDATOR: 'K1_VALIDATOR',
  VITE_SESSION_KEY_VALIDATOR: 'SESSION_KEY_VALIDATOR',
  VITE_SOCIAL_RECOVERY_VALIDATOR: 'SOCIAL_RECOVERY_VALIDATOR',
  VITE_WEBAUTHN_VALIDATOR: 'WEBAUTHN_VALIDATOR',
  VITE_USDC_TOKEN: 'SEPOLIA_USDC_TOKEN',
  USDC_TOKEN: 'SEPOLIA_USDC_TOKEN'
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
    
    // Check if key is directly in newValues
    if (newValues[actualKey] !== undefined) {
      lines[i] = `${actualKey}="${newValues[actualKey]}"`;
    } 
    // Check if key maps to an alias in newValues
    else if (aliases[actualKey] !== undefined && newValues[aliases[actualKey]] !== undefined) {
      lines[i] = `${actualKey}="${newValues[aliases[actualKey]]}"`;
    }
  }
  
  fs.writeFileSync(envFile, lines.join('\n'), 'utf8');
  console.log(`Updated ${envFile}`);
}
