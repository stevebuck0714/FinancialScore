import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env.prod.local', override: true });

const prisma = new PrismaClient();

type ParsedRow = {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
};

type Args = {
  companyId: string;
  anchorDate: string;
  file: string;
  source: string;
};

const BS_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
] as const;

function parseArgs(): Args {
  const out: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    const next = process.argv[i + 1];
    if (!key.startsWith('--') || !next || next.startsWith('--')) continue;
    out[key.slice(2)] = next;
    i += 1;
  }
  if (!out.companyId || !out.anchorDate || !out.file) {
    throw new Error(
      'Usage: npx tsx scripts/import-csi-balance-sheet-anchor.ts --companyId <id> --anchorDate YYYY-MM-DD --file <csv-or-tsv> [--source label]'
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.anchorDate)) throw new Error('anchorDate must be YYYY-MM-DD');
  return {
    companyId: out.companyId,
    anchorDate: out.anchorDate,
    file: out.file,
    source: out.source || `INFOR_CSI_BS_ANCHOR_${out.anchorDate}`,
  };
}

function parseMoney(raw: string | undefined): number {
  const text = String(raw || '').trim();
  if (!text || text === '-') return 0;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[(),$"]/g, '').trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

function splitLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  if (delimiter === '\t') return line.split('\t').map((part) => part.trim());
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseRows(filePath: string): ParsedRow[] {
  const absolute = path.resolve(filePath);
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error(`No rows found in ${absolute}`);
  const first = splitLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = first.includes('account') && first.includes('description');
  const rows = (hasHeader ? lines.slice(1) : lines)
    .map((line) => splitLine(line))
    .map((cells) => {
      const accountId = String(cells[0] || '').trim();
      const accountName = String(cells[1] || '').trim();
      const debit = parseMoney(cells[2]);
      const credit = parseMoney(cells[3]);
      return {
        accountId,
        accountName,
        debit,
        credit,
        balance: debit - credit,
      };
    })
    .filter((row) => row.accountId && (row.balance !== 0 || row.debit !== 0 || row.credit !== 0));
  if (rows.length === 0) throw new Error(`No non-zero account rows found in ${absolute}`);
  return rows;
}

function emptyBs(): Record<(typeof BS_FIELDS)[number], number> {
  return Object.fromEntries(BS_FIELDS.map((field) => [field, 0])) as Record<(typeof BS_FIELDS)[number], number>;
}

function bucketForAccount(accountId: string): keyof ReturnType<typeof emptyBs> | null {
  if (['10100', '10150', '10200', '10250', '10400', '10450'].includes(accountId)) return 'cash';
  if (accountId === '11100') return 'ar';
  if (['11120', '11150', '11155', '11160', '11700', '11800', '11850', '11870', '11900'].includes(accountId)) return 'otherCA';
  if (accountId === '12000') return 'inventory';
  if (accountId === '11500') return 'investments';
  if (/^(21|22|23)\d+/.test(accountId)) return 'fixedAssets';
  if (accountId === '30100') return 'ap';
  if (['39160', '39185'].includes(accountId)) return 'loc';
  if (/^(34|35|36|37)/.test(accountId) || ['218103', '218104', '30200', '30300', '34800', '34810', '34820', '34830', '34850', '39190'].includes(accountId)) return 'otherCL';
  if (/^391/.test(accountId)) return 'ltd';
  if (['40000'].includes(accountId)) return 'commonStock';
  if (accountId === '45000') return 'retainedEarnings';
  return null;
}

function buildRollup(rows: ParsedRow[]): Record<(typeof BS_FIELDS)[number], number> {
  const bs = emptyBs();
  for (const row of rows) {
    const bucket = bucketForAccount(row.accountId);
    if (!bucket) continue;
    const amount = row.balance;
    if (['ap', 'loc', 'otherCL', 'ltd', 'commonStock', 'retainedEarnings'].includes(bucket)) {
      bs[bucket] += -amount;
    } else {
      bs[bucket] += amount;
    }
  }
  bs.tca = bs.cash + bs.ar + bs.retainageReceivables + bs.contractAssets + bs.inventory + bs.otherCA;
  bs.totalAssets =
    bs.tca +
    bs.fixedAssets +
    bs.constructionEquipment +
    bs.officeEquipment +
    bs.shopEquipment +
    bs.investments +
    bs.rightOfUseLeases +
    bs.otherAssets;
  bs.tcl = bs.ap + bs.loc + bs.contractLiabilities + bs.otherCL;
  bs.totalLiab = bs.tcl + bs.ltd;
  bs.totalEquity =
    bs.ownersCapital +
    bs.ownersDraw +
    bs.commonStock +
    bs.preferredStock +
    bs.retainedEarnings +
    bs.additionalPaidInCapital +
    bs.treasuryStock;
  bs.totalLAndE = bs.totalLiab + bs.totalEquity;
  return bs;
}

async function main() {
  const args = parseArgs();
  const anchorDate = new Date(`${args.anchorDate}T00:00:00.000Z`);
  const rows = parseRows(args.file);
  const bs = buildRollup(rows);

  await (prisma as any).balanceSheetAnchor.upsert({
    where: {
      companyId_anchorDate: {
        companyId: args.companyId,
        anchorDate,
      },
    },
    create: {
      companyId: args.companyId,
      anchorDate,
      ...bs,
      source: args.source,
      notes: 'Imported from CSI balance sheet debit/credit export. Rollup uses net debit-credit account balances.',
    },
    update: {
      ...bs,
      source: args.source,
      notes: 'Imported from CSI balance sheet debit/credit export. Rollup uses net debit-credit account balances.',
    },
  });

  for (const row of rows) {
    await (prisma as any).balanceSheetAccountAnchor.upsert({
      where: {
        companyId_anchorDate_accountId: {
          companyId: args.companyId,
          anchorDate,
          accountId: row.accountId,
        },
      },
      create: {
        companyId: args.companyId,
        anchorDate,
        accountId: row.accountId,
        accountCode: row.accountId,
        accountName: row.accountName,
        openingBalance: row.balance,
        source: args.source.replace('_BS_ANCHOR_', '_BS_ACCOUNT_ANCHOR_'),
        notes: 'Imported from CSI balance sheet debit/credit export. Signed convention: debit positive, credit negative.',
      },
      update: {
        accountCode: row.accountId,
        accountName: row.accountName,
        openingBalance: row.balance,
        source: args.source.replace('_BS_ANCHOR_', '_BS_ACCOUNT_ANCHOR_'),
        notes: 'Imported from CSI balance sheet debit/credit export. Signed convention: debit positive, credit negative.',
      },
    });
  }

  console.log(JSON.stringify({
    ok: true,
    companyId: args.companyId,
    anchorDate: args.anchorDate,
    source: args.source,
    accountAnchors: rows.length,
    totalAssets: bs.totalAssets,
    totalLiab: bs.totalLiab,
    totalEquity: bs.totalEquity,
    totalLAndE: bs.totalLAndE,
    outOfBalance: Number((bs.totalAssets - bs.totalLAndE).toFixed(2)),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
