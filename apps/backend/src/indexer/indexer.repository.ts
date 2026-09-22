import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IndexerRepository {
  constructor(private readonly prisma: PrismaService) {}

  listIndexableChains() {
    return this.prisma.chain.findMany({
      where: {
        isActive: true,
        rpcUrl: { not: "" }
      },
      orderBy: [{ chainId: "asc" }]
    });
  }

  listSmartAccounts(chainId: number) {
    return this.prisma.smartAccount.findMany({
      where: { chainId },
      orderBy: [{ id: "asc" }]
    });
  }

  findSharedContract(key: string) {
    return this.prisma.sharedContract.findUnique({ where: { key } });
  }

  updateChainSync(chainId: number, input: { lastIndexedBlock?: number; lastSyncError?: string | null }) {
    return this.prisma.chain.update({
      where: { chainId },
      data: {
        lastIndexedBlock: input.lastIndexedBlock,
        lastSyncError: input.lastSyncError,
        lastSyncAt: new Date()
      }
    });
  }

  upsertIndexedUserOperation(input: {
    hash: string;
    smartAccountId: number;
    chainId: number;
    status: string;
    txHash: string;
    confirmedBlock: number;
    receipt: unknown;
  }) {
    return this.prisma.userOperation.upsert({
      where: { hash: input.hash },
      update: {
        status: input.status,
        txHash: input.txHash,
        confirmedBlock: input.confirmedBlock,
        confirmedAt: new Date(),
        receipt: input.receipt as Prisma.InputJsonValue
      },
      create: {
        hash: input.hash,
        smartAccountId: input.smartAccountId,
        chainId: input.chainId,
        status: input.status,
        label: "Indexed UserOperation",
        txHash: input.txHash,
        confirmedBlock: input.confirmedBlock,
        confirmedAt: new Date(),
        calldata: "0x",
        receipt: input.receipt as Prisma.InputJsonValue
      }
    });
  }
}
