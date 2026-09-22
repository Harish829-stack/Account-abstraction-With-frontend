const CONFIG_API_URL = import.meta.env.VITE_CONFIG_API_URL || "";

function getApiBase() {
  return CONFIG_API_URL.replace(/\/$/, "");
}

async function request(path, options = {}) {
  const base = getApiBase();
  if (!base) return null;

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Backend request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function upsertSmartAccount({ address, ownerEoa, chainId, salt = "0x" }) {
  return request("/accounts/upsert", {
    method: "POST",
    body: JSON.stringify({ address, ownerEoa, chainId, salt }),
  });
}

export async function saveUserOperation({
  hash,
  smartAccountAddress,
  ownerEoa,
  chainId,
  label,
  calldata = "0x",
  status = "pending",
  txHash,
  receipt,
}) {
  return request("/user-ops", {
    method: "POST",
    body: JSON.stringify({
      hash,
      smartAccountAddress,
      ownerEoa,
      chainId,
      label,
      calldata,
      status,
      txHash,
      receipt,
    }),
  });
}

export async function updateUserOperationStatus(hash, { status, txHash, confirmedBlock, confirmedAt, droppedAt, receipt }) {
  return request(`/user-ops/${hash}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, txHash, confirmedBlock, confirmedAt, droppedAt, receipt }),
  });
}

export async function getUserOperation(hash) {
  return request(`/user-ops/${hash}`);
}

export async function getAccountHistory({ smartAccountAddress, chainId, limit = 10 }) {
  const params = new URLSearchParams({ chainId: String(chainId), limit: String(limit) });
  return request(`/accounts/${smartAccountAddress}/history?${params.toString()}`);
}

export async function getDashboardSummary({ smartAccountAddress, chainId }) {
  const params = new URLSearchParams({ chainId: String(chainId) });
  return request(`/dashboard/${smartAccountAddress}?${params.toString()}`);
}

export async function revokePersistedAgent({ smartAccountAddress, agentAddress, chainId, txHashRevoke }) {
  return request(`/agents/${smartAccountAddress}/${agentAddress}/revoke`, {
    method: "PATCH",
    body: JSON.stringify({ chainId, txHashRevoke }),
  });
}

export async function revokeAllPersistedAgents({ smartAccountAddress, chainId, txHashRevoke }) {
  const params = new URLSearchParams({ chainId: String(chainId) });
  if (txHashRevoke) params.set("txHashRevoke", txHashRevoke);
  return request(`/agents/${smartAccountAddress}?${params.toString()}`, {
    method: "DELETE",
  });
}

export async function syncPersistedAgents({ smartAccountAddress, chainId, moduleInstalled, activeAgentAddresses }) {
  return request(`/agents/${smartAccountAddress}/sync`, {
    method: "POST",
    body: JSON.stringify({
      chainId,
      moduleInstalled,
      activeAgentAddresses,
    }),
  });
}

export async function getAdminConfig() {
  return request("/admin/config");
}

export async function upsertAdminChain(chain) {
  return request("/admin/chains", {
    method: "POST",
    body: JSON.stringify(chain),
  });
}

export async function updateAdminChain(chainId, patch) {
  return request(`/admin/chains/${chainId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function updateAdminChainContracts(chainId, contracts) {
  return request(`/admin/chains/${chainId}/contracts`, {
    method: "PATCH",
    body: JSON.stringify({ contracts }),
  });
}

export async function updateSharedContracts(contracts) {
  return request("/admin/shared-contracts", {
    method: "PATCH",
    body: JSON.stringify({ contracts }),
  });
}

export async function getObservabilitySummary() {
  return request("/observability/summary");
}

export async function getDebugUserOps({ status, chainId, limit = 10 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  if (chainId) params.set("chainId", String(chainId));
  return request(`/observability/user-ops?${params.toString()}`);
}

export async function pollReceipts() {
  return request("/receipts/poll", { method: "POST" });
}

export async function pollIndexer() {
  return request("/indexer/poll", { method: "POST" });
}
