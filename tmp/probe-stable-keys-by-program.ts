/**
 * What stable identifier is on each miProgram's payload?
 * Counts which payloads carry _ItemId vs RowPointer vs neither.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
function fmt(n: number | bigint): string { return Number(n).toLocaleString(); }
async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "miProgram",
            COUNT(*)::bigint                                        AS total,
            COUNT(*) FILTER (WHERE payload ? '_ItemId')::bigint     AS has_itemid,
            COUNT(*) FILTER (WHERE payload ? 'RowPointer')::bigint  AS has_rowptr,
            COUNT(*) FILTER (WHERE NOT (payload ? '_ItemId') AND NOT (payload ? 'RowPointer'))::bigint AS has_neither,
            COUNT(DISTINCT "sourceRecordHash")::bigint              AS distinct_hashes,
            COUNT(DISTINCT payload->>'_ItemId')::bigint             AS distinct_itemids,
            COUNT(DISTINCT payload->>'RowPointer')::bigint          AS distinct_rowptrs
       FROM "InforRawRecord"
      GROUP BY 1 ORDER BY 2 DESC`
  );
  console.log(`${'program'.padEnd(20)}  ${'total'.padStart(11)}  ${'_ItemId'.padStart(11)}  ${'RowPointer'.padStart(11)}  ${'neither'.padStart(8)}  ${'dHash'.padStart(8)}  ${'dItem'.padStart(8)}  ${'dRPtr'.padStart(8)}`);
  for (const r of rows) {
    console.log(
      `${String(r.miProgram).padEnd(20)}  ${fmt(r.total).padStart(11)}  ${fmt(r.has_itemid).padStart(11)}  ${fmt(r.has_rowptr).padStart(11)}  ${fmt(r.has_neither).padStart(8)}  ${fmt(r.distinct_hashes).padStart(8)}  ${fmt(r.distinct_itemids).padStart(8)}  ${fmt(r.distinct_rowptrs).padStart(8)}`
    );
  }
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
