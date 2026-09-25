import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.chain.upsert({
    where: { chainId: 421614 },
    update: {},
    create: {
      chainId: 421614,
      name: "Arbitrum Sepolia",
      isTestnet: true,
      isActive: true,
      viewOnly: false,
      rpcUrl: process.env.PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      bundlerUrl: process.env.PUBLIC_ARBITRUM_SEPOLIA_BUNDLER_URL || "",
      explorerUrl: "https://sepolia.arbiscan.io",
      explorerApiUrl: "https://api-sepolia.arbiscan.io/api",
      explorerApiChainId: 421614,
      nativeSymbol: "ETH",
      nativeName: "Arbitrum Sepolia Ether",
      nativeDecimals: 18,
      minPriorityFeeWei: "150000000",
      minFeeWei: "500000000",
      contracts: {
        create: [
          { key: "paymaster", address: process.env.PAYMASTER || "" },
          { key: "usdcToken", address: process.env.USDC_TOKEN || "" },
          { key: "priceFeed", address: process.env.PRICE_FEED || "" },
          { key: "multisigProxy", address: process.env.MULTISIG_PROXY || "" }
        ]
      }
    }
  });
  console.log("Arbitrum Sepolia seeded.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
