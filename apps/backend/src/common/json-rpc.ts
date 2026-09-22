export interface JsonRpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

export async function jsonRpcCall<T>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = 12_000
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (payload.error) throw new Error(payload.error.message || `${method} RPC error`);
    return payload.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export function toRpcQuantity(value: number): string {
  return `0x${value.toString(16)}`;
}
