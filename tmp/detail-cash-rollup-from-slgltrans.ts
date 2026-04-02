import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

type JsonRecord = Record<string, unknown>;

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const TARGET_MONTH = process.argv[3] || '2026-03';

function monthStart(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}

function monthEnd(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function pickNumber(row: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).replace(/,/g, '').trim();
    if (!text) continue;
    const num = Number(text);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function pickText(row: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function parseMaybeDate(value: unknown): Date | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const isoCandidate = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(isoCandidate);
  if (Number.isFinite(d.getTime())) return d;
  const csiDateTime = text.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (csiDateTime) {
    const y = Number(csiDateTime[1]);
    const m = Number(csiDateTime[2]);
    const day = Number(csiDateTime[3]);
    const hh = Number(csiDateTime[4]);
    const mm = Number(csiDateTime[5]);
    const ss = Number(csiDateTime[6]);
    const utc = new Date(Date.UTC(y, m - 1, day, hh, mm, ss));
    if (Number.isFinite(utc.getTime())) return utc;
  }
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const day = Number(compact[3]);
    const hh = Number(compact[4] || 0);
    const mm = Number(compact[5] || 0);
    const ss = Number(compact[6] || 0);
    const utc = new Date(Date.UTC(y, m - 1, day, hh, mm, ss));
    if (Number.isFinite(utc.getTime())) return utc;
  }
  return null;
}

function normalizeAcct(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveSignedAmount(row: JsonRecord): number {
  const dom = pickNumber(row, ['DomAmount', 'domAmount']);
  const amount = pickNumber(row, ['Amount', 'amount']);
  const signed = pickNumber(row, ['SignedAmount', 'signedAmount']);
  const drCr = pickText(row, ['DrCr', 'drCr']).toLowerCase();
  if (drCr.startsWith('d')) return Math.abs(dom ?? amount ?? signed ?? 0);
  if (drCr.startsWith('c')) return -Math.abs(dom ?? amount ?? signed ?? 0);
  if (signed != null) return signed;
  if (dom != null) return dom;
  if (amount != null) return amount;
  return 0;
}

async function loadSlgltransRows(companyId: string): Promise<JsonRecord[]> {
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;
  return rows
    .map((r) => (r?.item && typeof r.item === 'object' && !Array.isArray(r.item) ? (r.item as JsonRecord) : null))
    .filter((r): r is JsonRecord => Boolean(r));
}

async function main() {
  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId: COMPANY_ID,
      targetField: { in: ['cash', 'CASH'] as any },
    },
    select: {
      qbAccountId: true,
      qbAccountCode: true,
      qbAccount: true,
    },
    orderBy: { qbAccountId: 'asc' },
  });
  const mappedAccounts = mappings
    .map((m) => ({
      id: String(m.qbAccountId || m.qbAccountCode || '').trim(),
      name: String(m.qbAccount || '').trim(),
    }))
    .filter((m) => m.id);
  const mappedNorm = new Set(mappedAccounts.map((m) => normalizeAcct(m.id)));

  const allRows = await loadSlgltransRows(COMPANY_ID);
  const through = monthEnd(TARGET_MONTH);
  const start = monthStart(TARGET_MONTH);

  const sorted = allRows
    .map((row) => {
      const transDate = parseMaybeDate(row.TransDate ?? row.transDate);
      if (!transDate) return null;
      return { row, transDate };
    })
    .filter((x): x is { row: JsonRecord; transDate: Date } => Boolean(x))
    .sort((a, b) => a.transDate.getTime() - b.transDate.getTime());

  const cumulative = new Map<string, number>();
  const monthMovement = new Map<string, number>();
  const txCountThrough = new Map<string, number>();
  const txCountMonth = new Map<string, number>();

  for (const { row, transDate } of sorted) {
    if (transDate.getTime() > through.getTime()) break;
    const acctRaw = pickText(row, ['Acct', 'acct', 'Account', 'account']);
    const acctNorm = normalizeAcct(acctRaw);
    if (!mappedNorm.has(acctNorm)) continue;
    const signed = resolveSignedAmount(row);
    cumulative.set(acctNorm, (cumulative.get(acctNorm) || 0) + signed);
    txCountThrough.set(acctNorm, (txCountThrough.get(acctNorm) || 0) + 1);
    if (transDate.getTime() >= start.getTime()) {
      monthMovement.set(acctNorm, (monthMovement.get(acctNorm) || 0) + signed);
      txCountMonth.set(acctNorm, (txCountMonth.get(acctNorm) || 0) + 1);
    }
  }

  const monthlyRows = await prisma.$queryRaw<Array<{ cash: number }>>`
    SELECT mf."cash"
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${TARGET_MONTH}
    ORDER BY mf."createdAt" DESC
    LIMIT 1
  `;
  const monthlyCash = Number(monthlyRows[0]?.cash || 0);

  let sumMappedEnding = 0;
  const lines: string[] = [];
  lines.push([
    'account_id',
    'account_name',
    'slgltrans_cumulative_eom',
    'slgltrans_month_movement',
    'tx_count_through_eom',
    'tx_count_in_month',
    'monthlyfinancial_cash_rollup',
  ].join(','));
  for (const mapped of mappedAccounts) {
    const key = normalizeAcct(mapped.id);
    const endBal = cumulative.get(key) || 0;
    const movement = monthMovement.get(key) || 0;
    sumMappedEnding += endBal;
    lines.push([
      csvEscape(mapped.id),
      csvEscape(mapped.name),
      csvEscape(endBal),
      csvEscape(movement),
      csvEscape(txCountThrough.get(key) || 0),
      csvEscape(txCountMonth.get(key) || 0),
      csvEscape(monthlyCash),
    ].join(','));
  }
  lines.push([
    'TOTAL_MAPPED_CASH',
    '',
    csvEscape(sumMappedEnding),
    '',
    '',
    '',
    csvEscape(monthlyCash),
  ].join(','));

  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `cash-rollup-detail-from-slgltrans-${TARGET_MONTH}.csv`);
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        month: TARGET_MONTH,
        mappedCashAccounts: mappedAccounts.length,
        monthlyFinancialCash: monthlyCash,
        mappedCashEndingTotalFromSlgltrans: sumMappedEnding,
        delta: monthlyCash - sumMappedEnding,
        outFile,
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
