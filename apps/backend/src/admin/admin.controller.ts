import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  parseAddress,
  parseChainId,
  parseOptionalString,
  parsePositiveInteger
} from "../common/validation";
import { AdminService } from "./admin.service";
import type { AdminChainInput, AdminChainUpdateInput, AdminConfigResponse } from "./admin.types";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("config")
  getConfig(): Promise<AdminConfigResponse> {
    return this.adminService.getConfig();
  }

  @Post("chains")
  upsertChain(@Body() body: Record<string, unknown>) {
    return this.adminService.upsertChain(this.parseChainInput(body, true) as AdminChainInput);
  }

  @Patch("chains/:chainId")
  updateChain(
    @Param("chainId") chainId: string,
    @Body() body: Record<string, unknown>
  ) {
    const parsed = this.parseChainInput({ ...body, chainId }, false);
    return this.adminService.updateChain(parsed);
  }

  @Patch("chains/:chainId/contracts")
  updateChainContracts(
    @Param("chainId") chainId: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.adminService.updateChainContracts(
      parseChainId(chainId),
      this.parseAddressMap(body.contracts, "contracts")
    );
  }

  @Patch("shared-contracts")
  updateSharedContracts(@Body() body: Record<string, unknown>) {
    return this.adminService.updateSharedContracts(this.parseAddressMap(body.contracts, "contracts"));
  }

  private parseChainInput(body: Record<string, unknown>, requireName: boolean): AdminChainInput | AdminChainUpdateInput {
    const name = parseOptionalString(body.name, "name", 80);
    if (requireName && !name) throw new BadRequestException("name is required");

    return {
      chainId: parseChainId(body.chainId),
      name: name || undefined,
      rpcUrl: parseOptionalString(body.rpcUrl, "rpcUrl", 512),
      bundlerUrl: parseOptionalString(body.bundlerUrl, "bundlerUrl", 512),
      explorerUrl: parseOptionalString(body.explorerUrl, "explorerUrl", 512),
      explorerApiUrl: parseOptionalString(body.explorerApiUrl, "explorerApiUrl", 512),
      explorerApiChainId: body.explorerApiChainId ? parsePositiveInteger(body.explorerApiChainId, "explorerApiChainId") : undefined,
      nativeSymbol: parseOptionalString(body.nativeSymbol, "nativeSymbol", 16),
      nativeName: parseOptionalString(body.nativeName, "nativeName", 64),
      nativeDecimals: body.nativeDecimals ? parsePositiveInteger(body.nativeDecimals, "nativeDecimals") : undefined,
      isTestnet: this.parseOptionalBoolean(body.isTestnet, "isTestnet"),
      isActive: this.parseOptionalBoolean(body.isActive, "isActive"),
      viewOnly: this.parseOptionalBoolean(body.viewOnly, "viewOnly"),
      minPriorityFeeWei: parseOptionalString(body.minPriorityFeeWei, "minPriorityFeeWei", 80),
      minFeeWei: parseOptionalString(body.minFeeWei, "minFeeWei", 80),
      contracts: body.contracts ? this.parseAddressMap(body.contracts, "contracts") : undefined
    };
  }

  private parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new BadRequestException(`${field} must be a boolean`);
  }

  private parseAddressMap(value: unknown, field: string): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException(`${field} must be an object`);
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, address]) => address !== undefined && address !== null && address !== "")
        .map(([key, address]) => [
          parseOptionalString(key, `${field}.key`, 64) || key,
          parseAddress(address, `${field}.${key}`)
        ])
    );
  }
}
