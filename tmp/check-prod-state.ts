import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';
const CURSOR_FILE = path.resolve(process.cwd(), 'tmp/backfill-slledgers.cursor');

async function main() {
  const dbInfo = await prisma.$queryRawUnsafe<Array<{ db: string; host: string }>>(
    `SELECT current_database() AS db, inet_server_addr()::text AS host`,
  );
  console.log('DB:', dbInfo[0]);

  const co = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM "Company" WHERE id = $1`, CID,
  );
  console.log('Company:', co[0]);

  const rawCount = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord" WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'`, CID,
  );
  console.log(`InforRawRecord SLLedgers rows for prod company: ${Number(rawCount[0].cnt).toLocaleString()}`);

  const factBySource = await prisma.$queryRawUnsafe<Array<{ sourceProgram: string | null; cnt: bigint }>>(
    `SELECT "sourceProgram", COUNT(*)::bigint AS cnt
     FROM "GLTransactionFact"
     WHERE "companyId" = $1
     GROUP BY "sourceProgram" ORDER BY cnt DESC`, CID,
  );
  console.log('GLTransactionFact by sourceProgram (all accounts):');
  for (const r of factBySource) {
    console.log(`  ${String(r.sourceProgram || '(null)').padEnd(20)} ${Number(r.cnt).toLocaleString().padStart(10)}`);
  }

  const fact30100 = await prisma.$queryRawUnsafe<Array<{ sourceProgram: string | null; cnt: bigint }>>(
    `SELECT "sourceProgram", COUNT(*)::bigint AS cnt
     FROM "GLTransactionFact"
     WHERE "companyId" = $1 AND "accountId" = '30100'
     GROUP BY "sourceProgram" ORDER BY cnt DESC`, CID,
  );
  console.log('GLTransactionFact for account 30100 by sourceProgram:');
  for (const r of fact30100) {
    console.log(`  ${String(r.sourceProgram || '(null)').padEnd(20)} ${Number(r.cnt).toLocaleString().padStart(10)}`);
  }

  // What's the highest InforRawRecord id we'd have already covered?
  if (fs.existsSync(CURSOR_FILE)) {
    const cursor = fs.readFileSync(CURSOR_FILE, 'utf8').trim();
    console.log(`Cursor file present: ${cursor || '(empty)'}`);
    if (cursor) {
      const ahead = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
        `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord"
         WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers' AND id <= $2`,
        CID, cursor,
      );
      const remaining = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
        `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord"
         WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers' AND id > $2`,
        CID, cursor,
      );
      console.log(`  Raw rows already covered by cursor: ${Number(ahead[0].cnt).toLocaleString()}`);
      console.log(`  Raw rows remaining after cursor:    ${Number(remaining[0].cnt).toLocaleString()}`);
    }
  } else {
    console.log('Cursor file: (none)');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
