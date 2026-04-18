/**
 * Why are SLArtrans days incomplete? Look at run + task history with correct columns.
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
const CID = 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  // 1) Tasks by month + status (no recordsCreated on Task; use attemptCount + status)
  console.log('\n=== SLArtrans tasks by month + status (InforSyncTask) ===');
  const tasks = await prisma.$queryRawUnsafe<Array<{ ym: string; status: string; n: bigint; attempts_avg: number|null }>>(
    `SELECT to_char("createdAt",'YYYY-MM') AS ym, "status",
            COUNT(*)::bigint AS n,
            AVG(COALESCE("attemptCount",0))::float8 AS attempts_avg
       FROM "InforSyncTask"
       WHERE "companyId" = $1
         AND payload->>'miProgram' ILIKE '%artrans%'
       GROUP BY 1,2 ORDER BY 1 DESC, 2`,
    CID
  );
  if (tasks.length === 0) {
    console.log('  (no SLArtrans tasks found)');
  } else {
    console.log('  YYYY-MM   status        tasks   avg_attempts');
    for (const r of tasks) {
      console.log(`  ${r.ym}   ${(r.status||'?').padEnd(12)} ${String(r.n).padStart(6)}   ${Number(r.attempts_avg||0).toFixed(2).padStart(6)}`);
    }
  }

  // 2) Last 25 SLArtrans-bearing runs
  console.log('\n=== Last 25 SLArtrans-bearing runs ===');
  const runs = await prisma.$queryRawUnsafe<Array<{ id: string; createdAt: Date; finishedAt: Date|null; status: string; chunkCount: number|null; recordsCreated: number|null; warningCount: number|null; lastError: string|null; mode: string }>>(
    `SELECT r."id", r."createdAt", r."finishedAt", r."status", r."chunkCount", r."recordsCreated", r."warningCount", r."lastError", r."mode"
       FROM "InforSyncRun" r
       WHERE r."companyId" = $1
         AND EXISTS (
           SELECT 1 FROM "InforSyncTask" t
            WHERE t."runId" = r."id"
              AND t.payload->>'miProgram' ILIKE '%artrans%'
         )
       ORDER BY r."createdAt" DESC
       LIMIT 25`,
    CID
  );
  for (const r of runs) {
    const dur = r.finishedAt ? Math.round((r.finishedAt.getTime() - r.createdAt.getTime()) / 1000) + 's' : '-';
    const errSnip = r.lastError ? ` err="${r.lastError.slice(0,80)}"` : '';
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  ${(r.status||'?').padEnd(12)} mode=${r.mode||'?'}  chunks=${r.chunkCount ?? '-'}  rows=${r.recordsCreated ?? '-'}  warn=${r.warningCount ?? '-'}  dur=${dur}${errSnip}`);
  }

  // 3) Last 12 SLArtrans tasks with details + lastResponse snippet
  console.log('\n=== Last 12 SLArtrans tasks ===');
  const recent = await prisma.$queryRawUnsafe<Array<{ id: string; createdAt: Date; finishedAt: Date|null; status: string; attemptCount: number|null; lastError: string|null; lastResponse: any; payload: any }>>(
    `SELECT t."id", t."createdAt", t."finishedAt", t."status", t."attemptCount", t."lastError", t."lastResponse", t.payload
       FROM "InforSyncTask" t
       WHERE t."companyId" = $1
         AND t.payload->>'miProgram' ILIKE '%artrans%'
       ORDER BY t."createdAt" DESC
       LIMIT 12`,
    CID
  );
  for (const r of recent) {
    const errSnip = r.lastError ? ` err="${r.lastError.slice(0,100)}"` : '';
    const dur = r.finishedAt ? Math.round((r.finishedAt.getTime() - r.createdAt.getTime()) / 1000) + 's' : '-';
    const respSnip = r.lastResponse ? JSON.stringify(r.lastResponse).slice(0,140) : '';
    const pSnip = r.payload ? JSON.stringify(r.payload).slice(0,160) : '';
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  ${(r.status||'?').padEnd(10)} att=${r.attemptCount ?? '-'} dur=${dur}${errSnip}`);
    console.log(`     payload : ${pSnip}`);
    if (respSnip) console.log(`     lastResp: ${respSnip}`);
  }

  // 4) Distinct task payloads (program + endpoint) so we know what shape the SLArtrans calls take
  console.log('\n=== Distinct SLArtrans task payload shapes (top 5) ===');
  const shapes = await prisma.$queryRawUnsafe<Array<{ shape: string; n: bigint }>>(
    `SELECT
        json_build_object(
          'miProgram', payload->>'miProgram',
          'endpoint', payload->>'endpoint',
          'frequency', payload->>'frequency',
          'mode', payload->>'mode'
        )::text AS shape,
        COUNT(*)::bigint AS n
       FROM "InforSyncTask"
       WHERE "companyId"=$1
         AND payload->>'miProgram' ILIKE '%artrans%'
       GROUP BY shape ORDER BY n DESC LIMIT 5`,
    CID
  );
  for (const s of shapes) console.log(`  ${String(s.n).padStart(6)}  ${s.shape}`);
}

main().catch((e)=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
