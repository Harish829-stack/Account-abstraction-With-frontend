import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AdminChainInput, AdminChainUpdateInput } from "./admin.types";

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  listChains() {
    return this.prisma.chain.findMany({
      include: { contracts: true },
      orderBy: [{ chainId: "asc" }]
    });
  }

  listSharedContracts() {
    return this.prisma.sharedContract.findMany({ orderBy: [{ key: "asc" }] });
  }

  async upsertChain(input: AdminChainInput) {
    const chain = await this.prisma.chain.upsert({
      where: { chainId: input.chainId },
      update: this.chainData(input),
      create: {
        chainId: input.chainId,
        name: input.name,
        rpcUrl: input.rpcUrl || "",
        bundlerUrl: input.bundlerUrl || "",
        explorerUrl: input.explorerUrl || "",
        explorerApiUrl: input.explorerApiUrl,
        explorerApiChainId: input.explorerApiChainId,
        nativeSymbol: input.nativeSymbol || "ETH",
        nativeName: input.nativeName || input.nativeSymbol || "Ether",
        nativeDecimals: input.nativeDecimals || 18,
        isTestnet: input.isTestnet ?? true,
        isActive: input.isActive ?? false,
        viewOnly: input.viewOnly ?? true,
        minPriorityFeeWei: input.minPriorityFeeWei || "0",
        minFeeWei: input.minFeeWei || "0"
      }
    });

    if (input.contracts) {
      await this.upsertChainContracts(chain.id, input.contracts);
    }

    return this.prisma.chain.findUniqueOrThrow({
      where: { chainId: input.chainId },
      include: { contracts: true }
    });
  }

  async updateChain(input: AdminChainUpdateInput) {
    const chain = await this.prisma.chain.update({
      where: { chainId: input.chainId },
      data: this.chainData(input)
    });

    if (input.contracts) {
      await this.upsertChainContracts(chain.id, input.contracts);
    }

    return this.prisma.chain.findUniqueOrThrow({
      where: { chainId: input.chainId },
      include: { contracts: true }
    });
  }

  async upsertChainContractsByChainId(chainId: number, contracts: Record<string, string>) {
    const chain = await this.prisma.chain.findUniqueOrThrow({ where: { chainId } });
    await this.upsertChainContracts(chain.id, contracts);
    return this.prisma.chain.findUniqueOrThrow({
      where: { chainId },
      include: { contracts: true }
    });
  }

  async upsertSharedContracts(contracts: Record<string, string>) {
    for (const [key, address] of Object.entries(contracts)) {
      await this.prisma.sharedContract.upsert({
        where: { key },
        update: { address },
        create: { key, address }
      });
    }
    return this.listSharedContracts();
  }

  private async upsertChainContracts(chainId: number, contracts: Record<string, string | undefined>) {
    for (const [key, address] of Object.entries(contracts)) {
      if (!address) continue;
      await this.prisma.chainContract.upsert({
        where: { chainId_key: { chainId, key } },
        update: { address },
        create: { chainId, key, address }
      });
    }
  }

  private chainData(input: Partial<AdminChainInput>) {
    return {
      name: input.name,
      rpcUrl: input.rpcUrl,
      bundlerUrl: input.bundlerUrl,
      explorerUrl: input.explorerUrl,
      explorerApiUrl: input.explorerApiUrl,
      explorerApiChainId: input.explorerApiChainId,
      nativeSymbol: input.nativeSymbol,
      nativeName: input.nativeName,
      nativeDecimals: input.nativeDecimals,
      isTestnet: input.isTestnet,
      isActive: input.isActive,
      viewOnly: input.viewOnly,
      minPriorityFeeWei: input.minPriorityFeeWei,
      minFeeWei: input.minFeeWei
    };
  }
}
