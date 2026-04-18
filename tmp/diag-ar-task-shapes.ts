import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  console.log('\n=== Distinct miProgram values in InforSyncTask payloads ===');
  const progs = await prisma.$queryRawUnsafe<Array<{mp:string|null;n:bigint}>>(
    `SELECT payload->>'miProgram' AS mp, COUNT(*)::bigint AS n
       FROM "InforSyncTask" WHERE "companyId"=$1
       GROUP BY 1 ORDER BY n DESC LIMIT 50`, CID);
  for (const r of progs) console.log(`  ${(r.mp||'(null)').padEnd(28)} ${String(r.n).padStart(8)}`);

  console.log('\n=== Distinct payload top-level keys (top 30 keys) ===');
  const keys = await prisma.$queryRawUnsafe<Array<{k:string;n:bigint}>>(
    `SELECT k, COUNT(*)::bigint AS n
       FROM "InforSyncTask" t, jsonb_object_keys(t.payload) k
       WHERE t."companyId"=$1
       GROUP BY k ORDER BY n DESC LIMIT 30`, CID);
  for (const r of keys) console.log(`  ${r.k.padEnd(28)} ${String(r.n).padStart(8)}`);

  console.log('\n=== One sample task payload (most recent) ===');
  const sample = await prisma.$queryRawUnsafe<Array<{payload:any;createdAt:Date;status:string}>>(
    `SELECT payload, "createdAt", status FROM "InforSyncTask"
       WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 1`, CID);
  if (sample[0]) {
    console.log('  createdAt:', sample[0].createdAt);
    console.log('  status:', sample[0].status);
    console.log('  payload:', JSON.stringify(sample[0].payload, null, 2).slice(0,1200));
  }

  console.log('\n=== Tasks where any value/text contains "artrans" (case-insensitive) ===');
  const ar = await prisma.$queryRawUnsafe<Array<{n:bigint}>>(
    `SELECT COUNT(*)::bigint AS n FROM "InforSyncTask"
       WHERE "companyId"=$1 AND payload::text ILIKE '%artrans%'`, CID);
  console.log('  count =', ar[0]?.n);

  console.log('\n=== Source/program for AROpenInvoiceSnapshot vs counts ===');
  const sp = await prisma.$queryRawUnsafe<Array<{sp:string|null;st:string|null;n:bigint}>>(
    `SELECT "sourceProgram" AS sp, "sourceTransaction" AS st, COUNT(*)::bigint AS n
       FROM "AROpenInvoiceSnapshot" WHERE "companyId"=$1
       GROUP BY 1,2 ORDER BY n DESC LIMIT 10`, CID);
  for (const r of sp) console.log(`  sp=${(r.sp||'(null)').padEnd(35)} st=${(r.st||'(null)').padEnd(20)} ${String(r.n).padStart(10)}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
