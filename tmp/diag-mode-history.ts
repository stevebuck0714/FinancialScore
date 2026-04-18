import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  console.log('\n=== InforSyncRun mode distribution (all-time) ===');
  const m = await prisma.$queryRawUnsafe<Array<{mode:string|null;n:bigint;first:Date;last:Date}>>(
    `SELECT mode, COUNT(*)::bigint AS n, MIN("createdAt") AS first, MAX("createdAt") AS last
       FROM "InforSyncRun" WHERE "companyId"=$1 GROUP BY mode ORDER BY n DESC`, CID);
  for (const r of m) console.log(`  ${(r.mode||'(null)').padEnd(28)} ${String(r.n).padStart(6)}  first=${r.first?.toISOString().slice(0,10)} last=${r.last?.toISOString().slice(0,10)}`);

  console.log('\n=== Last 15 runs (any mode) with start/end window ===');
  const recent = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT id, mode, status, "chunkCount", "recordsCreated", "createdAt", "startDate", "endDate"
       FROM "InforSyncRun" WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 15`, CID);
  for (const r of recent) {
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  mode=${(r.mode||'?').padEnd(24)} ${r.status.padEnd(8)} chunks=${r.chunkCount ?? '-'} recs=${r.recordsCreated ?? '-'}  window=${r.startDate?.toISOString().slice(0,10)}→${r.endDate?.toISOString().slice(0,10)}`);
  }

  console.log('\n=== AccountingConnection metadata for INFOR_M3 (lastSyncAt + run state) ===');
  const conns = await prisma.accountingConnection.findMany({
    where: { platform:'INFOR_M3', companyId: CID },
    select: { id:true, lastSyncAt:true, errorMessage:true, connectionMetadata: true }
  });
  for (const c of conns) {
    const md:any = c.connectionMetadata || {};
    const run = md.operationalAsyncRun || md.operationalRun || md.run || null;
    console.log(`  conn=${c.id}  lastSyncAt=${c.lastSyncAt?.toISOString().slice(0,16) || '-'} err=${c.errorMessage || '-'}`);
    if (run) console.log(`    run: status=${run.status} mode=${run.mode} updatedAt=${run.updatedAt}`);
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
