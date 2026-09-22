import { Controller, Get, Query } from "@nestjs/common";
import { parseChainId, parseOptionalString, parsePositiveInteger } from "../common/validation";
import { ObservabilityService } from "./observability.service";
import type { DebugUserOperationItem, ObservabilitySummary } from "./observability.types";

@Controller("observability")
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get("summary")
  getSummary(): Promise<ObservabilitySummary> {
    return this.observabilityService.getSummary();
  }

  @Get("user-ops")
  listUserOps(
    @Query("status") status?: string,
    @Query("chainId") chainId?: string,
    @Query("limit") limit?: string
  ): Promise<DebugUserOperationItem[]> {
    return this.observabilityService.listUserOps({
      status: parseOptionalString(status, "status", 32),
      chainId: chainId ? parseChainId(chainId) : undefined,
      limit: limit ? parsePositiveInteger(limit, "limit") : undefined
    });
  }
}
