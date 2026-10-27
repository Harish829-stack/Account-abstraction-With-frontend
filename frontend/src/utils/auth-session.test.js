import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletAuth } from './auth-session.js';

const address = '0x0000000000000000000000000000000000000001';
const origin = 'http://localhost:5173';
const message = `localhost:5173 wants you to sign in with your Ethereum account:\n${address}\n\nSign in to AA Smart Wallet. This does not authorize transactions.\n\nURI: ${origin}\nVersion: 1\nChain ID: 421614\nNonce: abcdef1234567890\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(Date.now() + 300000).toISOString()}`;
function setup(challengeMessage = message) {
  let signatures = 0;
  const auth = createWalletAuth({ baseUrl: 'http://backend', origin, fetchImpl: async (url) => ({
    ok: true, status: 200, json: async () => url.endsWith('/challenge')
      ? { challengeId: 'a'.repeat(64), message: challengeMessage }
      : { accessToken: 'test-token', expiresAt: Date.now() + 900000, address, chainId: 421614 }
  }) });
  const signer = { signMessage: async () => { signatures++; return 'test-signature'; } };
  auth.configure({ signer, address, chainId: 421614 });
  return { auth, signatures: () => signatures };
}
test('concurrent API requests share one SIWE prompt and keep the token in memory', async () => {
  const { auth, signatures } = setup();
  const results = await Promise.all([auth.headers(), auth.headers(), auth.headers()]);
  assert.equal(signatures(), 1);
  assert.deepEqual(results[0], { Authorization: 'Bearer test-token' });
});
test('refuses a challenge for another domain before asking the wallet to sign', async () => {
  const { auth, signatures } = setup(message.replace('localhost:5173 wants', 'attacker.example wants'));
  await assert.rejects(auth.headers());
  assert.equal(signatures(), 0);
});
test('disconnect immediately clears local authentication', async () => {
  const { auth } = setup();
  await auth.headers();
  auth.clear();
  await assert.rejects(auth.headers(), /Connect your wallet/);
});
test('a wallet switch invalidates a pending sign-in', async () => {
  let release;
  const { auth } = setup();
  auth.configure({ address, chainId: 421614, signer: { signMessage: () => new Promise((resolve) => { release = resolve; }) } });
  const pending = auth.headers();
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  auth.clear();
  release('test-signature');
  await assert.rejects(pending, /Wallet changed/);
});
