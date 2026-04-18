import { syncInforM3OperationalData } from '../lib/infor-m3/operational-sync';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const startDate = new Date('2026-03-29T00:00:00.000Z');
const endDate = new Date('2026-04-14T23:59:59.999Z');

async function main() {
  console.log(`Backfilling order line snapshots for ${startDate.toISOString()} → ${endDate.toISOString()}`);
  console.log(`Company: ${companyId}`);
  console.log(`Mode: salesOnly (SLCOHDRS + SLCOS + SLCOITEMS only)\n`);

  let continuation: any = null;
  let batch = 0;
  let totalRecords = 0;

  const syncWindow = { startDate, endDate, mode: 'daily_overlap' as const };

  // First call
  batch++;
  console.log(`[Batch ${batch}] Starting...`);
  let result = await syncInforM3OperationalData(companyId, 'daily', undefined, syncWindow, {
    salesOnly: true,
  });
  totalRecords += result.recordsCreated;
  console.log(`[Batch ${batch}] records=${result.recordsCreated} hasMore=${result.hasMore} errors=${(result.errors || []).length}`);
  if (result.errors?.length) console.log(`  errors: ${result.errors.join(' | ')}`);

  // Continuation loop
  while (result.hasMore && result.continuation) {
    batch++;
    console.log(`[Batch ${batch}] Continuing from programOffset=${result.continuation.programOffset}...`);
    result = await syncInforM3OperationalData(companyId, 'daily', undefined, syncWindow, {
      salesOnly: true,
      programOffset: result.continuation.programOffset,
      requestOffset: result.continuation.requestOffset,
      bookmark: result.continuation.bookmark,
    });
    totalRecords += result.recordsCreated;
    console.log(`[Batch ${batch}] records=${result.recordsCreated} hasMore=${result.hasMore} errors=${(result.errors || []).length}`);
    if (result.errors?.length) console.log(`  errors: ${result.errors.join(' | ')}`);

    if (batch > 100) {
      console.log('Safety limit reached (100 batches). Stopping.');
      break;
    }
  }

  console.log(`\nDone. Total batches: ${batch}, Total records created: ${totalRecords}`);
  if (!result.hasMore) {
    console.log('All programs processed successfully.');
  } else {
    console.log('WARNING: hasMore is still true - sync did not fully complete.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
