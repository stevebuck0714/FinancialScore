import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type FilledOrderLineInput = {
  companyId: string;
  customerId: string | null;
  customerName: string;
  orderId: string;
  lineId: string;
  orderDate: Date | null;
  filledAsOf: Date;
  itemId: string | null;
  itemName: string | null;
  sku: string | null;
  customerPn?: string | null;
  qtyOrdered: number;
  qtyShipped?: number | null;
  qtyInvoiced: number;
  unitPrice: number;
  contractValue: number;
  invoicedAmount: number;
  remainingAmount: number;
  unbilledAccrual: number;
  sourcePlatform: string | null;
  sourceProgram: string | null;
  sourceTransaction: string | null;
  cono: string | null;
  divi: string | null;
};

export type OpenBookWindow = {
  start: Date;
  end: Date;
};

let ensureTablesOnce: Promise<void> | null = null;

export async function ensureCustomerOrderLineFilledTables(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CustomerOrderLineFilled" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "customerId" TEXT,
          "customerName" TEXT NOT NULL,
          "orderId" TEXT NOT NULL,
          "lineId" TEXT NOT NULL,
          "orderDate" TIMESTAMP(3),
          "filledAsOf" TIMESTAMP(3) NOT NULL,
          "itemId" TEXT,
          "itemName" TEXT,
          "sku" TEXT,
          "qtyOrdered" DOUBLE PRECISION NOT NULL,
          "qtyInvoiced" DOUBLE PRECISION NOT NULL,
          "unitPrice" DOUBLE PRECISION NOT NULL,
          "contractValue" DOUBLE PRECISION NOT NULL,
          "invoicedAmount" DOUBLE PRECISION NOT NULL,
          "remainingAmount" DOUBLE PRECISION NOT NULL,
          "unbilledAccrual" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
          "sourceProgram" TEXT,
          "sourceTransaction" TEXT,
          "cono" TEXT,
          "divi" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CustomerOrderLineFilled_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_order_line_customer_key"
          ON "CustomerOrderLineFilled"("companyId", "orderId", "lineId", "customerName")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_customer_orderDate_idx"
          ON "CustomerOrderLineFilled"("companyId", "customerId", "orderDate")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_filledAsOf_idx"
          ON "CustomerOrderLineFilled"("companyId", "filledAsOf")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_orderDate_idx"
          ON "CustomerOrderLineFilled"("companyId", "orderDate")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CustomerOrderLineFilledBackfill" (
          "companyId" TEXT NOT NULL,
          "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CustomerOrderLineFilledBackfill_pkey" PRIMARY KEY ("companyId")
        )
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineFilled" ADD COLUMN IF NOT EXISTS "customerPn" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineSnapshot" ADD COLUMN IF NOT EXISTS "customerPn" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineFilled" ADD COLUMN IF NOT EXISTS "qtyShipped" DOUBLE PRECISION
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineSnapshot" ADD COLUMN IF NOT EXISTS "qtyShipped" DOUBLE PRECISION
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function snapshotDayRangeSql(alias: string, start: Date, end: Date): Prisma.Sql {
  const col = Prisma.raw(`"${alias}"."snapshotDate"`);
  return Prisma.sql`${col} >= ${start} AND ${col} < ${end}`;
}

function sameCustomerSql(leftAlias: string, rightAlias: string): Prisma.Sql {
  const leftId = Prisma.raw(`"${leftAlias}"."customerId"`);
  const rightId = Prisma.raw(`"${rightAlias}"."customerId"`);
  const leftName = Prisma.raw(`"${leftAlias}"."customerName"`);
  const rightName = Prisma.raw(`"${rightAlias}"."customerName"`);
  return Prisma.sql`(
    (
      NULLIF(TRIM(COALESCE(${leftId}, '')), '') IS NOT NULL
      AND NULLIF(TRIM(COALESCE(${leftId}, '')), '') = NULLIF(TRIM(COALESCE(${rightId}, '')), '')
    )
    OR ${leftName} = ${rightName}
  )`;
}

