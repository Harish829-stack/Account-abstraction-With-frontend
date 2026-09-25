const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const chains = await prisma.chain.findMany({ include: { contracts: true } });
  console.dir(chains, { depth: null });
}
main().catch(console.error).finally(() => prisma.$disconnect());
