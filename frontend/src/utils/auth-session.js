// Session credentials intentionally remain in module memory, never browser storage.
export function createWalletAuth({ baseUrl, origin, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/$/, '');
  let wallet = null;
  let session = null;
  let pending = null;
  let version = 0;
  let rejection = null;

  async function request(path, body, token) {
    const response = await fetchImpl(`${base}/auth/${path}`, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const error = new Error('Wallet sign-in is unavailable. Please reconnect and try again.');
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  function clear() {
    const previous = session;
    version++;
    wallet = null;
    session = null;
    pending = null;
    rejection = null;
    if (previous) void request('logout', null, previous.accessToken).catch(() => {});
  }

  function configure(next) {
    clear();
    wallet = { ...next, address: next.address.toLowerCase(), chainId: Number(next.chainId) };
  }

  async function signIn() {
    if (!base || !wallet?.signer) throw new Error('Connect your wallet to sign in.');
    if (rejection) throw rejection;
    const active = wallet;
    const started = version;
    const challenge = await request('challenge', { address: active.address, chainId: active.chainId });
    const lines = typeof challenge.message === 'string' ? challenge.message.split('\n') : [];
    const domain = new URL(origin).host;
    if (lines[0] !== `${domain} wants you to sign in with your Ethereum account:`
      || lines[1]?.toLowerCase() !== active.address
      || lines[3] !== 'Sign in to AA Smart Wallet. This does not authorize transactions.'
      || lines[5] !== `URI: ${origin}` || lines[6] !== 'Version: 1' || lines[7] !== `Chain ID: ${active.chainId}`
      || !/^Nonce: [a-zA-Z0-9]{8,}$/.test(lines[8] || '') || lines.length !== 11
      || !lines[9].startsWith('Issued At: ') || !lines[10].startsWith('Expiration Time: ')
      || !Number.isFinite(Date.parse(lines[9].slice(11)))
      || !(Date.parse(lines[10].slice(17)) > Date.now())
      || started !== version) throw new Error('Unexpected sign-in request. Please reconnect your wallet.');
    let signature;
    try { signature = await active.signer.signMessage(challenge.message); }
    catch (error) {
      if (started === version && (error.code === 4001 || error.code === 'ACTION_REJECTED')) rejection = error;
      throw error;
    }
    if (started !== version) throw new Error('Wallet changed during sign-in.');
    const result = await request('verify', { challengeId: challenge.challengeId, signature });
    if (started !== version) {
      if (result?.accessToken) void request('logout', null, result.accessToken).catch(() => {});
      throw new Error('Wallet changed during sign-in.');
    }
    if (result.address !== active.address || result.chainId !== active.chainId
      || typeof result.accessToken !== 'string' || !result.accessToken || !(result.expiresAt > Date.now())) {
      throw new Error('Invalid wallet session.');
    }
    session = result;
    return result;
  }

  async function headers() {
    if (!wallet) throw new Error('Connect your wallet to sign in.');
    if (session && session.expiresAt > Date.now() + 10000) return { Authorization: `Bearer ${session.accessToken}` };
    if (!pending) {
      const current = signIn();
      pending = current;
      void current.finally(() => { if (pending === current) pending = null; }).catch(() => {});
    }
    const result = await pending;
    return { Authorization: `Bearer ${result.accessToken}` };
  }
  return { configure, clear, headers };
}
