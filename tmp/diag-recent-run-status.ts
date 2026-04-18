import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  console.log('\n=== Last 5 runs (full state) ===');
  const recent = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, mode, status, "createdAt", "lastChunkAt", "startDate", "endDate",
            "chunkCount", "recordsCreated", message
       FROM "InforSyncRun" WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 5`, CID);
  for (const r of recent) {
    console.log(`\n  Run ${r.id}`);
    console.log(`    mode=${r.mode} status=${r.status}`);
    console.log(`    created=${r.createdAt.toISOString()} lastChunk=${r.lastChunkAt?.toISOString() || '-'}`);
    console.log(`    window=${r.startDate?.toISOString().slice(0,10)}→${r.endDate?.toISOString().slice(0,10)}`);
    console.log(`    chunks=${r.chunkCount} records=${r.recordsCreated}`);
    if (r.message) console.log(`    message: ${r.message.slice(0,200)}`);
  }

  console.log('\n=== Task breakdown for 92dd4f90... (the one we kicked off tonight) ===');
  const tasks = await prisma.$queryRawUnsafe<any[]>(
    `SELECT status, COUNT(*)::int AS n,
            MIN("attemptCount")::int AS min_attempts, MAX("attemptCount")::int AS max_attempts
       FROM "InforSyncTask" WHERE "runId"='92dd4f90-b55f-4cab-93b4-8af473774b84'
       GROUP BY status ORDER BY status`);
  if (tasks.length === 0) console.log('  (no tasks found for that runId)');
  for (const t of tasks) console.log(`  ${t.status.padEnd(10)} count=${String(t.n).padStart(4)} attempts=${t.min_attempts}-${t.max_attempts}`);

  console.log('\n=== Sample failed tasks (if any) ===');
  const failed = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, "attemptCount", payload, "errorMessage"
       FROM "InforSyncTask"
       WHERE "runId"='92dd4f90-b55f-4cab-93b4-8af473774b84' AND status='failed'
       LIMIT 3`);
  for (const t of failed) {
    console.log(`  ${t.id} attempts=${t.attemptCount}`);
    console.log(`    payload: ${JSON.stringify(t.payload).slice(0,300)}`);
    console.log(`    error: ${(t.errorMessage||'').slice(0,300)}`);
  }

  console.log('\n=== Sample done tasks: what date+program were they targeting? ===');
  const done = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, payload
       FROM "InforSyncTask"
       WHERE "runId"='92dd4f90-b55f-4cab-93b4-8af473774b84' AND status='done'
       ORDER BY "updatedAt" DESC LIMIT 5`);
  for (const t of done) {
    const p:any = t.payload || {};
    console.log(`  businessDate=${p.businessDateIso || '?'}  programOffsets=${p.programOffset}-${p.programEndOffset}  payloadKeys=${Object.keys(p).slice(0,12).join(',')}`);
  }

  console.log('\n=== InforRawRecord rows ingested for AR programs in the last 24h ===');
  const raw = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram", COUNT(*)::int AS n
       FROM "InforRawRecord"
       WHERE "companyId"=$1 AND "createdAt" >= NOW() - INTERVAL '24 hours'
         AND "miProgram" ILIKE '%art%'
       GROUP BY "miProgram" ORDER BY n DESC`, CID);
  if (raw.length === 0) console.log('  (no AR-program raw records ingested in last 24h)');
  for (const r of raw) console.log(`  ${r.miProgram.padEnd(20)} ${r.n} rows`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
