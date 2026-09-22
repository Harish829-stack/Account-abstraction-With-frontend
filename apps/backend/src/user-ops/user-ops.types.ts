export type UserOperationStatus = "pending" | "confirmed" | "reverted" | "dropped";

export interface UpsertUserOperationInput {
  hash: string;
  smartAccountAddress: string;
  ownerEoa?: string;
  chainId: number;
  label?: string;
  status: UserOperationStatus;
  calldata: string;
  txHash?: string;
  receipt?: unknown;
}

export interface UpdateUserOperationStatusInput {
  hash: string;
  status: UserOperationStatus;
  txHash?: string;
  confirmedBlock?: number;
  confirmedAt?: Date;
  droppedAt?: Date;
  receipt?: unknown;
}

export interface UserOperationResponse {
  userOpHash: string;
  smartAccountAddress: string;
  chainId: number;
  status: UserOperationStatus;
  label?: string;
  txHash?: string;
  calldata: string;
  receipt?: unknown;
  confirmedBlock?: number;
  confirmedAt?: string;
  droppedAt?: string;
  createdAt: string;
  updatedAt: string;
}
