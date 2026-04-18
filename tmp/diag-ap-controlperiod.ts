/**
 * AP ControlPeriod diagnostic — READ ONLY.
 *
 * Captures the baseline state of GLTransactionFact for the AP control account,
 * so we can measure the impact of a focused SLLedgers re-sync.
 *
 * For the chosen company + AP anchor account, reports per fiscal month:
 *   - Total rows in GLTransactionFact
 *   - Rows by sourceProgram
 *   - Rows where controlPeriod IS NULL (the gap we are trying to close)
 *   - Sum(signedAmount) bucketed by transDate-month vs (controlYear, controlPeriod)
 *
 * Also reports:
 *   - AP roll-forward computed value at each month-end (anchor + AP voucher delta + GL payment delta)
 *   - GLAcctPeriodBalances end-of-period balance for the same account from raw IDO records
 *   - Drift = (computed) - (TB end balance)
 *
 * USAGE (PowerShell):
 *   $env:TARGET_COMPANY_ID="cmmnwyofv000fqhp4z8lebbny"
 *   npx tsx tmp/diag-ap-controlperiod.ts
 *
 * Optional overrides:
 *   $env:DIAG_ACCOUNT_ID="30100"
 *   $env:DIAG_START_YEAR="2024"
 *   $env:DIAG_END_YEAR="2026"
 */
import { PrismaClient } from '@prisma/client';
import { getApBalanceSheetAnchorConfig } from '../lib/financial/ap-balance-sheet-anchor';

const COMPANY_ID = String(process.env.TARGET_COMPANY_ID || '').trim();
const ACCOUNT_ID = String(process.env.DIAG_ACCOUNT_ID || '30100').trim();
const START_YEAR = Number(process.env.DIAG_START_YEAR || 2024);
const END_YEAR = Number(process.env.DIAG_END_YEAR || 2026);

if (!COMPANY_ID) {
  console.error('FATAL: TARGET_COMPANY_ID env var is required (use the dev company ID).');
  process.exit(1);
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(s: string, w: number, right = false): string {
  if (s.length >= w) return s;
  return right ? s.padStart(w) : s.padEnd(w);
}

async function dbHost(prisma: PrismaClient): Promise<string> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ inet_server_addr: string | null; current_database: string }>>(
      `SELECT inet_server_addr()::text as inet_server_addr, current_database()`
    );
    return `${r[0]?.current_database || '?'} @ ${r[0]?.inet_server_addr || 'unknown'}`;
  } catch {
    const url = process.env.DATABASE_URL || '';
    const host = url.match(/@([^/]+)/)?.[1] || 'unknown';
    return `via DATABASE_URL host: ${host}`;
  }
}

async function reportIdentity(prisma: PrismaClient) {
  console.log(`\n[${ts()}] === IDENTITY CHECK ===`);
  console.log(`  DB:           ${await dbHost(prisma)}`);
  console.log(`  Company ID:   ${COMPANY_ID}`);
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { name: true } });
  console.log(`  Company Name: ${company?.name || '(NOT FOUND)'}`);
  if (!company) {
    console.error('FATAL: company not found in this database. Bailing.');
    process.exit(1);
  }
  const conn = await prisma.accountingConnection.findFirst({
    where: { companyId: COMPANY_ID, platform: 'INFOR_M3' },
    select: { id: true, status: true, syncFrequency: true, connectionMetadata: true },
  });
  if (!conn) {
    console.error('WARN: no INFOR_M3 connection on this company.');
  } else {
    const meta = (conn.connectionMetadata as Record<string, unknown> | null) || {};
    const programs = Array.isArray(meta.accountingPrograms) ? meta.accountingPrograms.length : 0;
    const enabled = Array.isArray(meta.accountingPrograms)
      ? (meta.accountingPrograms as Array<{ enabled?: boolean }>).filter((p) => p.enabled !== false).length
      : 0;
    console.log(`  Connection:   id=${conn.id} status=${conn.status} freq=${conn.syncFrequency} programs=${programs} (${enabled} enabled)`);
  }
  const anchor = getApBalanceSheetAnchorConfig(COMPANY_ID);
  if (anchor) {
    const a = anchor.accounts.find((acc) => acc.accountId === ACCOUNT_ID);
    console.log(`  Anchor:       ${anchor.anchorDateIso} acct=${ACCOUNT_ID} balance=$${a ? fmtMoney(a.apBalance) : '(none)'}`);
  } else {
    console.log(`  Anchor:       (none configured for this company)`);
  }
}

