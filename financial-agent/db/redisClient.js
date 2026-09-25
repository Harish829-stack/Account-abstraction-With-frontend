// financial-agent/db/redisClient.js
// Singleton ioredis client for the financial-agent sidecar.
// Uses the same REDIS_URL as apps/backend but namespaces all keys with "financial:".

'use strict';

const Redis = require('ioredis');

let _client;

function getRedisClient() {
  if (!_client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      console.warn('[Redis] REDIS_URL not set — caching disabled');
      return null;
    }
    _client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    _client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }
  return _client;
}

/**
 * Get a cached value. Returns null if cache miss or Redis unavailable.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function cacheGet(key) {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(`financial:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
async function cacheSet(key, value, ttlSeconds) {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(`financial:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache failures are non-fatal
  }
}

module.exports = { getRedisClient, cacheGet, cacheSet };
