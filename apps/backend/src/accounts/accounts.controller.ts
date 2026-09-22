import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  parseAddress,
  parseChainId,
  parseOptionalDate,
  parseOptionalHex,
  parsePositiveInteger
} from "../common/validation";
import { AccountsService } from "./accounts.service";
import type { SmartAccountResponse, UserOperationHistoryItem } from "./accounts.types";

@Controller("accounts")
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post("upsert")
  async upsertSmartAccount(@Body() body: Record<string, unknown>): Promise<SmartAccountResponse> {
    return this.accountsService.upsertSmartAccount({
      address: parseAddress(body.address, "address"),
      ownerEoa: parseAddress(body.ownerEoa, "ownerEoa"),
      chainId: parseChainId(body.chainId),
      salt: parseOptionalHex(body.salt, "salt") || "0x",
      deployedAt: parseOptionalDate(body.deployedAt, "deployedAt")
    });
  }

  @Get(":address")
  async getSmartAccount(
    @Param("address") address: string,
    @Query("chainId") chainId?: string
  ): Promise<SmartAccountResponse | SmartAccountResponse[]> {
    return this.accountsService.getSmartAccount(
      parseAddress(address, "address"),
      chainId ? parseChainId(chainId) : undefined
    );
  }

  @Get(":address/history")
  async getHistory(
    @Param("address") address: string,
    @Query("chainId") chainId: string,
    @Query("limit") limit?: string
  ): Promise<UserOperationHistoryItem[]> {
    return this.accountsService.getHistory(
      parseAddress(address, "address"),
      parseChainId(chainId),
      limit ? parsePositiveInteger(limit, "limit") : undefined
    );
  }
}
