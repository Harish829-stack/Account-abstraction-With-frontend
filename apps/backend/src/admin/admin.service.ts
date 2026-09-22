import { Injectable } from "@nestjs/common";
import type { ChainContractKey, SerializedChainConfig } from "../config/config.types";
import { ConfigService } from "../config/config.service";
import { AdminRepository } from "./admin.repository";
import type { AdminChainInput, AdminChainUpdateInput, AdminConfigResponse } from "./admin.types";

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
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly configService: ConfigService
  ) {}

  async getConfig(): Promise<AdminConfigResponse> {
    const [chains, shared] = await Promise.all([
      this.adminRepository.listChains(),
      this.adminRepository.listSharedContracts()
    ]);

    return {
      chains: chains.map((chain) => this.serializeChain(chain)),
      sharedContracts: Object.fromEntries(shared.map((contract) => [contract.key, contract.address]))
    };
  }

  async upsertChain(input: AdminChainInput): Promise<SerializedChainConfig> {
    const chain = await this.adminRepository.upsertChain(input);
    await this.configService.invalidateConfigCache();
    return this.serializeChain(chain);
  }

  async updateChain(input: AdminChainUpdateInput): Promise<SerializedChainConfig> {
    const chain = await this.adminRepository.updateChain(input);
    await this.configService.invalidateConfigCache();
    return this.serializeChain(chain);
  }

  async updateChainContracts(
    chainId: number,
    contracts: Record<string, string>
  ): Promise<SerializedChainConfig> {
    const chain = await this.adminRepository.upsertChainContractsByChainId(chainId, contracts);
    await this.configService.invalidateConfigCache();
    return this.serializeChain(chain);
  }

  async updateSharedContracts(contracts: Record<string, string>): Promise<Record<string, string>> {
    const shared = await this.adminRepository.upsertSharedContracts(contracts);
    await this.configService.invalidateConfigCache();
    return Object.fromEntries(shared.map((contract) => [contract.key, contract.address]));
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
