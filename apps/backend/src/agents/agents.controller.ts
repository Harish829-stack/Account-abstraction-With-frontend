import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  parseAddress,
  parseChainId,
  parseOptionalHex,
  parseOptionalString,
  parsePositiveInteger
} from "../common/validation";
import { AgentsService } from "./agents.service";
import type { AgentResponse, InternalAgentResponse } from "./agents.types";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  async createAgent(@Body() body: Record<string, unknown>): Promise<AgentResponse> {
    return this.agentsService.createAgent({
      smartAccountAddress: parseAddress(body.smartAccountAddress, "smartAccountAddress"),
      ownerEoa: body.ownerEoa ? parseAddress(body.ownerEoa, "ownerEoa") : undefined,
      chainId: parseChainId(body.chainId),
      agentAddress: parseAddress(body.agentAddress, "agentAddress"),
      privateKey: parseOptionalString(body.privateKey, "privateKey", 256),
      name: parseOptionalString(body.name, "name", 64),
      scope: parseOptionalString(body.scope, "scope", 32) || "custom",
      maxAmount: parseOptionalString(body.maxAmount, "maxAmount", 64),
      maxValueWei: parseOptionalString(body.maxValueWei, "maxValueWei", 128),
      target: body.target ? parseAddress(body.target, "target") : undefined,
      selector: parseSelector(body.selector),
      validAfter: body.validAfter ? parsePositiveInteger(body.validAfter, "validAfter") : undefined,
      validUntil: body.validUntil ? parsePositiveInteger(body.validUntil, "validUntil") : undefined,
      txHashInstall: parseOptionalHex(body.txHashInstall, "txHashInstall")
    });
  }

  @Get()
  async listAgents(
    @Query("smartAccount") smartAccount: string,
    @Query("chainId") chainId: string
  ): Promise<AgentResponse[]> {
    return this.agentsService.listAgents(parseAddress(smartAccount, "smartAccount"), parseChainId(chainId));
  }

  @Get("internal/:smartAccount/:agentAddress")
  async getInternalAgent(
    @Param("smartAccount") smartAccount: string,
    @Param("agentAddress") agentAddress: string,
    @Query("chainId") chainId: string
  ): Promise<InternalAgentResponse> {
    return this.agentsService.getInternalAgent(
      parseAddress(smartAccount, "smartAccount"),
      parseChainId(chainId),
      parseAddress(agentAddress, "agentAddress")
    );
  }

  @Post(":smartAccount/sync")
  async syncAgents(
    @Param("smartAccount") smartAccount: string,
    @Body() body: Record<string, unknown>
  ): Promise<AgentResponse[]> {
    return this.agentsService.syncAgents({
      smartAccountAddress: parseAddress(smartAccount, "smartAccount"),
      chainId: parseChainId(body.chainId),
      moduleInstalled: parseBoolean(body.moduleInstalled, "moduleInstalled"),
      activeAgentAddresses: parseAddressArray(body.activeAgentAddresses, "activeAgentAddresses")
    });
  }

  @Patch(":smartAccount/:agentAddress/authorize")
  async authorizeAgent(
    @Param("smartAccount") smartAccount: string,
    @Param("agentAddress") agentAddress: string,
    @Body() body: Record<string, unknown>
  ): Promise<AgentResponse> {
    return this.agentsService.authorizeAgent({
      smartAccountAddress: parseAddress(smartAccount, "smartAccount"),
      chainId: parseChainId(body.chainId),
      agentAddress: parseAddress(agentAddress, "agentAddress"),
      target: body.target ? parseAddress(body.target, "target") : undefined,
      selector: parseSelector(body.selector),
      maxValueWei: parseOptionalString(body.maxValueWei, "maxValueWei", 128),
      validAfter: body.validAfter ? parsePositiveInteger(body.validAfter, "validAfter") : undefined,
      validUntil: body.validUntil ? parsePositiveInteger(body.validUntil, "validUntil") : undefined,
      txHashInstall: parseOptionalHex(body.txHashInstall, "txHashInstall")
    });
  }

  @Patch(":smartAccount/:agentAddress/revoke")
  async revokeAgent(
    @Param("smartAccount") smartAccount: string,
    @Param("agentAddress") agentAddress: string,
    @Body() body: Record<string, unknown>
  ): Promise<AgentResponse> {
    return this.agentsService.revokeAgent({
      smartAccountAddress: parseAddress(smartAccount, "smartAccount"),
      chainId: parseChainId(body.chainId),
      agentAddress: parseAddress(agentAddress, "agentAddress"),
      txHashRevoke: parseOptionalHex(body.txHashRevoke, "txHashRevoke")
    });
  }

  @Delete(":smartAccount")
  async revokeAllAgents(
    @Param("smartAccount") smartAccount: string,
    @Query("chainId") chainId: string,
    @Query("txHashRevoke") txHashRevoke?: string
  ): Promise<AgentResponse[]> {
    return this.agentsService.revokeAllAgents(
      parseAddress(smartAccount, "smartAccount"),
      parseChainId(chainId),
      parseOptionalHex(txHashRevoke, "txHashRevoke")
    );
  }
}

function parseSelector(value: unknown): string | undefined {
  const parsed = parseOptionalHex(value, "selector");
  if (!parsed) return undefined;
  if (!/^0x[a-fA-F0-9]{8}$/.test(parsed)) {
    throw new BadRequestException("selector must be 4-byte hex data");
  }
  return parsed;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BadRequestException(`${field} must be a boolean`);
}

function parseAddressArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new BadRequestException(`${field} must be an array`);
  return value.map((item, index) => parseAddress(item, `${field}[${index}]`));
}
