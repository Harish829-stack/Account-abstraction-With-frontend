export interface IndexerPollSummary {
  scannedChains: number;
  scannedAccounts: number;
  scannedLogs: number;
  indexedOps: number;
  errors: number;
}

export interface RpcLog {
  address: string;
  blockNumber: string;
  transactionHash: string;
  data: string;
  topics: string[];
}
