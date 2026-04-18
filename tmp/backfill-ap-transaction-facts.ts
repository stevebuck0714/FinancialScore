/**
 * Backfill APTransactionFact from existing InforRawRecord entries for SLVCHHDRS.
 *
 * Usage:
 *   npx tsx tmp/backfill-ap-transaction-facts.ts [companyId]
 *
 * If companyId is omitted, backfills the dev company.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_IDS = [
  'cmmnwyofv000fqhp4z8lebbny', // dev
  'cmmcp278j0002kz0439rlixdj', // prod
];

const AP_TYPE_SIGN: Record<string, number> = {
  v: 1,   // voucher (invoice) → AP increases
  d: 1,   // debit memo → AP increases
  c: -1,  // credit memo → AP decreases
  a: 1,   // adjustment → keep original sign
};

function parseCsiDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw === '0' || raw === 'null') return null;

  if (/^\d{8}$/.test(raw)) {
    return new Date(Date.UTC(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8)));
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] || '0').padEnd(3, '0')));
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function backfillCompany(companyId: string) {
  console.log(`\n=== Backfilling APTransactionFact for company ${companyId} ===`);

  // Clear existing data (fresh backfill)
  const deleted = await prisma.aPTransactionFact.deleteMany({ where: { companyId } });
  console.log(`  Cleared ${deleted.count} existing rows`);

  const BATCH = 5000;
  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalInserted = 0;
  const globalSeen = new Set<string>();

  while (true) {
    const rawRecords = await prisma.inforRawRecord.findMany({
      where: {
        companyId,
        miProgram: { in: ['SLVchHdrs', 'SLVCHHDRS', 'SlVchHdrs', 'slvchhdrs'] },
      },
      select: { id: true, payload: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (rawRecords.length === 0) break;
    cursor = rawRecords[rawRecords.length - 1].id;

    const rows: Array<Record<string, any>> = [];

    for (const raw of rawRecords) {
      const record = raw.payload as Record<string, any>;
      const voucher = String(record.Voucher || record.voucher || '').trim();
      if (!voucher) continue;

      const rawType = String(record.Type || record.type || 'V').trim().toLowerCase();
      const transType = rawType || 'v';
      const sign = AP_TYPE_SIGN[transType] ?? 1;
      const vouchSeq = String(record.VouchSeq || record.vouchSeq || '0').trim();
      const dedupKey = `${voucher}|${vouchSeq}|${transType}`;
      if (globalSeen.has(dedupKey)) continue;
      globalSeen.add(dedupKey);

      const invAmtStr = String(record.InvAmt || record.invAmt || '0');
      const invAmt = parseFloat(invAmtStr);
      if (!Number.isFinite(invAmt) || invAmt === 0) continue;

      const inWorkflow = String(record.InWorkflow || record.inWorkflow || '0');
      if (inWorkflow === '1') continue;

      const distDateRaw = parseCsiDate(record.DistDate || record.distDate);
      const invDateRaw = parseCsiDate(record.InvDate || record.invDate);
      const resolvedDate = distDateRaw || invDateRaw;
      if (!resolvedDate || resolvedDate.getTime() < Date.UTC(2023, 0, 1)) continue;
      const eventDate = startOfUtcDay(resolvedDate);

      rows.push({
        companyId,
        eventDate,
        apAcct: String(record.ApAcct || record.apAcct || '').trim() || null,
        vendorId: String(record.VendNum || record.vendNum || '').trim() || null,
        vendorName: String(record.VadName || record.vadName || '').trim() || null,
        voucher,
        vouchSeq,
        invoiceNum: String(record.InvNum || record.invNum || '').trim() || null,
        invoiceDate: invDateRaw ? startOfUtcDay(invDateRaw) : null,
        distDate: distDateRaw ? startOfUtcDay(distDateRaw) : null,
        transType: transType.toUpperCase(),
        invoiceAmount: invAmt,
        normalizedAmount: sign * invAmt,
        exchangeRate: parseFloat(String(record.ExchRate || '1')) || null,
        termsCode: String(record.TermsCode || '').trim() || null,
        sourcePlatform: 'INFOR_CSI',
      });
    }

    totalProcessed += rawRecords.length;

    if (rows.length > 0) {
      const WRITE_BATCH = 500;
      for (let i = 0; i < rows.length; i += WRITE_BATCH) {
        const batch = rows.slice(i, i + WRITE_BATCH);
        const result = await prisma.aPTransactionFact.createMany({
          data: batch,
          skipDuplicates: true,
        });
        totalInserted += result.count;
      }
    }

    if (totalProcessed % 25000 === 0) {
      console.log(`  Processed ${totalProcessed} raw records, inserted ${totalInserted} AP facts...`);
    }
  }

  console.log(`  Done: ${totalProcessed} raw records processed, ${totalInserted} AP facts inserted.`);

  const count = await prisma.aPTransactionFact.count({ where: { companyId } });
  console.log(`  Total APTransactionFact rows for company: ${count}`);

  // Validate dates
  const dateRange = await prisma.$queryRawUnsafe(`
    SELECT MIN("eventDate")::date as earliest, MAX("eventDate")::date as latest,
           COUNT(CASE WHEN "apAcct" IS NOT NULL THEN 1 END)::int as with_acct,
           COUNT(CASE WHEN "apAcct" IS NULL THEN 1 END)::int as without_acct
    FROM "APTransactionFact" WHERE "companyId" = $1
  `, companyId);
  console.log('  Date range & account coverage:');
  console.table(dateRange);

  const monthly = await prisma.$queryRawUnsafe(`
    SELECT date_trunc('year', "eventDate")::date as year,
           COUNT(*)::int as cnt,
           SUM("normalizedAmount") as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1 AND "apAcct" = '30100'
    GROUP BY year ORDER BY year
  `, companyId);
  console.log('  Yearly totals for 30100:');
  console.table(monthly);
}

async function main() {
  const targetCompany = process.argv[2];
  const companies = targetCompany ? [targetCompany] : [COMPANY_IDS[0]];

  for (const companyId of companies) {
    try {
      await backfillCompany(companyId);
    } catch (err) {
      console.error(`Error backfilling ${companyId}:`, err);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
