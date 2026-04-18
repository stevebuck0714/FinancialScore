import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  const active = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, "chunkCount", "createdAt", "lastChunkAt"
       FROM "InforSyncRun"
       WHERE "companyId"=$1 AND status IN ('running','queued')
       ORDER BY "createdAt" DESC`, CID);

  if (active.length === 0) {
    console.log('No active runs to cancel.');
    return;
  }

  const now = new Date();
  for (const r of active) {
    console.log(`\nCancelling run ${r.id} (status=${r.status} chunks=${r.chunkCount})...`);
    await prisma.$executeRawUnsafe(
      `UPDATE "InforSyncRun"
          SET status='cancelled', message='Cancelled to prevent further damage to historical AR snapshots.', "finishedAt"=$1, "updatedAt"=$1
          WHERE id=$2`,
      now, r.id
    );
    const upd = await prisma.$executeRawUnsafe(
      `UPDATE "InforSyncTask"
          SET status='cancelled', "finishedAt"=$1, "updatedAt"=$1
          WHERE "runId"=$2 AND status IN ('pending','leased')`,
      now, r.id
    );
    console.log(`  marked ${upd} pending/leased tasks as cancelled`);
  }

  console.log('\nFinal task breakdown across cancelled runs:');
  for (const r of active) {
    const tasks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status, COUNT(*)::int AS n FROM "InforSyncTask" WHERE "runId"=$1 GROUP BY status`, r.id);
    console.log(`  Run ${r.id}:`);
    for (const t of tasks) console.log(`    ${t.status.padEnd(10)} ${t.n}`);
  }
}
main().catch(e=>{console.error(e); process.exitCode=1;}).finally(()=>prisma.$disconnect());
