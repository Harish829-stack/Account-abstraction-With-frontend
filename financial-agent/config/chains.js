// financial-agent/config/chains.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for chain-specific protocol configuration.
//
// Rules:
//   • All addresses are EIP-55 checksummed (ethers.getAddress verified)
//   • Protocol addresses live HERE — never in .env
//   • .env holds only runtime secrets: RPC URLs, bundler URLs, API keys
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * @typedef {Object} ChainConfig
 * @property {number} chainId
 * @property {string} name
 * @property {string} nativeSymbol
 * @property {string} rpcUrl
 * @property {string} [bundlerUrl]
 * @property {string} entryPointAddress
 * @property {string} sessionKeyValidatorAddress
 * @property {string} usdcAddress
 * @property {string} [wethAddress]
 * @property {string} [uniswapFactoryAddress]
 * @property {string} [uniswapRouterAddress]
 * @property {string} [uniswapQuoterV2Address]
 * @property {string} [aavePoolAddress]
 * @property {string} [aaveDataProviderAddress]
 * @property {string} [aavePoolAddressesProvider]
 */

/** @type {Record<number, ChainConfig>} */
const CHAIN_CONFIGS = {

  // ── Ethereum Sepolia (11155111) ─────────────────────────────────────────────
  // Aave:    https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses
  // Uniswap: https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
  11155111: {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    nativeSymbol: 'ETH',

    rpcUrl:    process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    bundlerUrl: process.env.ETHEREUM_SEPOLIA_BUNDLER_URL,

    entryPointAddress:         '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    sessionKeyValidatorAddress: '0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44',

    // ── Tokens ─────────────────────────────────────────────────────────────────
    // Canonical MockUSDC — 6 decimals, used by both Uniswap router and Aave pool.
    // Deployed via CREATE3 salt "MOCK_USDC_V1" from deployUniswapMock.ts
    usdcAddress: '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E',
    // Aave Mock WETH — verified via DataProvider.getAllReservesTokens() on Sepolia
    wethAddress: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c',

    // All ERC-20 tokens to scan in portfolio (in addition to native ETH)
    tokens: [
      { symbol: 'USDC', address: '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E', priceSymbol: 'USDC' },
      { symbol: 'WETH', address: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c', priceSymbol: 'ETH'  },
      { symbol: 'aUSDC (Aave)', address: '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4', priceSymbol: 'USDC' },
    ],

    // Uniswap V3 — all checksummed
    uniswapFactoryAddress:  '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    uniswapRouterAddress:   '0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F',
    uniswapQuoterV2Address: '0xedEa35800073054Fe6b994d240C0303756Bd0453',

    // AaveYieldPool V2 — deployed with canonical MockUSDC (0x4665...) as staking token
    // salt "AAVE_YIELD_POOL_V2" via CREATE3, same address on all chains
    aavePoolAddress:           '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4',
    aaveDataProviderAddress:   undefined,
    aavePoolAddressesProvider: undefined,
  },

  // ── Arbitrum Sepolia (421614) ───────────────────────────────────────────────
  // Aave:    https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses
  // Uniswap: https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments
  421614: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    nativeSymbol: 'ETH',

    rpcUrl:    process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    bundlerUrl: process.env.ARBITRUM_SEPOLIA_BUNDLER_URL,

    entryPointAddress:         '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    sessionKeyValidatorAddress: '0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44',

    // Canonical MockUSDC — same CREATE3 salt as Sepolia, same address on all chains.
    usdcAddress: '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E',
    // L2 WETH — checksummed
    wethAddress: '0x980B3b374e3c40ffBf522c74C3470D4E01B7c773',

    tokens: [
      { symbol: 'USDC', address: '0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E', priceSymbol: 'USDC' },
      { symbol: 'WETH', address: '0x980B3b374e3c40ffBf522c74C3470D4E01B7c773', priceSymbol: 'ETH'  },
      { symbol: 'aUSDC (Aave)', address: '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4', priceSymbol: 'USDC' },
    ],

    // MockUniswapRouter — same salt, same address as Sepolia
    uniswapFactoryAddress:  '0x248aB79ac9Dc53e132F7797b9c9D0E4DccC32189',
    uniswapRouterAddress:   '0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F',
    uniswapQuoterV2Address: '0x27f9712A3d0335c49ae639e1F1C1c52E58c28f2A',

    // AaveYieldPool V2 — same address across chains
    aavePoolAddress:           '0xAB49984529296Ead4dF03309BFeA6b273d9d34E4',
    aaveDataProviderAddress:   undefined,
    aavePoolAddressesProvider: undefined,
  },

  // ── Polygon Amoy (80002) ────────────────────────────────────────────────────
  // DeFi protocols not yet verified — portfolio read-only only
  80002: {
    chainId: 80002,
    name: 'Polygon Amoy',
    nativeSymbol: 'POL',

    rpcUrl:    process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com',
    bundlerUrl: process.env.POLYGON_AMOY_BUNDLER_URL,

    entryPointAddress:         '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    sessionKeyValidatorAddress: '0xC578bF1899fF9E49d0FC65BE5b1a0A26EB11aF44',

    usdcAddress:     '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    aaveUsdcAddress: undefined,
    wethAddress:     undefined,

    tokens: [
      { symbol: 'USDC', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', priceSymbol: 'USDC' },
    ],

    uniswapFactoryAddress:  undefined,
    uniswapRouterAddress:   undefined,
    uniswapQuoterV2Address: undefined,

    aavePoolAddress:           undefined,
    aaveDataProviderAddress:   undefined,
    aavePoolAddressesProvider: undefined,
  },
};

/**
 * Retrieve config for a chain, throwing if unknown.
 * @param {number} chainId
 * @returns {ChainConfig}
 */
function getChainConfig(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    const supported = Object.keys(CHAIN_CONFIGS).join(', ');
    throw new Error(`Unsupported chainId ${chainId}. Supported: ${supported}`);
  }
  return config;
}

/**
 * Check whether a DeFi feature is available on a chain.
 * @param {number} chainId
 * @param {'aave'|'uniswap'} feature
 * @returns {boolean}
 */
function hasFeature(chainId, feature) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) return false;
  if (feature === 'aave')    return Boolean(config.aavePoolAddress);
  if (feature === 'uniswap') return Boolean(config.uniswapRouterAddress);
  return false;
}

/**
 * Return all chainIds that support a given feature.
 * @param {'aave'|'uniswap'} feature
 * @returns {number[]}
 */
function chainsWithFeature(feature) {
  return Object.values(CHAIN_CONFIGS)
    .filter(c => hasFeature(c.chainId, feature))
    .map(c => c.chainId);
}

module.exports = { CHAIN_CONFIGS, getChainConfig, hasFeature, chainsWithFeature };
