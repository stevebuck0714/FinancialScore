/**
 * Verify the dedup migration:
 *   1. Partial unique index exists.
 *   2. sourceRecordId is now backfilled from _ItemId for all current rows.
 *   3. A simulated re-insert of an existing row's payload silently skips.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false });
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
const prisma = new PrismaClient();

// Auto-detected from the database below — was hardcoded to dev companyId
// which doesn't exist on prod and caused a FK error.
let COMPANY = process.env.COMPANY_ID || '';

function fmt(n: number | bigint): string { return Number(n).toLocaleString(); }

async function main() {
  const url = process.env.DATABASE_URL || '';
  const dbHost = url.split('@')[1]?.split('/')[0] || '';
  console.log('DB:', dbHost);
  if (dbHost.includes('-pooler')) {
    console.error(`Refusing to run against pooler endpoint (${dbHost}). Use the DIRECT endpoint.`);
    process.exit(1);
  }
  if (!dbHost) {
    console.error('DATABASE_URL not set or unparsable');
    process.exit(1);
  }
  if (!COMPANY) {
    const auto = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "companyId" FROM "InforRawRecord" GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1`
    );
    COMPANY = auto[0]?.companyId || '';
    if (!COMPANY) { console.error('No companyId found in InforRawRecord'); process.exit(1); }
    console.log(`auto-detected companyId: ${COMPANY}`);
  }

  console.log('\n1. Partial unique index in pg_indexes:');
  const idx = await prisma.$queryRawUnsafe<any[]>(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE tablename = 'InforRawRecord'
        AND indexname = 'InforRawRecord_dedup_by_itemid_uniq'`
  );
  for (const r of idx) console.log(' ', r);
  if (idx.length === 0) console.log('  MISSING');

  console.log('\n2. sourceRecordId backfill coverage:');
  const cov = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram",
            COUNT(*)::int AS rows,
            COUNT(*) FILTER (WHERE "sourceRecordId" IS NOT NULL)::int AS with_srcid,
            COUNT(*) FILTER (WHERE "sourceRecordId" = LEFT(payload->>'_ItemId',255))::int AS srcid_eq_itemid
       FROM "InforRawRecord"
      GROUP BY 1 ORDER BY 2 DESC`
  );
  for (const r of cov) console.log(' ', r);

  console.log('\n3. Simulated re-insert dedup test:');
  const sample = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "batchId", "miProgram", "sourceRecordId", "sourceRecordHash",
            payload, "businessDate", module, transaction
       FROM "InforRawRecord"
      WHERE "miProgram" = 'SLArtrans' AND "sourceRecordId" IS NOT NULL
      LIMIT 3`
  );
  if (sample.length === 0) {
    console.log('  no SLArtrans rows to test against');
    return;
  }
  const beforeCount = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "InforRawRecord" WHERE "miProgram"='SLArtrans'`
  );
  console.log(`  pre-test SLArtrans row count: ${fmt(beforeCount[0].n)}`);

  // Simulate a fresh sync trying to re-ingest the same source rows.
  // This mirrors the writer at operational-sync.ts:9097-9119.
  const fakeRows = sample.map((s) => {
    const payloadJson = JSON.stringify(s.payload);
    return {
      id: randomUUID(),
      batchId: s.batchId, // reuse a real batch id (FK constraint)
      companyId: COMPANY,
      platform: 'INFOR_M3',
      syncRunId: 'fake-resync-' + randomUUID(),  // NEW syncRunId — this is what previously caused dups
      businessDate: s.businessDate,
      module: s.module,
      miProgram: s.miProgram,
      transaction: s.transaction,
      sourceRecordId: s.sourceRecordId,
      sourceRecordHash: createHash('sha256').update(payloadJson).digest('hex'),
      payload: s.payload as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    };
  });

  const result = await (prisma as any).inforRawRecord.createMany({
    data: fakeRows,
    skipDuplicates: true,
  });
  console.log(`  createMany skipDuplicates result: ${JSON.stringify(result)}`);

  const afterCount = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "InforRawRecord" WHERE "miProgram"='SLArtrans'`
  );
  console.log(`  post-test SLArtrans row count: ${fmt(afterCount[0].n)}`);
  const delta = afterCount[0].n - beforeCount[0].n;
  if (delta === 0) {
    console.log(`  PASS — re-insert of ${sample.length} existing rows added 0 new rows.`);
  } else {
    console.log(`  FAIL — ${delta} new rows were added (expected 0).`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
