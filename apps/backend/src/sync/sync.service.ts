import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountsRepository } from "../accounts/accounts.repository";
import { ChainReaderService, ActionTag } from "../common/chain-reader";

export const VALID_ACTION_TAGS = new Set<ActionTag>([
  "ETH_BALANCE",
  "USDC_BALANCE",
  "APPROVAL",
  "DEPLOYMENT",
  "SESSION_KEY",
  "AAVE_POSITION",
  "MARKET_PRICES",
  "FULL_SYNC",
]);

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly repo: AccountsRepository,
    private readonly chainReader: ChainReaderService
  ) {}

  async syncAccount(
    address: string,
    chainId: number,
    actionTag: ActionTag,
    txHash?: string
  ): Promise<void> {
    // 1. Load chain row with its ChainContract children
    const chain = await this.repo.findChainWithContracts(chainId);
    if (!chain) {
      this.logger.warn(`[Sync] Chain ${chainId} not found in DB — skipping sync`);
      return;
    }

    // 2. Load SmartAccount row
    const account = await this.repo.findSmartAccount(address, chainId);
    if (!account) {
      this.logger.warn(`[Sync] SmartAccount ${address} on chain ${chainId} not found — skipping`);
      return;
    }

    // 3. Resolve contracts from ChainContract rows (keyed by `key` column)
    const contractMap = Object.fromEntries(
      chain.contracts.map((c) => [c.key.toLowerCase(), c.address])
    );
    const contracts = {
      usdcToken:  contractMap["usdctoken"]  || contractMap["usdc_token"] || undefined,
      paymaster:  contractMap["paymaster"]  || undefined,
      aavePool:   contractMap["aavepool"]   || contractMap["aave_pool"]  || undefined,
      priceFeed:  contractMap["pricefeed"]  || contractMap["price_feed"] || undefined,
    };

    // SESSION_KEY_VALIDATOR is a shared contract, not per-chain —
    // read it from SharedContract table via PrismaService fallback or env
    const sessionKeyValidator =
      process.env.SESSION_KEY_VALIDATOR ||
      "0x9B7Fd296B6b332b525Bd6AD65f621D25C0060323"; // canonical deployed address

    this.logger.log(
      `[Sync] ${actionTag} for ${address} on chain ${chainId}${txHash ? ` (tx: ${txHash})` : ""}`
    );

    // 4. Dispatch to ChainReader — isolated RPC calls per tag
    const { ledger, market } = await this.chainReader.resolve(
      actionTag,
      chain.rpcUrl,
      address,
      sessionKeyValidator,
      contracts
    );

    // 5. Write ledger patch (only fields returned by this action tag)
    if (Object.keys(ledger).length > 0) {
      await this.repo.updateLedger(account.id, ledger);
    }

    // 6. Write market data patch (only for MARKET_PRICES and FULL_SYNC)
    if (Object.keys(market).length > 0) {
      await this.repo.upsertChainMarketData(chainId, market);
    }

    this.logger.log(`[Sync] ${actionTag} complete for ${address}`);
  }
}
