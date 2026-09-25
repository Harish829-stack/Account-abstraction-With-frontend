// financial-agent/db/prismaClient.js
// Singleton Prisma client for the financial-agent sidecar.
// Uses the shared DATABASE_URL — reads and writes only to the 3 new models.

'use strict';

const { PrismaClient } = require('@prisma/client');

let _client;

function getPrismaClient() {
  if (!_client) {
    _client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return _client;
}

module.exports = { getPrismaClient };
