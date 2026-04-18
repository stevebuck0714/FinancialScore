/**
 * CSI: SLArtrans Site distribution.
 * If multiple Sites are present in our InforRawRecord SLArtrans data, we've
 * been aggregating sister entities into one bucket and that explains the
 * 25x inflation vs the BS.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';
const FROM = '20230801';
const TO   = '20231231';

function fmt$(n: number): string { return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function ts(): string { return new Date().toISOString().slice(11,19); }

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);

  // 1. Inventory of payload keys for Type='I' rows in 2023 window — does Site appear at all?
  console.log(`\n[${ts()}] payload keys for Type='I', InvDate ${FROM}..${TO}:`);
  const keys = await prisma.$queryRawUnsafe<any[]>(
    `SELECT key, COUNT(*)::int AS n
       FROM "InforRawRecord", jsonb_object_keys(payload) AS key
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' >= $2 AND payload->>'InvDate' <= ($3 || ' 99:99:99')
      GROUP BY 1 ORDER BY n DESC, key`,
    COMPANY, FROM, TO
  );
  for (const r of keys) console.log(`  ${String(r.key).padEnd(28)} ${r.n}`);

  // 2. Site values directly on InforRawRecord (column, not payload).
  console.log(`\n[${ts()}] InforRawRecord.site distribution for SLArtrans:`);
  const siteCol = await prisma.$queryRawUnsafe<any[]>(
    `SELECT site, COUNT(*)::int AS n
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
      GROUP BY 1 ORDER BY n DESC LIMIT 30`,
    COMPANY
  );
  for (const r of siteCol) console.log(`  site='${r.site ?? ''}'  n=${r.n}`);

  // 3. If payload has a 'Site' key, distribution.
  console.log(`\n[${ts()}] payload->>'Site' distribution for Type='I' window:`);
  const siteJson = await prisma.$queryRawUnsafe<any[]>(
    `SELECT payload->>'Site' AS site, COUNT(*)::int AS n,
            SUM(ABS((payload->>'Amount')::float8))::float8 AS sum_abs
       FROM "InforRawRecord"
      WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' >= $2 AND payload->>'InvDate' <= ($3 || ' 99:99:99')
      GROUP BY 1 ORDER BY n DESC LIMIT 30`,
    COMPANY, FROM, TO
  );
  for (const r of siteJson) console.log(`  Site='${r.site ?? ''}'  n=${r.n}  sum_abs=${fmt$(r.sum_abs)}`);
}

main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
