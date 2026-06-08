import { ethers } from 'ethers';

export function toHex(value) {
  return "0x" + BigInt(value).toString(16);
}

export async function getEthPriceInUsd(provider, priceFeedAddress) {
  try {
    if (!provider || !priceFeedAddress) return 3300;
    const priceFeed = new ethers.Contract(
      priceFeedAddress,
      ["function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"],
      provider
    );
    const data = await priceFeed.latestRoundData();
    const price = Number(data.answer) / 100000000;
    return price > 0 ? price : 3300;
  } catch (e) {
    console.warn("Failed to fetch price from Chainlink feed, using fallback 3300:", e);
    return 3300;
  }
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
