import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthorizeAgentInput, CreateAgentInput, RevokeAgentInput } from "./agents.types";

@Injectable()
export class AgentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChain(chainId: number) {
    return this.prisma.chain.findUnique({ where: { chainId } });
  }

  findSmartAccount(address: string, chainId: number) {
    return this.prisma.smartAccount.findUnique({
      where: { chainId_address: { chainId, address } }
    });
  }

  upsertSmartAccount(address: string, ownerEoa: string, chainId: number) {
    return this.prisma.smartAccount.upsert({
      where: { chainId_address: { chainId, address } },
      update: { ownerEoa },
      create: {
        address,
        ownerEoa,
        chainId,
        salt: "0x"
      }
    });
  }

  upsertAgent(input: CreateAgentInput, smartAccountId: number) {
    const keyAddress = input.agentAddress;
    return this.prisma.sessionKey.upsert({
      where: { smartAccountId_keyAddress: { smartAccountId, keyAddress } },
      update: {
        privateKey: input.privateKey,
        name: input.name,
        scope: input.scope,
        maxAmount: input.maxAmount,
        maxValueWei: input.maxValueWei || "0",
        target: input.target || "0x0000000000000000000000000000000000000000",
        selector: input.selector || "0x00000000",
        validAfter: input.validAfter || 0,
        validUntil: input.validUntil || 0,
        txHashInstall: input.txHashInstall,
        rawPermissions: this.toRawPermissions(input)
      },
      create: {
        smartAccountId,
        keyAddress,
        privateKey: input.privateKey,
        name: input.name,
        scope: input.scope,
        status: "pending",
        allowedTargets: input.target ? [input.target] : [],
        target: input.target || "0x0000000000000000000000000000000000000000",
        selector: input.selector || "0x00000000",
        maxValueWei: input.maxValueWei || "0",
        maxAmount: input.maxAmount,
        validAfter: input.validAfter || 0,
        validUntil: input.validUntil || 0,
        txHashInstall: input.txHashInstall,
        rawPermissions: this.toRawPermissions(input)
      }
    });
  }

  authorizeAgent(input: AuthorizeAgentInput, smartAccountId: number) {
    return this.prisma.sessionKey.update({
      where: { smartAccountId_keyAddress: { smartAccountId, keyAddress: input.agentAddress } },
      data: {
        status: "active",
        revoked: false,
        target: input.target || undefined,
        selector: input.selector || undefined,
        allowedTargets: input.target ? [input.target] : undefined,
        maxValueWei: input.maxValueWei || undefined,
        validAfter: input.validAfter,
        validUntil: input.validUntil,
        txHashInstall: input.txHashInstall,
        authorizedAt: new Date(),
        revokedAt: null,
        txHashRevoke: null,
        rawPermissions: this.toRawPermissions(input)
      }
    });
  }

  revokeAgent(input: RevokeAgentInput, smartAccountId: number) {
    return this.prisma.sessionKey.update({
      where: { smartAccountId_keyAddress: { smartAccountId, keyAddress: input.agentAddress } },
      data: {
        status: "revoked",
        revoked: true,
        privateKey: null,
        txHashRevoke: input.txHashRevoke,
        revokedAt: new Date()
      }
    });
  }

  revokeAllAgents(smartAccountId: number, txHashRevoke?: string) {
    return this.prisma.sessionKey.updateMany({
      where: { smartAccountId, revoked: false },
      data: {
        status: "revoked",
        revoked: true,
        privateKey: null,
        txHashRevoke,
        revokedAt: new Date()
      }
    });
  }

  listAgents(smartAccountId: number) {
    return this.prisma.sessionKey.findMany({
      where: { smartAccountId },
      orderBy: [{ createdAt: "desc" }]
    });
  }

  findAgent(smartAccountId: number, agentAddress: string) {
    return this.prisma.sessionKey.findUnique({
      where: { smartAccountId_keyAddress: { smartAccountId, keyAddress: agentAddress } }
    });
  }

  private toRawPermissions(input: Partial<CreateAgentInput | AuthorizeAgentInput>) {
    return {
      scope: "scope" in input ? input.scope : undefined,
      target: input.target,
      selector: input.selector,
      maxAmount: "maxAmount" in input ? input.maxAmount : undefined,
      maxValueWei: input.maxValueWei,
      validAfter: input.validAfter,
      validUntil: input.validUntil
    };
  }
}
