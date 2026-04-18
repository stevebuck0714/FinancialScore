/**
 * Backfill GLTransactionFact from existing SLLedgers raw records in InforRawRecord.
 *
 * Improvements over v1:
 *   - Resumable via tmp/backfill-slledgers.cursor (id of last processed InforRawRecord).
 *   - Newline progress (no \r) so the terminal file always reflects current state.
 *   - Smaller cursor batches (500) and insert batches (250) to keep Neon happy.
 *   - Reconnects PrismaClient every RECONNECT_EVERY cursor pages to avoid pooler drift.
 *   - Per-page wall-clock + rolling rate so you can see progress and ETA.
 *   - Kill-safe: re-run picks up where it left off.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CID = process.env.BACKFILL_COMPANY_ID || 'cmmcp278j0002kz0439rlixdj';
const CURSOR_BATCH = Number(process.env.BACKFILL_CURSOR_BATCH || 500);
const INSERT_BATCH = Number(process.env.BACKFILL_INSERT_BATCH || 250);
const RECONNECT_EVERY = Number(process.env.BACKFILL_RECONNECT_EVERY || 25); // pages
const CURSOR_FILE = path.resolve(process.cwd(), 'tmp/backfill-slledgers.cursor');

let prisma = new PrismaClient();

function readCursor(): string {
  try {
    if (fs.existsSync(CURSOR_FILE)) return fs.readFileSync(CURSOR_FILE, 'utf8').trim();
  } catch {}
  return '';
}

function writeCursor(id: string) {
  try { fs.writeFileSync(CURSOR_FILE, id); } catch {}
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
}

function parseMaybeDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '0' || s === 'null') return null;
  const compactMatch = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const d = new Date(Date.UTC(+compactMatch[1], +compactMatch[2] - 1, +compactMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    if (v != null) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function extractSignedAmount(record: Record<string, unknown>): { signedAmount: number; debitAmount: number; creditAmount: number } {
  const debitAmount = pickNumber(record, ['DerDomAmountDebit', 'DomAmountDebit', 'Debit']);
  const creditAmount = pickNumber(record, ['DerDomAmountCredit', 'DomAmountCredit', 'Credit']);
  const domAmount = pickNumber(record, ['DomAmount', 'DerSumDomAmount']);
  if (Number.isFinite(domAmount) && domAmount !== 0) return { signedAmount: domAmount, debitAmount, creditAmount };
  if ((Number.isFinite(debitAmount) && debitAmount !== 0) || (Number.isFinite(creditAmount) && creditAmount !== 0)) {
    return { signedAmount: debitAmount - creditAmount, debitAmount, creditAmount };
  }
  return { signedAmount: 0, debitAmount: 0, creditAmount: 0 };
}

async function reconnect() {
  try { await prisma.$disconnect(); } catch {}
  prisma = new PrismaClient();
}

async function totalToProcess(): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*)::bigint AS cnt FROM "InforRawRecord" WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'`,
    CID,
  );
  return Number(r[0]?.cnt || 0);
}

async function main() {
  const startTs = Date.now();
  let cursorId = readCursor();
  const total = await totalToProcess();
  console.log(`[${ts()}] Backfill SLLedgers -> GLTransactionFact for company ${CID}`);
  console.log(`[${ts()}] Total SLLedgers raw rows: ${total.toLocaleString()}`);
  console.log(`[${ts()}] Resume cursor: ${cursorId || '(start)'}`);
  console.log(`[${ts()}] Cursor batch=${CURSOR_BATCH}, insert batch=${INSERT_BATCH}, reconnect every ${RECONNECT_EVERY} pages`);

  let totalProcessed = 0;
  let totalSkipped = 0;
  let pageNum = 0;

  while (true) {
    const pageStart = Date.now();
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; payload: any }>>(`
      SELECT id, payload FROM "InforRawRecord"
      WHERE "companyId" = $1
        AND "miProgram" = 'SLLedgers'
        ${cursorId ? `AND id > $2` : ''}
      ORDER BY id ASC
      LIMIT ${CURSOR_BATCH}
    `, ...(cursorId ? [CID, cursorId] : [CID]));

    if (rows.length === 0) break;
    pageNum++;

    const sqlRows: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const p = row.payload;
      if (!p || typeof p !== 'object') { totalSkipped++; continue; }

      const transDateRaw = parseMaybeDate(pickString(p, ['TransDate', 'transDate']));
      if (!transDateRaw) { totalSkipped++; continue; }
      const transDate = startOfUtcDay(transDateRaw);

      const accountId = pickString(p, ['Acct', 'AcctNum', 'Account']);
      if (!accountId) { totalSkipped++; continue; }

      const { signedAmount, debitAmount, creditAmount } = extractSignedAmount(p);
      if (!Number.isFinite(signedAmount) || signedAmount === 0) { totalSkipped++; continue; }

      const distDateRaw = parseMaybeDate(pickString(p, ['DistDate', 'distDate']));
      const controlPeriod = pickNumber(p, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod']);
      const controlYear = pickNumber(p, ['ControlYear', 'controlYear', 'FiscalYear']);
      const drCr = pickString(p, ['DrCr', 'drCr']);

      sqlRows.push({
        id: randomUUID(),
        companyId: CID,
        transDate: transDate.toISOString(),
        distDate: distDateRaw ? startOfUtcDay(distDateRaw).toISOString() : null,
        accountId,
        accountName: pickString(p, ['ChaDescription', 'ChtDescription', 'Description']) || null,
        accountType: null,
        accountCategory: null,
        signedAmount,
        debitAmount: Number.isFinite(debitAmount) && debitAmount !== 0 ? debitAmount : null,
        creditAmount: Number.isFinite(creditAmount) && creditAmount !== 0 ? creditAmount : null,
        drCr: drCr || null,
        transNum: pickString(p, ['TransNum', 'transNum']) || null,
        ref: pickString(p, ['Ref', 'ref']) || null,
        description: pickString(p, ['Description', 'description']) || '',
        site: pickString(p, ['Site', 'site']) || null,
        sourcePlatform: 'INFOR_M3',
        sourceProgram: 'SLLedgers',
        sourceTransaction: 'BACKFILL',
        controlPeriod: Number.isFinite(controlPeriod) && controlPeriod > 0 ? controlPeriod : null,
        controlYear: Number.isFinite(controlYear) && controlYear > 0 ? controlYear : null,
        cono: null,
        divi: null,
      });
    }

    let inserted = 0;
    for (let i = 0; i < sqlRows.length; i += INSERT_BATCH) {
      const batch = sqlRows.slice(i, i + INSERT_BATCH);
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "GLTransactionFact" (
            "id", "companyId", "transDate", "distDate", "accountId", "accountName",
            "accountType", "accountCategory", "signedAmount", "debitAmount", "creditAmount",
            "drCr", "transNum", "ref", "description", "site",
            "sourcePlatform", "sourceProgram", "sourceTransaction",
            "controlPeriod", "controlYear", "cono", "divi"
          )
          SELECT
            x."id", x."companyId", x."transDate", x."distDate", x."accountId", x."accountName",
            x."accountType", x."accountCategory", x."signedAmount", x."debitAmount", x."creditAmount",
            x."drCr", x."transNum", x."ref", x."description", x."site",
            x."sourcePlatform", x."sourceProgram", x."sourceTransaction",
            x."controlPeriod", x."controlYear", x."cono", x."divi"
          FROM jsonb_to_recordset($1::jsonb) AS x(
            "id" text, "companyId" text, "transDate" timestamptz, "distDate" timestamptz,
            "accountId" text, "accountName" text, "accountType" text, "accountCategory" text,
            "signedAmount" double precision, "debitAmount" double precision, "creditAmount" double precision,
            "drCr" text, "transNum" text, "ref" text, "description" text, "site" text,
            "sourcePlatform" text, "sourceProgram" text, "sourceTransaction" text,
            "controlPeriod" integer, "controlYear" integer, "cono" text, "divi" text
          )
          ON CONFLICT ("companyId", "transDate", "accountId", "transNum", "ref", "description") DO NOTHING
        `, JSON.stringify(batch));
        inserted += batch.length;
      } catch (err) {
        console.error(`[${ts()}] insert batch failed (size=${batch.length}): ${err instanceof Error ? err.message : String(err)}`);
        // reconnect and retry once
        await reconnect();
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO "GLTransactionFact" (
              "id", "companyId", "transDate", "distDate", "accountId", "accountName",
              "accountType", "accountCategory", "signedAmount", "debitAmount", "creditAmount",
              "drCr", "transNum", "ref", "description", "site",
              "sourcePlatform", "sourceProgram", "sourceTransaction",
              "controlPeriod", "controlYear", "cono", "divi"
            )
            SELECT
              x."id", x."companyId", x."transDate", x."distDate", x."accountId", x."accountName",
              x."accountType", x."accountCategory", x."signedAmount", x."debitAmount", x."creditAmount",
              x."drCr", x."transNum", x."ref", x."description", x."site",
              x."sourcePlatform", x."sourceProgram", x."sourceTransaction",
              x."controlPeriod", x."controlYear", x."cono", x."divi"
            FROM jsonb_to_recordset($1::jsonb) AS x(
              "id" text, "companyId" text, "transDate" timestamptz, "distDate" timestamptz,
              "accountId" text, "accountName" text, "accountType" text, "accountCategory" text,
              "signedAmount" double precision, "debitAmount" double precision, "creditAmount" double precision,
              "drCr" text, "transNum" text, "ref" text, "description" text, "site" text,
              "sourcePlatform" text, "sourceProgram" text, "sourceTransaction" text,
              "controlPeriod" integer, "controlYear" integer, "cono" text, "divi" text
            )
            ON CONFLICT ("companyId", "transDate", "accountId", "transNum", "ref", "description") DO NOTHING
          `, JSON.stringify(batch));
          inserted += batch.length;
        } catch (err2) {
          console.error(`[${ts()}] retry also failed, abandoning page; cursor preserved`);
          throw err2;
        }
      }
    }

    cursorId = rows[rows.length - 1].id;
    writeCursor(cursorId);
    totalProcessed += rows.length;

    const pageMs = Date.now() - pageStart;
    const elapsedSec = Math.max(1, Math.round((Date.now() - startTs) / 1000));
    const rate = Math.round(totalProcessed / elapsedSec);
    const etaSec = rate > 0 ? Math.round((total - totalProcessed - 0) / rate) : -1;
    const pctRaw = total > 0 ? ((totalProcessed / total) * 100).toFixed(1) : '?';
    console.log(`[${ts()}] page ${pageNum}: read ${rows.length}, mapped ${sqlRows.length}, inserted ${inserted}, skipped(total) ${totalSkipped} | cursor=${cursorId.slice(0, 8)}… | ${pageMs}ms | ${totalProcessed.toLocaleString()} processed (${pctRaw}%, ${rate}/s, ETA ${etaSec >= 0 ? Math.round(etaSec / 60) + 'min' : '?'})`);

    if (pageNum % RECONNECT_EVERY === 0) {
      console.log(`[${ts()}] reconnecting Prisma client (every ${RECONNECT_EVERY} pages)...`);
      await reconnect();
    }
  }

  console.log(`\n[${ts()}] Done. Processed ${totalProcessed.toLocaleString()} SLLedgers raw records, skipped ${totalSkipped}.`);

  const counts = await prisma.$queryRawUnsafe<Array<{ sourceProgram: string | null; cnt: bigint }>>(`
    SELECT "sourceProgram", COUNT(*) as cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
    GROUP BY "sourceProgram"
    ORDER BY cnt DESC
  `, CID);
  console.log('\nGLTransactionFact by sourceProgram:');
  for (const c of counts) {
    console.log(`  ${String(c.sourceProgram || '(null)').padEnd(20)} ${String(c.cnt).padStart(8)} rows`);
  }

  const counts30100 = await prisma.$queryRawUnsafe<Array<{ sourceProgram: string | null; cnt: bigint }>>(`
    SELECT "sourceProgram", COUNT(*) as cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
    GROUP BY "sourceProgram"
    ORDER BY cnt DESC
  `, CID);
  console.log('\nGLTransactionFact for account 30100 by source:');
  for (const c of counts30100) {
    console.log(`  ${String(c.sourceProgram || '(null)').padEnd(20)} ${String(c.cnt).padStart(8)} rows`);
  }
}

main()
  .catch((err) => {
    console.error(`[${ts()}] FATAL`, err);
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch {}
  });