export async function resolveOpenBookWindow(companyId: string): Promise<OpenBookWindow | null> {
  const rows = await prisma.$queryRaw<Array<{ start: Date; end: Date; n: number }>>(Prisma.sql`
    WITH day_counts AS (
      SELECT DATE_TRUNC('day', "snapshotDate") AS day_start, COUNT(*)::int AS n
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND "frequency" = 'daily'
      GROUP BY 1
    ),
    latest AS (
      SELECT MAX(day_start) AS max_day FROM day_counts
    ),
    recent AS (
      SELECT d.day_start, d.n
      FROM day_counts d
      CROSS JOIN latest
      WHERE d.day_start >= latest.max_day - INTERVAL '21 days'
    ),
    ranked AS (
      SELECT day_start, n, MAX(n) OVER () AS max_n
      FROM recent
    )
    SELECT day_start AS start, (day_start + INTERVAL '1 day') AS end, n
    FROM ranked
    WHERE n >= GREATEST((max_n * 0.5)::int, 1)
    ORDER BY day_start DESC
    LIMIT 1
  `);
  const start = rows[0]?.start;
  const end = rows[0]?.end;
  if (!start || !end) return null;
  return { start, end };
}

async function snapshotRowCount(companyId: string, start: Date, end: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" >= ${start}
      AND "snapshotDate" < ${end}
  `);
  return Number(rows[0]?.n || 0);
}

async function insertFilledLines(lines: FilledOrderLineInput[]): Promise<number> {
  if (lines.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < lines.length; i += 400) {
    const chunk = lines.slice(i, i + 400);
    const values = chunk.map((row) => Prisma.sql`(
      ${randomUUID()},
      ${row.companyId},
      ${row.customerId},
      ${row.customerName},
      ${row.orderId},
      ${row.lineId},
      ${row.orderDate},
      ${row.filledAsOf},
      ${row.itemId},
      ${row.itemName},
      ${row.sku},
      ${row.customerPn || null},
      ${Number(row.qtyOrdered || 0)},
      ${row.qtyShipped == null ? null : Number(row.qtyShipped)},
      ${Number(row.qtyInvoiced || 0)},
      ${Number(row.unitPrice || 0)},
      ${Number(row.contractValue || 0)},
      ${Number(row.invoicedAmount || 0)},
      ${Number(row.remainingAmount || 0)},
      ${Number(row.unbilledAccrual || 0)},
      ${row.sourcePlatform},
      ${row.sourceProgram},
      ${row.sourceTransaction},
      ${row.cono},
      ${row.divi},
      NOW()
    )`);
    const result = await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "CustomerOrderLineFilled" (
        "id", "companyId", "customerId", "customerName", "orderId", "lineId",
        "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn",
        "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
        "invoicedAmount", "remainingAmount", "unbilledAccrual",
        "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
    `);
    inserted += Number(result || 0);
  }
  return inserted;
}

