import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

type RawRow = {
  accountId: string;
  transDate: Date;
  transDay: string;
  recordDay: string | null;
  site: string | null;
  transNum: string | null;
  ref: string | null;
  description: string | null;
  drCr: string | null;
  debitAmount: number | null;
  creditAmount: number | null;
  signedAmount: number;
  sourceProgram: string | null;
};

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthBounds(month: string): { start: Date; end: Date; year: number; period: number } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end, year: y, period: m };
}

function toCsv(header: string[], rows: Array<Array<unknown>>): string {
  const lines = [header.join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\n')}\n`;
}

async function pickRevenueAccount(companyId: string, start: Date, end: Date): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ accountId: string; amt: number }>>`
    WITH mapped_rev AS (
      SELECT DISTINCT TRIM(COALESCE("qbAccountId","qbAccountCode")) AS account_id
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND (
          LOWER(COALESCE("targetField", '')) = 'revenue'
          OR LOWER(COALESCE("targetField", '')) LIKE 'rev\_%' ESCAPE '\'
        )
        AND TRIM(COALESCE("qbAccountId","qbAccountCode")) <> ''
    )
    SELECT
      g."accountId" AS "accountId",
      SUM(ABS(g."signedAmount"))::double precision AS amt
    FROM "GLTransactionFact" g
    JOIN mapped_rev mr ON mr.account_id = TRIM(g."accountId")
    WHERE g."companyId" = ${companyId}
      AND g."transDate" >= ${start}
      AND g."transDate" <= ${end}
    GROUP BY 1
    ORDER BY amt DESC
    LIMIT 1
  `;
  return rows[0]?.accountId ? String(rows[0].accountId).trim() : null;
}

