import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  console.log('\n=== INFOR_M3 connection auto-sync state ===');
  const conns = await prisma.accountingConnection.findMany({
    where: { platform:'INFOR_M3', companyId: CID },
    select: { id:true, status:true, autoSync:true, syncFrequency:true, lastSyncAt:true, errorMessage:true, connectionMetadata: true }
  });
  for (const c of conns) {
    const md:any = c.connectionMetadata || {};
    console.log(`  conn=${c.id}`);
    console.log(`    status=${c.status}  autoSync=${c.autoSync}  freq=${c.syncFrequency}  pullTime=${md.operationalPullTime||'(default 08:00)'}  windowDays=${md.autoSyncWindowDays||'(default)'}`);
    console.log(`    lastSyncAt=${c.lastSyncAt?.toISOString() || '-'}  err=${(c.errorMessage||'').slice(0,200)}`);
  }

  console.log('\n=== Recent InforSyncRun rows triggered_by source breakdown (look at "trigger" payload) ===');
  const recent = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, mode, status, "createdAt", "startDate", "endDate", "chunkCount", "recordsCreated", payload
       FROM "InforSyncRun" WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 12`, CID);
  for (const r of recent) {
    const trig = r.payload?.trigger || r.payload?.source || r.payload?.initiatedBy || '?';
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  mode=${(r.mode||'?').padEnd(22)} ${r.status.padEnd(8)} chunks=${r.chunkCount ?? '-'} recs=${r.recordsCreated ?? '-'}  trigger=${JSON.stringify(trig)}`);
  }

  console.log('\n=== AROpenInvoiceSnapshot per-day rows for April 2026 ===');
  const apr = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day',"snapshotDate") AS d, COUNT(*)::bigint AS n, SUM("openAmount")::numeric AS open
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "snapshotDate" >= '2026-04-01' AND "snapshotDate" < '2026-05-01'
       GROUP BY 1 ORDER BY 1 DESC`, CID);
  if (apr.length === 0) console.log('  (no April snapshots at all)');
  for (const r of apr) console.log(`  ${r.d.toISOString().slice(0,10)}  rows=${String(r.n).padStart(6)}  open=${Number(r.open).toLocaleString()}`);

  console.log('\n=== AROpenInvoiceSnapshot per-day rows for late March + early April (compare daily_overlap era) ===');
  const mar = await prisma.$queryRawUnsafe<any[]>(
    `SELECT date_trunc('day',"snapshotDate") AS d, COUNT(*)::bigint AS n
       FROM "AROpenInvoiceSnapshot"
       WHERE "companyId"=$1 AND "snapshotDate" >= '2026-03-25' AND "snapshotDate" < '2026-04-15'
       GROUP BY 1 ORDER BY 1 DESC`, CID);
  for (const r of mar) console.log(`  ${r.d.toISOString().slice(0,10)}  rows=${String(r.n).padStart(6)}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
