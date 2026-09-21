import { PrismaClient } from "@prisma/client";
import { CHAIN_CONFIG_SEED, SHARED_CONTRACT_SEED } from "../src/config/static-config";

const prisma = new PrismaClient();

async function main() {
  for (const [key, address] of Object.entries(SHARED_CONTRACT_SEED)) {
    if (!address) continue;
    await prisma.sharedContract.upsert({
      where: { key },
      update: { address },
      create: { key, address }
    });
  }

  for (const chainConfig of CHAIN_CONFIG_SEED) {
    const chain = await prisma.chain.upsert({
      where: { chainId: chainConfig.chainId },
      update: {
        name: chainConfig.name,
        rpcUrl: chainConfig.rpcUrl,
        bundlerUrl: chainConfig.bundlerUrl,
        explorerUrl: chainConfig.explorerUrl,
        explorerApiUrl: chainConfig.explorerApiUrl,
        explorerApiChainId: chainConfig.explorerApiChainId,
        nativeSymbol: chainConfig.nativeCurrency.symbol,
        nativeName: chainConfig.nativeCurrency.name,
        nativeDecimals: chainConfig.nativeCurrency.decimals,
        isTestnet: chainConfig.isTestnet,
        isActive: chainConfig.isActive,
        viewOnly: chainConfig.viewOnly,
        minPriorityFeeWei: chainConfig.minPriorityFeeWei,
        minFeeWei: chainConfig.minFeeWei
      },
      create: {
        chainId: chainConfig.chainId,
        name: chainConfig.name,
        rpcUrl: chainConfig.rpcUrl,
        bundlerUrl: chainConfig.bundlerUrl,
        explorerUrl: chainConfig.explorerUrl,
        explorerApiUrl: chainConfig.explorerApiUrl,
        explorerApiChainId: chainConfig.explorerApiChainId,
        nativeSymbol: chainConfig.nativeCurrency.symbol,
        nativeName: chainConfig.nativeCurrency.name,
        nativeDecimals: chainConfig.nativeCurrency.decimals,
        isTestnet: chainConfig.isTestnet,
        isActive: chainConfig.isActive,
        viewOnly: chainConfig.viewOnly,
        minPriorityFeeWei: chainConfig.minPriorityFeeWei,
        minFeeWei: chainConfig.minFeeWei
      }
    });

    for (const [key, address] of Object.entries(chainConfig.contracts)) {
      if (!address) continue;
      await prisma.chainContract.upsert({
        where: { chainId_key: { chainId: chain.id, key } },
        update: { address },
        create: { chainId: chain.id, key, address }
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
