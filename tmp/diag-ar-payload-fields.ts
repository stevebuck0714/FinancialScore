/**
 * AR payload field audit. Force-loads .env.local first.
 */
import * as fs from 'fs';
import * as path from 'path';

(function loadDotenvLocal() {
  try {
    const p = path.resolve(process.cwd(), '.env.local');
    const txt = fs.readFileSync(p, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val; // override
    }
    console.log('Loaded .env.local; DATABASE_URL host =', new URL(process.env.DATABASE_URL || '').host);
  } catch (e) {
    console.error('Failed to load .env.local:', e);
  }
})();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const AR_PROGRAMS = ['SLARTRANS', 'SLCUSTDRFTS', 'SLINVHDRS'];
const DATE_KEYS_OF_INTEREST = [
  'RecordDate', 'recordDate', 'RGDT', 'LMDT',
  'DistDate', 'distDate',
  'InvDate', 'invoiceDate', 'IVDT', 'IssueDate',
  'DueDate', 'dueDate', 'DUDT',
  'TransDate', 'transDate', 'TRDT',
  'PYDT', 'PaymentDate', 'paymentDate',
  'ControlPeriod', 'controlPeriod', 'ControlYear', 'controlYear',
  'AcctPeriod', 'acctPeriod', 'AcctYear', 'acctYear',
];

async function inventoryAllPrograms() {
  // What miPrograms exist at all on this DB?
  const rows = await prisma.$queryRawUnsafe<Array<{ companyId: string; miProgram: string; n: bigint }>>(
    `SELECT "companyId", "miProgram", COUNT(*)::bigint AS n
     FROM "InforRawRecord"
     GROUP BY "companyId", "miProgram"
     ORDER BY "companyId", "miProgram"`
  );
  return rows;
}

async function showSample(companyId: string, program: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: any; createdAt: Date }>>(
    `SELECT payload, "createdAt" FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = $2
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    companyId, program
  );
  if (rows.length === 0) {
    console.log(`\n=== ${program} (${companyId}): no rows ===`);
    return;
  }
  const payload = rows[0].payload || {};
  const allKeys = Object.keys(payload);
  console.log(`\n=== ${program} (${companyId}): ${allKeys.length} keys, latest ${rows[0].createdAt.toISOString()} ===`);
  console.log('  All keys: ' + allKeys.sort().join(', '));

  console.log('  Date / period fields actually present:');
  let any = false;
  for (const k of DATE_KEYS_OF_INTEREST) {
    if (k in payload) {
      any = true;
      const v = payload[k];
      const display = v == null ? 'NULL' : String(v);
      console.log(`    ${k.padEnd(20)} = ${display.length > 60 ? display.slice(0, 60) + '...' : display}`);
    }
  }
  if (!any) console.log('    (none of the candidate date/period keys are present)');
}

async function describeDateFieldCoverage(companyId: string, program: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(
    `SELECT payload FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = $2
     ORDER BY "createdAt" DESC
     LIMIT 1000`,
    companyId, program
  );
  if (rows.length === 0) return;
  const counts: Record<string, number> = {};
  for (const k of DATE_KEYS_OF_INTEREST) counts[k] = 0;
  for (const r of rows) {
    const payload = r.payload || {};
    for (const k of DATE_KEYS_OF_INTEREST) {
      const v = payload[k];
      if (v != null && String(v).trim() !== '') counts[k] += 1;
    }
  }
  console.log(`  Date/period field NON-NULL coverage in last ${rows.length} ${program} records:`);
  const interesting = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (interesting.length === 0) {
    console.log('    (none of the candidate date/period keys are populated in any record)');
    return;
  }
  for (const [k, n] of interesting) {
    const pct = ((n / rows.length) * 100).toFixed(1);
    console.log(`    ${k.padEnd(20)} ${String(n).padStart(5)} / ${rows.length}  (${pct}%)`);
  }
}

async function main() {
  console.log('=== AR Payload Audit ===');

  const inv = await inventoryAllPrograms();
  if (inv.length === 0) {
    console.log('No InforRawRecord rows at all on this DB.');
    return;
  }
  // Just show AR-related ones first
  const arInv = inv.filter((r) => AR_PROGRAMS.includes(r.miProgram));
  console.log('\nAR-program inventory:');
  if (arInv.length === 0) {
    console.log('  (none)  -- showing all miPrograms instead:');
    for (const r of inv) {
      console.log(`  ${r.companyId}  ${r.miProgram.padEnd(20)} ${r.n.toString().padStart(8)} records`);
    }
    return;
  }
  for (const r of arInv) {
    console.log(`  ${r.companyId}  ${r.miProgram.padEnd(14)} ${r.n.toString().padStart(8)} records`);
  }

  const byCompany = new Map<string, string[]>();
  for (const r of arInv) {
    if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, []);
    byCompany.get(r.companyId)!.push(r.miProgram);
  }

  for (const [companyId, programs] of byCompany.entries()) {
    console.log(`\n\n############ Company ${companyId} ############`);
    for (const program of programs) {
      await showSample(companyId, program);
      await describeDateFieldCoverage(companyId, program);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
