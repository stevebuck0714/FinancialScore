/**
 * Cheapest possible probe of SLArtrans Type='I' for Aug-Dec 2023.
 * One small aggregate per call. Pass query name as argv[2].
 *   tsx tmp/probe-slartrans-dup-events.ts cono
 *   tsx tmp/probe-slartrans-dup-events.ts curr
 *   tsx tmp/probe-slartrans-dup-events.ts dups
 *   tsx tmp/probe-slartrans-dup-events.ts customers
 *   tsx tmp/probe-slartrans-dup-events.ts keys
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';
const FROM = '2023-08-01';
const TO   = '2023-12-31';

function fmt$(n: number): string { return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function ts(): string { return new Date().toISOString().slice(11,19); }

const BASE = `
  FROM "InforRawRecord"
  WHERE "companyId"='${COMPANY}'
    AND "miProgram" ILIKE 'SLArtrans'
    AND UPPER(payload->>'Type') = 'I'
    AND payload->>'InvDate' IS NOT NULL
    AND (payload->>'InvDate')::date BETWEEN '${FROM}'::date AND '${TO}'::date
`;

const QUERIES: Record<string, string> = {
  cono: `SELECT payload->>'Cono' AS cono, COUNT(*)::int AS events,
                COUNT(DISTINCT (payload->>'CustNum', payload->>'InvNum'))::int AS distinct_inv,
                SUM(ABS((payload->>'Amount')::float8))::float8 AS sum_abs
         ${BASE} GROUP BY 1 ORDER BY events DESC`,

  divi: `SELECT payload->>'Divi' AS divi, COUNT(*)::int AS events,
                COUNT(DISTINCT (payload->>'CustNum', payload->>'InvNum'))::int AS distinct_inv,
                SUM(ABS((payload->>'Amount')::float8))::float8 AS sum_abs
         ${BASE} GROUP BY 1 ORDER BY events DESC`,

  curr: `SELECT payload->>'CurrCode' AS curr, COUNT(*)::int AS events,
                COUNT(DISTINCT (payload->>'CustNum', payload->>'InvNum'))::int AS distinct_inv,
                SUM(ABS((payload->>'Amount')::float8))::float8 AS sum_abs
         ${BASE} GROUP BY 1 ORDER BY events DESC`,

  dups: `WITH per AS (
           SELECT payload->>'CustNum' AS cust, payload->>'InvNum' AS inv,
                  COUNT(*)::int AS evts,
                  COUNT(DISTINCT payload->>'Amount')::int AS distinct_amts,
                  MAX(ABS((payload->>'Amount')::float8))::float8 AS max_abs,
                  SUM(ABS((payload->>'Amount')::float8))::float8 AS sum_abs
             ${BASE} GROUP BY 1,2
         )
         SELECT
           CASE WHEN evts=1 THEN '1'
                WHEN evts BETWEEN 2 AND 5 THEN '2-5'
                WHEN evts BETWEEN 6 AND 20 THEN '6-20'
                WHEN evts BETWEEN 21 AND 100 THEN '21-100'
                ELSE '100+' END AS bucket,
           COUNT(*)::int      AS pairs,
           SUM(evts)::int     AS total_events,
           SUM(sum_abs)::float8 AS sum_amount_summing_all,
           SUM(max_abs)::float8 AS sum_amount_taking_max
         FROM per GROUP BY 1 ORDER BY 1`,

  customers: `SELECT COUNT(DISTINCT payload->>'CustNum')::int AS distinct_customers,
                     COUNT(DISTINCT (payload->>'CustNum', payload->>'InvNum'))::int AS distinct_inv,
                     COUNT(*)::int AS events
              ${BASE}`,

  keys: `SELECT key, COUNT(*)::int AS n
           FROM "InforRawRecord", jsonb_object_keys(payload) AS key
          WHERE "companyId"='${COMPANY}'
            AND "miProgram" ILIKE 'SLArtrans'
            AND UPPER(payload->>'Type') = 'I'
            AND payload->>'InvDate' IS NOT NULL
            AND (payload->>'InvDate')::date BETWEEN '${FROM}'::date AND '${TO}'::date
          GROUP BY 1 ORDER BY n DESC, key`,
};

async function main() {
  const which = (process.argv[2] || '').toLowerCase();
  if (!which || !QUERIES[which]) {
    console.log('available queries:', Object.keys(QUERIES).join(', '));
    process.exit(1);
  }
  console.log(`[${ts()}] DB: ${(process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]}`);
  console.log(`[${ts()}] Window: InvDate ${FROM} → ${TO},  Type='I'`);
  console.log(`[${ts()}] Running '${which}'...`);
  const rows = await prisma.$queryRawUnsafe<any[]>(QUERIES[which]);
  console.log(`[${ts()}] ${rows.length} row(s):`);
  for (const r of rows) {
    const out: string[] = [];
    for (const k of Object.keys(r)) {
      const v = r[k];
      const s = (typeof v === 'number' && /sum|amount|total/i.test(k)) ? fmt$(v) :
                (v instanceof Date) ? v.toISOString().slice(0,10) :
                String(v ?? '');
      out.push(`${k}=${s}`);
    }
    console.log('  ' + out.join('  '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