async function backfillFromSnapshots(companyId: string, openBook: OpenBookWindow): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn",
      "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
      "invoicedAmount", "remainingAmount", "unbilledAccrual",
      "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
    )
    SELECT
      gen_random_uuid()::text,
      last."companyId",
      last."customerId",
      last."customerName",
      last."orderId",
      last."lineId",
      last."orderDate",
      last."snapshotDate",
      last."itemId",
      last."itemName",
      last."sku",
      last."customerPn",
      last."qtyOrdered",
      last."qtyShipped",
      last."qtyInvoiced",
      last."unitPrice",
      last."contractValue",
      last."invoicedAmount",
      last."remainingAmount",
      last."unbilledAccrual",
      last."sourcePlatform",
      last."sourceProgram",
      last."sourceTransaction",
      last."cono",
      last."divi",
      NOW()
    FROM (
      SELECT DISTINCT ON (s."orderId", s."lineId", s."customerName")
        s."companyId",
        s."customerId",
        s."customerName",
        s."orderId",
        s."lineId",
        s."orderDate",
        s."snapshotDate",
        s."itemId",
        s."itemName",
        s."sku",
        s."customerPn",
        s."qtyOrdered",
        s."qtyShipped",
        s."qtyInvoiced",
        s."unitPrice",
        s."contractValue",
        s."invoicedAmount",
        s."remainingAmount",
        s."unbilledAccrual",
        s."sourcePlatform",
        s."sourceProgram",
        s."sourceTransaction",
        s."cono",
        s."divi"
      FROM "CustomerOrderLineSnapshot" s
      WHERE s."companyId" = ${companyId}
        AND s."frequency" = 'daily'
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineSnapshot" o
          WHERE o."companyId" = ${companyId}
            AND o."frequency" = 'daily'
            AND ${snapshotDayRangeSql('o', openBook.start, openBook.end)}
            AND o."orderId" = s."orderId"
            AND o."lineId" = s."lineId"
            AND ${sameCustomerSql('s', 'o')}
        )
      ORDER BY s."orderId", s."lineId", s."customerName", s."snapshotDate" DESC
    ) last
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
  `);
}

async function captureDisappearedFromPriorDay(
  companyId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<number> {
  const priorRows = await prisma.$queryRaw<Array<{ start: Date }>>(Prisma.sql`
    SELECT DATE_TRUNC('day', MAX("snapshotDate")) AS start
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" < ${todayStart}
  `);
  const priorStart = priorRows[0]?.start;
  if (!priorStart) return 0;
  const priorEnd = addUtcDays(priorStart, 1);
  const priorCount = await snapshotRowCount(companyId, priorStart, priorEnd);
  const todayCount = await snapshotRowCount(companyId, todayStart, todayEnd);
  if (priorCount <= 0 || todayCount < Math.max(1, Math.floor(priorCount * 0.5))) {
    return 0;
  }

  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn",
      "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
      "invoicedAmount", "remainingAmount", "unbilledAccrual",
      "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
    )
    SELECT
      gen_random_uuid()::text,
      s."companyId",
      s."customerId",
      s."customerName",
      s."orderId",
      s."lineId",
      s."orderDate",
      s."snapshotDate",
      s."itemId",
      s."itemName",
      s."sku",
      s."customerPn",
      s."qtyOrdered",
      s."qtyShipped",
      s."qtyInvoiced",
      s."unitPrice",
      s."contractValue",
      s."invoicedAmount",
      s."remainingAmount",
      s."unbilledAccrual",
      s."sourcePlatform",
      s."sourceProgram",
      s."sourceTransaction",
      s."cono",
      s."divi",
      NOW()
    FROM "CustomerOrderLineSnapshot" s
    WHERE s."companyId" = ${companyId}
      AND s."frequency" = 'daily'
      AND ${snapshotDayRangeSql('s', priorStart, priorEnd)}
      AND NOT EXISTS (
        SELECT 1
        FROM "CustomerOrderLineSnapshot" t
        WHERE t."companyId" = ${companyId}
          AND t."frequency" = 'daily'
          AND ${snapshotDayRangeSql('t', todayStart, todayEnd)}
          AND t."orderId" = s."orderId"
          AND t."lineId" = s."lineId"
      )
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
  `);
}

async function removeReopenedLines(companyId: string, openBook: OpenBookWindow): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM "CustomerOrderLineFilled" f
    USING "CustomerOrderLineSnapshot" s
    WHERE f."companyId" = ${companyId}
      AND s."companyId" = ${companyId}
      AND s."frequency" = 'daily'
      AND ${snapshotDayRangeSql('s', openBook.start, openBook.end)}
      AND f."orderId" = s."orderId"
      AND f."lineId" = s."lineId"
      AND ${sameCustomerSql('f', 's')}
  `);
}

const REPAIR_FILLED_ORDER_IDS = ['43400', '43401', '43402'] as const;
const REPAIR_FILLED_CUSTOMER_ID = '1011301';

async function restoreDroppedCustomerFills(companyId: string, openBook: OpenBookWindow): Promise<number> {
  const orderIds = [...REPAIR_FILLED_ORDER_IDS];
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn",
      "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
      "invoicedAmount", "remainingAmount", "unbilledAccrual",
      "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
    )
    SELECT
      gen_random_uuid()::text,
      last."companyId",
      last."customerId",
      last."customerName",
      last."orderId",
      last."lineId",
      last."orderDate",
      last."snapshotDate",
      last."itemId",
      last."itemName",
      last."sku",
      last."customerPn",
      last."qtyOrdered",
      last."qtyShipped",
      last."qtyInvoiced",
      last."unitPrice",
      last."contractValue",
      last."invoicedAmount",
      last."remainingAmount",
      last."unbilledAccrual",
      last."sourcePlatform",
      last."sourceProgram",
      last."sourceTransaction",
      last."cono",
      last."divi",
      NOW()
    FROM (
      SELECT DISTINCT ON (s."orderId", s."lineId", s."customerName")
        s."companyId",
        s."customerId",
        s."customerName",
        s."orderId",
        s."lineId",
        s."orderDate",
        s."snapshotDate",
        s."itemId",
        s."itemName",
        s."sku",
        s."customerPn",
        s."qtyOrdered",
        s."qtyShipped",
        s."qtyInvoiced",
        s."unitPrice",
        s."contractValue",
        s."invoicedAmount",
        s."remainingAmount",
        s."unbilledAccrual",
        s."sourcePlatform",
        s."sourceProgram",
        s."sourceTransaction",
        s."cono",
        s."divi"
      FROM "CustomerOrderLineSnapshot" s
      WHERE s."companyId" = ${companyId}
        AND s."frequency" = 'daily'
        AND s."orderId" IN (${Prisma.join(orderIds)})
        AND (
          NULLIF(TRIM(COALESCE(s."customerId", '')), '') = ${REPAIR_FILLED_CUSTOMER_ID}
          OR s."customerName" ILIKE 'ADP Advanced Dist Prod%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineSnapshot" o
          WHERE o."companyId" = ${companyId}
            AND o."frequency" = 'daily'
            AND ${snapshotDayRangeSql('o', openBook.start, openBook.end)}
            AND o."orderId" = s."orderId"
            AND o."lineId" = s."lineId"
            AND ${sameCustomerSql('s', 'o')}
        )
      ORDER BY s."orderId", s."lineId", s."customerName", s."snapshotDate" DESC
    ) last
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
  `);
}

