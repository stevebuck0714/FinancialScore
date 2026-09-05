import { randomUUID } from 'node:crypto';

import prisma from '@/lib/prisma';
import {
  syncInforM3OperationalData,
  transformInforM3RawRun,
} from '@/lib/infor-m3/operational-sync';

/**
 * Re-ingests AP source records and rebuilds the payment side of the AP ledger.
 *
 * Payments were previously booked at InvAmt (the voucher's face value) instead
 * of AmtPaid, so a voucher settled in several installments was credited once
 * per installment at full value. Correcting the stored rows needs a delete:
 * saveAPTransactionFacts writes with skipDuplicates and will not overwrite.
 *
 * The delete is deliberately narrow. SLVchHdrs returns voucher history from
 * 2023-06-01 while SLAptrxps only returns a trailing window, so clearing every
 * AP fact would restore the full voucher population against a fraction of the
 * payments and leave AP overstated by years of settled bills. Only payments
 * inside the window that is actually re-ingested are removed; vouchers and
 * older history are left intact.
 */

const DEFAULT_LOOKBACK_DAYS = 150;

const args = process.argv.slice(2);
const companyId = args[0];
const confirmed = args.includes('--confirm');
const siteArg = args.find((a) => a.startsWith('--site='))?.split('=')[1]?.trim() || undefined;
const lookbackArg = Number(args.find((a) => a.startsWith('--lookback-days='))?.split('=')[1]);
const lookbackDays =
  Number.isFinite(lookbackArg) && lookbackArg > 0 ? Math.floor(lookbackArg) : DEFAULT_LOOKBACK_DAYS;

if (!companyId || !confirmed) {
  throw new Error(
    'Usage: tsx scripts/rebuild-infor-ap-history.ts <companyId> --confirm [--site=LYN] [--lookback-days=150]'
  );
}

const endDate = new Date();
const cutoff = new Date(
  Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate() - lookbackDays
  )
);
const syncRunId = `ap-history-rebuild-${randomUUID()}`;
const window = {
  startDate: cutoff,
  endDate,
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
    const syncResult = await syncInforM3OperationalData(companyId, 'daily', siteArg, window, {
      apOnlyBackfill: true,
      arOnlyBackfill: false,
      ingestOnly: true,
      syncRunId,
      programOffset: continuation?.programOffset,
      programEndOffset: continuation?.programEndOffset,
      requestOffset: continuation?.requestOffset,
      bookmark: continuation?.bookmark,
    });
    if (!syncResult.success) {
      throw new Error(`Historical AP ingest failed: ${syncResult.errors.join('; ')}`);
    }
    if (syncResult.hasMore && !syncResult.continuation) {
      throw new Error('Historical AP ingest returned more data without a continuation cursor.');
    }
    continuation = syncResult.hasMore ? syncResult.continuation : null;
  } while (continuation);

  const sourceRecordCount = await prisma.inforRawRecord.count({
    where: {
      companyId,
      platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
      syncRunId,
      miProgram: { in: ['SLAPTRXPS', 'SLAptrxps'] },
    },
  });
  if (sourceRecordCount === 0) {
    throw new Error(
      'Historical AP ingest completed without SLAPTRXPS source records; no facts were replaced. ' +
        'Check the CSI filter — this IDO rejects a Site predicate with IllegalFilterException.'
    );
  }

  // Source records are staged above. Replace only the payment rows the replay
  // will rewrite, so vouchers and pre-window history survive.
  const [deletedPaymentFacts, deletedPaymentEvents] = await prisma.$transaction([
    prisma.aPPaymentFact.deleteMany({
      where: { companyId, paymentDate: { gte: cutoff } },
    }),
    prisma.aPTransactionFact.deleteMany({
      where: { companyId, transType: 'P', eventDate: { gte: cutoff } },
    }),
  ]);

  const transformResult = await transformInforM3RawRun({
    companyId,
    syncRunId,
    frequency: 'daily',
    batchSize: 5000,
  });
  if (!transformResult.success) {
    throw new Error(`Historical AP transform failed: ${transformResult.errors.join('; ')}`);
  }

  const latestBooksAp = await prisma.dailyFinancialSnapshot.findFirst({
    where: { companyId, frequency: 'daily' },
    select: { snapshotDate: true, ap: true },
    orderBy: { snapshotDate: 'desc' },
  });
  const asOfIso =
    latestBooksAp?.snapshotDate.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const openApRows = await prisma.$queryRawUnsafe<
    Array<{ open_ap: number; open_vouchers: number }>
  >(
    `WITH voucher_net AS (
       SELECT "voucher", SUM("normalizedAmount") AS net
       FROM "APTransactionFact"
       WHERE "companyId" = $1
         AND "eventDate" <= $2::date
       GROUP BY "voucher"
     )
     SELECT COALESCE(SUM(GREATEST(net, 0)), 0)::double precision AS open_ap,
            COUNT(*) FILTER (WHERE net > 0.005)::int            AS open_vouchers
     FROM voucher_net`,
    companyId,
    asOfIso
  );

  const detailAp = Number(openApRows[0]?.open_ap || 0);
  const booksAp = Number(latestBooksAp?.ap || 0);

  console.log(
    JSON.stringify(
      {
        companyId,
        syncRunId,
        lookbackDays,
        windowStart: cutoff.toISOString().slice(0, 10),
        sourceRecordCount,
        deletedPaymentFacts: deletedPaymentFacts.count,
        deletedPaymentEvents: deletedPaymentEvents.count,
        transformResult,
        booksApAsOf: asOfIso,
        booksAp,
        reconstructedOpenAp: detailAp,
        difference: booksAp - detailAp,
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
