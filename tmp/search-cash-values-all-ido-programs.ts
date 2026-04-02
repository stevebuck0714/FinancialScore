import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

const TARGETS = [
  { accountId: '10100', amount: 95680.49 },
  { accountId: '10150', amount: 62396.68 },
  { accountId: '10200', amount: 0 },
  { accountId: '10250', amount: 2502.84 },
  { accountId: '10400', amount: 204.78 },
  { accountId: '10450', amount: 4259.77 },
];

const AMOUNT_LIKE = /(amount|balance|debit|credit|beg|end|ytd|deramount|domamount|foramount)/i;

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

function readAccount(item: Record<string, unknown>): string {
  const keys = ['Acct', 'AcctNum', 'Account', 'AccountId', 'GLAccount', 'ChartAcct', 'AccountCode', 'accountId'];
  for (const k of keys) {
    if (k in item) return String(item[k] ?? '').trim();
  }
  for (const [k, v] of Object.entries(item)) {
    const lower = k.toLowerCase();
    if (lower.includes('acct') || lower.includes('account')) {
      const s = String(v ?? '').trim();
      if (/^\d{3,}$/.test(s)) return s;
    }
  }
  return '';
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `all-ido-program-cash-target-search-${month}.csv`);

  const rows = await prisma.$queryRaw<Array<{ createdAt: Date; program: string; item: unknown }>>`
    WITH logs AS (
      SELECT
        "createdAt",
        UPPER(COALESCE("errorDetails"->>'miProgram','NULL')) AS program,
        "errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
        AND status = 'success'
        AND jsonb_typeof("errorDetails"->'response'->'Items') = 'array'
    )
    SELECT "createdAt", program, x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
    WHERE COALESCE(
      x.value->>'Acct',
      x.value->>'AcctNum',
      x.value->>'Account',
      x.value->>'account',
      x.value->>'AccountId',
      x.value->>'accountId'
    ) IN ('10100','10150','10200','10250','10400','10450')
  `;

  const lines: string[] = [];
  lines.push(
    ['company_id', 'month', 'program', 'log_created_at', 'account_id', 'target_amount', 'matched_field', 'matched_value', 'item_keys'].join(',')
  );
  let matches = 0;
  const tolerance = 0.01;

  for (const row of rows) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = readAccount(item);
    for (const target of TARGETS) {
      if (acct !== target.accountId) continue;
      for (const [field, raw] of Object.entries(item)) {
        if (!AMOUNT_LIKE.test(field)) continue;
        const n = parseNumber(raw);
        if (n === null) continue;
        if (Math.abs(n - target.amount) <= tolerance) {
          matches += 1;
          lines.push(
            [
              csvEscape(companyId),
              csvEscape(month),
              csvEscape(row.program),
              csvEscape(row.createdAt.toISOString()),
              csvEscape(acct),
              csvEscape(target.amount),
              csvEscape(field),
              csvEscape(n),
              csvEscape(Object.keys(item).join('|')),
            ].join(',')
          );
        }
      }
    }
  }

  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ companyId, month, scannedRows: rows.length, matches, outFile }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