async function loadRawAccountRows(
  companyId: string,
  accountId: string,
  start: Date,
  end: Date,
  site: string | null,
): Promise<RawRow[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      TRIM(g."accountId") AS "accountId",
      g."transDate" AS "transDate",
      to_char(g."transDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "transDay",
      NULL::text AS "recordDay",
      g.site AS site,
      g."transNum" AS "transNum",
      g.ref AS ref,
      g.description AS description,
      g."drCr" AS "drCr",
      g."debitAmount" AS "debitAmount",
      g."creditAmount" AS "creditAmount",
      g."signedAmount" AS "signedAmount",
      g."sourceProgram" AS "sourceProgram"
    FROM "GLTransactionFact" g
    WHERE g."companyId" = ${companyId}
      AND TRIM(g."accountId") = ${accountId}
      AND g."transDate" >= ${start}
      AND g."transDate" <= ${end}
      ${site ? Prisma.sql`AND COALESCE(g.site,'') = ${site}` : Prisma.empty}
    ORDER BY g."transDate" ASC, COALESCE(g."transNum", '') ASC
  `;
  return rows;
}

async function loadPeriodRows(
  companyId: string,
  accountId: string,
  year: number,
  period: number,
  site: string | null,
): Promise<Array<Record<string, unknown>>> {
  const rows = await prisma.$queryRaw<Array<{ item: unknown; createdAt: Date }>>`
    WITH logs AS (
      SELECT l."createdAt", l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item, logs."createdAt"
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;

  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(item.Acct ?? item.acct ?? item.Account ?? '').trim();
    if (acct !== accountId) continue;
    const fy = asNum(item.FiscalYear ?? item.fiscalYear ?? item.ControlYear ?? item.controlYear);
    const fp = asNum(item.FiscalPeriod ?? item.fiscalPeriod ?? item.ControlPeriod ?? item.controlPeriod);
    if (!(Math.trunc(fy) === year && Math.trunc(fp) === period)) continue;
    const rowSite = String(item.Site ?? item.site ?? '').trim();
    if (site && rowSite && rowSite !== site) continue;
    out.push({
      createdAt: row.createdAt.toISOString(),
      acct,
      site: rowSite,
      fiscalYear: fy || '',
      fiscalPeriod: fp || '',
      begBalance: item.BegBalance ?? item.begBalance ?? '',
      debit: item.Debit ?? item.debit ?? '',
      credit: item.Credit ?? item.credit ?? '',
      endBalance: item.EndBalance ?? item.endBalance ?? item.PeriodEndBalance ?? item.periodEndBalance ?? '',
      transDate: item.TransDate ?? item.transDate ?? '',
      recordDate: item.RecordDate ?? item.recordDate ?? '',
      domAmount: item.DomAmount ?? item.domAmount ?? '',
      drCr: item.DrCr ?? item.drCr ?? '',
      transNum: item.TransNum ?? item.transNum ?? '',
      ref: item.Ref ?? item.ref ?? '',
    });
  }
  return out;
}

async function writeAccountDebugFiles(params: {
  companyId: string;
  month: string;
  accountId: string;
  label: string;
  site: string | null;
  outDir: string;
  year: number;
  period: number;
  start: Date;
  end: Date;
}) {
  const raw = await loadRawAccountRows(params.companyId, params.accountId, params.start, params.end, params.site);

  const dailyMap = new Map<string, { count: number; daily: number }>();
  const byRecordDate = new Map<string, number>();
  for (const row of raw) {
    const d = row.transDay;
    const cur = dailyMap.get(d) || { count: 0, daily: 0 };
    cur.count += 1;
    cur.daily += asNum(row.signedAmount);
    dailyMap.set(d, cur);
    if (row.recordDay) byRecordDate.set(row.recordDay, (byRecordDate.get(row.recordDay) || 0) + asNum(row.signedAmount));
  }

  const dailyRows: Array<Array<unknown>> = [];
  let running = 0;
  for (const day of Array.from(dailyMap.keys()).sort()) {
    const cur = dailyMap.get(day)!;
    running += cur.daily;
    dailyRows.push([day, cur.count, cur.daily, running]);
  }

  const duplicateRows = await prisma.$queryRaw<Array<{ transDay: string; transNum: string | null; ref: string | null; signedAmount: number; cnt: number }>>`
    SELECT
      to_char(g."transDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "transDay",
      g."transNum" AS "transNum",
      g.ref AS ref,
      g."signedAmount" AS "signedAmount",
      COUNT(*)::int AS cnt
    FROM "GLTransactionFact" g
    WHERE g."companyId" = ${params.companyId}
      AND TRIM(g."accountId") = ${params.accountId}
      AND g."transDate" >= ${params.start}
      AND g."transDate" <= ${params.end}
      ${params.site ? Prisma.sql`AND COALESCE(g.site,'') = ${params.site}` : Prisma.empty}
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, "transDay" ASC
  `;

  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId: params.companyId,
      OR: [{ qbAccountId: params.accountId }, { qbAccountCode: params.accountId }],
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      qbAccountClassification: true,
      targetField: true,
    },
  });

  const periodRows = await loadPeriodRows(params.companyId, params.accountId, params.year, params.period, params.site);
  const periodBeg = periodRows.length ? asNum(periodRows[0].begBalance) : null;

  const movementCompareRows = await prisma.$queryRaw<
    Array<{
      acct: string;
      site: string | null;
      ourDebit: number;
      ourCredit: number;
      ourNetMovement: number;
      csiDebit: number | null;
      csiCredit: number | null;
      csiNetMovement: number | null;
      netMovementDiff: number | null;
      begBalance: number | null;
      endBalance: number | null;
    }>
  >`
    WITH our_movement AS (
      SELECT
        TRIM(g."accountId") AS acct,
        COALESCE(g.site, '') AS site,
        SUM(COALESCE(g."debitAmount", 0))::double precision AS "ourDebit",
        SUM(COALESCE(g."creditAmount", 0))::double precision AS "ourCredit",
        SUM(g."signedAmount")::double precision AS "ourNetMovement"
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${params.companyId}
        AND TRIM(g."accountId") = ${params.accountId}
        AND g."transDate" >= ${params.start}
        AND g."transDate" <= ${params.end}
        ${params.site ? Prisma.sql`AND COALESCE(g.site,'') = ${params.site}` : Prisma.empty}
      GROUP BY 1,2
    ),
    csi_period AS (
      SELECT
        ${params.accountId}::text AS acct,
        ${params.site || ''}::text AS site,
        ${
          periodRows.length
            ? Prisma.sql`${asNum(periodRows[0].debit)}::double precision`
            : Prisma.sql`NULL::double precision`
        } AS "csiDebit",
        ${
          periodRows.length
            ? Prisma.sql`${asNum(periodRows[0].credit)}::double precision`
            : Prisma.sql`NULL::double precision`
        } AS "csiCredit",
        ${
          periodRows.length
            ? Prisma.sql`${asNum(periodRows[0].begBalance)}::double precision`
            : Prisma.sql`NULL::double precision`
        } AS "begBalance",
        ${
          periodRows.length
            ? Prisma.sql`${asNum(periodRows[0].endBalance)}::double precision`
            : Prisma.sql`NULL::double precision`
        } AS "endBalance"
    )
    SELECT
      o.acct,
      NULLIF(o.site, '') AS site,
      o."ourDebit",
      o."ourCredit",
      o."ourNetMovement",
      c."csiDebit",
      c."csiCredit",
      CASE WHEN c."csiDebit" IS NULL OR c."csiCredit" IS NULL THEN NULL ELSE (c."csiDebit" - c."csiCredit") END AS "csiNetMovement",
      CASE
        WHEN c."csiDebit" IS NULL OR c."csiCredit" IS NULL THEN NULL
        ELSE o."ourNetMovement" - (c."csiDebit" - c."csiCredit")
      END AS "netMovementDiff",
      c."begBalance",
      c."endBalance"
    FROM our_movement o
    LEFT JOIN csi_period c
      ON c.acct = o.acct
  `;

  const transVsRecordRows = await prisma.$queryRaw<Array<{ dt: string; amtByTransDate: number | null; amtByRecordDate: number | null }>>`
    WITH by_trans AS (
      SELECT
        to_char(g."transDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dt,
        SUM(g."signedAmount")::double precision AS amt
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${params.companyId}
        AND TRIM(g."accountId") = ${params.accountId}
        AND g."transDate" >= ${params.start}
        AND g."transDate" <= ${params.end}
        ${params.site ? Prisma.sql`AND COALESCE(g.site,'') = ${params.site}` : Prisma.empty}
      GROUP BY 1
    ),
    by_record AS (
      SELECT
        to_char(g."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dt,
        SUM(g."signedAmount")::double precision AS amt
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${params.companyId}
        AND TRIM(g."accountId") = ${params.accountId}
        AND g."transDate" >= ${params.start}
        AND g."transDate" <= ${params.end}
        ${params.site ? Prisma.sql`AND COALESCE(g.site,'') = ${params.site}` : Prisma.empty}
      GROUP BY 1
    )
    SELECT
      COALESCE(t.dt, r.dt) AS dt,
      t.amt AS "amtByTransDate",
      r.amt AS "amtByRecordDate"
    FROM by_trans t
    FULL OUTER JOIN by_record r ON r.dt = t.dt
    ORDER BY 1
  `;

  const rawCsv = toCsv(
    ['trans_date_utc', 'account_id', 'site', 'trans_num', 'ref', 'drcr', 'debit', 'credit', 'signed_amount', 'description', 'source_program'],
    raw.map((r) => [
      r.transDate.toISOString(),
      r.accountId,
      r.site || '',
      r.transNum || '',
      r.ref || '',
      r.drCr || '',
      r.debitAmount ?? '',
      r.creditAmount ?? '',
      r.signedAmount,
      r.description || '',
      r.sourceProgram || '',
    ])
  );

  const dailyCsv = toCsv(
    ['trans_date', 'transaction_count', 'daily_change', 'running_balance_from_month_start'],
    dailyRows
  );

  const dupCsv = toCsv(
    ['trans_date', 'trans_num', 'ref', 'signed_amount', 'duplicate_count'],
    duplicateRows.map((r) => [r.transDay, r.transNum || '', r.ref || '', r.signedAmount, r.cnt])
  );

  const periodCsv = toCsv(
    ['created_at', 'acct', 'site', 'fiscal_year', 'fiscal_period', 'beg_balance', 'debit', 'credit', 'end_balance', 'trans_date', 'record_date', 'dom_amount', 'drcr', 'trans_num', 'ref'],
    periodRows.map((r) => [
      r.createdAt,
      r.acct,
      r.site,
      r.fiscalYear,
      r.fiscalPeriod,
      r.begBalance,
      r.debit,
      r.credit,
      r.endBalance,
      r.transDate,
      r.recordDate,
      r.domAmount,
      r.drCr,
      r.transNum,
      r.ref,
    ])
  );

  const mapCsv = toCsv(
    ['qb_account', 'qb_account_id', 'qb_account_code', 'classification', 'target_field'],
    mappings.map((m) => [m.qbAccount || '', m.qbAccountId || '', m.qbAccountCode || '', m.qbAccountClassification || '', m.targetField || ''])
  );

  const movementCompareCsv = toCsv(
    ['acct', 'site', 'our_debit', 'our_credit', 'our_net_movement', 'csi_debit', 'csi_credit', 'csi_net_movement', 'net_movement_diff', 'beg_balance', 'end_balance'],
    movementCompareRows.map((r) => [
      r.acct,
      r.site || '',
      r.ourDebit,
      r.ourCredit,
      r.ourNetMovement,
      r.csiDebit ?? '',
      r.csiCredit ?? '',
      r.csiNetMovement ?? '',
      r.netMovementDiff ?? '',
      r.begBalance ?? '',
      r.endBalance ?? '',
    ])
  );

  const transVsRecordCsv = toCsv(
    ['date', 'amt_by_transdate', 'amt_by_recorddate'],
    transVsRecordRows.map((r) => [r.dt, r.amtByTransDate ?? '', r.amtByRecordDate ?? ''])
  );

  const openingRollforwardCsv = toCsv(
    ['trans_date', 'beg_balance', 'daily_net_change', 'ending_balance_with_opening'],
    dailyRows.map((d) => {
      const runningNoOpening = asNum(d[3]);
      return [d[0], periodBeg ?? '', d[2], periodBeg == null ? '' : periodBeg + runningNoOpening];
    })
  );

  const prefix = `${params.month}-${params.label}-${params.accountId}`;
  const files = {
    raw: path.join(params.outDir, `${prefix}-raw-gl.csv`),
    daily: path.join(params.outDir, `${prefix}-daily-rollforward.csv`),
    dup: path.join(params.outDir, `${prefix}-duplicate-check.csv`),
    period: path.join(params.outDir, `${prefix}-period-balance.csv`),
    map: path.join(params.outDir, `${prefix}-mapping.csv`),
    movement: path.join(params.outDir, `${prefix}-movement-compare.csv`),
    transVsRecord: path.join(params.outDir, `${prefix}-trans-vs-record.csv`),
    opening: path.join(params.outDir, `${prefix}-with-opening-rollforward.csv`),
  };

  await fs.writeFile(files.raw, rawCsv, 'utf8');
  await fs.writeFile(files.daily, dailyCsv, 'utf8');
  await fs.writeFile(files.dup, dupCsv, 'utf8');
  await fs.writeFile(files.period, periodCsv, 'utf8');
  await fs.writeFile(files.map, mapCsv, 'utf8');
  await fs.writeFile(files.movement, movementCompareCsv, 'utf8');
  await fs.writeFile(files.transVsRecord, transVsRecordCsv, 'utf8');
  await fs.writeFile(files.opening, openingRollforwardCsv, 'utf8');

  const monthMovement = raw.reduce((s, r) => s + asNum(r.signedAmount), 0);
  const periodEndBalance = periodRows
    .map((r) => asNum(r.endBalance))
    .filter((v) => Number.isFinite(v));
  const periodEnd = periodEndBalance.length ? periodEndBalance[0] : null;
  const duplicateCount = duplicateRows.reduce((s, r) => s + asNum(r.cnt), 0);

  return {
    accountId: params.accountId,
    label: params.label,
    txCount: raw.length,
    monthMovement,
    periodEndBalance: periodEnd,
    duplicateGroupedRows: duplicateRows.length,
    duplicateRowTotal: duplicateCount,
    files,
  };
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const bsAccount = process.argv[4] || '10150';
  const isAccountArg = process.argv[5] || '';
  const site = (process.argv[6] || 'LYN').trim() || null;

  const { start, end, year, period } = monthBounds(month);
  const isAccount = isAccountArg || (await pickRevenueAccount(companyId, start, end));
  if (!isAccount) throw new Error('Could not auto-pick an active revenue account for this month.');

  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });

  const bs = await writeAccountDebugFiles({
    companyId,
    month,
    accountId: bsAccount,
    label: 'bs',
    site,
    outDir,
    year,
    period,
    start,
    end,
  });
  const isAcct = await writeAccountDebugFiles({
    companyId,
    month,
    accountId: isAccount,
    label: 'is',
    site,
    outDir,
    year,
    period,
    start,
    end,
  });

  const summaryPath = path.join(outDir, `${month}-debug-summary-${bsAccount}-${isAccount}.csv`);
  const summaryCsv = toCsv(
    ['company_id', 'month', 'site', 'label', 'account_id', 'tx_count', 'month_movement_transdate', 'period_end_balance', 'duplicate_grouped_rows', 'duplicate_row_total'],
    [
      [companyId, month, site || '', bs.label, bs.accountId, bs.txCount, bs.monthMovement, bs.periodEndBalance ?? '', bs.duplicateGroupedRows, bs.duplicateRowTotal],
      [companyId, month, site || '', isAcct.label, isAcct.accountId, isAcct.txCount, isAcct.monthMovement, isAcct.periodEndBalance ?? '', isAcct.duplicateGroupedRows, isAcct.duplicateRowTotal],
    ]
  );
  await fs.writeFile(summaryPath, summaryCsv, 'utf8');

  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        site,
        bsAccount,
        isAccount,
        summaryPath,
        files: { bs: bs.files, is: isAcct.files },
      },
      null,
      2
    )
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

