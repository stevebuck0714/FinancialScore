import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';
async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);
  // Show full payload of 5 sample Type='I' rows from the window.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT payload, "createdAt" FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' LIKE '202312%'
      LIMIT 5`,
    COMPANY
  );
  for (let i=0;i<rows.length;i++) {
    console.log(`\n--- row ${i+1} (createdAt=${rows[i].createdAt.toISOString()}) ---`);
    const p = rows[i].payload;
    const keys = Object.keys(p).sort();
    for (const k of keys) {
      const v = p[k];
      if (v === '' || v === null || v === undefined) continue;
      console.log(`  ${k.padEnd(24)} ${String(v)}`);
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