async function reportPerMonthCoverage(prisma: PrismaClient) {
  console.log(`\n[${ts()}] === PER-MONTH COVERAGE  (account ${ACCOUNT_ID}, ${START_YEAR}-01 .. ${END_YEAR}-12) ===`);
  console.log(
    `  ${pad('Month', 9)}  ${pad('Rows', 7, true)}  ${pad('CP NULL', 8, true)}  ${pad('CP set', 7, true)}  ${pad('Sum by TransDate', 22, true)}  ${pad('Sum by ControlPeriod', 22, true)}  Sources`
  );
  const start = new Date(Date.UTC(START_YEAR, 0, 1));
  const end = new Date(Date.UTC(END_YEAR, 11, 31, 23, 59, 59));
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      yr: number;
      mo: number;
      total: bigint;
      cp_null: bigint;
      cp_set: bigint;
      sum_by_trans: number | null;
      sum_by_cp: number | null;
      programs: string;
    }>
  >(
    `
    WITH base AS (
      SELECT
        EXTRACT(YEAR  FROM "transDate")::int AS yr,
        EXTRACT(MONTH FROM "transDate")::int AS mo,
        "controlYear",
        "controlPeriod",
        "signedAmount",
        "sourceProgram"
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND "accountId" = $2
        AND "transDate" >= $3
        AND "transDate" <= $4
    )
    SELECT
      yr, mo,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE "controlPeriod" IS NULL)::bigint AS cp_null,
      COUNT(*) FILTER (WHERE "controlPeriod" IS NOT NULL)::bigint AS cp_set,
      SUM("signedAmount") AS sum_by_trans,
      SUM(CASE WHEN "controlYear" = yr AND "controlPeriod" = mo THEN "signedAmount" ELSE 0 END) AS sum_by_cp,
      string_agg(DISTINCT COALESCE("sourceProgram", '(null)'), ',' ORDER BY COALESCE("sourceProgram", '(null)')) AS programs
    FROM base
    GROUP BY yr, mo
    ORDER BY yr, mo
    `,
    COMPANY_ID,
    ACCOUNT_ID,
    start,
    end
  );

  let totRows = 0;
  let totNull = 0;
  let totSet = 0;
  for (const r of rows) {
    const total = Number(r.total);
    const cpNull = Number(r.cp_null);
    const cpSet = Number(r.cp_set);
    totRows += total;
    totNull += cpNull;
    totSet += cpSet;
    const month = `${r.yr}-${String(r.mo).padStart(2, '0')}`;
    const sumTrans = Number(r.sum_by_trans || 0);
    const sumCp = Number(r.sum_by_cp || 0);
    console.log(
      `  ${pad(month, 9)}  ${pad(String(total), 7, true)}  ${pad(String(cpNull), 8, true)}  ${pad(
        String(cpSet),
        7,
        true
      )}  ${pad(fmtMoney(sumTrans), 22, true)}  ${pad(fmtMoney(sumCp), 22, true)}  ${r.programs || ''}`
    );
  }
  if (rows.length === 0) {
    console.log('  (no rows in window)');
  }
  console.log(
    `  ${pad('TOTAL', 9)}  ${pad(String(totRows), 7, true)}  ${pad(String(totNull), 8, true)}  ${pad(
      String(totSet),
      7,
      true
    )}  ControlPeriod coverage: ${
      totRows > 0 ? ((totSet / totRows) * 100).toFixed(1) : '0.0'
    }%`
  );
}

