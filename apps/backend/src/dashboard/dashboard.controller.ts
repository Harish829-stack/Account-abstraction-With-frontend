import { Controller, Get, Param, Query } from "@nestjs/common";
import { parseAddress, parseChainId } from "../common/validation";
import { DashboardService } from "./dashboard.service";
import type { DashboardSummary } from "./dashboard.types";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(":smartAccountAddress")
  getSummary(
    @Param("smartAccountAddress") smartAccountAddress: string,
    @Query("chainId") chainId: string
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary({
      smartAccountAddress: parseAddress(smartAccountAddress, "smartAccountAddress"),
      chainId: parseChainId(chainId)
    });
  }
}
