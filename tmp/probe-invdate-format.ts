import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';
async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);
  // 1. Look at InvDate value examples for known invoice 202304143.
  const r1 = await prisma.$queryRawUnsafe<any[]>(
    `SELECT payload->>'InvDate' AS inv_date, payload->>'CustNum' AS cust, payload->>'InvNum' AS inv,
            payload->>'Amount' AS amt, payload->>'Type' AS typ
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND payload->>'InvNum' = '202304143'
      LIMIT 10`,
    COMPANY
  );
  console.log('\nrows for InvNum=202304143:'); for (const r of r1) console.log(' ', r);

  // 2. Distinct InvDate string formats in the window.
  const r2 = await prisma.$queryRawUnsafe<any[]>(
    `SELECT length(payload->>'InvDate') AS len, COUNT(*)::int AS n,
            MIN(payload->>'InvDate') AS sample_min, MAX(payload->>'InvDate') AS sample_max
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' IS NOT NULL
      GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    COMPANY
  );
  console.log('\nInvDate length distribution:'); for (const r of r2) console.log(' ', r);

  // 3. Earliest and latest InvDate string overall.
  const r3 = await prisma.$queryRawUnsafe<any[]>(
    `SELECT MIN(payload->>'InvDate') AS min_invdate, MAX(payload->>'InvDate') AS max_invdate, COUNT(*)::int AS n
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' IS NOT NULL`,
    COMPANY
  );
  console.log('\noverall InvDate range (Type=I):'); for (const r of r3) console.log(' ', r);
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
