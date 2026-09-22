import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ObservabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  countUserOps() {
    return this.prisma.userOperation.count();
  }

  groupUserOpsByStatus() {
    return this.prisma.userOperation.groupBy({
      by: ["status"],
      _count: { _all: true }
    });
  }

  listConfirmedOpsForLatency(take: number) {
    return this.prisma.userOperation.findMany({
      where: {
        confirmedAt: { not: null },
        status: { in: ["confirmed", "reverted"] }
      },
      orderBy: [{ confirmedAt: "desc" }],
      take
    });
  }

  countAgents() {
    return this.prisma.sessionKey.count();
  }

  groupAgentsByStatus() {
    return this.prisma.sessionKey.groupBy({
      by: ["status"],
      _count: { _all: true }
    });
  }

  listChains() {
    return this.prisma.chain.findMany({
      orderBy: [{ chainId: "asc" }]
    });
  }

  listUserOps(input: { status?: string; chainId?: number; take: number }) {
    return this.prisma.userOperation.findMany({
      where: {
        status: input.status,
        chainId: input.chainId
      },
      orderBy: [{ updatedAt: "desc" }],
      take: input.take,
      include: { smartAccount: true }
    });
  }
}
