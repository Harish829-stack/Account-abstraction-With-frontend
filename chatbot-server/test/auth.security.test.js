'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware, getAuthorization } = require('../../packages/server-auth');

const address = '0x0000000000000000000000000000000000000001';
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
test('protected agent routes reject missing tokens before contacting any backend', async () => {
  let called = false;
  const middleware = createAuthMiddleware({ backendUrl: 'http://backend', fetchImpl: async () => { called = true; } });
  const res = response();
  await middleware({ headers: {}, body: {}, query: {} }, res, () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});
test('caller-supplied identity cannot impersonate another user', async () => {
  const middleware = createAuthMiddleware({ backendUrl: 'http://backend', fetchImpl: async () => ({
    ok: true, json: async () => ({ address, chainId: 421614 })
  }) });
  const res = response();
  await middleware({ headers: { authorization: 'Bearer token' }, body: { userId: 'someone-else' }, query: {} }, res,
    () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 403);
});
test('forwards only verified request credentials and preserves them across async calls', async () => {
  let sent;
  const middleware = createAuthMiddleware({ backendUrl: 'http://backend', resolveAccount: () => address,
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return { ok: true, json: async () => ({ address, chainId: 421614 }) };
    }
  });
  const req = { headers: { authorization: 'Bearer token' }, body: { chainId: 421614 }, query: {} };
  await middleware(req, response(), async () => {
    await Promise.resolve();
    assert.equal(getAuthorization(), 'Bearer token');
    assert.equal(req.auth.address, address);
  });
  assert.equal(sent.options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(sent.options.body), { account: address, chainId: 421614 });
  assert.equal(getAuthorization(), undefined);
});
test('backend outage fails closed and does not leak upstream errors', async () => {
  const middleware = createAuthMiddleware({ backendUrl: 'http://backend', fetchImpl: async () => { throw new Error('secret-upstream-detail'); } });
  const res = response();
  await middleware({ headers: { authorization: 'Bearer token' }, body: {}, query: {} }, res,
    () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes('secret-upstream-detail'));
});
