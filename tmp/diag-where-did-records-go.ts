import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  console.log('\n=== Q1: Did 98K records land in InforRawRecord today? ===');
  const raw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram", COUNT(*)::int AS n,
            MIN("createdAt") AS first_at, MAX("createdAt") AS last_at
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "createdAt" >= NOW() - INTERVAL '6 hours'
       GROUP BY "miProgram" ORDER BY n DESC LIMIT 30`, CID);
  if (raw.length === 0) console.log('  (no raw records ingested in last 6h !!!)');
  for (const r of raw) console.log(`  ${r.miProgram.padEnd(22)} ${String(r.n).padStart(7)}  ${r.first_at?.toISOString().slice(11,19)}–${r.last_at?.toISOString().slice(11,19)}`);

  console.log('\n=== Q2: Did AROpenInvoiceSnapshot get rows written today (any snapshotDate)? ===');
  const aroToday = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day',"snapshotDate") AS snap_date, COUNT(*)::int AS n,
            MIN("createdAt") AS first_at, MAX("createdAt") AS last_at
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "createdAt" >= NOW() - INTERVAL '6 hours'
       GROUP BY 1 ORDER BY 1`, CID);
  if (aroToday.length === 0) console.log('  (no AROpenInvoiceSnapshot rows created/updated in last 6h !!!)');
  for (const r of aroToday) console.log(`  snapshotDate=${r.snap_date.toISOString().slice(0,10)}  rows=${String(r.n).padStart(6)}  written=${r.first_at?.toISOString().slice(11,19)}–${r.last_at?.toISOString().slice(11,19)}`);

  console.log('\n=== Q3: Did ARInvoiceDetail get rows written today? ===');
  const arDetail = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "ARInvoiceDetail"
       WHERE "companyId"=$1 AND "updatedAt" >= NOW() - INTERVAL '6 hours'`, CID);
  console.log(`  rows updated/created: ${arDetail[0]?.n}`);

  console.log('\n=== Q4: Did ARPaymentFact get rows written today? ===');
  const arPay = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "ARPaymentFact"
       WHERE "companyId"=$1 AND "updatedAt" >= NOW() - INTERVAL '6 hours'`, CID);
  console.log(`  rows updated/created: ${arPay[0]?.n}`);

  console.log('\n=== Q5: Inventory ALL InforRawRecord miPrograms in raw store (for 92dd4f90 era) ===');
  const all = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram", COUNT(*)::int AS n
       FROM "InforRawRecord"
       WHERE "companyId"=$1
         AND "createdAt" >= '2026-04-17T05:18:00Z'
         AND "createdAt" <= '2026-04-17T05:35:00Z'
       GROUP BY "miProgram" ORDER BY n DESC`, CID);
  if (all.length === 0) console.log('  (no raw records created during the 92dd window!)');
  for (const r of all) console.log(`  ${r.miProgram.padEnd(22)} ${r.n}`);

  console.log('\n=== Q6: For an SLArtrans raw record from today, what does it look like? ===');
  const sample = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram", payload, "createdAt"
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "miProgram" ILIKE 'SLArt%'
         AND "createdAt" >= NOW() - INTERVAL '6 hours'
       ORDER BY "createdAt" DESC LIMIT 1`, CID);
  if (sample.length === 0) console.log('  (no SLArtrans raw records from last 6h)');
  for (const s of sample) {
    console.log(`  miProgram: ${s.miProgram}`);
    console.log(`  createdAt: ${s.createdAt.toISOString()}`);
    console.log(`  payload keys: ${Object.keys(s.payload||{}).join(',')}`);
    const p:any = s.payload || {};
    console.log(`  RecordDate=${p.RecordDate}  InvDate=${p.InvDate}  DistDate=${p.DistDate}  Type=${p.Type}  Amount=${p.Amount}  UbOpening=${p.UbOpening}`);
  }

  console.log('\n=== Q7: APOpenInvoiceSnapshot — was AP snapshot updated similarly? ===');
  const apToday = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day',"snapshotDate") AS snap_date, COUNT(*)::int AS n
       FROM "APOpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "createdAt" >= NOW() - INTERVAL '6 hours'
       GROUP BY 1 ORDER BY 1`, CID);
  if (apToday.length === 0) console.log('  (no AP snapshot rows from last 6h)');
  for (const r of apToday) console.log(`  snapshotDate=${r.snap_date.toISOString().slice(0,10)}  rows=${r.n}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
