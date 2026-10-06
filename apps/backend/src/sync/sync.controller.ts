import { Controller, Post, Param, Body, HttpCode, HttpStatus, BadRequestException } from "@nestjs/common";
import { SyncService, VALID_ACTION_TAGS } from "./sync.service";
import { AccountsRepository } from "../accounts/accounts.repository";
import { isActionTag, type ActionTag } from "../common/action-tags";
import { parseAddress, parseChainId, parseOptionalString } from "../common/validation";

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

function requireSupportedChain(chainId: number): void {
  if (chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
    throw new BadRequestException("Only Arbitrum Sepolia (421614) is supported");
  }
}

@Controller("accounts")
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly repo: AccountsRepository,
  ) {}

  /**
   * POST /accounts/:address/sync
   * Body: { chainId, actionTag, txHash? }
   * Called by the frontend markConfirmed callback and bootstrap FULL_SYNC on connect.
   * Returns 202 — processing is async, response does not wait for chain read.
   */
  @Post(":address/sync")
  @HttpCode(HttpStatus.ACCEPTED)
  async syncAccount(
    @Param("address") address: string,
    @Body() body: Record<string, unknown>
  ): Promise<{ queued: true }> {
    const saAddress = parseAddress(address, "address");
    const chainId   = parseChainId(body.chainId);
    requireSupportedChain(chainId);
    const txHash    = parseOptionalString(body.txHash, "txHash", 66);

    const rawTags = Array.isArray(body.actionTags) ? body.actionTags : [body.actionTag];
    if (rawTags.length === 0 || !rawTags.every(isActionTag)) {
      throw new BadRequestException(
        `actionTag/actionTags must contain only: ${[...VALID_ACTION_TAGS].join(", ")}`
      );
    }

    // Fire-and-forget — do not await so the client gets 202 immediately
    void this.syncService.syncAccountTags(saAddress, chainId, rawTags as ActionTag[], txHash).catch(
      (err: Error) => console.warn(`[SyncController] sync failed silently: ${err.message}`)
    );

    return { queued: true };
  }

  /**
   * POST /accounts/:address/sync-await
   * Same as /sync but awaits completion and returns the updated ledger.
   * Used by frontend on wallet connect (FULL_SYNC) so it gets fresh data.
   */
  @Post(":address/sync-await")
  @HttpCode(HttpStatus.OK)
  async syncAccountAndWait(
    @Param("address") address: string,
    @Body() body: Record<string, unknown>
  ) {
    const saAddress = parseAddress(address, "address");
    const chainId   = parseChainId(body.chainId);
    requireSupportedChain(chainId);
    const txHash    = parseOptionalString(body.txHash, "txHash", 66);

    const rawTags = Array.isArray(body.actionTags)
      ? body.actionTags
      : [typeof body.actionTag === "string" ? body.actionTag : "FULL_SYNC"];
    if (rawTags.length === 0 || !rawTags.every(isActionTag)) {
      throw new BadRequestException(`actionTag must be one of: ${[...VALID_ACTION_TAGS].join(", ")}`);
    }

    // Await the sync so the response contains fresh on-chain data
    await this.syncService.syncAccountTags(saAddress, chainId, rawTags as ActionTag[], txHash);

    // Return the freshly updated ledger
    const ledger = await this.repo.getLedger(saAddress, chainId);
    return ledger ?? { synced: true };
  }
}
