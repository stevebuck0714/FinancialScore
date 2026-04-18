import { Client } from 'pg';
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const c = new Client({ connectionString: url });
  await c.connect();
  const r = await c.query(
    `SELECT "companyId", COUNT(*)::bigint AS rows
       FROM "InforRawRecord"
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 5`
  );
  for (const row of r.rows) console.log(row);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
