const env = import.meta.env;

export const SHARED_CONTRACTS = {
  ENTRY_POINT: env.VITE_ENTRY_POINT,
  CREATE3_FACTORY: env.VITE_CREATE3FACTORY,
  FACTORY: env.VITE_FACTORY,
  OLD_EOA_FACTORY: env.VITE_OLD_EOA_FACTORY,
  NEXUS_IMPLEMENTATION: env.VITE_NEXUS_IMPLEMENTATION,
  NEXUS_BOOTSTRAP: env.VITE_NEXUS_BOOTSTRAP,
  K1_VALIDATOR: env.VITE_K1_VALIDATOR,
  SESSION_KEY_VALIDATOR: env.VITE_SESSION_KEY_VALIDATOR,
  SOCIAL_RECOVERY_VALIDATOR: env.VITE_SOCIAL_RECOVERY_VALIDATOR,
  WEBAUTHN_VALIDATOR: env.VITE_WEBAUTHN_VALIDATOR,
  WEBAUTHN_VALIDATOR_OLD: env.VITE_WEBAUTHN_VALIDATOR_OLD,
};

const getAmoyBundlerUrl = () => {
  if (env.VITE_PIMLICO_BUNDLER_URL) {
    return env.VITE_PIMLICO_BUNDLER_URL.replace("137", "80002");
  }
  return env.VITE_SKANDHA_RPC_URL?.replace("11155111", "80002") || "";
};

export const CHAIN_REGISTRY = [
  {
    chainId: 11155111,
    name: "Sepolia",
    isTestnet: true,
    isActive: true,
    viewOnly: false,
    rpcUrl: env.VITE_SEPOLIA_RPC_URL,
    bundlerUrl: env.VITE_SKANDHA_RPC_URL,
    explorerUrl: "https://sepolia.etherscan.io",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 11155111,
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    minPriorityFeeWei: "1500000000",
    minFeeWei: "5000000000",
    contracts: {
      paymaster: env.VITE_PAYMASTER,
      usdcToken: env.VITE_USDC_TOKEN,
      eurcToken: "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4",
      priceFeed: env.VITE_PRICE_FEED,
      multisigProxy: env.VITE_MULTISIG_PROXY,
    },
    switchNetwork: {
      chainName: "Sepolia Test Network",
      rpcUrls: [env.VITE_SEPOLIA_RPC_URL || "https://rpc.sepolia.org"],
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
  },
  {
    chainId: 80002,
    name: "Polygon Amoy",
    isTestnet: true,
    isActive: true,
    viewOnly: false,
    rpcUrl: env.VITE_AMOY_RPC_URL,
    bundlerUrl: getAmoyBundlerUrl(),
    explorerUrl: "https://amoy.polygonscan.com",
    explorerApiUrl: "https://api.etherscan.io/v2/api",
    explorerApiChainId: 80002,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    minPriorityFeeWei: "30000000000",
    minFeeWei: "35000000000",
    contracts: {
      paymaster: env.VITE_PAYMASTER,
      usdcToken: "0xA0C3907b1fc323AdB95dA27e08e289deaE87BD8C",
      priceFeed: env.VITE_MOCK_AGGREGATOR,
      multisigProxy: env.VITE_MULTISIG_PROXY,
    },
    switchNetwork: {
      chainName: "Polygon Amoy Testnet",
      rpcUrls: [env.VITE_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/"],
      blockExplorerUrls: ["https://amoy.polygonscan.com/"],
    },
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
    contracts: {},
    switchNetwork: {
      chainName: "Holesky Testnet",
      rpcUrls: ["https://ethereum-holesky-rpc.publicnode.com"],
      blockExplorerUrls: ["https://holesky.etherscan.io"],
    },
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
    contracts: {},
    switchNetwork: {
      chainName: "Base Sepolia",
      rpcUrls: ["https://sepolia.base.org"],
      blockExplorerUrls: ["https://sepolia.basescan.org"],
    },
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
    contracts: {},
    switchNetwork: {
      chainName: "Optimism Sepolia",
      rpcUrls: ["https://sepolia.optimism.io"],
      blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"],
    },
  },
];

const CONFIG_CACHE_KEY = "aa_wallet_config";
let configLoadPromise = null;

function readCachedConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedConfig(config) {
  try {
    window.localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Cache writes are best-effort only.
  }
}

function applyRemoteConfig(config) {
  if (!config || !Array.isArray(config.chains)) return;

  const staticByChainId = new Map(CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]));
  const remoteChains = config.chains.map((chain) => ({
    ...(staticByChainId.get(chain.chainId) || {}),
    ...chain,
  }));

  CHAIN_REGISTRY.splice(0, CHAIN_REGISTRY.length, ...remoteChains);

  if (config.sharedContracts && typeof config.sharedContracts === "object") {
    Object.assign(SHARED_CONTRACTS, config.sharedContracts);
  }
}

async function loadRemoteConfig() {
  if (!env.VITE_CONFIG_API_URL) return null;
  if (!configLoadPromise) {
    configLoadPromise = fetch(`${env.VITE_CONFIG_API_URL.replace(/\/$/, "")}/config`)
      .then((res) => {
        if (!res.ok) throw new Error(`Config request failed: ${res.status}`);
        return res.json();
      })
      .then((config) => {
        applyRemoteConfig(config);
        writeCachedConfig(config);
        return config;
      })
      .catch((error) => {
        console.warn("[chains] Falling back to static config:", error);
        return null;
      })
      .finally(() => {
        configLoadPromise = null;
      });
  }
  return configLoadPromise;
}

applyRemoteConfig(readCachedConfig());
void loadRemoteConfig();

export function getSupportedChains({ includeViewOnly = false } = {}) {
  return CHAIN_REGISTRY.filter((chain) => chain.isActive || (includeViewOnly && chain.viewOnly));
}

export function getSupportedChainIds(options) {
  return getSupportedChains(options).map((chain) => chain.chainId);
}

export function getDefaultChainId() {
  return Number(env.VITE_CHAIN_ID || getSupportedChains()[0]?.chainId || 11155111);
}

export function getChainConfig(chainId = getDefaultChainId()) {
  const id = Number(chainId);
  return CHAIN_REGISTRY.find((chain) => chain.chainId === id) || null;
}

export function requireChainConfig(chainId = getDefaultChainId()) {
  const chain = getChainConfig(chainId);
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
  return chain;
}

export function isSupportedChain(chainId) {
  return getSupportedChainIds().includes(Number(chainId));
}

export function getReadRpcUrl(chainId) {
  return getChainConfig(chainId)?.rpcUrl || "";
}

export function getBundlerUrl(chainId) {
  return getChainConfig(chainId)?.bundlerUrl || "";
}

export function getExplorerTxUrl(chainId, txHash) {
  const explorerUrl = getChainConfig(chainId)?.explorerUrl;
  return explorerUrl && txHash ? `${explorerUrl}/tx/${txHash}` : "";
}

export function getChainContracts(chainId) {
  return getChainConfig(chainId)?.contracts || {};
}

export function getNativeCurrency(chainId) {
  return getChainConfig(chainId)?.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 };
}

export async function getChainRegistry() {
  await loadRemoteConfig();
  return CHAIN_REGISTRY;
}

export async function getSharedContracts() {
  await loadRemoteConfig();
  return SHARED_CONTRACTS;
}
