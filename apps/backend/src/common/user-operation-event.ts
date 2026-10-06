export const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

export function parseUserOperationEventSuccess(data: string, fallback = true): boolean {
  const normalized = data.startsWith("0x") ? data.slice(2) : data;
  const successWord = normalized.slice(64, 128);
  if (!successWord) return fallback;
  return BigInt(`0x${successWord}`) !== 0n;
}
