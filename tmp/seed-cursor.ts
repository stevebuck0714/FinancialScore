import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';
const CURSOR_FILE = path.resolve(process.cwd(), 'tmp/backfill-slledgers.cursor');
const OFFSET = Number(process.env.SEED_OFFSET || 80000); // safety: re-do last ~2K to be sure

async function main() {
  // Get the id at offset OFFSET (in id-asc order) - that's where we'll resume.
  const r = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
     ORDER BY id ASC
     OFFSET $2 LIMIT 1`,
    CID, OFFSET,
  );
  if (r.length === 0) {
    console.log(`No row at offset ${OFFSET}; not enough rows.`);
    return;
  }
  const cursor = r[0].id;
  // We seed cursor as the id of the row just BEFORE the resume point so the next page begins exactly at it.
  // Easier: write `cursor - 1`-equivalent by writing the id of the row at offset-1 (so id > that → starts at offset row).
  const rPrev = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
     ORDER BY id ASC
     OFFSET $2 LIMIT 1`,
    CID, Math.max(0, OFFSET - 1),
  );
  const seed = rPrev[0]?.id || '';
  fs.writeFileSync(CURSOR_FILE, seed);
  const remaining = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers' AND id > $2`,
    CID, seed,
  );
  console.log(`Seeded cursor file at ${CURSOR_FILE}`);
  console.log(`  cursor = ${seed}  (just before offset ${OFFSET})`);
  console.log(`  resume row id ≈ ${cursor}`);
  console.log(`  rows remaining after cursor: ${Number(remaining[0].cnt).toLocaleString()}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
