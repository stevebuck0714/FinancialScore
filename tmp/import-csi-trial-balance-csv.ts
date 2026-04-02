import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

type JsonRecord = Record<string, unknown>;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ''));
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase().replace(/[\s_-]+/g, ''));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(value: string): number {
  const text = String(value || '').replace(/[$,\s]/g, '').trim();
  if (!text) return 0;
  const negativeParen = text.startsWith('(') && text.endsWith(')');
  const raw = negativeParen ? text.slice(1, -1) : text;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return negativeParen ? -n : n;
}

function parseArgs(argv: string[]) {
  const args = {
    companyId: 'cmmnwyofv000fqhp4z8lebbny',
    csvPath: '',
    asOfDate: '',
    defaultSite: '',
  };
  if (argv[2] && !argv[2].startsWith('--')) args.companyId = String(argv[2]).trim();
  if (argv[3] && !argv[3].startsWith('--')) args.csvPath = String(argv[3]).trim();
  for (let i = 4; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--asOfDate' && argv[i + 1]) {
      args.asOfDate = String(argv[i + 1]).trim();
      i += 1;
    } else if (token === '--defaultSite' && argv[i + 1]) {
      args.defaultSite = String(argv[i + 1]).trim();
      i += 1;
    }
  }
  if (!args.csvPath) {
    throw new Error('Usage: npx tsx tmp/import-csi-trial-balance-csv.ts <companyId> <csvPath> [--asOfDate YYYY-MM-DD] [--defaultSite LYN]');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const absCsvPath = path.isAbsolute(args.csvPath) ? args.csvPath : path.join(process.cwd(), args.csvPath);
  const csv = await fs.readFile(absCsvPath, 'utf8');
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must contain header and at least one data row.');

  const headers = parseCsvLine(lines[0]);
  const acctIdx = findHeaderIndex(headers, ['acct', 'account', 'accountid', 'accountnumber', 'acctid']);
  const balanceIdx = findHeaderIndex(headers, ['endingbalance', 'balance', 'endbalance']);
  const asOfIdx = findHeaderIndex(headers, ['asofdate', 'date', 'snapshotdate']);
  const siteIdx = findHeaderIndex(headers, ['site', 'location']);
  if (acctIdx < 0 || balanceIdx < 0) {
    throw new Error('CSV must include account and ending balance columns.');
  }

  const snapshotRows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const accountId = String(cols[acctIdx] || '').trim();
    if (!accountId) continue;
    const endingBalance = parseAmount(String(cols[balanceIdx] || ''));
    const asOfDate = String((asOfIdx >= 0 ? cols[asOfIdx] : args.asOfDate) || args.asOfDate || '').trim();
    if (!asOfDate) continue;
    const site = String((siteIdx >= 0 ? cols[siteIdx] : args.defaultSite) || args.defaultSite || '').trim();
    snapshotRows.push({
      accountId,
      accountCode: accountId,
      site: site || null,
      asOfDate,
      endingBalance,
      source: 'trial_balance_csv',
      importedAt: new Date().toISOString(),
    });
  }
  if (snapshotRows.length === 0) {
    throw new Error('No usable trial-balance rows were parsed from CSV.');
  }

  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId: args.companyId, platform: 'INFOR_M3' } },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as JsonRecord)
      : {};
  const existing = Array.isArray(metadata.csiTrialBalanceSnapshots) ? (metadata.csiTrialBalanceSnapshots as unknown[]) : [];
  const merged = [...existing, ...snapshotRows];

  await prisma.accountingConnection.updateMany({
    where: { companyId: args.companyId, platform: 'INFOR_M3' },
    data: {
      connectionMetadata: {
        ...metadata,
        csiTrialBalanceSnapshots: merged,
      } as any,
      lastSyncAt: new Date(),
    },
  });

  console.log(
    JSON.stringify(
      {
        companyId: args.companyId,
        csvPath: absCsvPath,
        importedRows: snapshotRows.length,
        totalStoredSnapshots: merged.length,
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
