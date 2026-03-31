import fs from 'node:fs';
import prisma from '@/lib/prisma';

const csvPath = 'C:/Users/steve/FinancialScore/exports/open_invoices_2026-03-06_2026-03-09_2026-03-10.csv';
const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const day = '2026-03-09';
const snapshotDate = new Date(`${day}T00:00:00.000Z`);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const normalize = (value: string): string => String(value || '').trim().replace(/\s+/g, '').toUpperCase();

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

type Row = {
  amount: number;
  invoiceDate: Date | null;
  dueDate: Date | null;
};

function summarize(rows: Row[]) {
  const bucket = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let total = 0;
  for (const row of rows) {
    total += row.amount;
    const basis = row.dueDate || row.invoiceDate;
    if (!basis) {
      bucket['90+'] += row.amount;
      continue;
    }
    const age = Math.floor((snapshotDate.getTime() - basis.getTime()) / MS_PER_DAY);
    if (age <= 30) bucket['0-30'] += row.amount;
    else if (age <= 60) bucket['31-60'] += row.amount;
    else if (age <= 90) bucket['61-90'] += row.amount;
    else bucket['90+'] += row.amount;
  }
  return {
    count: rows.length,
    total: Number(total.toFixed(2)),
    bucket: {
      '0-30': Number(bucket['0-30'].toFixed(2)),
      '31-60': Number(bucket['31-60'].toFixed(2)),
      '61-90': Number(bucket['61-90'].toFixed(2)),
      '90+': Number(bucket['90+'].toFixed(2)),
    },
  };
}

function summarizeByInvoiceDate(rows: Row[]) {
  const bucket = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let total = 0;
  for (const row of rows) {
    total += row.amount;
    const basis = row.invoiceDate;
    if (!basis) {
      bucket['90+'] += row.amount;
      continue;
    }
    const age = Math.floor((snapshotDate.getTime() - basis.getTime()) / MS_PER_DAY);
    if (age <= 30) bucket['0-30'] += row.amount;
    else if (age <= 60) bucket['31-60'] += row.amount;
    else if (age <= 90) bucket['61-90'] += row.amount;
    else bucket['90+'] += row.amount;
  }
  return {
    count: rows.length,
    total: Number(total.toFixed(2)),
    bucket: {
      '0-30': Number(bucket['0-30'].toFixed(2)),
      '31-60': Number(bucket['31-60'].toFixed(2)),
      '61-90': Number(bucket['61-90'].toFixed(2)),
      '90+': Number(bucket['90+'].toFixed(2)),
    },
  };
}

async function main(): Promise<void> {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0] || '');
  const idx = (name: string) => header.indexOf(name);
  const iDay = idx('reportDay');
  const iInv = idx('invoiceId');
  const iCust = idx('customerId');
  const iAmt = idx('amount');
  if (iDay < 0 || iInv < 0 || iCust < 0 || iAmt < 0) {
    throw new Error('CSV header missing expected columns');
  }

  const baselineRows: Row[] = [];
  const baselineKeyset = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols[iDay] !== day) continue;
    const key = `${normalize(cols[iInv])}|${String(cols[iCust] || '').trim()}`;
    baselineKeyset.add(key);
    baselineRows.push({
      amount: Number(cols[iAmt] || 0),
      invoiceDate: cols[header.indexOf('invoiceDate')] ? new Date(`${cols[header.indexOf('invoiceDate')]}T00:00:00.000Z`) : null,
      dueDate: null,
    });
  }

  const snapshotRows = await prisma.aROpenInvoiceSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate,
      amountDueHome: { gt: 0 },
    },
    select: {
      invoiceNo: true,
      customerId: true,
      amountDueHome: true,
      invoiceDate: true,
      dueDate: true,
    },
  });

  const rawRows: Row[] = [];
  const gatedRows: Row[] = [];
  let unmatchedAmount = 0;
  let unmatchedCount = 0;
  for (const row of snapshotRows) {
    const amount = Number(row.amountDueHome || 0);
    const shaped: Row = {
      amount,
      invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : null,
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
    };
    rawRows.push(shaped);
    const key = `${normalize(String(row.invoiceNo || ''))}|${String(row.customerId || '').trim()}`;
    if (baselineKeyset.has(key)) {
      gatedRows.push(shaped);
    } else {
      unmatchedCount += 1;
      unmatchedAmount += amount;
    }
  }

  const baselineSummary = summarize(baselineRows);
  const rawSummary = summarize(rawRows);
  const gatedSummary = summarize(gatedRows);
  const baselineByInvoiceDate = summarizeByInvoiceDate(baselineRows);
  const gatedByInvoiceDate = summarizeByInvoiceDate(gatedRows);

  console.log(
    JSON.stringify(
      {
        day,
        baseline: baselineSummary,
        baselineByInvoiceDate,
        currentRaw: rawSummary,
        currentKeysetGated: gatedSummary,
        currentKeysetGatedByInvoiceDate: gatedByInvoiceDate,
        excludedByGate: {
          count: unmatchedCount,
          amount: Number(unmatchedAmount.toFixed(2)),
        },
        gatedDeltaVsBaseline: {
          total: Number((gatedSummary.total - baselineSummary.total).toFixed(2)),
          bucket: {
            '0-30': Number((gatedSummary.bucket['0-30'] - baselineSummary.bucket['0-30']).toFixed(2)),
            '31-60': Number((gatedSummary.bucket['31-60'] - baselineSummary.bucket['31-60']).toFixed(2)),
            '61-90': Number((gatedSummary.bucket['61-90'] - baselineSummary.bucket['61-90']).toFixed(2)),
            '90+': Number((gatedSummary.bucket['90+'] - baselineSummary.bucket['90+']).toFixed(2)),
          },
        },
        gatedByInvoiceDateDeltaVsBaselineByInvoiceDate: {
          total: Number((gatedByInvoiceDate.total - baselineByInvoiceDate.total).toFixed(2)),
          bucket: {
            '0-30': Number((gatedByInvoiceDate.bucket['0-30'] - baselineByInvoiceDate.bucket['0-30']).toFixed(2)),
            '31-60': Number((gatedByInvoiceDate.bucket['31-60'] - baselineByInvoiceDate.bucket['31-60']).toFixed(2)),
            '61-90': Number((gatedByInvoiceDate.bucket['61-90'] - baselineByInvoiceDate.bucket['61-90']).toFixed(2)),
            '90+': Number((gatedByInvoiceDate.bucket['90+'] - baselineByInvoiceDate.bucket['90+']).toFixed(2)),
          },
        },
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
