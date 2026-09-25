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
};

// Map script aliases to the expected prefixed names in frontend
const aliasMap = {
  'frontend/.env': (k) => 'VITE_' + k
};

for (const envFile of envsToPatch) {
  if (!fs.existsSync(envFile)) continue;
  let content = fs.readFileSync(envFile, 'utf8');
  let lines = content.split('\n');
  
  const existingKeys = new Set(
    lines.filter(l => !l.startsWith('#') && l.includes('='))
         .map(l => l.split('=')[0].trim())
  );
  
  let changed = false;
  
  for (const [key, val] of Object.entries(newValues)) {
    const actualKey = aliasMap[envFile] ? aliasMap[envFile](key) : key;
    
    if (!existingKeys.has(actualKey)) {
      lines.push(`${actualKey}="${val}"`);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(envFile, lines.join('\n') + '\n', 'utf8');
    console.log(`Appended missing keys to ${envFile}`);
  }
}
