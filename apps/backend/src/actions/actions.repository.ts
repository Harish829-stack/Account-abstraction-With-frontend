import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ActionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({
      where: { chainId },
      include: { contracts: true }
    });
  }

  findUserOperation(hash: string) {
    return this.prisma.userOperation.findUnique({
      where: { hash },
      include: { smartAccount: true }
    });
  }

  findSharedContract(key: string) {
    return this.prisma.sharedContract.findUnique({ where: { key } });
  }

  async updateUserOperationReceipt(
    hash: string,
    input: { status: "confirmed" | "reverted"; txHash: string; receipt: unknown }
  ): Promise<void> {
    await this.prisma.userOperation.update({
      where: { hash },
      data: {
        status: input.status,
        txHash: input.txHash,
        receipt: input.receipt as object,
        confirmedAt: new Date()
      }
    });
  }
}

