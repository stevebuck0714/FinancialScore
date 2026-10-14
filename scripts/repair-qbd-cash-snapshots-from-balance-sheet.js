// Rebuild QuickBooks Desktop daily CashSnapshot rows from the stored per-day
// Balance Sheet reports. AccountRet Balance includes future-dated transactions,
// so older snapshots can be wrong; the Balance Sheet is capped at its as-of date.
//
// Usage:
//   DATABASE_URL=... node scripts/repair-qbd-cash-snapshots-from-balance-sheet.js <companyId> [--since=YYYY-MM-DD] [--apply]
// Without --apply this is a dry run.

const { PrismaClient } = require('@prisma/client');
const { requireDatabaseUrl } = require('./require-database-url');

const args = process.argv.slice(2);
const companyId = args.find((arg) => !arg.startsWith('--'));
const apply = args.includes('--apply');
const since = (args.find((arg) => arg.startsWith('--since=')) || '').slice('--since='.length) || null;

if (!companyId) {
  console.error('Usage: node scripts/repair-qbd-cash-snapshots-from-balance-sheet.js <companyId> [--since=YYYY-MM-DD] [--apply]');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: requireDatabaseUrl() } } });

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function asOfDate(rows) {
  for (const row of rows) {
    const match = /^As of\s+(.+)$/i.exec(String(row.reportSubtitle || '').trim());
    if (!match) continue;
    const parsed = new Date(`${match[1].trim()} UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function amountsByAccount(rows) {
  const amounts = new Map();
  for (const row of rows) {
    if (String(row.rowKind || '') !== 'DataRow') continue;
    const name = String(row.accountName || row.rowValue || '').trim().toLowerCase();
    if (!name) continue;
    const cols = Array.isArray(row.colData) ? row.colData : [];
    const col = cols.find((c) => String(c.colID || '') === '2') || cols[cols.length - 1];
    amounts.set(name, (amounts.get(name) || 0) + toNumber(col && col.value));
  }
  return amounts;
}

function isCashAccount(account) {
  const type = String(account.AccountType || '').trim().toLowerCase();
  if (type === 'bank') return true;
  if (type && type !== 'othercurrentasset') return false;
  const name = String(account.FullName || account.Name || '').toLowerCase();
  return name.includes('cash') || name.includes('checking') || name.includes('savings');
}

async function main() {
  const accountPages = await prisma.$queryRawUnsafe(
    `SELECT "payload" FROM "QuickBooksDesktopBackfillPage"
     WHERE "companyId" = $1 AND "requestName" = 'AccountQuery'
     ORDER BY "createdAt" DESC LIMIT 20`,
    companyId,
  );
  const accountsById = new Map();
  for (const page of accountPages) {
    for (const account of Array.isArray(page.payload) ? page.payload : []) {
      const id = String(account.ListID || '');
      if (id && !accountsById.has(id)) accountsById.set(id, account);
    }
  }
  if (accountsById.size === 0) throw new Error('No stored AccountQuery pages for this company.');

  const bsPages = await prisma.$queryRawUnsafe(
    `SELECT "jobId", "pageNumber", "createdAt", "payload" FROM "QuickBooksDesktopBackfillPage"
     WHERE "companyId" = $1 AND "requestName" = 'BalanceSheetStandardReportQuery'
     ORDER BY "createdAt" ASC, "jobId" ASC, "pageNumber" ASC`,
    companyId,
  );
  const rowsByJob = new Map();
  for (const page of bsPages) {
    const rows = rowsByJob.get(page.jobId) || [];
    rows.push(...(Array.isArray(page.payload) ? page.payload : []));
    rowsByJob.set(page.jobId, rows);
  }
  // Later pulls of the same as-of day win (backdated entries change history).
  const reportByDate = new Map();
  for (const rows of rowsByJob.values()) {
    const date = asOfDate(rows);
    if (date) reportByDate.set(date, amountsByAccount(rows));
  }

  const snapshots = await prisma.cashSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      ...(since ? { snapshotDate: { gte: new Date(`${since}T00:00:00.000Z`) } } : {}),
    },
    orderBy: { snapshotDate: 'asc' },
  });

  const updates = [];
  const deletes = [];
  const skippedDates = new Set();
  for (const snapshot of snapshots) {
    const date = snapshot.snapshotDate.toISOString().slice(0, 10);
    const account = accountsById.get(String(snapshot.accountId || ''));
    if (account && !isCashAccount(account)) {
      deletes.push({ id: snapshot.id, date, accountName: snapshot.accountName, cashBalance: Number(snapshot.cashBalance) });
      continue;
    }
    const report = reportByDate.get(date);
    if (!report) {
      skippedDates.add(date);
      continue;
    }
    const corrected = Math.round((report.get(String(snapshot.accountName || '').trim().toLowerCase()) || 0) * 100) / 100;
    const current = Number(snapshot.cashBalance);
    if (Math.abs(corrected - current) > 0.004) {
      updates.push({ id: snapshot.id, date, accountName: snapshot.accountName, from: current, to: corrected });
    }
  }

  const totals = new Map();
  for (const snapshot of snapshots) {
    const date = snapshot.snapshotDate.toISOString().slice(0, 10);
    const entry = totals.get(date) || { before: 0, after: 0 };
    entry.before += Number(snapshot.cashBalance);
    const deleted = deletes.find((row) => row.id === snapshot.id);
    const updated = updates.find((row) => row.id === snapshot.id);
    if (!deleted) entry.after += updated ? updated.to : Number(snapshot.cashBalance);
    totals.set(date, entry);
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Balance Sheet as-of dates available: ${reportByDate.size}`);
  console.log(`Rows to update: ${updates.length}; non-cash rows to delete: ${deletes.length}`);
  for (const row of deletes.filter((r, i, all) => all.findIndex((x) => x.accountName === r.accountName) === i)) {
    console.log(`  delete non-cash account rows: ${row.accountName}`);
  }
  console.log('\nTotal cash by date (before -> after):');
  for (const [date, entry] of totals) {
    const note = skippedDates.has(date) ? '  (no Balance Sheet for this date; balances unchanged)' : '';
    console.log(`  ${date}: ${entry.before.toFixed(2)} -> ${entry.after.toFixed(2)}${note}`);
  }

  if (!apply) return;
  await prisma.$transaction([
    ...updates.map((row) => prisma.cashSnapshot.update({ where: { id: row.id }, data: { cashBalance: row.to } })),
    prisma.cashSnapshot.deleteMany({ where: { id: { in: deletes.map((row) => row.id) } } }),
  ]);
  console.log('\nApplied.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
