import type { AppConfigResponse, SerializedChainConfig } from "./config.types";

const env = process.env;
const CANONICAL_MOCK_USDC = "0x4665ed736379C8B1BeDe411EBcDA607dd4cab96E";
const SEPOLIA_MOCK_WETH = "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c";
const ARBITRUM_SEPOLIA_WETH = "0x980B3b374e3c40ffBf522c74C3470D4E01B7c773";
const AAVE_YIELD_POOL_V2 = "0xd5263f6Bc6fcD4e969E5F4ffF89359989b52831A";
const MOCK_UNISWAP_ROUTER = "0x1e473E7A8C2EB73B744321D4CFD73195B1Ed996F";
const SEPOLIA_UNISWAP_QUOTER = "0xedEa35800073054Fe6b994d240C0303756Bd0453";
const ARBITRUM_SEPOLIA_UNISWAP_QUOTER = "0x27f9712A3d0335c49ae639e1F1C1c52E58c28f2A";

export const SHARED_CONTRACT_SEED: Record<string, string> = {
  ENTRY_POINT: env.ENTRY_POINT || "",
  CREATE3_FACTORY: env.CREATE3_FACTORY || "",
  FACTORY: env.FACTORY || "",
  OLD_EOA_FACTORY: env.OLD_EOA_FACTORY || "",
  NEXUS_IMPLEMENTATION: env.NEXUS_IMPLEMENTATION || "",
  NEXUS_BOOTSTRAP: env.NEXUS_BOOTSTRAP || "",
  K1_VALIDATOR: env.K1_VALIDATOR || "",
  SESSION_KEY_VALIDATOR: env.SESSION_KEY_VALIDATOR || "",
  SOCIAL_RECOVERY_VALIDATOR: env.SOCIAL_RECOVERY_VALIDATOR || "",
  WEBAUTHN_VALIDATOR: env.WEBAUTHN_VALIDATOR || "",
  WEBAUTHN_VALIDATOR_OLD: env.WEBAUTHN_VALIDATOR_OLD || ""
};

export const CHAIN_CONFIG_SEED: SerializedChainConfig[] = [
  {
    chainId: 11155111,
    name: "Sepolia",
    isTestnet: true,
    isActive: true,
    viewOnly: false,
    rpcUrl: env.PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
    bundlerUrl: env.PUBLIC_SEPOLIA_BUNDLER_URL || "",
    explorerUrl: "https://sepolia.etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 11155111,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "1500000000",
    minFeeWei: "5000000000",
    contracts: {
      paymaster: env.PAYMASTER || "",
      usdcToken: env.USDC_TOKEN || CANONICAL_MOCK_USDC,
      wethToken: env.WETH_TOKEN || SEPOLIA_MOCK_WETH,
      eurcToken: "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4",
      priceFeed: env.SEPOLIA_PRICE_FEED || "0x694AA1769357215DE4FAC081bf1f309aDC325306",
      multisigProxy: env.MULTISIG_PROXY || "",
      aavePool: env.AAVE_YIELD_POOL || AAVE_YIELD_POOL_V2,
      uniswapRouter: env.UNISWAP_ROUTER || MOCK_UNISWAP_ROUTER,
      uniswapQuoter: env.UNISWAP_QUOTER || SEPOLIA_UNISWAP_QUOTER
    }
  },
  {
    chainId: 80002,
    name: "Polygon Amoy",
    isTestnet: true,
    isActive: true,
    viewOnly: false,
    rpcUrl: env.PUBLIC_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/",
    bundlerUrl: env.PUBLIC_AMOY_BUNDLER_URL || "",
    explorerUrl: "https://amoy.polygonscan.com",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 80002,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    minPriorityFeeWei: "30000000000",
    minFeeWei: "35000000000",
    contracts: {
      paymaster: env.PAYMASTER || "",
      usdcToken: CANONICAL_MOCK_USDC,
      priceFeed: env.MOCK_AGGREGATOR || "",
      multisigProxy: env.MULTISIG_PROXY || ""
    }
  },
  {
    chainId: 17000,
    name: "Holesky",
    isTestnet: true,
    isActive: false,
    viewOnly: true,
    rpcUrl: "",
    bundlerUrl: "",
    explorerUrl: "https://holesky.etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 17000,
    nativeCurrency: { name: "Holesky Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "1500000000",
    minFeeWei: "5000000000",
    contracts: {}
  },
  {
    chainId: 84532,
    name: "Base Sepolia",
    isTestnet: true,
    isActive: false,
    viewOnly: true,
    rpcUrl: "",
    bundlerUrl: "",
    explorerUrl: "https://sepolia.basescan.org",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 84532,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "1500000000",
    minFeeWei: "5000000000",
    contracts: {}
  },
  {
    chainId: 11155420,
    name: "Optimism Sepolia",
    isTestnet: true,
    isActive: false,
    viewOnly: true,
    rpcUrl: "",
    bundlerUrl: "",
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 11155420,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "1500000000",
    minFeeWei: "5000000000",
    contracts: {}
  },
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    isTestnet: true,
    isActive: true,
    viewOnly: false,
    rpcUrl: env.PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    bundlerUrl: env.PUBLIC_ARBITRUM_SEPOLIA_BUNDLER_URL || "",
    explorerUrl: "https://sepolia.arbiscan.io",
    explorerApiUrl: "https://api-sepolia.arbiscan.io/api",
    explorerApiChainId: 421614,
    nativeCurrency: { name: "Arbitrum Sepolia Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "150000000",
    minFeeWei: "500000000",
    contracts: {
      paymaster: env.PAYMASTER || "",
      usdcToken: env.USDC_TOKEN || CANONICAL_MOCK_USDC,
      wethToken: env.WETH_TOKEN || ARBITRUM_SEPOLIA_WETH,
      priceFeed: env.ARBITRUM_SEPOLIA_PRICE_FEED || "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
      multisigProxy: env.MULTISIG_PROXY || "",
      aavePool: env.AAVE_YIELD_POOL || AAVE_YIELD_POOL_V2,
      uniswapRouter: env.UNISWAP_ROUTER || MOCK_UNISWAP_ROUTER,
      uniswapQuoter: env.UNISWAP_QUOTER || ARBITRUM_SEPOLIA_UNISWAP_QUOTER
    }
  }
];

export const STATIC_CONFIG_RESPONSE: AppConfigResponse = {
  chains: CHAIN_CONFIG_SEED.filter((chain) => chain.isActive),
  sharedContracts: Object.fromEntries(
    Object.entries(SHARED_CONTRACT_SEED).filter(([, address]) => Boolean(address))
  )
};
