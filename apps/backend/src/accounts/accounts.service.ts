import { Injectable, NotFoundException } from "@nestjs/common";
import { AccountsRepository } from "./accounts.repository";
import type { SmartAccountResponse, UpsertSmartAccountInput, UserOperationHistoryItem } from "./accounts.types";

@Injectable()
export class AccountsService {
  constructor(private readonly accountsRepository: AccountsRepository) {}

  async upsertSmartAccount(input: UpsertSmartAccountInput): Promise<SmartAccountResponse> {
    await this.requireChain(input.chainId);
    const account = await this.accountsRepository.upsertSmartAccount(input);
    return this.serializeSmartAccount(account);
  }

  async getSmartAccount(address: string, chainId?: number): Promise<SmartAccountResponse | SmartAccountResponse[]> {
    if (chainId) {
      const account = await this.accountsRepository.findSmartAccount(address, chainId);
      if (!account) throw new NotFoundException("Smart account not found");
      return this.serializeSmartAccount(account);
    }

    const accounts = await this.accountsRepository.listSmartAccounts(address);
    return accounts.map((account) => this.serializeSmartAccount(account));
  }

  async getHistory(address: string, chainId: number, limit = 10): Promise<UserOperationHistoryItem[]> {
    const ops = await this.accountsRepository.listHistory(address, chainId, Math.min(Math.max(limit, 1), 50));
    return ops.map((op) => ({
      userOpHash: op.hash,
      txHash: op.txHash || undefined,
      status: this.toDisplayStatus(op.status),
      label: op.label || undefined,
      timestamp: op.confirmedAt?.getTime() || op.droppedAt?.getTime() || op.createdAt.getTime()
    }));
  }

  private async requireChain(chainId: number): Promise<void> {
    const chain = await this.accountsRepository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
  }

  private serializeSmartAccount(account: {
    address: string;
    ownerEoa: string;
    chainId: number;
    salt: string;
    deployedAt: Date;
  }): SmartAccountResponse {
    return {
      address: account.address,
      ownerEoa: account.ownerEoa,
      chainId: account.chainId,
      salt: account.salt,
      deployedAt: account.deployedAt.toISOString()
    };
  }

  private toDisplayStatus(status: string): UserOperationHistoryItem["status"] {
    switch (status) {
      case "confirmed":
      case "success":
      case "included":
        return "Success";
      case "reverted":
      case "failed":
        return "Reverted";
      case "dropped":
        return "Dropped";
      default:
        return "Pending";
    }
  }
}
