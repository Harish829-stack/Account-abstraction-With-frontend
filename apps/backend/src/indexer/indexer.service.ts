import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Chain, SmartAccount } from "@prisma/client";
import { jsonRpcCall, toRpcQuantity } from "../common/json-rpc";
import { IndexerRepository } from "./indexer.repository";
import type { IndexerPollSummary, RpcLog } from "./indexer.types";

const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private readonly enabled = process.env.USEROP_INDEXER_ENABLED !== "false";
  private readonly intervalMs = this.readPositiveEnv("USEROP_INDEXER_POLL_INTERVAL_MS", 30_000);
  private readonly confirmations = this.readPositiveEnv("USEROP_INDEXER_CONFIRMATIONS", 2);
  private readonly blockRange = this.readPositiveEnv("USEROP_INDEXER_BLOCK_RANGE", 150);
  private readonly startLookback = this.readPositiveEnv("USEROP_INDEXER_START_LOOKBACK_BLOCKS", 300);
  private interval: NodeJS.Timeout | undefined;
  private isIndexing = false;
  private entryPointAddress: string | undefined;

  constructor(private readonly indexerRepository: IndexerRepository) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("UserOperation indexer disabled");
      return;
    }

    this.logger.log(`UserOperation indexer running every ${this.intervalMs}ms`);
    void this.pollOnce();
    this.interval = setInterval(() => void this.pollOnce(), this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async pollOnce(): Promise<IndexerPollSummary> {
    const summary: IndexerPollSummary = {
      scannedChains: 0,
      scannedAccounts: 0,
      scannedLogs: 0,
      indexedOps: 0,
      errors: 0
    };
    if (this.isIndexing) return summary;

    this.isIndexing = true;
    try {
      const entryPoint = await this.getEntryPointAddress();
      if (!entryPoint) {
        this.logger.warn("Skipping indexer: ENTRY_POINT is not configured");
        return summary;
      }

      const chains = await this.indexerRepository.listIndexableChains();
      for (const chain of chains) {
        summary.scannedChains += 1;
        try {
          await this.indexChain(chain, entryPoint, summary);
        } catch (error) {
          summary.errors += 1;
          await this.indexerRepository.updateChainSync(chain.chainId, {
            lastSyncError: (error as Error).message.slice(0, 512)
          });
          this.logger.warn(`Indexer failed for chain ${chain.chainId}: ${(error as Error).message}`);
        }
      }
    } finally {
      this.isIndexing = false;
    }

    return summary;
  }

  private async indexChain(chain: Chain, entryPoint: string, summary: IndexerPollSummary): Promise<void> {
    const accounts = await this.indexerRepository.listSmartAccounts(chain.chainId);
    summary.scannedAccounts += accounts.length;
    if (accounts.length === 0) {
      await this.indexerRepository.updateChainSync(chain.chainId, { lastSyncError: null });
      return;
    }

    const latestHex = await jsonRpcCall<string>(chain.rpcUrl, "eth_blockNumber", []);
    if (!latestHex) return;
    const latestBlock = Number(BigInt(latestHex));
    const targetBlock = latestBlock - this.confirmations;
    if (targetBlock <= 0) return;

    let fromBlock = chain.lastIndexedBlock === null
      ? Math.max(0, targetBlock - this.startLookback)
      : chain.lastIndexedBlock + 1;
    if (fromBlock > targetBlock) {
      await this.indexerRepository.updateChainSync(chain.chainId, { lastSyncError: null });
      return;
    }

    while (fromBlock <= targetBlock) {
      const toBlock = Math.min(targetBlock, fromBlock + this.blockRange - 1);
      for (const account of accounts) {
        const logs = await this.getAccountLogs(chain, entryPoint, account.address, fromBlock, toBlock);
        summary.scannedLogs += logs.length;
        for (const log of logs) {
          await this.persistLog(chain, account, log);
          summary.indexedOps += 1;
        }
      }
      await this.indexerRepository.updateChainSync(chain.chainId, {
        lastIndexedBlock: toBlock,
        lastSyncError: null
      });
      fromBlock = toBlock + 1;
    }
  }

  private async getAccountLogs(
    chain: Chain,
    entryPoint: string,
    accountAddress: string,
    fromBlock: number,
    toBlock: number
  ): Promise<RpcLog[]> {
    return await jsonRpcCall<RpcLog[]>(chain.rpcUrl, "eth_getLogs", [{
      address: entryPoint,
      fromBlock: toRpcQuantity(fromBlock),
      toBlock: toRpcQuantity(toBlock),
      topics: [USER_OPERATION_EVENT_TOPIC, null, this.padAddressTopic(accountAddress)]
    }]) || [];
  }

  private async persistLog(chain: Chain, account: SmartAccount, log: RpcLog): Promise<void> {
    const userOpHash = log.topics[1];
    if (!userOpHash) return;

    await this.indexerRepository.upsertIndexedUserOperation({
      hash: userOpHash,
      smartAccountId: account.id,
      chainId: chain.chainId,
      status: this.parseSuccess(log.data) ? "confirmed" : "reverted",
      txHash: log.transactionHash,
      confirmedBlock: Number(BigInt(log.blockNumber)),
      receipt: {
        source: "entryPointIndexer",
        log,
        success: this.parseSuccess(log.data)
      }
    });
  }

  private async getEntryPointAddress(): Promise<string | undefined> {
    if (this.entryPointAddress) return this.entryPointAddress;
    const record = await this.indexerRepository.findSharedContract("ENTRY_POINT");
    this.entryPointAddress = record?.address || process.env.ENTRY_POINT || undefined;
    return this.entryPointAddress;
  }

  private parseSuccess(data: string): boolean {
    const normalized = data.startsWith("0x") ? data.slice(2) : data;
    const successWord = normalized.slice(64, 128);
    if (!successWord) return true;
    return BigInt(`0x${successWord}`) !== 0n;
  }

  private padAddressTopic(address: string): string {
    return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  }

  private readPositiveEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
