import { Injectable } from "@nestjs/common";
import type { SmartAccount, UserOperation } from "@prisma/client";
import { ObservabilityRepository } from "./observability.repository";
import type { DebugUserOperationItem, ObservabilitySummary } from "./observability.types";

type UserOperationWithAccount = UserOperation & { smartAccount: SmartAccount };

@Injectable()
export class ObservabilityService {
  constructor(private readonly observabilityRepository: ObservabilityRepository) {}

  async getSummary(): Promise<ObservabilitySummary> {
    const [totalUserOps, userOpGroups, latencyOps, totalAgents, agentGroups, chains] = await Promise.all([
      this.observabilityRepository.countUserOps(),
      this.observabilityRepository.groupUserOpsByStatus(),
      this.observabilityRepository.listConfirmedOpsForLatency(200),
      this.observabilityRepository.countAgents(),
      this.observabilityRepository.groupAgentsByStatus(),
      this.observabilityRepository.listChains()
    ]);

    return {
      generatedAt: new Date().toISOString(),
      userOps: {
        total: totalUserOps,
        byStatus: this.toCountMap(userOpGroups),
        averageConfirmationSeconds: this.averageConfirmationSeconds(latencyOps)
      },
      agents: {
        total: totalAgents,
        byStatus: this.toCountMap(agentGroups)
      },
      chains: chains.map((chain) => ({
        chainId: chain.chainId,
        name: chain.name,
        isActive: chain.isActive,
        lastIndexedBlock: chain.lastIndexedBlock || undefined,
        lastSyncAt: chain.lastSyncAt?.toISOString(),
        lastSyncError: chain.lastSyncError || undefined
      }))
    };
  }

  async listUserOps(input: { status?: string; chainId?: number; limit?: number }): Promise<DebugUserOperationItem[]> {
    const ops = await this.observabilityRepository.listUserOps({
      status: input.status,
      chainId: input.chainId,
      take: Math.min(Math.max(input.limit || 25, 1), 100)
    });
    return ops.map((op) => this.serializeUserOp(op));
  }

  private serializeUserOp(op: UserOperationWithAccount): DebugUserOperationItem {
    return {
      userOpHash: op.hash,
      smartAccountAddress: op.smartAccount.address,
      chainId: op.chainId,
      status: op.status,
      label: op.label || undefined,
      txHash: op.txHash || undefined,
      receipt: op.receipt || undefined,
      createdAt: op.createdAt.toISOString(),
      updatedAt: op.updatedAt.toISOString()
    };
  }

  private toCountMap(groups: Array<{ status: string; _count: { _all: number } }>): Record<string, number> {
    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }

  private averageConfirmationSeconds(ops: UserOperation[]): number | undefined {
    const durations = ops
      .filter((op) => op.confirmedAt)
      .map((op) => Math.max(0, op.confirmedAt!.getTime() - op.createdAt.getTime()) / 1000);
    if (durations.length === 0) return undefined;
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    return Math.round((total / durations.length) * 10) / 10;
  }
}
