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

export async function getAccountHistory({ smartAccountAddress, chainId, limit = 10 }) {
  const params = new URLSearchParams({ chainId: String(chainId), limit: String(limit) });
  return request(`/accounts/${smartAccountAddress}/history?${params.toString()}`);
}
