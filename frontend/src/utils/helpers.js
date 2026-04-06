export function toHex(value) {
  return "0x" + BigInt(value).toString(16);
}

export function formatNum(value, decimals = 18) {
  if (!value) return "0.0";
  const num = Number(value) / (10 ** decimals);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function shortenAddress(address) {
  if (!address) return "0x000...0000";
  return address.slice(0, 6) + "..." + address.slice(-4);
}
