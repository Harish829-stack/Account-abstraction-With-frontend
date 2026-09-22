import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  parseAddress,
  parseBytes32,
  parseChainId,
  parseOptionalAddress,
  parseOptionalDate,
  parseOptionalHex,
  parseOptionalString,
  parsePositiveInteger
} from "../common/validation";
import { UserOpsService } from "./user-ops.service";
import type { UserOperationResponse, UserOperationStatus } from "./user-ops.types";

const VALID_STATUSES: UserOperationStatus[] = ["pending", "confirmed", "reverted", "dropped"];

@Controller("user-ops")
export class UserOpsController {
  constructor(private readonly userOpsService: UserOpsService) {}

  @Post()
  async upsertUserOperation(@Body() body: Record<string, unknown>): Promise<UserOperationResponse> {
    return this.userOpsService.upsertUserOperation({
      hash: parseBytes32(body.hash, "hash"),
      smartAccountAddress: parseAddress(body.smartAccountAddress, "smartAccountAddress"),
      ownerEoa: parseOptionalAddress(body.ownerEoa, "ownerEoa"),
      chainId: parseChainId(body.chainId),
      label: parseOptionalString(body.label, "label"),
      status: this.parseStatus(body.status, "pending"),
      calldata: parseOptionalHex(body.calldata, "calldata") || "0x",
      txHash: body.txHash ? parseBytes32(body.txHash, "txHash") : undefined,
      receipt: body.receipt
    });
  }

  @Get()
  async listUserOperations(
    @Query("smartAccount") smartAccount: string,
    @Query("chainId") chainId: string,
    @Query("limit") limit?: string
  ): Promise<UserOperationResponse[]> {
    return this.userOpsService.listUserOperations(
      parseAddress(smartAccount, "smartAccount"),
      parseChainId(chainId),
      limit ? parsePositiveInteger(limit, "limit") : undefined
    );
  }

  @Patch(":hash/status")
  async updateStatus(
    @Param("hash") hash: string,
    @Body() body: Record<string, unknown>
  ): Promise<UserOperationResponse> {
    return this.userOpsService.updateStatus({
      hash: parseBytes32(hash, "hash"),
      status: this.parseStatus(body.status),
      txHash: body.txHash ? parseBytes32(body.txHash, "txHash") : undefined,
      confirmedBlock: body.confirmedBlock ? parsePositiveInteger(body.confirmedBlock, "confirmedBlock") : undefined,
      confirmedAt: parseOptionalDate(body.confirmedAt, "confirmedAt"),
      droppedAt: parseOptionalDate(body.droppedAt, "droppedAt"),
      receipt: body.receipt
    });
  }

  private parseStatus(value: unknown, fallback?: UserOperationStatus): UserOperationStatus {
    if (value === undefined || value === null || value === "") {
      if (fallback) return fallback;
      throw new BadRequestException("status is required");
    }
    if (typeof value === "string" && VALID_STATUSES.includes(value as UserOperationStatus)) {
      return value as UserOperationStatus;
    }
    throw new BadRequestException(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }
}
