/**
 * Snapshot the GLTransactionFact table to a timestamped backup table BEFORE
 * applying the dedup migration. Idempotent: re-running with the same
 * SNAPSHOT_SUFFIX is a no-op if the snapshot already exists.
 *
 * Usage:
 *   $env:DATABASE_URL="<prod url>"; $env:SNAPSHOT_SUFFIX="20260418"; npx tsx tmp/snapshot-gl-fact.ts
 *
 * To restore (manually, if migration goes wrong):
 *   TRUNCATE "GLTransactionFact";
 *   INSERT INTO "GLTransactionFact" SELECT * FROM "GLTransactionFact_snapshot_20260418";
 *   (then re-create indexes if needed)
 */
import { PrismaClient } from '@prisma/client';

const SUFFIX = String(process.env.SNAPSHOT_SUFFIX || '').trim();
if (!SUFFIX) {
  console.error('FATAL: SNAPSHOT_SUFFIX is required (e.g. "20260418")');
  process.exit(1);
}

(async () => {
  const p = new PrismaClient();
  const snapshotTable = `GLTransactionFact_snapshot_${SUFFIX}`;
  try {
    const dbHost = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1];
    console.log(`DB: ${dbHost}`);
    console.log(`Snapshot table: "${snapshotTable}"`);

    const exists = await p.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      snapshotTable
    );
    if (exists[0].exists) {
      const count = await p.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM "${snapshotTable}"`
      );
      console.log(`Snapshot table already exists with ${Number(count[0].n).toLocaleString()} rows. Nothing to do.`);
      return;
    }

    const before = await p.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM "GLTransactionFact"`
    );
    console.log(`Source table rows: ${Number(before[0].n).toLocaleString()}`);

    console.log(`Creating snapshot...`);
    const t0 = Date.now();
    await p.$executeRawUnsafe(
      `CREATE TABLE "${snapshotTable}" AS SELECT * FROM "GLTransactionFact"`
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const after = await p.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::bigint AS n FROM "${snapshotTable}"`
    );
    console.log(`Snapshot complete in ${elapsed}s. Rows: ${Number(after[0].n).toLocaleString()}`);

    if (Number(after[0].n) !== Number(before[0].n)) {
      console.error(
        `FATAL: row count mismatch! source=${before[0].n} snapshot=${after[0].n}. Aborting.`
      );
      process.exit(2);
    }
    console.log(`Verified row counts match. Safe to proceed with migration.`);
  } finally {
    await p.$disconnect();
  }
})();
