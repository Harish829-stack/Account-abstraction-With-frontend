import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertSmartAccountInput } from "./accounts.types";

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
}
