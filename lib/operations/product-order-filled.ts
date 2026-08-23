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
  qtyOrdered: number;
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
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function latestOpenSnapshotDate(companyId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ snapshotDate: Date }>>(Prisma.sql`
    SELECT MAX("snapshotDate") AS "snapshotDate"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
  `);
  return rows[0]?.snapshotDate ? utcDay(rows[0].snapshotDate) : null;
}

async function snapshotRowCount(companyId: string, snapshotDate: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" = ${snapshotDate}
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
      ${Number(row.qtyOrdered || 0)},
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
        "orderDate", "filledAsOf", "itemId", "itemName", "sku",
        "qtyOrdered", "qtyInvoiced", "unitPrice", "contractValue",
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

async function backfillFromSnapshots(companyId: string, latestDate: Date): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku",
      "qtyOrdered", "qtyInvoiced", "unitPrice", "contractValue",
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
      last."qtyOrdered",
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
        s."qtyOrdered",
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
            AND o."snapshotDate" = ${latestDate}
            AND o."orderId" = s."orderId"
            AND o."lineId" = s."lineId"
            AND o."customerName" = s."customerName"
        )
      ORDER BY s."orderId", s."lineId", s."customerName", s."snapshotDate" DESC
    ) last
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
  `);
}

async function captureDisappearedFromPriorDay(companyId: string, snapshotDate: Date): Promise<number> {
  const priorRows = await prisma.$queryRaw<Array<{ snapshotDate: Date }>>(Prisma.sql`
    SELECT MAX("snapshotDate") AS "snapshotDate"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND "frequency" = 'daily'
      AND "snapshotDate" < ${snapshotDate}
  `);
  const priorDate = priorRows[0]?.snapshotDate ? utcDay(priorRows[0].snapshotDate) : null;
  if (!priorDate) return 0;

  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku",
      "qtyOrdered", "qtyInvoiced", "unitPrice", "contractValue",
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
      s."qtyOrdered",
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
      AND s."snapshotDate" = ${priorDate}
      AND NOT EXISTS (
        SELECT 1
        FROM "CustomerOrderLineSnapshot" t
        WHERE t."companyId" = ${companyId}
          AND t."frequency" = 'daily'
          AND t."snapshotDate" = ${snapshotDate}
          AND t."orderId" = s."orderId"
          AND t."lineId" = s."lineId"
          AND t."customerName" = s."customerName"
      )
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO NOTHING
  `);
}

async function removeReopenedLines(companyId: string, snapshotDate: Date): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM "CustomerOrderLineFilled" f
    USING "CustomerOrderLineSnapshot" s
    WHERE f."companyId" = ${companyId}
      AND s."companyId" = ${companyId}
      AND s."frequency" = 'daily'
      AND s."snapshotDate" = ${snapshotDate}
      AND f."orderId" = s."orderId"
      AND f."lineId" = s."lineId"
      AND f."customerName" = s."customerName"
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

export async function ensureFilledHistory(companyId: string): Promise<void> {
  await ensureCustomerOrderLineFilledTables();
  if (await isBackfillComplete(companyId)) return;

  const latestDate = await latestOpenSnapshotDate(companyId);
  if (!latestDate) return;
  if ((await snapshotRowCount(companyId, latestDate)) <= 0) return;

  const lockKey = `filled-backfill|${companyId}`;
  const locks = await prisma.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS locked
  `);
  if (!locks[0]?.locked) return;

  try {
    if (await isBackfillComplete(companyId)) return;
    await backfillFromSnapshots(companyId, latestDate);
    await markBackfillComplete(companyId);
  } finally {
    await prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`);
  }
}

export async function captureFilledOrderLines(params: {
  companyId: string;
  snapshotDate: Date;
  closedLines?: FilledOrderLineInput[];
}): Promise<{ closed: number; disappeared: number; backfilled: boolean }> {
  const companyId = String(params.companyId || '').trim();
  const snapshotDate = utcDay(params.snapshotDate);
  if (!companyId) return { closed: 0, disappeared: 0, backfilled: false };

  await ensureCustomerOrderLineFilledTables();

  const closed = await insertFilledLines(
    (params.closedLines || []).filter((row) => row.orderId && row.lineId && row.customerName)
  );

  const todayCount = await snapshotRowCount(companyId, snapshotDate);
  let disappeared = 0;
  if (todayCount > 0) {
    disappeared = Number((await captureDisappearedFromPriorDay(companyId, snapshotDate)) || 0);
    await removeReopenedLines(companyId, snapshotDate);
  }

  let backfilled = false;
  if (!(await isBackfillComplete(companyId)) && todayCount > 0) {
    await backfillFromSnapshots(companyId, snapshotDate);
    await markBackfillComplete(companyId);
    backfilled = true;
  }

  return { closed, disappeared, backfilled };
}
