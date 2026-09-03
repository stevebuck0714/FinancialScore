import { randomUUID } from 'node:crypto';

import prisma from '@/lib/prisma';
import {
  syncInforM3OperationalData,
  transformInforM3RawRun,
} from '@/lib/infor-m3/operational-sync';

const [companyId, confirmation] = process.argv.slice(2);

if (!companyId || confirmation !== '--confirm') {
  throw new Error('Usage: tsx scripts/rebuild-infor-ar-history.ts <companyId> --confirm');
}

const syncRunId = `ar-history-rebuild-${randomUUID()}`;
const window = {
  startDate: new Date('2023-01-01T00:00:00.000Z'),
  endDate: new Date(),
  mode: 'backfill' as const,
};

async function main() {
  let continuation: {
    programOffset: number;
    programEndOffset?: number;
    requestOffset?: number;
    bookmark?: string | null;
  } | null = null;

  do {
    const syncResult = await syncInforM3OperationalData(companyId, 'daily', undefined, window, {
      arOnlyBackfill: true,
      fullArFactHistory: true,
      ingestOnly: true,
      syncRunId,
      programOffset: continuation?.programOffset,
      programEndOffset: continuation?.programEndOffset,
      requestOffset: continuation?.requestOffset,
      bookmark: continuation?.bookmark,
    });
    if (!syncResult.success) {
      throw new Error(`Historical AR ingest failed: ${syncResult.errors.join('; ')}`);
    }
    if (syncResult.hasMore && !syncResult.continuation) {
      throw new Error('Historical AR ingest returned more data without a continuation cursor.');
    }
    continuation = syncResult.hasMore ? syncResult.continuation : null;
  } while (continuation);

  const sourceRecordCount = await prisma.inforRawRecord.count({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      syncRunId,
      miProgram: 'SLARTRANS',
    },
  });
  if (sourceRecordCount === 0) {
    throw new Error('Historical AR ingest completed without SLARTRANS source records; no facts were replaced.');
  }

  // Source records are durably staged above. Replace only this company’s
  // derived AR ledgers so legacy rows cannot be mixed with the canonical run.
  await prisma.$transaction([
    prisma.aRTransactionFact.deleteMany({ where: { companyId } }),
    prisma.aRPaymentFact.deleteMany({ where: { companyId } }),
  ]);

  const transformResult = await transformInforM3RawRun({
    companyId,
    syncRunId,
    frequency: 'daily',
    batchSize: 5000,
  });
  if (!transformResult.success) {
    throw new Error(`Historical AR transform failed: ${transformResult.errors.join('; ')}`);
  }

  const latestBooksAr = await prisma.dailyFinancialSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    select: { snapshotDate: true, ar: true },
    orderBy: { snapshotDate: 'desc' },
  });
  const openArRows = await prisma.$queryRawUnsafe<Array<{ open_ar: number }>>(
    `WITH invoices AS (
       SELECT "customerId" AS customer_id, "invoiceNum" AS invoice_no
       FROM "ARTransactionFact"
       WHERE "companyId" = $1
         AND "arAcct" = '11100'
         AND "transType" = 'I'
         AND "eventDate" <= $2::date
       GROUP BY "customerId", "invoiceNum"
     ),
     invoice_balances AS (
       SELECT GREATEST(COALESCE(SUM(e."normalizedAmount"), 0), 0) AS open_amount
       FROM invoices i
       LEFT JOIN "ARTransactionFact" e
         ON e."companyId" = $1
        AND e."eventDate" <= $2::date
        AND COALESCE(e."applyToInvNum", e."invoiceNum") = i.invoice_no
        AND e."customerId" IS NOT DISTINCT FROM i.customer_id
       GROUP BY i.customer_id, i.invoice_no
     )
     SELECT COALESCE(SUM(open_amount), 0)::double precision AS open_ar
     FROM invoice_balances`,
    companyId,
    latestBooksAr?.snapshotDate.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const detailAr = Number(openArRows[0]?.open_ar || 0);
  const booksAr = Number(latestBooksAr?.ar || 0);

  console.log(
    JSON.stringify(
      {
        companyId,
        syncRunId,
        sourceRecordCount,
        transformResult,
        booksArAsOf: latestBooksAr?.snapshotDate.toISOString().slice(0, 10) ?? null,
        booksAr,
        reconstructedOpenAr: detailAr,
        difference: booksAr - detailAr,
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
