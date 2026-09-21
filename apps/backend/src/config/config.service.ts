import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { STATIC_CONFIG_RESPONSE } from "./static-config";
import type { AppConfigResponse, ChainContractKey, SerializedChainConfig } from "./config.types";

const CONFIG_CACHE_KEY = "app_config";
const CONFIG_CACHE_TTL_SECONDS = 60;

interface ChainRecord {
  chainId: number;
  name: string;
  rpcUrl: string;
  bundlerUrl: string;
  explorerUrl: string;
  explorerApiUrl: string | null;
  explorerApiChainId: number | null;
  nativeSymbol: string;
  nativeName: string;
  nativeDecimals: number;
  isTestnet: boolean;
  isActive: boolean;
  viewOnly: boolean;
  minPriorityFeeWei: string;
  minFeeWei: string;
  contracts: Array<{ key: string; address: string }>;
}

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async getConfig(): Promise<AppConfigResponse> {
    const cached = await this.redis.get(CONFIG_CACHE_KEY);
    if (cached) return JSON.parse(cached) as AppConfigResponse;

    const payload = await this.loadFromDatabase();
    await this.redis.setJson(CONFIG_CACHE_KEY, payload, CONFIG_CACHE_TTL_SECONDS);
    return payload;
  }

  async invalidateConfigCache(): Promise<void> {
    await this.redis.del(CONFIG_CACHE_KEY);
  }

  private async loadFromDatabase(): Promise<AppConfigResponse> {
    try {
      const [chains, shared] = await Promise.all([
        this.prisma.chain.findMany({
          where: { isActive: true },
          include: { contracts: true },
          orderBy: { chainId: "asc" }
        }),
        this.prisma.sharedContract.findMany({ orderBy: { key: "asc" } })
      ]);

      if (chains.length === 0) {
        return STATIC_CONFIG_RESPONSE;
      }

      return {
        chains: chains.map((chain) => this.serializeChain(chain)),
        sharedContracts: Object.fromEntries(
          shared
            .filter((contract) => Boolean(contract.address))
            .map((contract) => [contract.key, contract.address])
        )
      };
    } catch (error) {
      this.logger.warn(`Falling back to static config: ${(error as Error).message}`);
      return STATIC_CONFIG_RESPONSE;
    }
  }

  private serializeChain(chain: ChainRecord): SerializedChainConfig {
    return {
      chainId: chain.chainId,
      name: chain.name,
      isTestnet: chain.isTestnet,
      isActive: chain.isActive,
      viewOnly: chain.viewOnly,
      rpcUrl: chain.rpcUrl,
      bundlerUrl: chain.bundlerUrl,
      explorerUrl: chain.explorerUrl,
      explorerApiUrl: chain.explorerApiUrl || undefined,
      explorerApiChainId: chain.explorerApiChainId || undefined,
      nativeCurrency: {
        name: chain.nativeName,
        symbol: chain.nativeSymbol,
        decimals: chain.nativeDecimals
      },
      minPriorityFeeWei: chain.minPriorityFeeWei,
      minFeeWei: chain.minFeeWei,
      contracts: Object.fromEntries(
        chain.contracts
          .filter((contract) => Boolean(contract.address))
          .map((contract) => [contract.key as ChainContractKey, contract.address])
      )
    };
  }
}
