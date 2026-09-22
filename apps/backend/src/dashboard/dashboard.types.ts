export interface DashboardChecklistItem {
  key: string;
  label: string;
  complete: boolean;
}

export interface DashboardSummary {
  generatedAt: string;
  smartAccountAddress: string;
  chainId: number;
  knownAccount: boolean;
  chain?: {
    name: string;
    isActive: boolean;
    viewOnly: boolean;
    rpcConfigured: boolean;
    bundlerConfigured: boolean;
    paymasterConfigured: boolean;
    entryPointConfigured: boolean;
    lastIndexedBlock?: number;
    lastSyncAt?: string;
    lastSyncError?: string;
  };
  userOps: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{
      userOpHash: string;
      label?: string;
      status: string;
      txHash?: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  agents: {
    total: number;
    active: number;
    expiringSoon: number;
    byStatus: Record<string, number>;
    recentActive: Array<{
      agentAddress: string;
      name?: string;
      scope: string;
      validUntil: number;
      authorizedAt?: string;
    }>;
  };
  productReadiness: {
    score: number;
    accountTracked: boolean;
    hasRecentSuccess: boolean;
    hasActiveAgent: boolean;
    hasBundler: boolean;
    hasPaymaster: boolean;
    checklist: DashboardChecklistItem[];
  };
}
