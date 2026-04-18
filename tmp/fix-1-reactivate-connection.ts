/**
 * FIX #1: Re-activate the INFOR_M3 connection so the nightly cron picks it up again.
 *
 * Why: The connection was flipped to status=INACTIVE on or around 2026-04-09 via a
 * manual disconnect (`inforManualDisconnect: true` is set in metadata, with credentials
 * still intact). The nightly cron (app/api/cron/sync-operational-data/route.ts) filters
 * `status === 'ACTIVE'`, so it has been silently skipping this company for ~10 days,
 * which is why no AR snapshots exist for April.
 *
 * What this does:
 *   - Sets status -> ACTIVE
 *   - Clears connectionMetadata.inforManualDisconnect
 *
 * Effect:
 *   - The 03:00 ET cron will sync this connection on the next run
 *   - The "Daily Auto Sync" badge in the UI will show as connected
 *
 * SAFE because credentials and inforProfiles are still intact in metadata
 * (verified via diag-conn-inactive.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CONN = 'cmmzih9p10004qhjwxlgui0sc';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('Host:', new URL(process.env.DATABASE_URL!).host);
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE');

  const before = await prisma.accountingConnection.findUnique({
    where: { id: CONN },
    select: { id: true, status: true, autoSync: true, connectionMetadata: true }
  });
  if (!before) { console.log('connection not found'); return; }

  console.log('\nBefore:');
  const md: any = before.connectionMetadata || {};
  console.log(`  status=${before.status}  autoSync=${before.autoSync}  inforManualDisconnect=${md.inforManualDisconnect}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Would set: status=ACTIVE, inforManualDisconnect=false');
    return;
  }

  const newMetadata = { ...md, inforManualDisconnect: false };
  const after = await prisma.accountingConnection.update({
    where: { id: CONN },
    data: {
      status: 'ACTIVE',
      connectionMetadata: newMetadata,
    },
    select: { id: true, status: true, autoSync: true, connectionMetadata: true }
  });

  const mdAfter: any = after.connectionMetadata || {};
  console.log('\nAfter:');
  console.log(`  status=${after.status}  autoSync=${after.autoSync}  inforManualDisconnect=${mdAfter.inforManualDisconnect}`);
  console.log('\nDONE. Cron will pick this up at the configured pull time (03:00 ET).');
}
main().catch((e)=>{console.error(e); process.exitCode=1;}).finally(()=>prisma.$disconnect());
