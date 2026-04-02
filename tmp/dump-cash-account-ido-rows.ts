import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

const ACCOUNTS = ['10100', '10150', '10200', '10250', '10400', '10450'];

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

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const outDir = path.join(process.cwd(), 'exports');
  const outFile = path.join(outDir, `ido-cash-account-rows-${month}.csv`);
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

  const lines: string[] = [];
  lines.push(
    [
      'company_id',
      'month',
      'source_program',
      'log_created_at',
      'account_id',
      'row_month',
      'raw_date',
      'control_year',
      'control_period',
      'drcr',
      'amount',
      'dom_amount',
      'debit_amount',
      'credit_amount',
      'balance',
      'end_balance',
      'ytd_balance',
      'record_keys',
    ].join(',')
  );

  let matchedRows = 0;
  for (const row of rows) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(
      readAny(item, ['Acct', 'AcctNum', 'Account', 'AccountId', 'accountId', 'account', 'GLAccount', 'ChartAcct']) ?? ''
    ).trim();
    if (!ACCOUNTS.includes(acct)) continue;
    const rowMonth = toYearMonth(item);
    if (rowMonth && rowMonth !== month) continue;

    matchedRows += 1;
    lines.push(
      [
        csvEscape(companyId),
        csvEscape(month),
        csvEscape(row.miProgram),
        csvEscape(row.createdAt.toISOString()),
        csvEscape(acct),
        csvEscape(rowMonth || ''),
        csvEscape(readAny(item, ['PeriodEndDate', 'RecordDate', 'TransDate', 'Date', 'PostDate', 'AcctDate']) ?? ''),
        csvEscape(readAny(item, ['ControlYear', 'FiscalYear', 'Year', 'AcctYear']) ?? ''),
        csvEscape(readAny(item, ['ControlPeriod', 'FiscalPeriod', 'Period', 'AcctPeriod']) ?? ''),
        csvEscape(readAny(item, ['DrCr', 'DRCR', 'drCr']) ?? ''),
        csvEscape(readAny(item, ['Amount', 'amount']) ?? ''),
        csvEscape(readAny(item, ['DomAmount', 'domAmount', 'DomAmt']) ?? ''),
        csvEscape(readAny(item, ['DebitAmount', 'debitAmount', 'Debit']) ?? ''),
        csvEscape(readAny(item, ['CreditAmount', 'creditAmount', 'Credit']) ?? ''),
        csvEscape(readAny(item, ['Balance', 'balance']) ?? ''),
        csvEscape(readAny(item, ['EndBalance', 'endBalance', 'PeriodEndBalance']) ?? ''),
        csvEscape(readAny(item, ['YtdBalance', 'ytdBalance']) ?? ''),
        csvEscape(Object.keys(item).join('|')),
      ].join(',')
    );
  }

  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ companyId, month, scannedRows: rows.length, matchedRows, outFile }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
