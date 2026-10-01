import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertSmartAccountInput } from "./accounts.types";
import type { LedgerPatch, MarketDataPatch } from "../common/chain-reader";

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({ where: { chainId } });
  }

  upsertSmartAccount(input: UpsertSmartAccountInput) {
    return this.prisma.smartAccount.upsert({
      where: { chainId_address: { chainId: input.chainId, address: input.address } },
      update: {
        ownerEoa: input.ownerEoa,
        salt: input.salt,
        deployedAt: input.deployedAt
      },
      create: input
    });
  }

  findSmartAccount(address: string, chainId: number) {
    return this.prisma.smartAccount.findUnique({
      where: { chainId_address: { chainId, address } }
    });
  }

  listSmartAccounts(address: string) {
    return this.prisma.smartAccount.findMany({
      where: { address },
      orderBy: [{ chainId: "asc" }]
    });
  }

  listHistory(address: string, chainId: number, take: number) {
    return this.prisma.userOperation.findMany({
      where: {
        chainId,
        smartAccount: { address }
      },
      orderBy: [{ createdAt: "desc" }],
      take
    });
  }

  // ─── Ledger sync methods ────────────────────────────────────────────────

  updateLedger(accountId: number, patch: LedgerPatch) {
    const data: Record<string, unknown> = {};
    if (patch.isDeployed !== undefined)           data["isDeployed"]            = patch.isDeployed;
    if (patch.hasSessionKeyModule !== undefined)  data["hasSessionKeyModule"]   = patch.hasSessionKeyModule;
    if (patch.ethBalanceWei !== undefined)        data["ethBalanceWei"]         = patch.ethBalanceWei;
    if (patch.usdcBalanceWei !== undefined)       data["usdcBalanceWei"]        = patch.usdcBalanceWei;
    if (patch.paymasterAllowanceWei !== undefined)data["paymasterAllowanceWei"] = patch.paymasterAllowanceWei;
    if (patch.aaveDepositedWei !== undefined)     data["aaveDepositedWei"]      = patch.aaveDepositedWei;
    if (patch.aaveEarningsWei !== undefined)      data["aaveEarningsWei"]       = patch.aaveEarningsWei;
    if (patch.ledgerUpdatedAt !== undefined)      data["ledgerUpdatedAt"]       = patch.ledgerUpdatedAt;
    if (Object.keys(data).length === 0) return Promise.resolve();
    return this.prisma.smartAccount.update({ where: { id: accountId }, data });
  }

  /** Load a Chain row including its ChainContract child rows. */
  findChainWithContracts(chainId: number) {
    return this.prisma.chain.findUnique({
      where: { chainId },
      include: { contracts: true },
    });
  }

  upsertChainMarketData(chainId: number, patch: MarketDataPatch) {
    const data: Record<string, unknown> = {};
    if (patch.ethPriceUsd !== undefined)    data["ethPriceUsd"]    = patch.ethPriceUsd;
    if (patch.usdcPriceUsd !== undefined)   data["usdcPriceUsd"]   = patch.usdcPriceUsd;
    if (patch.aaveApyBps !== undefined)     data["aaveApyBps"]     = patch.aaveApyBps;
    if (patch.aaveLiquidity !== undefined)  data["aaveLiquidity"]  = patch.aaveLiquidity;
    if (patch.priceUpdatedAt !== undefined) data["priceUpdatedAt"] = patch.priceUpdatedAt;
    if (patch.aaveUpdatedAt !== undefined)  data["aaveUpdatedAt"]  = patch.aaveUpdatedAt;
    if (Object.keys(data).length === 0) return Promise.resolve();
    return this.prisma.chainMarketData.upsert({
      where: { chainId },
      create: { chainId, ...data },
      update: data,
    });
  }

  getChainMarketData(chainId: number) {
    return this.prisma.chainMarketData.findUnique({ where: { chainId } });
  }

  getLedger(address: string, chainId: number) {
    return this.prisma.smartAccount.findUnique({
      where: { chainId_address: { chainId, address } },
      select: {
        isDeployed: true,
        hasSessionKeyModule: true,
        ethBalanceWei: true,
        usdcBalanceWei: true,
        paymasterAllowanceWei: true,
        aaveDepositedWei: true,
        aaveEarningsWei: true,
        ledgerUpdatedAt: true,
      },
    });
  }
}
