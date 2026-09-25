const fs = require('fs');

const AAVE_V2 = '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4';
const USDC    = '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E';

const files = ['.env', 'frontend/.env', 'apps/backend/.env', 'chatbot-server/.env', 'financial-agent/.env'];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const isVite = f.startsWith('frontend/');
  const prefix = isVite ? 'VITE_' : '';

  const upsert = (key, val) => {
    const re = new RegExp(`^${key}=.*`, 'm');
    if (re.test(text)) {
      text = text.replace(re, `${key}="${val}"`);
    } else {
      text = text.trimEnd() + `\n${key}="${val}"\n`;
    }
  };

  upsert(`${prefix}AAVE_YIELD_POOL`, AAVE_V2);
  // Replace old V1 pool if present
  text = text.replace(/0x9Ca9BE618Af518C9CE32fc4A6db3cAC5d880ac2d/g, AAVE_V2);
  // Replace old aMOCK ERC20 with canonical USDC everywhere in envs
  text = text.replace(/0xE3202980E8725d57cB8d6276EA1e2b5b48466c08/g, USDC);

  fs.writeFileSync(f, text, 'utf8');
  console.log(`Updated ${f}`);
}
