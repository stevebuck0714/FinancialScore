import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID='cmmnwyofv000fqhp4z8lebbny';
const CONN='cmmzih9p10004qhjwxlgui0sc';

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);

  const c = await prisma.accountingConnection.findUnique({
    where: { id: CONN },
    select: {
      id: true, status: true, autoSync: true, syncFrequency: true,
      lastSyncAt: true, errorMessage: true, createdAt: true, updatedAt: true,
      connectionMetadata: true,
    }
  });
  if (!c) { console.log('connection not found'); return; }

  console.log('\n=== Connection state ===');
  console.log(`  status=${c.status}  autoSync=${c.autoSync}  freq=${c.syncFrequency}`);
  console.log(`  createdAt=${c.createdAt.toISOString()}`);
  console.log(`  updatedAt=${c.updatedAt.toISOString()}  <-- when was state last changed?`);
  console.log(`  lastSyncAt=${c.lastSyncAt?.toISOString() || '-'}`);
  console.log(`  errorMessage=${c.errorMessage || '(none)'}`);

  const md: any = c.connectionMetadata || {};
  console.log('\n=== connectionMetadata keys ===');
  console.log('  keys:', Object.keys(md).slice(0, 50));
  if (md.lastError || md.lastErrorAt || md.deactivatedAt || md.deactivationReason) {
    console.log('\n=== Deactivation breadcrumbs ===');
    console.log('  lastError:', md.lastError);
    console.log('  lastErrorAt:', md.lastErrorAt);
    console.log('  deactivatedAt:', md.deactivatedAt);
    console.log('  deactivationReason:', md.deactivationReason);
  }

  console.log('\n=== Last 10 InforSyncRun rows for context ===');
  const runs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, mode, status, "createdAt", "completedAt", "startDate", "endDate", "chunkCount", "recordsCreated"
       FROM "InforSyncRun" WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 10`, CID);
  for (const r of runs) {
    console.log(`  ${r.createdAt.toISOString().slice(0,16)}  mode=${(r.mode||'?').padEnd(22)} ${r.status.padEnd(9)} chunks=${r.chunkCount ?? '-'} recs=${r.recordsCreated ?? '-'}  completed=${r.completedAt?.toISOString().slice(0,16) || '-'}`);
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
