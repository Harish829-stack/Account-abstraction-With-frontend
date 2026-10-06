import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ethers } from "ethers";
import { ActionTag, expandActionTags, type ActionTag as ActionTagType, type ResourceTag } from "../common/action-tags";
import { jsonRpcCall } from "../common/json-rpc";
import { parseUserOperationEventSuccess, USER_OPERATION_EVENT_TOPIC } from "../common/user-operation-event";
import { SyncService } from "../sync/sync.service";
import { deriveReceiptEffects, RESOURCE_VERIFIERS, type ReceiptLog } from "./action-verifiers";
import { ActionsRepository } from "./actions.repository";

const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
interface RpcReceipt {
  status: string;
  transactionHash: string;
  logs: ReceiptLog[];
}

export interface SubmitActionEventInput {
  account: string;
  chainId: number;
  tags: ActionTagType[];
  userOpHash?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActionsService {
  constructor(
    private readonly repository: ActionsRepository,
    private readonly syncService: SyncService
  ) {}

  async submit(input: SubmitActionEventInput) {
    if (input.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
      throw new BadRequestException("Only Arbitrum Sepolia (421614) is supported");
    }
    if (!input.userOpHash && !input.txHash) {
      throw new BadRequestException("userOpHash or txHash is required");
    }

    const chain = await this.repository.findChain(input.chainId);
    if (!chain?.isActive) throw new NotFoundException(`Active chain ${input.chainId} not found`);

    let txHash = input.txHash;
    if (input.userOpHash) {
      const operation = await this.repository.findUserOperation(input.userOpHash);
      if (operation) {
        if (operation.chainId !== input.chainId || operation.smartAccount.address.toLowerCase() !== input.account.toLowerCase()) {
          throw new BadRequestException("UserOperation does not belong to this account and chain");
        }
        if (input.txHash && operation.txHash && input.txHash.toLowerCase() !== operation.txHash.toLowerCase()) {
          throw new BadRequestException("Transaction hash does not match the stored UserOperation");
        }
        txHash = operation.txHash || input.txHash;
        if (operation.status === "reverted" || operation.status === "dropped") {
          return { status: "failed", requestedTags: input.tags, verifiedTags: [], txHash };
        }
      }
    }

    if (!txHash) {
      return { status: "pending", requestedTags: input.tags, verifiedTags: [], userOpHash: input.userOpHash };
    }

    const receipt = await jsonRpcCall<RpcReceipt | null>(chain.rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return { status: "pending", requestedTags: input.tags, verifiedTags: [], userOpHash: input.userOpHash, txHash };
    }

    if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new BadRequestException("RPC receipt transaction hash mismatch");
    }
    const accountTopic = this.addressTopic(input.account);
    const matchingUserOpLog = receipt.logs.find((log) =>
      log.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC &&
      log.topics[2]?.toLowerCase() === accountTopic &&
      (!input.userOpHash || log.topics[1]?.toLowerCase() === input.userOpHash.toLowerCase())
    );

    if (!matchingUserOpLog) {
      throw new BadRequestException("Transaction does not contain a matching EntryPoint UserOperationEvent");
    }
    const successful = BigInt(receipt.status || "0x0") !== 0n && parseUserOperationEventSuccess(matchingUserOpLog.data, false);

    if (input.userOpHash) {
      await this.repository.updateUserOperationReceipt(input.userOpHash, {
        status: successful ? "confirmed" : "reverted",
        txHash,
        receipt
      });
    }
    if (!successful) {
      return { status: "failed", requestedTags: input.tags, verifiedTags: [], userOpHash: input.userOpHash, txHash };
    }

    const contractMap = Object.fromEntries(chain.contracts.map((contract) => [contract.key.toLowerCase(), contract.address]));
    const sharedValidator = await this.repository.findSharedContract("SESSION_KEY_VALIDATOR");
    const contracts = {
      usdcToken: contractMap.usdctoken || contractMap.usdc_token,
      aavePool: contractMap.aavepool || contractMap.aave_pool,
      uniswapRouter: contractMap.uniswaprouter || contractMap.uniswap_router
    };
    const code = await jsonRpcCall<string>(chain.rpcUrl, "eth_getCode", [input.account, "latest"]);
    const verificationContext = {
      account: input.account,
      code: code || "0x",
      logs: receipt.logs,
      contracts,
      sessionKeyValidator: sharedValidator?.address || process.env.SESSION_KEY_VALIDATOR
    };
    const derivedTags = deriveReceiptEffects(verificationContext);

    // A requested effect is accepted only when its verifier found corresponding
    // chain evidence. Independently derived effects widen the refresh set.
    const requestedResources = expandActionTags(input.tags);
    const verifiedRequestedTags = requestedResources.filter((tag) => RESOURCE_VERIFIERS[tag](verificationContext));
    // FULL_SYNC is the deliberately safe fallback: after the receipt/account
    // relationship is proven, the server may re-read every resource. No value
    // supplied by the client is persisted.
    const verifiedTags = input.tags.includes(ActionTag.FULL_SYNC)
      ? expandActionTags([ActionTag.FULL_SYNC])
      : [...new Set<ResourceTag>([
          ...derivedTags,
          ...verifiedRequestedTags
        ])];

    await this.syncService.syncAccountTags(input.account, input.chainId, verifiedTags, txHash);

    return {
      status: "confirmed",
      requestedTags: input.tags,
      verifiedTags,
      userOpHash: input.userOpHash,
      txHash,
      effects: verifiedTags.map((tag) => ({ resource: tag }))
    };
  }

  private addressTopic(address: string): string {
    return `0x${ethers.getAddress(address).toLowerCase().slice(2).padStart(64, "0")}`;
  }
}
