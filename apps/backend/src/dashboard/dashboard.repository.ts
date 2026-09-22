import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({
      where: { chainId },
      include: { contracts: true }
    });
  }

  listSharedContracts() {
    return this.prisma.sharedContract.findMany();
  }

  findSmartAccount(address: string, chainId: number) {
    return this.prisma.smartAccount.findUnique({
      where: { chainId_address: { chainId, address } }
    });
  }

  countUserOps(smartAccountId: number) {
    return this.prisma.userOperation.count({ where: { smartAccountId } });
  }

  groupUserOpsByStatus(smartAccountId: number) {
    return this.prisma.userOperation.groupBy({
      by: ["status"],
      where: { smartAccountId },
      _count: { _all: true }
    });
  }

  listRecentUserOps(smartAccountId: number, take: number) {
    return this.prisma.userOperation.findMany({
      where: { smartAccountId },
      orderBy: [{ updatedAt: "desc" }],
      take
    });
  }

  countAgents(smartAccountId: number) {
    return this.prisma.sessionKey.count({ where: { smartAccountId } });
  }

  groupAgentsByStatus(smartAccountId: number) {
    return this.prisma.sessionKey.groupBy({
      by: ["status"],
      where: { smartAccountId },
      _count: { _all: true }
    });
  }

  countActiveAgents(smartAccountId: number, nowSeconds: number) {
    return this.prisma.sessionKey.count({
      where: {
        smartAccountId,
        status: "active",
        revoked: false,
        OR: [{ validUntil: 0 }, { validUntil: { gt: nowSeconds } }]
      }
    });
  }

  countExpiringAgents(smartAccountId: number, nowSeconds: number, cutoffSeconds: number) {
    return this.prisma.sessionKey.count({
      where: {
        smartAccountId,
        status: "active",
        revoked: false,
        validUntil: { gt: nowSeconds, lte: cutoffSeconds }
      }
    });
  }

  listRecentActiveAgents(smartAccountId: number, nowSeconds: number, take: number) {
    return this.prisma.sessionKey.findMany({
      where: {
        smartAccountId,
        status: "active",
        revoked: false,
        OR: [{ validUntil: 0 }, { validUntil: { gt: nowSeconds } }]
      },
      orderBy: [{ authorizedAt: "desc" }, { updatedAt: "desc" }],
      take
    });
  }
}
