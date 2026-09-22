export interface ObservabilitySummary {
  generatedAt: string;
  userOps: {
    total: number;
    byStatus: Record<string, number>;
    averageConfirmationSeconds?: number;
  };
  agents: {
    total: number;
    byStatus: Record<string, number>;
  };
  chains: Array<{
    chainId: number;
    name: string;
    isActive: boolean;
    lastIndexedBlock?: number;
    lastSyncAt?: string;
    lastSyncError?: string;
  }>;
}

export interface DebugUserOperationItem {
  userOpHash: string;
  smartAccountAddress: string;
  chainId: number;
  status: string;
  label?: string;
  txHash?: string;
  receipt?: unknown;
  createdAt: string;
  updatedAt: string;
}
