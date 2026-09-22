import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateUserOperationStatusInput, UpsertUserOperationInput } from "./user-ops.types";

@Injectable()
export class UserOpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({ where: { chainId } });
  }

  findSmartAccount(address: string, chainId: number) {
    return this.prisma.smartAccount.findUnique({
      where: { chainId_address: { chainId, address } }
    });
  }

  upsertSmartAccount(address: string, ownerEoa: string, chainId: number) {
    return this.prisma.smartAccount.upsert({
      where: { chainId_address: { chainId, address } },
      update: { ownerEoa },
      create: {
        address,
        ownerEoa,
        chainId,
        salt: "0x"
      }
    });
  }

  upsertUserOperation(input: UpsertUserOperationInput, smartAccountId: number) {
    const receipt = this.toJson(input.receipt);
    return this.prisma.userOperation.upsert({
      where: { hash: input.hash },
      update: {
        label: input.label,
        status: input.status,
        txHash: input.txHash,
        calldata: input.calldata,
        receipt,
        smartAccountId,
        chainId: input.chainId
      },
      create: {
        hash: input.hash,
        label: input.label,
        status: input.status,
        txHash: input.txHash,
        calldata: input.calldata,
        receipt,
        smartAccountId,
        chainId: input.chainId
      },
      include: { smartAccount: true }
    });
  }

  updateUserOperationStatus(input: UpdateUserOperationStatusInput) {
    return this.prisma.userOperation.update({
      where: { hash: input.hash },
      data: {
        status: input.status,
        txHash: input.txHash,
        confirmedBlock: input.confirmedBlock,
        confirmedAt: input.confirmedAt,
        droppedAt: input.droppedAt,
        receipt: this.toJson(input.receipt)
      },
      include: { smartAccount: true }
    });
  }

  listUserOperations(smartAccountAddress: string, chainId: number, take: number) {
    return this.prisma.userOperation.findMany({
      where: {
        chainId,
        smartAccount: { address: smartAccountAddress }
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: { smartAccount: true }
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonValue);
  }
}
