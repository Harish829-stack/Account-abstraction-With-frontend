export type ChainContractKey =
  | "aavePool"
  | "paymaster"
  | "usdcToken"
  | "wethToken"
  | "uniswapQuoter"
  | "uniswapRouter"
  | "priceFeed"
  | "multisigProxy"
  | "eurcToken";

export interface SerializedChainConfig {
  chainId: number;
  name: string;
  isTestnet: boolean;
  isActive: boolean;
  viewOnly: boolean;
  rpcUrl: string;
  bundlerUrl: string;
  explorerUrl: string;
  explorerApiUrl?: string;
  explorerApiChainId?: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  minPriorityFeeWei: string;
  minFeeWei: string;
  contracts: Partial<Record<ChainContractKey, string>>;
}

export interface AppConfigResponse {
  chains: SerializedChainConfig[];
  sharedContracts: Record<string, string>;
}
