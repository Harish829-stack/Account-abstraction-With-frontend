import type { ChainContractKey, SerializedChainConfig } from "../config/config.types";

export interface AdminChainInput {
  chainId: number;
  name: string;
  rpcUrl?: string;
  bundlerUrl?: string;
  explorerUrl?: string;
  explorerApiUrl?: string;
  explorerApiChainId?: number;
  nativeSymbol?: string;
  nativeName?: string;
  nativeDecimals?: number;
  isTestnet?: boolean;
  isActive?: boolean;
  viewOnly?: boolean;
  minPriorityFeeWei?: string;
  minFeeWei?: string;
  contracts?: Partial<Record<ChainContractKey, string>>;
}

export interface AdminChainUpdateInput extends Partial<AdminChainInput> {
  chainId: number;
}

export interface AdminConfigResponse {
  chains: SerializedChainConfig[];
  sharedContracts: Record<string, string>;
}
