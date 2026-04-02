import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

type JsonRecord = Record<string, unknown>;

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const TARGET_MONTH = process.argv[3] || '2026-03';

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function pickText(row: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function pickNumber(row: JsonRecord, keys: string[]): number {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    const s = String(v).replace(/,/g, '').trim();
    if (!s) continue;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseCsiDateTimeToken(value: unknown): Date | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const csi = text.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (csi) {
    return new Date(Date.UTC(Number(csi[1]), Number(csi[2]) - 1, Number(csi[3]), Number(csi[4]), Number(csi[5]), Number(csi[6])));
  }
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3])));
  const iso = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isFinite(iso.getTime())) return iso;
  return null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMappingKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildAccountKey(rawAccount: string): string {
  const value = rawAccount.trim();
  if (!value) return '';
  const numeric = value.match(/(\d{3,})/);
  return numeric ? numeric[1] : value.toLowerCase();
}

function extractAccountCodeCandidates(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  const add = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const key = buildAccountKey(raw);
    if (key) candidates.add(key);
    const digitMatches = raw.match(/\d{3,}/g) || [];
    for (const token of digitMatches) {
      const normalized = String(Number(token));
      if (normalized && normalized !== 'NaN') candidates.add(normalized);
      candidates.add(token);
      if (token.length === 4) candidates.add(`${token}0`);
      if (token.length >= 5) {
        candidates.add(token.slice(0, 4));
        if (token.endsWith('0')) candidates.add(token.slice(0, -1));
      }
    }
  };
  for (const v of values) add(v);
  return Array.from(candidates).filter(Boolean);
}

function resolveSignedAmount(row: JsonRecord): number {
  const dom = pickNumber(row, ['DomAmount', 'domAmount', 'Amount', 'amount', 'ForAmount', 'forAmount']);
  const drCr = pickText(row, ['DrCr', 'drCr', 'drcr']).toLowerCase();
  if (drCr.startsWith('d')) return Math.abs(dom);
  if (drCr.startsWith('c')) return -Math.abs(dom);
  return dom;
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
    .map((row) => (row?.item && typeof row.item === 'object' && !Array.isArray(row.item) ? (row.item as JsonRecord) : null))
    .filter((row): row is JsonRecord => Boolean(row));
}

async function main() {
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId: COMPANY_ID },
    select: { qbAccount: true, qbAccountId: true, qbAccountCode: true, targetField: true },
  });

  const mappingByName = new Map<string, string>();
  const mappingByCode = new Map<string, string>();
  const explicitCashIds = new Set<string>();

  for (const row of mappings) {
    const targetField = String(row.targetField || '').trim();
    if (!targetField || targetField.toLowerCase() === 'unmapped') continue;
    const byName = normalizeMappingKey(row.qbAccount);
    if (byName && !mappingByName.has(byName)) mappingByName.set(byName, targetField);
    for (const candidate of extractAccountCodeCandidates(row.qbAccountCode, row.qbAccountId, row.qbAccount)) {
      if (!mappingByCode.has(candidate)) mappingByCode.set(candidate, targetField);
    }
    if (targetField.toLowerCase() === 'cash') {
      for (const candidate of extractAccountCodeCandidates(row.qbAccountId, row.qbAccountCode)) explicitCashIds.add(candidate);
    }
  }

  const rows = await loadSlgltransRows(COMPANY_ID);
  const sorted = rows
    .map((row) => {
      const transDate = parseCsiDateTimeToken(row.TransDate ?? row.transDate);
      if (!transDate) return null;
      return { row, transDate };
    })
    .filter((x): x is { row: JsonRecord; transDate: Date } => Boolean(x))
    .sort((a, b) => a.transDate.getTime() - b.transDate.getTime());

  const cumulativeByAccount = new Map<string, number>();
  const monthSnapshot = new Map<string, number>();
  const monthTxCount = new Map<string, number>();
  const monthName = new Map<string, string>();

  for (const { row, transDate } of sorted) {
    const rowMonth = monthKey(transDate);
    if (rowMonth > TARGET_MONTH) break;

    const rawAccount = pickText(row, ['Acct', 'acct', 'Account', 'account']);
    const accountKey = buildAccountKey(rawAccount);
    if (!accountKey) continue;
    const accountName = pickText(row, ['AccountName', 'accountName', 'Description', 'description']) || rawAccount;
    const codeCandidates = extractAccountCodeCandidates(accountKey, rawAccount, accountName);
    let mappedTargetField: string | null = null;
    for (const candidate of codeCandidates) {
      const mapped = mappingByCode.get(candidate);
      if (mapped) {
        mappedTargetField = mapped;
        break;
      }
    }
    if (!mappedTargetField) {
      mappedTargetField =
        mappingByName.get(normalizeMappingKey(accountName)) ||
        mappingByName.get(normalizeMappingKey(rawAccount)) ||
        null;
    }
    if (String(mappedTargetField || '').toLowerCase() !== 'cash') continue;

    const signed = resolveSignedAmount(row);
    const next = (cumulativeByAccount.get(accountKey) || 0) + signed;
    cumulativeByAccount.set(accountKey, next);
    if (rowMonth === TARGET_MONTH) {
      monthSnapshot.set(accountKey, next);
      monthTxCount.set(accountKey, (monthTxCount.get(accountKey) || 0) + 1);
      monthName.set(accountKey, accountName);
    }
  }

  const contributorRows = Array.from(monthSnapshot.entries())
    .map(([account, ending]) => ({
      account,
      accountName: monthName.get(account) || account,
      ending,
      contributionAbs: Math.abs(ending),
      monthTxCount: monthTxCount.get(account) || 0,
      isExplicitMappedCashAccount: explicitCashIds.has(account),
    }))
    .sort((a, b) => b.contributionAbs - a.contributionAbs);

  const monthlyRows = await prisma.$queryRaw<Array<{ cash: number }>>`
    SELECT mf."cash"
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${TARGET_MONTH}
    ORDER BY mf."createdAt" DESC
    LIMIT 1
  `;
  const monthlyCash = Number(monthlyRows[0]?.cash || 0);
  const computedCash = contributorRows.reduce((sum, r) => sum + r.contributionAbs, 0);

  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `cash-rollup-contributors-${TARGET_MONTH}.csv`);
  const lines: string[] = [];
  lines.push([
    'account',
    'account_name',
    'ending_balance_eom',
    'abs_contribution_to_cash',
    'tx_count_in_month',
    'is_explicit_cash_mapping',
    'monthlyfinancial_cash',
  ].join(','));
  for (const row of contributorRows) {
    lines.push([
      csvEscape(row.account),
      csvEscape(row.accountName),
      csvEscape(row.ending),
      csvEscape(row.contributionAbs),
      csvEscape(row.monthTxCount),
      csvEscape(row.isExplicitMappedCashAccount ? 'yes' : 'no'),
      csvEscape(monthlyCash),
    ].join(','));
  }
  lines.push([
    'TOTAL',
    '',
    '',
    csvEscape(computedCash),
    '',
    '',
    csvEscape(monthlyCash),
  ].join(','));
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        month: TARGET_MONTH,
        contributingAccounts: contributorRows.length,
        computedCashFromContributors: computedCash,
        monthlyFinancialCash: monthlyCash,
        delta: monthlyCash - computedCash,
        outFile,
        top10: contributorRows.slice(0, 10),
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
