import prisma from '../lib/prisma';

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readAny(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function toYearMonth(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const csi = raw.match(/^(\d{4})(\d{2})(\d{2})[ T]/);
  if (csi) return `${csi[1]}-${csi[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const targetMonth = process.argv[3] || '2026-03';
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) IN ('SLGLTRANS')
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item
    FROM ledger_rows
  `;

  const accountAccumulator = new Map<string, number>();
  for (const row of rows || []) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(readAny(item, ['Acct', 'AcctNum', 'Account', 'account', 'accountId', 'accountCode']) ?? '').trim();
    if (!acct) continue;
    const year = normalizeNumber(readAny(item, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']));
    const period = normalizeNumber(readAny(item, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']));
    const rowMonth =
      year >= 1900 && period >= 1 && period <= 12
        ? `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`
        : toYearMonth(readAny(item, ['PeriodEndDate', 'periodEndDate', 'RecordDate', 'recordDate', 'TransDate', 'transDate', 'Date', 'date']));
    if (targetMonth && rowMonth && rowMonth !== targetMonth) continue;

    const amount = normalizeNumber(
      readAny(item, ['EndBalance', 'Balance', 'PeriodEndBalance', 'YtdBalance', 'ACAM', 'Amount', 'amount', 'DomAmount', 'domAmount'])
    );
    accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);
  }

  const top = Array.from(accountAccumulator.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 20)
    .map(([acct, amount]) => ({ acct, amount }));
  console.log(JSON.stringify({ companyId, targetMonth, sourceRows: rows.length, accountCount: accountAccumulator.size, top }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
