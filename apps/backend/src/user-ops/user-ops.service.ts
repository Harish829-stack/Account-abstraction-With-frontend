import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SmartAccount, UserOperation } from "@prisma/client";
import { UserOpsRepository } from "./user-ops.repository";
import type {
  UpdateUserOperationStatusInput,
  UpsertUserOperationInput,
  UserOperationResponse,
  UserOperationStatus
} from "./user-ops.types";

type UserOperationWithAccount = UserOperation & { smartAccount: SmartAccount };

@Injectable()
export class UserOpsService {
  constructor(private readonly userOpsRepository: UserOpsRepository) {}

  async upsertUserOperation(input: UpsertUserOperationInput): Promise<UserOperationResponse> {
    await this.requireChain(input.chainId);

    let account = await this.userOpsRepository.findSmartAccount(input.smartAccountAddress, input.chainId);
    if (!account) {
      if (!input.ownerEoa) {
        throw new BadRequestException("ownerEoa is required when the smart account is not already stored");
      }
      account = await this.userOpsRepository.upsertSmartAccount(
        input.smartAccountAddress,
        input.ownerEoa,
        input.chainId
      );
    } else if (input.ownerEoa && account.ownerEoa.toLowerCase() !== input.ownerEoa.toLowerCase()) {
      account = await this.userOpsRepository.upsertSmartAccount(
        input.smartAccountAddress,
        input.ownerEoa,
        input.chainId
      );
    }

    const op = await this.userOpsRepository.upsertUserOperation(input, account.id);
    return this.serializeUserOperation(op);
  }

  async updateStatus(input: UpdateUserOperationStatusInput): Promise<UserOperationResponse> {
    const op = await this.userOpsRepository.updateUserOperationStatus({
      ...input,
      confirmedAt: input.confirmedAt || (input.status === "confirmed" || input.status === "reverted" ? new Date() : undefined),
      droppedAt: input.droppedAt || (input.status === "dropped" ? new Date() : undefined)
    });
    return this.serializeUserOperation(op);
  }

  async listUserOperations(
    smartAccountAddress: string,
    chainId: number,
    limit = 10
  ): Promise<UserOperationResponse[]> {
    const ops = await this.userOpsRepository.listUserOperations(
      smartAccountAddress,
      chainId,
      Math.min(Math.max(limit, 1), 50)
    );
    return ops.map((op) => this.serializeUserOperation(op));
  }

  private async requireChain(chainId: number): Promise<void> {
    const chain = await this.userOpsRepository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
  }

  private serializeUserOperation(op: UserOperationWithAccount): UserOperationResponse {
    return {
      userOpHash: op.hash,
      smartAccountAddress: op.smartAccount.address,
      chainId: op.chainId,
      status: op.status as UserOperationStatus,
      label: op.label || undefined,
      txHash: op.txHash || undefined,
      calldata: op.calldata,
      receipt: op.receipt || undefined,
      confirmedBlock: op.confirmedBlock || undefined,
      confirmedAt: op.confirmedAt?.toISOString(),
      droppedAt: op.droppedAt?.toISOString(),
      createdAt: op.createdAt.toISOString(),
      updatedAt: op.updatedAt.toISOString()
    };
  }
}
