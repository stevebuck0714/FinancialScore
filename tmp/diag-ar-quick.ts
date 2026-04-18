/**
 * Quick: list every distinct miProgram on this DB, then case-insensitive AR check.
 */
import * as fs from 'fs';
import * as path from 'path';

(function loadDotenvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
})();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  const all = await prisma.$queryRawUnsafe<Array<{ companyId: string; miProgram: string; n: bigint }>>(
    `SELECT "companyId", "miProgram", COUNT(*)::bigint AS n
       FROM "InforRawRecord"
       GROUP BY "companyId","miProgram"
       ORDER BY n DESC`
  );
  console.log(`\nAll (companyId, miProgram) tuples in InforRawRecord:`);
  for (const r of all) console.log(`  ${r.companyId}  ${r.miProgram.padEnd(24)} ${String(r.n).padStart(10)}`);

  // Also see whether the dev company has any AR-related fact tables already populated.
  const devCID = 'cmmnwyofv000fqhp4z8lebbny';
  const arOpenCount = await prisma.aROpenInvoiceSnapshot.count({ where: { companyId: devCID } });
  const arInvDetail = await prisma.aRInvoiceDetail.count({ where: { companyId: devCID } });
  const arPayments = await prisma.aRPaymentFact.count({ where: { companyId: devCID } });
  const arAging = await prisma.aRAgingSnapshot.count({ where: { companyId: devCID } });
  console.log(`\nDev company AR fact-table counts:`);
  console.log(`  AROpenInvoiceSnapshot:  ${arOpenCount}`);
  console.log(`  ARInvoiceDetail:        ${arInvDetail}`);
  console.log(`  ARPaymentFact:          ${arPayments}`);
  console.log(`  ARAgingSnapshot:        ${arAging}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
