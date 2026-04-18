import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const RUN_ID = 'f0ba5faa-863d-4e31-b961-b87e14254269';
const CID = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  // 1. The run itself
  const run = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT * FROM "InforSyncRun" WHERE id = $1`, RUN_ID
  );
  console.log('\n=== Run ===');
  console.log(JSON.stringify(run[0], null, 2));

  // 2. All tasks for this run
  const tasks = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT id, status, "attemptCount", "createdAt", "startedAt", "finishedAt", "lastError",
            payload->>'programOffset' AS off,
            payload->>'programEndOffset' AS endoff,
            payload->>'requestOffset' AS reqoff,
            payload->>'businessDateIso' AS biz,
            payload->>'bookmark' AS bookmark
       FROM "InforSyncTask"
       WHERE "runId" = $1
       ORDER BY "createdAt"`, RUN_ID
  );
  console.log(`\n=== Tasks for run (${tasks.length}) ===`);
  for (const t of tasks) {
    console.log(`  [${t.status}] off=${t.off}-${t.endoff} reqOff=${t.reqoff} biz=${t.biz} bookmark=${t.bookmark} att=${t.attemptCount}`);
    if (t.lastError) console.log(`     err: ${String(t.lastError).slice(0,200)}`);
  }

  // 3. Compare to a healthy run from earlier — find any prior run that produced a Feb 27 healthy snapshot
  console.log('\n=== Last 5 runs by createdAt for context ===');
  const recent = await prisma.$queryRawUnsafe<Array<any>>(
    `SELECT id, mode, status, "chunkCount", "recordsCreated", "warningCount", "createdAt", "finishedAt", "startDate", "endDate"
       FROM "InforSyncRun" WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 8`, CID
  );
  for (const r of recent) {
    const dur = r.finishedAt ? Math.round((new Date(r.finishedAt).getTime()-new Date(r.createdAt).getTime())/1000)+'s' : '-';
    console.log(`  ${r.createdAt.toISOString().slice(0,16)} mode=${r.mode||'?'} ${r.status} chunks=${r.chunkCount} recs=${r.recordsCreated} warn=${r.warningCount} dur=${dur} window=[${r.startDate?.toISOString().slice(0,10)}→${r.endDate?.toISOString().slice(0,10)}]`);
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
