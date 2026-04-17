/**
 * Find and terminate any Postgres backend that is holding (or waiting on)
 * Prisma migrate's advisory lock 72707369. Run with DATABASE_URL pointed
 * at the DIRECT (non-pooler) endpoint of the target branch.
 *
 *   $env:DATABASE_URL = "postgresql://...@ep-aged-snow-ah3zislt.c-3.us-east-1.aws.neon.tech/..."
 *   npx tsx tmp/release-prisma-advisory-lock.ts
 */
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const masked = url.replace(/:([^:@]+)@/, ':***@');
  console.log('Connecting to:', masked);

  const client = new Client({ connectionString: url });
  await client.connect();

  // Show every session that even references the advisory lock function or
  // is idle-in-transaction from prisma. We cast classid+objid to bigint to
  // match Prisma's lock id (72707369 fits in 32 bits).
  const holders = await client.query(`
    SELECT
      a.pid,
      a.usename,
      a.application_name,
      a.state,
      a.wait_event_type,
      a.wait_event,
      now() - a.state_change AS state_age,
      left(a.query, 200) AS query_preview
    FROM pg_stat_activity a
    LEFT JOIN pg_locks l
      ON l.pid = a.pid
     AND l.locktype = 'advisory'
     AND l.objid = 72707369
    WHERE l.pid IS NOT NULL
       OR a.query ILIKE '%pg_advisory_lock(72707369)%'
       OR (a.application_name ILIKE '%prisma%' AND a.state = 'idle in transaction')
    ORDER BY a.state_change ASC NULLS LAST;
  `);

  if (holders.rows.length === 0) {
    console.log('No sessions found holding or waiting on advisory lock 72707369.');
    console.log('Try `npx prisma migrate deploy` again — the lock may already be free.');
    await client.end();
    return;
  }

  console.log(`Found ${holders.rows.length} candidate session(s):`);
  console.table(holders.rows);

  for (const row of holders.rows) {
    if (row.pid === undefined) continue;
    try {
      const res = await client.query('SELECT pg_terminate_backend($1) AS terminated', [row.pid]);
      console.log(`Terminated pid=${row.pid}: ${res.rows[0].terminated}`);
    } catch (err) {
      console.error(`Failed to terminate pid=${row.pid}:`, err);
    }
  }

  await client.end();
  console.log('Done. Re-run `npx prisma migrate deploy` now.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
