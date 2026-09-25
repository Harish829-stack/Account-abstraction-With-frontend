import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const chainId = 421614;
  const address = "0xb9d7e0fA7cB31DC6128Cf64554164155A42fFe9d";

  const account = await prisma.smartAccount.upsert({
    where: { chainId_address: { chainId, address } },
    update: {},
    create: {
      chainId,
      address,
      ownerEoa: "0x878344AF84A404439Ea37cFB9b30DeFd7938741C",
      salt: "1"
    }
  });

  const sessionKey = await prisma.sessionKey.upsert({
    where: { smartAccountId_keyAddress: { smartAccountId: account.id, keyAddress: "0x5aafed20d23dbb7aa94e1ae788830f95a3ebd343096df4c1910935e012c307b3" } },
    update: {},
    create: {
      smartAccountId: account.id,
      keyAddress: "0x5aafed20d23dbb7aa94e1ae788830f95a3ebd343096df4c1910935e012c307b3",
      name: "Financial Agent Session Key",
      status: "authorized",
      allowedTargets: ["0xAB49984529296Ead4dF03309BFeA6b273d9d34E4"],
      maxValueWei: "0",
      validAfter: 0,
      validUntil: 1999999999,
      rawPermissions: {}
    }
  });

  const userOp = await prisma.userOperation.upsert({
    where: { hash: "0xbf2f1...25b66" },
    update: {},
    create: {
      hash: "0xbf2f1...25b66",
      smartAccountId: account.id,
      chainId: chainId,
      label: "Mock Arbitrum Tx",
      status: "confirmed",
      txHash: "0xbf2f1...25b66",
      calldata: "0x",
      receipt: {}
    }
  });

  console.log("Mock data seeded:", account, sessionKey, userOp);
}

main().finally(() => prisma.$disconnect());
