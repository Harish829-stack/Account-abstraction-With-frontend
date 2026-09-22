import { Injectable } from "@nestjs/common";
import type { Chain, ChainContract, SessionKey, SharedContract, UserOperation } from "@prisma/client";
import { DashboardRepository } from "./dashboard.repository";
import type { DashboardChecklistItem, DashboardSummary } from "./dashboard.types";

type ChainWithContracts = Chain & { contracts: ChainContract[] };

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getSummary(input: { smartAccountAddress: string; chainId: number }): Promise<DashboardSummary> {
    const [chain, smartAccount, sharedContracts] = await Promise.all([
      this.dashboardRepository.findChain(input.chainId),
      this.dashboardRepository.findSmartAccount(input.smartAccountAddress, input.chainId),
      this.dashboardRepository.listSharedContracts()
    ]);

    if (!smartAccount) {
      return this.emptySummary(input, chain || undefined, sharedContracts);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiringSoonCutoffSeconds = nowSeconds + 7 * 24 * 60 * 60;
    const [totalUserOps, userOpGroups, recentUserOps, totalAgents, agentGroups, activeAgents, expiringSoon, recentActive] =
      await Promise.all([
        this.dashboardRepository.countUserOps(smartAccount.id),
        this.dashboardRepository.groupUserOpsByStatus(smartAccount.id),
        this.dashboardRepository.listRecentUserOps(smartAccount.id, 5),
        this.dashboardRepository.countAgents(smartAccount.id),
        this.dashboardRepository.groupAgentsByStatus(smartAccount.id),
        this.dashboardRepository.countActiveAgents(smartAccount.id, nowSeconds),
        this.dashboardRepository.countExpiringAgents(smartAccount.id, nowSeconds, expiringSoonCutoffSeconds),
        this.dashboardRepository.listRecentActiveAgents(smartAccount.id, nowSeconds, 5)
      ]);

    const userOpsByStatus = this.toCountMap(userOpGroups);
    const agentsByStatus = this.toCountMap(agentGroups);
    const checklist = this.buildChecklist({
      knownAccount: true,
      chain,
      hasRecentSuccess: (userOpsByStatus.confirmed || 0) > 0,
      hasActiveAgent: activeAgents > 0
    });

    return {
      generatedAt: new Date().toISOString(),
      smartAccountAddress: input.smartAccountAddress,
      chainId: input.chainId,
      knownAccount: true,
      chain: chain ? this.serializeChain(chain, sharedContracts) : undefined,
      userOps: {
        total: totalUserOps,
        byStatus: userOpsByStatus,
        recent: recentUserOps.map((op) => this.serializeUserOp(op))
      },
      agents: {
        total: totalAgents,
        active: activeAgents,
        expiringSoon,
        byStatus: agentsByStatus,
        recentActive: recentActive.map((agent) => this.serializeAgent(agent))
      },
      productReadiness: {
        score: this.scoreChecklist(checklist),
        accountTracked: true,
        hasRecentSuccess: (userOpsByStatus.confirmed || 0) > 0,
        hasActiveAgent: activeAgents > 0,
        hasBundler: Boolean(chain?.bundlerUrl),
        hasPaymaster: this.hasContract(chain, "paymaster"),
        checklist
      }
    };
  }

  private emptySummary(
    input: { smartAccountAddress: string; chainId: number },
    chain: ChainWithContracts | undefined,
    sharedContracts: SharedContract[]
  ): DashboardSummary {
    const checklist = this.buildChecklist({
      knownAccount: false,
      chain,
      hasRecentSuccess: false,
      hasActiveAgent: false
    });

    return {
      generatedAt: new Date().toISOString(),
      smartAccountAddress: input.smartAccountAddress,
      chainId: input.chainId,
      knownAccount: false,
      chain: chain ? this.serializeChain(chain, sharedContracts) : undefined,
      userOps: { total: 0, byStatus: {}, recent: [] },
      agents: { total: 0, active: 0, expiringSoon: 0, byStatus: {}, recentActive: [] },
      productReadiness: {
        score: this.scoreChecklist(checklist),
        accountTracked: false,
        hasRecentSuccess: false,
        hasActiveAgent: false,
        hasBundler: Boolean(chain?.bundlerUrl),
        hasPaymaster: this.hasContract(chain, "paymaster"),
        checklist
      }
    };
  }

  private buildChecklist(input: {
    knownAccount: boolean;
    chain?: ChainWithContracts | null;
    hasRecentSuccess: boolean;
    hasActiveAgent: boolean;
  }): DashboardChecklistItem[] {
    return [
      { key: "account", label: "Smart account tracked", complete: input.knownAccount },
      { key: "chain", label: "Chain config active", complete: Boolean(input.chain?.isActive && !input.chain?.viewOnly) },
      { key: "bundler", label: "Bundler configured", complete: Boolean(input.chain?.bundlerUrl) },
      { key: "paymaster", label: "Paymaster configured", complete: this.hasContract(input.chain, "paymaster") },
      { key: "success", label: "At least one successful operation", complete: input.hasRecentSuccess },
      { key: "agent", label: "Active AI agent available", complete: input.hasActiveAgent }
    ];
  }

  private serializeChain(chain: ChainWithContracts, sharedContracts: SharedContract[]) {
    return {
      name: chain.name,
      isActive: chain.isActive,
      viewOnly: chain.viewOnly,
      rpcConfigured: Boolean(chain.rpcUrl),
      bundlerConfigured: Boolean(chain.bundlerUrl),
      paymasterConfigured: this.hasContract(chain, "paymaster"),
      entryPointConfigured: this.hasSharedContract(sharedContracts, "ENTRY_POINT"),
      lastIndexedBlock: chain.lastIndexedBlock || undefined,
      lastSyncAt: chain.lastSyncAt?.toISOString(),
      lastSyncError: chain.lastSyncError || undefined
    };
  }

  private serializeUserOp(op: UserOperation) {
    return {
      userOpHash: op.hash,
      label: op.label || undefined,
      status: op.status,
      txHash: op.txHash || undefined,
      createdAt: op.createdAt.toISOString(),
      updatedAt: op.updatedAt.toISOString()
    };
  }

  private serializeAgent(agent: SessionKey) {
    return {
      agentAddress: agent.keyAddress,
      name: agent.name || undefined,
      scope: agent.scope,
      validUntil: agent.validUntil,
      authorizedAt: agent.authorizedAt?.toISOString()
    };
  }

  private hasContract(chain: ChainWithContracts | null | undefined, key: string): boolean {
    return Boolean(chain?.contracts.some((contract) => contract.key === key && contract.address));
  }

  private hasSharedContract(contracts: SharedContract[], key: string): boolean {
    return contracts.some((contract) => contract.key === key && Boolean(contract.address));
  }

  private scoreChecklist(checklist: DashboardChecklistItem[]): number {
    if (checklist.length === 0) return 0;
    return Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100);
  }

  private toCountMap(groups: Array<{ status: string; _count: { _all: number } }>): Record<string, number> {
    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }
}
