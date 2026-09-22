import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { UserOperationStatus } from "../user-ops/user-ops.types";

@Injectable()
export class ReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPendingUserOperations(take: number) {
    return this.prisma.userOperation.findMany({
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }],
      take,
      include: { smartAccount: true, chain: true }
    });
  }

  findSharedContract(key: string) {
    return this.prisma.sharedContract.findUnique({ where: { key } });
  }

  updateUserOperation(input: {
    hash: string;
    status: UserOperationStatus;
    txHash?: string;
    confirmedBlock?: number;
    confirmedAt?: Date;
    droppedAt?: Date;
    receipt?: unknown;
  }) {
    return this.prisma.userOperation.update({
      where: { hash: input.hash },
      data: {
        status: input.status,
        txHash: input.txHash,
        confirmedBlock: input.confirmedBlock,
        confirmedAt: input.confirmedAt,
        droppedAt: input.droppedAt,
        receipt: input.receipt === undefined ? undefined : (input.receipt as Prisma.InputJsonValue)
      }
    });
  }
}
