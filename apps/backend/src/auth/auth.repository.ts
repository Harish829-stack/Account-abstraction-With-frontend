import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({ where: { chainId }, include: { contracts: true } });
  }

  findSharedContract(key: string) {
    return this.prisma.sharedContract.findUnique({ where: { key } });
  }

  findAdmin(address: string) {
    return this.prisma.adminUser.findFirst({
      where: { address: { equals: address, mode: "insensitive" }, role: "admin" }
    });
  }

  findUserOperation(hash: string) {
    return this.prisma.userOperation.findUnique({
      where: { hash }, include: { smartAccount: true }
    });
  }
}
