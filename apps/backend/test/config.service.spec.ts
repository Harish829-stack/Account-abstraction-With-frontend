import { Test } from "@nestjs/testing";
import { ConfigService } from "../src/config/config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

describe("ConfigService", () => {
  it("serializes chains and shared contracts into the public /config shape", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: PrismaService,
          useValue: {
            chain: {
              findMany: jest.fn().mockResolvedValue([
                {
                  chainId: 1,
                  name: "Example",
                  isTestnet: true,
                  isActive: true,
                  viewOnly: false,
                  rpcUrl: "https://example.invalid",
                  bundlerUrl: "https://bundler.example.invalid",
                  explorerUrl: "https://explorer.example.invalid",
                  explorerApiUrl: null,
                  explorerApiChainId: null,
                  nativeName: "Ether",
                  nativeSymbol: "ETH",
                  nativeDecimals: 18,
                  minPriorityFeeWei: "1",
                  minFeeWei: "2",
                  contracts: [
                    { key: "paymaster", address: "0x0000000000000000000000000000000000000001" },
                    { key: "eurcToken", address: "" }
                  ]
                }
              ])
            },
            sharedContract: {
              findMany: jest.fn().mockResolvedValue([
                { key: "ENTRY_POINT", address: "0x0000000000000000000000000000000000000002" }
              ])
            }
          }
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setJson: jest.fn().mockResolvedValue(undefined)
          }
        }
      ]
    }).compile();

    const service = moduleRef.get(ConfigService);
    await expect(service.getConfig()).resolves.toEqual({
      chains: [
        expect.objectContaining({
          chainId: 1,
          contracts: {
            paymaster: "0x0000000000000000000000000000000000000001"
          }
        })
      ],
      sharedContracts: {
        ENTRY_POINT: "0x0000000000000000000000000000000000000002"
      }
    });
  });

  it("ignores and replaces malformed cached config", async () => {
    const redis = {
      get: jest.fn().mockResolvedValue("{not-json"),
      del: jest.fn().mockResolvedValue(undefined),
      setJson: jest.fn().mockResolvedValue(undefined)
    };
    const databasePayload = [{
      chainId: 421614,
      name: "Arbitrum Sepolia",
      isTestnet: true,
      isActive: true,
      viewOnly: false,
      rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
      bundlerUrl: "",
      explorerUrl: "https://sepolia.arbiscan.io",
      explorerApiUrl: null,
      explorerApiChainId: 421614,
      nativeName: "Arbitrum Sepolia Ether",
      nativeSymbol: "ETH",
      nativeDecimals: 18,
      minPriorityFeeWei: "1",
      minFeeWei: "2",
      contracts: []
    }];
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: PrismaService,
          useValue: {
            chain: { findMany: jest.fn().mockResolvedValue(databasePayload) },
            sharedContract: { findMany: jest.fn().mockResolvedValue([]) }
          }
        },
        { provide: RedisService, useValue: redis }
      ]
    }).compile();

    await expect(moduleRef.get(ConfigService).getConfig()).resolves.toEqual(
      expect.objectContaining({ chains: [expect.objectContaining({ chainId: 421614 })] })
    );
    expect(redis.del).toHaveBeenCalledWith("app_config");
    expect(redis.setJson).toHaveBeenCalled();
  });
});
