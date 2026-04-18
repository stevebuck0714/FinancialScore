import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const deleted = await prisma.$executeRaw`
    DELETE FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND EXTRACT(HOUR FROM "snapshotDate") != 0`;
  console.log(`Deleted non-midnight straggler rows: ${deleted}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
