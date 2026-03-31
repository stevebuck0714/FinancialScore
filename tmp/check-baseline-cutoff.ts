import fs from 'node:fs';

const csvPath = 'C:/Users/steve/FinancialScore/exports/open_invoices_2026-03-06_2026-03-09_2026-03-10.csv';
const day = '2026-03-09';
const asOf = new Date('2026-03-09T00:00:00.000Z');
const cutoff = new Date(asOf.getTime() - 180 * 24 * 60 * 60 * 1000);

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

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines[0] || '');
const iDay = header.indexOf('reportDay');
const iDate = header.indexOf('invoiceDate');
const iAmount = header.indexOf('amount');

let rowCount = 0;
let total = 0;
let olderThan180Count = 0;
let olderThan180Total = 0;

for (let i = 1; i < lines.length; i += 1) {
  const cols = parseCsvLine(lines[i]);
  if (cols[iDay] !== day) continue;
  rowCount += 1;
  const amount = Number(cols[iAmount] || 0);
  total += amount;
  const invoiceDate = new Date(`${cols[iDate]}T00:00:00.000Z`);
  if (invoiceDate.getTime() < cutoff.getTime()) {
    olderThan180Count += 1;
    olderThan180Total += amount;
  }
}

console.log(
  JSON.stringify(
    {
      day,
      cutoff: cutoff.toISOString().slice(0, 10),
      rowCount,
      total: Number(total.toFixed(2)),
      olderThan180Count,
      olderThan180Total: Number(olderThan180Total.toFixed(2)),
    },
    null,
    2
  )
);
