import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

type Target = { accountId: string; amount: number };

const TARGETS: Target[] = [
  { accountId: '10100', amount: 95680.49 },
  { accountId: '10150', amount: 62396.68 },
  { accountId: '10200', amount: 0 },
  { accountId: '10250', amount: 2502.84 },
  { accountId: '10400', amount: 204.78 },
  { accountId: '10450', amount: 4259.77 },
];

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readAny(record: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in record) return record[k];
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lower.set(k.toLowerCase(), v);
  for (const k of keys) {
    const value = lower.get(k.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function toYearMonth(item: Record<string, unknown>): string | null {
  const year = parseNumber(readAny(item, ['ControlYear', 'FiscalYear', 'Year', 'AcctYear']));
  const period = parseNumber(readAny(item, ['ControlPeriod', 'FiscalPeriod', 'Period', 'AcctPeriod']));
  if (year && period && period >= 1 && period <= 12) {
    return `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`;
  }
  const raw = String(
    readAny(item, ['PeriodEndDate', 'RecordDate', 'TransDate', 'Date', 'PostDate', 'AcctDate']) ?? ''
  ).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function extractNumericFields(item: Record<string, unknown>): Array<{ field: string; value: number }> {
  const out: Array<{ field: string; value: number }> = [];
  for (const [k, v] of Object.entries(item)) {
    const n = parseNumber(v);
    if (n === null) continue;
    out.push({ field: k, value: n });
  }
  return out;
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const outDir = path.join(process.cwd(), 'exports');
  const matchesCsv = path.join(outDir, `ido-cash-account-matches-${month}.csv`);
  const summaryCsv = path.join(outDir, `ido-cash-account-summary-${month}.csv`);
  const tolerance = 0.01;

  await fs.mkdir(outDir, { recursive: true });

  const rows = await prisma.$queryRaw<Array<{ createdAt: Date; miProgram: string; item: unknown }>>`
    WITH logs AS (
      SELECT
        "createdAt",
        UPPER(COALESCE("errorDetails"->>'miProgram','')) AS "miProgram",
        "errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
        AND status = 'success'
        AND UPPER(COALESCE("errorDetails"->>'miProgram','')) IN ('SLGLTRANS', 'GLACCTPERIODBALANCES')
        AND jsonb_typeof("errorDetails"->'response'->'Items') = 'array'
    )
    SELECT "createdAt", "miProgram", x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;

  const targetByAcct = new Map(TARGETS.map((t) => [t.accountId, t]));
  const matchLines: string[] = [];
  matchLines.push(
    [
      'company_id',
      'month',
      'source_program',
      'log_created_at',
      'account_id',
      'target_amount',
      'matched_field',
      'matched_value',
      'row_month',
      'raw_date',
      'row_keys',
    ].join(',')
  );

  const summary = new Map<string, { accountId: string; targetAmount: number; matchCount: number; programs: Set<string> }>();
  for (const t of TARGETS) {
    summary.set(t.accountId, { accountId: t.accountId, targetAmount: t.amount, matchCount: 0, programs: new Set() });
  }

  for (const row of rows) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(
      readAny(item, ['Acct', 'AcctNum', 'Account', 'AccountId', 'accountId', 'account', 'GLAccount', 'ChartAcct']) ?? ''
    ).trim();
    if (!acct || !targetByAcct.has(acct)) continue;
    const rowMonth = toYearMonth(item);
    if (rowMonth && rowMonth !== month) continue;

    const target = targetByAcct.get(acct)!;
    const numericFields = extractNumericFields(item);
    for (const field of numericFields) {
      if (Math.abs(field.value - target.amount) <= tolerance) {
        const rawDate = readAny(item, ['PeriodEndDate', 'RecordDate', 'TransDate', 'Date', 'PostDate', 'AcctDate']) ?? '';
        matchLines.push(
          [
            csvEscape(companyId),
            csvEscape(month),
            csvEscape(row.miProgram),
            csvEscape(row.createdAt.toISOString()),
            csvEscape(acct),
            csvEscape(target.amount),
            csvEscape(field.field),
            csvEscape(field.value),
            csvEscape(rowMonth || ''),
            csvEscape(rawDate),
            csvEscape(Object.keys(item).join('|')),
          ].join(',')
        );
        const s = summary.get(acct)!;
        s.matchCount += 1;
        s.programs.add(row.miProgram);
      }
    }
  }

  const summaryLines: string[] = [];
  summaryLines.push(['company_id', 'month', 'account_id', 'target_amount', 'match_count', 'programs_found_in'].join(','));
  for (const t of TARGETS) {
    const s = summary.get(t.accountId)!;
    summaryLines.push(
      [
        csvEscape(companyId),
        csvEscape(month),
        csvEscape(s.accountId),
        csvEscape(s.targetAmount),
        csvEscape(s.matchCount),
        csvEscape(Array.from(s.programs).sort().join('|')),
      ].join(',')
    );
  }

  await fs.writeFile(matchesCsv, `${matchLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(summaryCsv, `${summaryLines.join('\n')}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        scannedRows: rows.length,
        matchesCsv,
        summaryCsv,
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
