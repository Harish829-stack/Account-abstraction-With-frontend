export interface UserOperationReceiptResult {
  success?: boolean;
  receipt?: {
    transactionHash?: string;
    blockNumber?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ReceiptPollSummary {
  scanned: number;
  confirmed: number;
  reverted: number;
  dropped: number;
  pending: number;
}
