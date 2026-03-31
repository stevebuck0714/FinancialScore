import fs from 'node:fs';
import prisma from '@/lib/prisma';

const csvPath = 'C:/Users/steve/FinancialScore/exports/open_invoices_2026-03-06_2026-03-09_2026-03-10.csv';
const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const day = '2026-03-09';

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

  const baseline = new Map<string, number>();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols[iDay] !== day) continue;
    const key = `${normalize(cols[iInv])}|${String(cols[iCust] || '').trim()}`;
    baseline.set(key, (baseline.get(key) || 0) + Number(cols[iAmt] || 0));
  }

  const snapshotDate = new Date(`${day}T00:00:00.000Z`);
  const rows = await prisma.aROpenInvoiceSnapshot.findMany({
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
      status: true,
    },
  });

  const current = new Map<string, number>();
  const currentMeta = new Map<
    string,
    { invoiceDate: string | null; dueDate: string | null; status: string | null }
  >();
  for (const row of rows) {
    const key = `${normalize(String(row.invoiceNo || ''))}|${String(row.customerId || '').trim()}`;
    current.set(key, (current.get(key) || 0) + Number(row.amountDueHome || 0));
    if (!currentMeta.has(key)) {
      currentMeta.set(key, {
        invoiceDate: row.invoiceDate ? row.invoiceDate.toISOString().slice(0, 10) : null,
        dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
        status: row.status || null,
      });
    }
  }

  const keys = new Set<string>([...baseline.keys(), ...current.keys()]);
  const deltas: Array<{ key: string; base: number; cur: number; delta: number }> = [];
  const deltaByCustomer = new Map<string, { base: number; cur: number; delta: number }>();
  let baselineTotal = 0;
  let currentTotal = 0;
  let matchedKeys = 0;
  let onlyBaselineKeys = 0;
  let onlyCurrentKeys = 0;
  let deltaFromOnlyCurrent = 0;
  let deltaFromMatched = 0;

  for (const key of keys) {
    const base = Number(baseline.get(key) || 0);
    const cur = Number(current.get(key) || 0);
    baselineTotal += base;
    currentTotal += cur;
    if (base > 0 && cur > 0) {
      matchedKeys += 1;
      deltaFromMatched += cur - base;
    } else if (base > 0 && cur === 0) {
      onlyBaselineKeys += 1;
    } else if (cur > 0 && base === 0) {
      onlyCurrentKeys += 1;
      deltaFromOnlyCurrent += cur;
    }
    deltas.push({ key, base, cur, delta: Number((cur - base).toFixed(2)) });
    const customerId = key.split('|')[1] || '';
    const bucket = deltaByCustomer.get(customerId) || { base: 0, cur: 0, delta: 0 };
    bucket.base += base;
    bucket.cur += cur;
    bucket.delta += cur - base;
    deltaByCustomer.set(customerId, bucket);
  }

  const topOverstated = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 30)
    .map((d) => ({ ...d, ...(currentMeta.get(d.key) || {}) }));
  const topMissingOrUnderstated = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 20);

  const topCustomerDelta = Array.from(deltaByCustomer.entries())
    .map(([customerId, x]) => ({
      customerId,
      base: Number(x.base.toFixed(2)),
      cur: Number(x.cur.toFixed(2)),
      delta: Number(x.delta.toFixed(2)),
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 20);

  console.log(
    JSON.stringify(
      {
        day,
        baselineCount: baseline.size,
        currentCount: current.size,
        matchedKeys,
        onlyBaselineKeys,
        onlyCurrentKeys,
        baselineTotal: Number(baselineTotal.toFixed(2)),
        currentTotal: Number(currentTotal.toFixed(2)),
        totalDelta: Number((currentTotal - baselineTotal).toFixed(2)),
        deltaFromOnlyCurrent: Number(deltaFromOnlyCurrent.toFixed(2)),
        deltaFromMatchedKeys: Number(deltaFromMatched.toFixed(2)),
        topCustomerDelta,
        topOverstated,
        topMissingOrUnderstated,
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
