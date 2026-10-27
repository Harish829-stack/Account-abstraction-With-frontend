'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const requestContext = new AsyncLocalStorage();

function getAuthorization() {
  return requestContext.getStore()?.authorization;
}

function createAuthMiddleware({ backendUrl, resolveAccount = () => undefined, fetchImpl = fetch }) {
  const base = (backendUrl || '').replace(/\/$/, '');
  return async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 4096) {
      return res.status(401).json({ code: 'SIGN_IN_REQUIRED', error: 'Sign in with your wallet to continue.' });
    }
    if (!base) return res.status(503).json({ code: 'AUTH_UNAVAILABLE', error: 'Authentication is unavailable.' });
    try {
      const account = resolveAccount(req);
      const chainId = Number(req.query?.chainId || req.body?.chainId || 421614);
      const response = await fetchImpl(`${base}/auth/authorize`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({ account, chainId })
      });
      if (!response.ok) {
        const status = [401, 403, 429].includes(response.status) ? response.status : 503;
        return res.status(status).json({ code: 'AUTH_REJECTED', error: status === 403
          ? 'You do not have access to this account.' : 'Wallet authentication is required or unavailable.' });
      }
      const session = await response.json();
      if (!/^0x[a-f0-9]{40}$/.test(session.address) || session.chainId !== chainId) {
        return res.status(403).json({ code: 'WRONG_SESSION', error: 'Sign in on the requested network.' });
      }
      const identities = [req.body?.userId, req.body?.ownerEoa, req.query?.userId, req.headers['x-user-id']];
      if (identities.some((value) => value !== undefined && (typeof value !== 'string' || value.toLowerCase() !== session.address))) {
        return res.status(403).json({ code: 'IDENTITY_MISMATCH', error: 'Request identity does not match the signed-in wallet.' });
      }
      req.auth = session;
      return requestContext.run({ authorization }, next);
    } catch {
      return res.status(503).json({ code: 'AUTH_UNAVAILABLE', error: 'Authentication is unavailable. Please try again.' });
    }
  };
}

module.exports = { createAuthMiddleware, getAuthorization };
