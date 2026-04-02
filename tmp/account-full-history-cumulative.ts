import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const ACCOUNT_ID = process.argv[3] || '10150';
const SITE = (process.argv[4] || 'LYN').trim() || null;
const THROUGH_MONTH = process.argv[5] || '2026-02';

function monthEndUtc(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

function monthStartUtc(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function toCsv(header: string[], rows: Array<Array<unknown>>) {
  const lines = [header.join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\n')}\n`;
}

async function main() {
  const through = monthEndUtc(THROUGH_MONTH);
  const monthStart = monthStartUtc(THROUGH_MONTH);
  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });

  const daily = await prisma.$queryRaw<
    Array<{ transDay: string; txCount: number; dailyNet: number; runningBalance: number }>
  >`
    WITH day_change AS (
      SELECT
        to_char(g."transDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "transDay",
        COUNT(*)::int AS "txCount",
        SUM(g."signedAmount")::double precision AS "dailyNet"
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${COMPANY_ID}
        AND TRIM(g."accountId") = ${ACCOUNT_ID}
        AND g."transDate" <= ${through}
        ${SITE ? Prisma.sql`AND COALESCE(g.site,'') = ${SITE}` : Prisma.empty}
      GROUP BY 1
    )
    SELECT
      "transDay",
      "txCount",
      "dailyNet",
      SUM("dailyNet") OVER (
        ORDER BY "transDay"
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::double precision AS "runningBalance"
    FROM day_change
    ORDER BY "transDay"
  `;

  const monthEndRows = await prisma.$queryRaw<
    Array<{ month: string; monthNet: number; monthEndBalance: number }>
  >`
    WITH day_change AS (
      SELECT
        to_char(g."transDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        SUM(g."signedAmount")::double precision AS daily_net
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${COMPANY_ID}
        AND TRIM(g."accountId") = ${ACCOUNT_ID}
        AND g."transDate" <= ${through}
        ${SITE ? Prisma.sql`AND COALESCE(g.site,'') = ${SITE}` : Prisma.empty}
      GROUP BY 1
    ),
    running AS (
      SELECT
        day,
        daily_net,
        SUM(daily_net) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
      FROM day_change
    )
    , month_net AS (
      SELECT
        to_char(to_date(day, 'YYYY-MM-DD'), 'YYYY-MM') AS month,
        SUM(daily_net)::double precision AS "monthNet"
      FROM running
      GROUP BY 1
    ),
    month_end AS (
      SELECT DISTINCT ON (to_char(to_date(day, 'YYYY-MM-DD'), 'YYYY-MM'))
        to_char(to_date(day, 'YYYY-MM-DD'), 'YYYY-MM') AS month,
        running::double precision AS "monthEndBalance"
      FROM running
      ORDER BY to_char(to_date(day, 'YYYY-MM-DD'), 'YYYY-MM') ASC, day DESC
    )
    SELECT n.month, n."monthNet", e."monthEndBalance"
    FROM month_net n
    JOIN month_end e ON e.month = n.month
    ORDER BY n.month
  `;

  const signSamples = await prisma.$queryRaw<
    Array<{ transDate: Date; transNum: string | null; drCr: string | null; signedAmount: number; description: string | null; ref: string | null }>
  >`
    SELECT
      g."transDate",
      g."transNum",
      g."drCr",
      g."signedAmount",
      g.description,
      g.ref
    FROM "GLTransactionFact" g
    WHERE g."companyId" = ${COMPANY_ID}
      AND TRIM(g."accountId") = ${ACCOUNT_ID}
      AND g."transDate" >= ${monthStart}
      AND g."transDate" <= ${through}
      ${SITE ? Prisma.sql`AND COALESCE(g.site,'') = ${SITE}` : Prisma.empty}
    ORDER BY ABS(g."signedAmount") DESC, g."transDate" DESC
    LIMIT 20
  `;

  const dailyFile = path.join(outDir, `${THROUGH_MONTH}-full-history-cumulative-${ACCOUNT_ID}-${SITE || 'all'}.csv`);
  const monthlyFile = path.join(outDir, `${THROUGH_MONTH}-month-end-balances-${ACCOUNT_ID}-${SITE || 'all'}.csv`);
  const samplesFile = path.join(outDir, `${THROUGH_MONTH}-sign-samples-${ACCOUNT_ID}-${SITE || 'all'}.csv`);

  await fs.writeFile(
    dailyFile,
    toCsv(
      ['trans_date', 'tx_count', 'daily_net', 'running_balance'],
      daily.map((r) => [r.transDay, r.txCount, r.dailyNet, r.runningBalance]),
    ),
    'utf8',
  );
  await fs.writeFile(
    monthlyFile,
    toCsv(
      ['month', 'month_net_movement', 'month_end_running_balance'],
      monthEndRows.map((r) => [r.month, r.monthNet, r.monthEndBalance]),
    ),
    'utf8',
  );
  await fs.writeFile(
    samplesFile,
    toCsv(
      ['trans_date_utc', 'trans_num', 'drcr', 'signed_amount', 'description', 'ref'],
      signSamples.map((r) => [r.transDate.toISOString(), r.transNum || '', r.drCr || '', r.signedAmount, r.description || '', r.ref || '']),
    ),
    'utf8',
  );

  const febRow = monthEndRows.find((r) => r.month === THROUGH_MONTH) || null;
  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        accountId: ACCOUNT_ID,
        site: SITE,
        throughMonth: THROUGH_MONTH,
        monthEndBalance: febRow?.monthEndBalance ?? null,
        monthNetMovement: febRow?.monthNet ?? null,
        rowsDaily: daily.length,
        files: { dailyFile, monthlyFile, samplesFile },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
