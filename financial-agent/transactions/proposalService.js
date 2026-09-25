// financial-agent/transactions/proposalService.js
// ─────────────────────────────────────────────────────────────────────────────
// Transaction Proposal lifecycle state machine.
// Proposals are persisted in Postgres.
// The AI may PREPARE but never EXECUTE without explicit user confirmation.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { getPrismaClient } = require('../db/prismaClient');

const TTL_SECONDS = Number(process.env.TRANSACTION_PROPOSAL_TTL_SECONDS || 300);

/**
 * Valid status transitions.
 * @type {Record<string, string[]>}
 */
const TRANSITIONS = {
  DRAFT: ['AWAITING_CONFIRMATION'],
  AWAITING_CONFIRMATION: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['REVALIDATING'],
  REVALIDATING: ['SIMULATING', 'FAILED'],
  SIMULATING: ['EXECUTING', 'FAILED'],
  EXECUTING: ['SUBMITTED', 'FAILED'],
  SUBMITTED: ['CONFIRMED_ONCHAIN', 'FAILED'],
};

/**
 * Create a new transaction proposal in DRAFT status.
 * @param {{
 *   userId: string,
 *   smartAccountAddress: string,
 *   agentAddress: string,
 *   chainId: number,
 *   action: string,
 *   calls: Array<{target: string, value: string, callData: string}>,
 *   displayedSummary: object,
 *   financialContext: object,
 * }} data
 * @returns {Promise<object>}
 */
async function createProposal(data) {
  const prisma = getPrismaClient();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const proposal = await prisma.transactionProposal.create({
    data: {
      userId: data.userId,
      smartAccountAddress: data.smartAccountAddress.toLowerCase(),
      agentAddress: data.agentAddress.toLowerCase(),
      chainId: data.chainId,
      action: data.action,
      calls: data.calls,
      displayedSummary: data.displayedSummary,
      financialContext: data.financialContext,
      status: 'AWAITING_CONFIRMATION', // skip DRAFT — AI already prepared it
      expiresAt,
    },
  });

  // Audit log
  await _auditLog({
    userId: data.userId,
    proposalId: proposal.id,
    eventType: 'PROPOSAL_CREATED',
    metadata: { action: data.action, chainId: data.chainId },
  });

  return proposal;
}

/**
 * Get a proposal by ID with ownership check.
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getProposal(id, userId) {
  const prisma = getPrismaClient();
  const proposal = await prisma.transactionProposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError(`Proposal ${id} not found`);
  if (proposal.userId !== userId) throw new ForbiddenError('Proposal does not belong to this user');
  return _withExpiry(proposal);
}

/**
 * Confirm a proposal (user explicitly approves).
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function confirmProposal(id, userId) {
  const proposal = await getProposal(id, userId);
  _assertStatus(proposal, 'AWAITING_CONFIRMATION');
  _assertNotExpired(proposal);

  const prisma = getPrismaClient();
  const updated = await prisma.transactionProposal.update({
    where: { id },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });

  await _auditLog({ userId, proposalId: id, eventType: 'PROPOSAL_CONFIRMED', metadata: {} });
  return updated;
}

/**
 * Reject / cancel a proposal.
 * @param {string} id
 * @param {string} userId
 * @param {string} [reason]
 * @returns {Promise<object>}
 */
async function rejectProposal(id, userId, reason) {
  const proposal = await getProposal(id, userId);
  _assertStatus(proposal, 'AWAITING_CONFIRMATION');

  const prisma = getPrismaClient();
  const updated = await prisma.transactionProposal.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });

  await _auditLog({
    userId,
    proposalId: id,
    eventType: 'PROPOSAL_REJECTED',
    metadata: { reason: reason ?? 'User rejected' },
  });
  return updated;
}

/**
 * Advance proposal status (used internally by execution pipeline).
 * @param {string} id
 * @param {string} newStatus
 * @param {object} [extra] extra fields to update
 */
async function advanceStatus(id, newStatus, extra = {}) {
  const prisma = getPrismaClient();
  return prisma.transactionProposal.update({
    where: { id },
    data: { status: newStatus, ...extra },
  });
}

/**
 * Sweep expired proposals in AWAITING_CONFIRMATION status.
 * Call this periodically or on startup.
 */
async function sweepExpiredProposals() {
  const prisma = getPrismaClient();
  const result = await prisma.transactionProposal.updateMany({
    where: {
      status: 'AWAITING_CONFIRMATION',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    console.log(`[Proposals] Expired ${result.count} proposal(s)`);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _auditLog({ userId, proposalId, eventType, metadata }) {
  try {
    const prisma = getPrismaClient();
    await prisma.financialAuditLog.create({
      data: { userId, proposalId: proposalId ?? null, eventType, metadata: metadata ?? {} },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err.message);
  }
}

function _withExpiry(proposal) {
  return {
    ...proposal,
    isExpired: proposal.expiresAt < new Date() && proposal.status === 'AWAITING_CONFIRMATION',
  };
}

function _assertStatus(proposal, expected) {
  if (proposal.status !== expected) {
    throw new ConflictError(
      `Proposal is in status ${proposal.status} — expected ${expected}`
    );
  }
}

function _assertNotExpired(proposal) {
  if (proposal.expiresAt < new Date()) {
    throw new ConflictError('Proposal has expired — please create a new one');
  }
}

class NotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'NotFoundError'; this.statusCode = 404; }
}
class ForbiddenError extends Error {
  constructor(msg) { super(msg); this.name = 'ForbiddenError'; this.statusCode = 403; }
}
class ConflictError extends Error {
  constructor(msg) { super(msg); this.name = 'ConflictError'; this.statusCode = 409; }
}

module.exports = {
  createProposal,
  getProposal,
  confirmProposal,
  rejectProposal,
  advanceStatus,
  sweepExpiredProposals,
  NotFoundError,
  ForbiddenError,
  ConflictError,
};
