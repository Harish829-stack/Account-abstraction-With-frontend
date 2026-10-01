import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { AccountsRepository } from "../accounts/accounts.repository";
import { parseChainId } from "../common/validation";

/**
 * GET /market/:chainId
 * Returns cached Chainlink price + Aave market data from the ChainMarketData table.
 * Used by the financial-agent sidecar to avoid direct blockchain calls.
 */
@Controller("market")
export class MarketController {
  constructor(private readonly repo: AccountsRepository) {}

  @Get(":chainId")
  async getMarketData(@Param("chainId") chainId: string) {
    const id   = parseChainId(chainId);
    const data = await this.repo.getChainMarketData(id);
    if (!data) {
      throw new NotFoundException(
        `No market data cached for chain ${id}. Trigger a FULL_SYNC or MARKET_PRICES sync first.`
      );
    }
    return data;
  }
}
