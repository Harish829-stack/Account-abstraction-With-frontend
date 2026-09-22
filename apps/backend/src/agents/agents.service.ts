import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SessionKey, SmartAccount } from "@prisma/client";
import { AgentsRepository } from "./agents.repository";
import type {
  AgentResponse,
  AuthorizeAgentInput,
  CreateAgentInput,
  InternalAgentResponse,
  RevokeAgentInput
} from "./agents.types";

@Injectable()
export class AgentsService {
  constructor(private readonly agentsRepository: AgentsRepository) {}

  async createAgent(input: CreateAgentInput): Promise<AgentResponse> {
    await this.requireChain(input.chainId);
    const account = await this.requireOrCreateAccount(input.smartAccountAddress, input.chainId, input.ownerEoa);
    const agent = await this.agentsRepository.upsertAgent(input, account.id);
    return this.serialize(agent);
  }

  async authorizeAgent(input: AuthorizeAgentInput): Promise<AgentResponse> {
    const account = await this.requireAccount(input.smartAccountAddress, input.chainId);
    const agent = await this.agentsRepository.authorizeAgent(input, account.id);
    return this.serialize(agent);
  }

  async revokeAgent(input: RevokeAgentInput): Promise<AgentResponse> {
    const account = await this.requireAccount(input.smartAccountAddress, input.chainId);
    const agent = await this.agentsRepository.revokeAgent(input, account.id);
    return this.serialize(agent);
  }

  async revokeAllAgents(smartAccountAddress: string, chainId: number, txHashRevoke?: string): Promise<AgentResponse[]> {
    const account = await this.requireAccount(smartAccountAddress, chainId);
    await this.agentsRepository.revokeAllAgents(account.id, txHashRevoke);
    const agents = await this.agentsRepository.listAgents(account.id);
    return agents.map((agent) => this.serialize(agent));
  }

  async listAgents(smartAccountAddress: string, chainId: number): Promise<AgentResponse[]> {
    const account = await this.requireAccount(smartAccountAddress, chainId);
    const agents = await this.agentsRepository.listAgents(account.id);
    return agents.map((agent) => this.serialize(agent));
  }

  async getInternalAgent(
    smartAccountAddress: string,
    chainId: number,
    agentAddress: string
  ): Promise<InternalAgentResponse> {
    const account = await this.requireAccount(smartAccountAddress, chainId);
    const agent = await this.agentsRepository.findAgent(account.id, agentAddress);
    if (!agent) throw new NotFoundException("Agent not found");
    return this.serialize(agent, true);
  }

  private async requireChain(chainId: number): Promise<void> {
    const chain = await this.agentsRepository.findChain(chainId);
    if (!chain) throw new NotFoundException(`Chain ${chainId} not found`);
  }

  private async requireAccount(address: string, chainId: number): Promise<SmartAccount> {
    const account = await this.agentsRepository.findSmartAccount(address, chainId);
    if (!account) throw new NotFoundException("Smart account not found");
    return account;
  }

  private async requireOrCreateAccount(address: string, chainId: number, ownerEoa?: string): Promise<SmartAccount> {
    const account = await this.agentsRepository.findSmartAccount(address, chainId);
    if (account) return account;
    if (!ownerEoa) throw new BadRequestException("ownerEoa is required when smart account is not already stored");
    return this.agentsRepository.upsertSmartAccount(address, ownerEoa, chainId);
  }

  private serialize(agent: SessionKey, includePrivateKey = false): InternalAgentResponse {
    const status = agent.revoked ? "revoked" : agent.status;
    return {
      agentAddress: agent.keyAddress,
      name: agent.name || undefined,
      scope: agent.scope,
      maxAmount: agent.maxAmount || undefined,
      maxValueWei: agent.maxValueWei,
      target: agent.target,
      selector: agent.selector,
      validAfter: agent.validAfter,
      validUntil: agent.validUntil,
      authorized: status === "active",
      status: status as InternalAgentResponse["status"],
      revoked: agent.revoked,
      txHashInstall: agent.txHashInstall || undefined,
      txHashRevoke: agent.txHashRevoke || undefined,
      privateKey: includePrivateKey ? agent.privateKey || undefined : undefined,
      createdAt: agent.createdAt.toISOString(),
      authorizedAt: agent.authorizedAt?.toISOString(),
      revokedAt: agent.revokedAt?.toISOString(),
      updatedAt: agent.updatedAt.toISOString()
    };
  }
}