async function reportRollForwardAtCheckpoints(prisma: PrismaClient) {
  console.log(`\n[${ts()}] === AP ROLL-FORWARD vs GLAcctPeriodBalances (account ${ACCOUNT_ID}) ===`);
  const anchor = getApBalanceSheetAnchorConfig(COMPANY_ID);
  if (!anchor) {
    console.log('  (no anchor configured; skipping roll-forward)');
    return;
  }
  const anchorAcct = anchor.accounts.find((a) => a.accountId === ACCOUNT_ID);
  if (!anchorAcct) {
    console.log(`  (no anchor for account ${ACCOUNT_ID}; skipping)`);
    return;
  }
  const anchorDate = new Date(`${anchor.anchorDateIso}T12:00:00.000Z`);
  const anchorBalance = anchorAcct.apBalance;

  const checkpoints: Array<{ label: string; year: number; period: number; date: Date }> = [];
  for (let y = START_YEAR; y <= END_YEAR; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const eom = new Date(Date.UTC(y, m, 0, 23, 59, 59));
      if (eom <= anchorDate) continue;
      checkpoints.push({ label: `${y}-${String(m).padStart(2, '0')}-end`, year: y, period: m, date: eom });
    }
  }

  console.log(
    `  ${pad('Checkpoint', 14)}  ${pad('Voucher Δ', 16, true)}  ${pad('GL Pmt Δ', 16, true)}  ${pad(
      'Computed AP',
      18,
      true
    )}  ${pad('TB End (raw)', 16, true)}  ${pad('Drift', 14, true)}`
  );
  for (const cp of checkpoints) {
    const voucherSum = await prisma.aPTransactionFact.aggregate({
      _sum: { normalizedAmount: true },
      where: {
        companyId: COMPANY_ID,
        OR: [{ apAcct: ACCOUNT_ID }, { apAcct: null }],
        eventDate: { gt: anchorDate, lte: cp.date },
      },
    });
    const paymentRows = await prisma.$queryRawUnsafe<Array<{ s: number | null }>>(
      `
      SELECT COALESCE(SUM("signedAmount"), 0) AS s
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND "accountId" = $2
        AND "transDate" > $3
        AND "transDate" <= $4
        AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
      `,
      COMPANY_ID,
      ACCOUNT_ID,
      anchorDate,
      cp.date
    );
    const voucherDelta = Number(voucherSum._sum.normalizedAmount || 0);
    const paymentDelta = -Number(paymentRows[0]?.s || 0);
    const computed = anchorBalance + voucherDelta + paymentDelta;

    const tbRow = await prisma.$queryRawUnsafe<Array<{ end_balance: number | null }>>(
      `
      SELECT MAX(
        COALESCE(
          (payload ->> 'EndBalance')::numeric,
          (payload ->> 'endBalance')::numeric
        )
      ) AS end_balance
      FROM "InforRawRecord"
      WHERE "companyId" = $1
        AND "miProgram" = 'GLAcctPeriodBalances'
        AND COALESCE(payload ->> 'Acct',  payload ->> 'acct')  = $2
        AND COALESCE(payload ->> 'FiscalYear',  payload ->> 'fiscalYear')::int  = $3
        AND COALESCE(payload ->> 'FiscalPeriod',payload ->> 'fiscalPeriod')::int = $4
      `,
      COMPANY_ID,
      ACCOUNT_ID,
      cp.year,
      cp.period
    );
    const tbEnd = tbRow[0]?.end_balance != null ? Number(tbRow[0].end_balance) : null;
    const drift = tbEnd != null ? computed - tbEnd : null;

    console.log(
      `  ${pad(cp.label, 14)}  ${pad(fmtMoney(voucherDelta), 16, true)}  ${pad(
        fmtMoney(paymentDelta),
        16,
        true
      )}  ${pad(fmtMoney(computed), 18, true)}  ${pad(tbEnd != null ? fmtMoney(tbEnd) : '(no raw)', 16, true)}  ${pad(
        drift != null ? fmtMoney(drift) : '-',
        14,
        true
      )}`
    );
  }
}

async function reportGlobalGlSourceMix(prisma: PrismaClient) {
  console.log(`\n[${ts()}] === GLOBAL SOURCE MIX (all accounts) ===`);
  const rows = await prisma.$queryRawUnsafe<Array<{ src: string | null; cnt: bigint; cp_set: bigint }>>(
    `
    SELECT "sourceProgram" AS src,
           COUNT(*)::bigint AS cnt,
           COUNT(*) FILTER (WHERE "controlPeriod" IS NOT NULL)::bigint AS cp_set
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
    GROUP BY "sourceProgram"
    ORDER BY cnt DESC
    `,
    COMPANY_ID
  );
  for (const r of rows) {
    const total = Number(r.cnt);
    const set = Number(r.cp_set);
    const pct = total > 0 ? ((set / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${pad(String(r.src || '(null)'), 20)}  ${pad(String(total), 8, true)} rows  CP set: ${pad(String(set), 8, true)} (${pct}%)`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await reportIdentity(prisma);
    await reportGlobalGlSourceMix(prisma);
    await reportPerMonthCoverage(prisma);
    await reportRollForwardAtCheckpoints(prisma);
    console.log(`\n[${ts()}] DONE.`);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
  }
}

main().catch((err) => {
  console.error(`[${ts()}] FATAL`, err);
  process.exit(1);
});
