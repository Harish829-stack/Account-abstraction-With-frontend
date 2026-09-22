export interface UpsertSmartAccountInput {
  address: string;
  ownerEoa: string;
  chainId: number;
  salt: string;
  deployedAt?: Date;
}

export interface SmartAccountResponse {
  address: string;
  ownerEoa: string;
  chainId: number;
  salt: string;
  deployedAt: string;
}

export interface UserOperationHistoryItem {
  userOpHash: string;
  txHash?: string;
  status: "Pending" | "Success" | "Reverted" | "Dropped";
  label?: string;
  timestamp?: number;
  details?: string;
  updatedAt?: string;
}
