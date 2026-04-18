/**
 * Add `ApAcct` to the `properties=` query string of every saved SLVchHdrs
 * endpoint URL in `AccountingConnection.connectionMetadata`.
 *
 * Why:
 *   The canonical SLVchHdrs URL builder (lib/infor-m3/operational-sync.ts,
 *   `SL_VCHHDRS_SAFE_PROPERTIES`) already includes `ApAcct`, but legacy
 *   per-customer connection rows stored a URL without it. CSI returns only
 *   the requested properties, so without this fix every newly-synced voucher
 *   row will continue to land with apAcct=NULL.
 *
 * Idempotent:
 *   Adds `ApAcct` only if missing. Re-runs are no-ops.
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.env.DRY_RUN !== '0';

type Program = {
  miProgram?: string;
  endpointPath?: string;
  module?: string;
  [k: string]: any;
};

function ensureApAcct(endpointPath: string): { updated: string; changed: boolean } {
  const [path, qs = ''] = endpointPath.split('?');
  const params = new URLSearchParams(qs);
  const propStr = params.get('properties') || '';
  const props = propStr.split(',').map((s) => s.trim()).filter(Boolean);
  if (props.some((p) => p.toLowerCase() === 'apacct')) {
    return { updated: endpointPath, changed: false };
  }
  props.push('ApAcct');
  params.set('properties', props.join(','));
  // Preserve original orderby formatting (URLSearchParams encodes it differently
  // than CSI expects). Rebuild manually so 'orderby=RecordDate desc, Voucher desc'
  // stays intact (commas in the value, etc.).
  const rebuilt: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === 'orderby' || k === 'orderBy') {
      rebuilt.push(`${k}=${v}`);
    } else {
      rebuilt.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  return { updated: `${path}?${rebuilt.join('&')}`, changed: true };
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const dbHost = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1];
    console.log(`DB: ${dbHost}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (set DRY_RUN=0 to apply)' : 'APPLY'}`);

    const conns = await prisma.accountingConnection.findMany({
      select: { id: true, companyId: true, connectionMetadata: true },
    });

    let totalChanges = 0;
    for (const conn of conns) {
      const meta = (conn.connectionMetadata as any) || {};
      const slots: { path: string[]; programs: Program[] }[] = [];
      if (Array.isArray(meta.accountingPrograms)) {
        slots.push({ path: ['accountingPrograms'], programs: meta.accountingPrograms });
      }
      if (meta.accountingProgramsBySystem && typeof meta.accountingProgramsBySystem === 'object') {
        for (const sys of Object.keys(meta.accountingProgramsBySystem)) {
          const arr = meta.accountingProgramsBySystem[sys];
          if (Array.isArray(arr)) {
            slots.push({ path: ['accountingProgramsBySystem', sys], programs: arr });
          }
        }
      }
      if (slots.length === 0) continue;

      let changedAny = false;
      const summary: string[] = [];
      for (const slot of slots) {
        for (const prog of slot.programs) {
          if (!prog || typeof prog.endpointPath !== 'string') continue;
          const isSlVchHdrs = String(prog.miProgram || '').toUpperCase() === 'SLVCHHDRS' ||
                              /\/load\/SLVchHdrs/i.test(prog.endpointPath);
          if (!isSlVchHdrs) continue;
          const result = ensureApAcct(prog.endpointPath);
          if (result.changed) {
            summary.push(`    ${slot.path.join('.')}.miProgram=${prog.miProgram} -> added ApAcct`);
            prog.endpointPath = result.updated;
            changedAny = true;
            totalChanges += 1;
          } else {
            summary.push(`    ${slot.path.join('.')}.miProgram=${prog.miProgram} -> already has ApAcct (no-op)`);
          }
        }
      }

      console.log(`\nConnection ${conn.id} (companyId=${conn.companyId})`);
      for (const line of summary) console.log(line);

      if (changedAny && !DRY_RUN) {
        await prisma.accountingConnection.update({
          where: { id: conn.id },
          data: { connectionMetadata: meta },
        });
        console.log(`    -> persisted updated metadata`);
      }
    }

    console.log(`\nTotal endpoint URLs that ${DRY_RUN ? 'would be' : 'were'} updated: ${totalChanges}`);
  } finally {
    await prisma.$disconnect();
  }
})();