async function markBackfillComplete(companyId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilledBackfill" ("companyId", "completedAt")
    VALUES (${companyId}, NOW())
    ON CONFLICT ("companyId") DO UPDATE SET "completedAt" = EXCLUDED."completedAt"
  `);
}

async function isBackfillComplete(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ companyId: string }>>(Prisma.sql`
    SELECT "companyId"
    FROM "CustomerOrderLineFilledBackfill"
    WHERE "companyId" = ${companyId}
    LIMIT 1
  `);
  return rows.length > 0;
}

export async function ensureFilledHistory(companyId: string): Promise<OpenBookWindow | null> {
  await ensureCustomerOrderLineFilledTables();
  const openBook = await resolveOpenBookWindow(companyId);
  if (!openBook) return null;

  await removeReopenedLines(companyId, openBook);
  await restoreDroppedCustomerFills(companyId, openBook);

  if (await isBackfillComplete(companyId)) {
    await removeReopenedLines(companyId, openBook);
    await restoreDroppedCustomerFills(companyId, openBook);
    return openBook;
  }

  const lockKey = `filled-backfill|${companyId}`;
  const locks = await prisma.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS locked
  `);
  if (!locks[0]?.locked) return openBook;

  try {
    if (!(await isBackfillComplete(companyId))) {
      await backfillFromSnapshots(companyId, openBook);
      await markBackfillComplete(companyId);
    }
    await removeReopenedLines(companyId, openBook);
    await restoreDroppedCustomerFills(companyId, openBook);
  } finally {
    await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`);
  }

  return openBook;
}

export async function captureFilledOrderLines(params: {
  companyId: string;
  snapshotDate: Date;
  closedLines?: FilledOrderLineInput[];
}): Promise<{ closed: number; disappeared: number; backfilled: boolean }> {
  const companyId = String(params.companyId || '').trim();
  if (!companyId) return { closed: 0, disappeared: 0, backfilled: false };

  const todayStart = new Date(
    Date.UTC(params.snapshotDate.getUTCFullYear(), params.snapshotDate.getUTCMonth(), params.snapshotDate.getUTCDate())
  );
  const todayEnd = addUtcDays(todayStart, 1);

  await ensureCustomerOrderLineFilledTables();

  const closed = await insertFilledLines(
    (params.closedLines || []).filter((row) => row.orderId && row.lineId && row.customerName)
  );

  const todayCount = await snapshotRowCount(companyId, todayStart, todayEnd);
  let disappeared = 0;
  if (todayCount > 0) {
    disappeared = Number((await captureDisappearedFromPriorDay(companyId, todayStart, todayEnd)) || 0);
  }

  const openBook = (await resolveOpenBookWindow(companyId)) || { start: todayStart, end: todayEnd };
  await removeReopenedLines(companyId, openBook);

  let backfilled = false;
  if (!(await isBackfillComplete(companyId)) && todayCount > 0) {
    await backfillFromSnapshots(companyId, openBook);
    await markBackfillComplete(companyId);
    await removeReopenedLines(companyId, openBook);
    backfilled = true;
  }

  return { closed, disappeared, backfilled };
}
