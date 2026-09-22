import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Chain, SmartAccount, UserOperation } from "@prisma/client";
import { jsonRpcCall, toRpcQuantity } from "../common/json-rpc";
import { ReceiptsRepository } from "./receipts.repository";
import type { ReceiptPollSummary, UserOperationReceiptResult } from "./receipts.types";

const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

type PendingUserOperation = UserOperation & { smartAccount: SmartAccount; chain: Chain };

interface RpcLog {
  transactionHash: string;
  blockNumber: string;
  data: string;
}

@Injectable()
export class ReceiptsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly enabled = process.env.USEROP_RECEIPT_WORKER_ENABLED !== "false";
  private readonly intervalMs = this.readPositiveEnv("USEROP_RECEIPT_POLL_INTERVAL_MS", 15_000);
  private readonly batchSize = this.readPositiveEnv("USEROP_RECEIPT_BATCH_SIZE", 25);
  private readonly staleMinutes = this.readPositiveEnv("USEROP_RECEIPT_STALE_MINUTES", 20);
  private readonly fallbackBlocks = this.readPositiveEnv("USEROP_RECEIPT_FALLBACK_BLOCKS", 150);
  private interval: NodeJS.Timeout | undefined;
  private isPolling = false;
  private entryPointAddress: string | undefined;

  constructor(private readonly receiptsRepository: ReceiptsRepository) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("UserOperation receipt worker disabled");
      return;
    }

    this.logger.log(`UserOperation receipt worker running every ${this.intervalMs}ms`);
    void this.pollOnce();
    this.interval = setInterval(() => void this.pollOnce(), this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async pollOnce(): Promise<ReceiptPollSummary> {
    const summary: ReceiptPollSummary = { scanned: 0, confirmed: 0, reverted: 0, dropped: 0, pending: 0 };
    if (this.isPolling) return summary;

    this.isPolling = true;
    try {
      const ops = await this.receiptsRepository.listPendingUserOperations(this.batchSize);
      summary.scanned = ops.length;

      for (const op of ops) {
        const outcome = await this.reconcileOperation(op);
        summary[outcome] += 1;
      }
    } catch (error) {
      this.logger.warn(`Receipt poll failed: ${(error as Error).message}`);
    } finally {
      this.isPolling = false;
    }

    return summary;
  }

  private async reconcileOperation(op: PendingUserOperation): Promise<"confirmed" | "reverted" | "dropped" | "pending"> {
    const bundlerReceipt = await this.getBundlerReceipt(op).catch((error) => {
      this.logger.warn(`Bundler receipt lookup failed for ${op.hash}: ${(error as Error).message}`);
      return null;
    });

    if (bundlerReceipt) {
      await this.persistReceipt(op, bundlerReceipt);
      return bundlerReceipt.success === false ? "reverted" : "confirmed";
    }

    const fallbackReceipt = await this.getEntryPointLogReceipt(op).catch((error) => {
      this.logger.warn(`EntryPoint log lookup failed for ${op.hash}: ${(error as Error).message}`);
      return null;
    });

    if (fallbackReceipt) {
      await this.persistReceipt(op, fallbackReceipt);
      return fallbackReceipt.success === false ? "reverted" : "confirmed";
    }

    if (Date.now() - op.createdAt.getTime() > this.staleMinutes * 60_000) {
      await this.receiptsRepository.updateUserOperation({
        hash: op.hash,
        status: "dropped",
        droppedAt: new Date()
      });
      return "dropped";
    }

    return "pending";
  }

  private async getBundlerReceipt(op: PendingUserOperation): Promise<UserOperationReceiptResult | null> {
    if (!op.chain.bundlerUrl) return null;
    return jsonRpcCall<UserOperationReceiptResult | null>(op.chain.bundlerUrl, "eth_getUserOperationReceipt", [op.hash]);
  }

  private async getEntryPointLogReceipt(op: PendingUserOperation): Promise<UserOperationReceiptResult | null> {
    if (!op.chain.rpcUrl) return null;

    const entryPoint = await this.getEntryPointAddress();
    if (!entryPoint) return null;

    const latestHex = await jsonRpcCall<string>(op.chain.rpcUrl, "eth_blockNumber", []);
    if (!latestHex) return null;

    const latestBlock = Number(BigInt(latestHex));
    const fromBlock = Math.max(0, latestBlock - this.fallbackBlocks);
    const logs = await jsonRpcCall<RpcLog[]>(op.chain.rpcUrl, "eth_getLogs", [{
      address: entryPoint,
      fromBlock: toRpcQuantity(fromBlock),
      toBlock: toRpcQuantity(latestBlock),
      topics: [USER_OPERATION_EVENT_TOPIC, op.hash]
    }]);

    const log = logs?.[0];
    if (!log) return null;

    return {
      success: this.parseUserOperationEventSuccess(log.data),
      receipt: {
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber
      },
      source: "entryPointLog"
    };
  }

  private async persistReceipt(op: PendingUserOperation, result: UserOperationReceiptResult): Promise<void> {
    const txHash = result.receipt?.transactionHash;
    const blockNumber = result.receipt?.blockNumber;
    await this.receiptsRepository.updateUserOperation({
      hash: op.hash,
      status: result.success === false ? "reverted" : "confirmed",
      txHash: typeof txHash === "string" ? txHash : undefined,
      confirmedBlock: blockNumber === undefined ? undefined : Number(BigInt(blockNumber)),
      confirmedAt: new Date(),
      receipt: result
    });
  }

  private async getEntryPointAddress(): Promise<string | undefined> {
    if (this.entryPointAddress) return this.entryPointAddress;
    const record = await this.receiptsRepository.findSharedContract("ENTRY_POINT");
    this.entryPointAddress = record?.address || process.env.ENTRY_POINT || undefined;
    return this.entryPointAddress;
  }

  private parseUserOperationEventSuccess(data: string): boolean {
    const normalized = data.startsWith("0x") ? data.slice(2) : data;
    const successWord = normalized.slice(64, 128);
    if (!successWord) return true;
    return BigInt(`0x${successWord}`) !== 0n;
  }

  private readPositiveEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
