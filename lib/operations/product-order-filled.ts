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
  lineStat?: string | null;
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
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineFilled" ADD COLUMN IF NOT EXISTS "lineStat" TEXT
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CustomerOrderLineSnapshot" ADD COLUMN IF NOT EXISTS "lineStat" TEXT
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

export function remainingShipQtySql(alias: string): Prisma.Sql {
  const ordered = Prisma.raw(`"${alias}"."qtyOrdered"`);
  const shipped = Prisma.raw(`"${alias}"."qtyShipped"`);
  return Prisma.sql`GREATEST(COALESCE(${ordered}, 0) - COALESCE(${shipped}, 0), 0)`;
}

export function remainingToShip(qtyOrdered: number, qtyShipped?: number | null): number {
  return Math.max(Number(qtyOrdered || 0) - Number(qtyShipped || 0), 0);
}

export function isCsiOpenLine(stat: string | null | undefined, qtyOrdered: number, qtyShipped?: number | null): boolean {
  const status = String(stat || '').trim().toUpperCase();
  return remainingToShip(qtyOrdered, qtyShipped) > 0.0001 && status !== 'F' && status !== 'C';
}

export function isCsiFilledLine(stat: string | null | undefined, qtyOrdered: number, qtyShipped?: number | null): boolean {
  const status = String(stat || '').trim().toUpperCase();
  return status === 'F' || status === 'C' || remainingToShip(qtyOrdered, qtyShipped) <= 0.0001;
}

export function isTrulyOpenSql(alias: string): Prisma.Sql {
  const stat = Prisma.raw(`"${alias}"."lineStat"`);
  return Prisma.sql`(
    ${remainingShipQtySql(alias)} > 0.0001
    AND UPPER(COALESCE(${stat}, '')) NOT IN ('C', 'F')
  )`;
}

export function isTrulyFilledSql(alias: string): Prisma.Sql {
  const stat = Prisma.raw(`"${alias}"."lineStat"`);
  return Prisma.sql`(
    ${remainingShipQtySql(alias)} <= 0.0001
    OR UPPER(COALESCE(${stat}, '')) IN ('C', 'F')
  )`;
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
      ${row.lineStat ? String(row.lineStat).trim().toUpperCase() : null},
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
        "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn", "lineStat",
        "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
        "invoicedAmount", "remainingAmount", "unbilledAccrual",
        "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO UPDATE SET
        "lineStat" = COALESCE(EXCLUDED."lineStat", "CustomerOrderLineFilled"."lineStat"),
        "qtyShipped" = COALESCE(EXCLUDED."qtyShipped", "CustomerOrderLineFilled"."qtyShipped"),
        "customerPn" = COALESCE(EXCLUDED."customerPn", "CustomerOrderLineFilled"."customerPn"),
        "customerId" = COALESCE(EXCLUDED."customerId", "CustomerOrderLineFilled"."customerId"),
        "qtyOrdered" = EXCLUDED."qtyOrdered",
        "qtyInvoiced" = EXCLUDED."qtyInvoiced",
        "unitPrice" = EXCLUDED."unitPrice",
        "contractValue" = EXCLUDED."contractValue",
        "invoicedAmount" = EXCLUDED."invoicedAmount",
        "remainingAmount" = EXCLUDED."remainingAmount",
        "filledAsOf" = GREATEST("CustomerOrderLineFilled"."filledAsOf", EXCLUDED."filledAsOf")
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
        AND ${isTrulyFilledSql('s')}
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
      AND ${isTrulyFilledSql('s')}
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
      AND ${isTrulyOpenSql('s')}
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

function csiNumericSql(payloadAlias: string, key: string): Prisma.Sql {
  const expr = Prisma.raw(`COALESCE(${payloadAlias}.payload->>'${key}', '')`);
  return Prisma.sql`(CASE WHEN ${expr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ${expr}::double precision ELSE 0 END)`;
}

function csiOrderIdExpr(alias: string): Prisma.Sql {
  return Prisma.raw(
    `COALESCE(NULLIF(REGEXP_REPLACE(TRIM(COALESCE(${alias}.payload->>'CoNum', ${alias}.payload->>'CONUM', ${alias}.payload->>'coNum', '')), '^0+', ''), ''), '0')`
  );
}

function csiLineIdExpr(alias: string): Prisma.Sql {
  return Prisma.raw(
    `TRIM(COALESCE(${alias}.payload->>'CoLine', ${alias}.payload->>'COLINE', '1')) || '-' || TRIM(COALESCE(${alias}.payload->>'CoRelease', ${alias}.payload->>'CORELEASE', '0'))`
  );
}

function csiStatExpr(alias: string): Prisma.Sql {
  return Prisma.raw(
    `UPPER(TRIM(COALESCE(${alias}.payload->>'Stat', ${alias}.payload->>'STAT', ${alias}.payload->>'stat', '')))`
  );
}

function csiOrderDateExpr(alias: string): Prisma.Sql {
  return Prisma.raw(`CASE
    WHEN COALESCE(${alias}.payload->>'OrderDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN LEFT(${alias}.payload->>'OrderDate', 10)::timestamp
    WHEN COALESCE(${alias}.payload->>'OrderDate', '') ~ '^[0-9]{8}' THEN to_date(LEFT(${alias}.payload->>'OrderDate', 8), 'YYYYMMDD')::timestamp
    ELSE NULL
  END`);
}

function csiHeaderCustomerIdExpr(alias: string): Prisma.Sql {
  return Prisma.raw(
    `NULLIF(TRIM(COALESCE(${alias}.payload->>'CustNum', ${alias}.payload->>'CUSTNUM', ${alias}.payload->>'CustNo', '')), '')`
  );
}

function csiHeaderCustomerNameExpr(alias: string): Prisma.Sql {
  return Prisma.raw(`COALESCE(
    NULLIF(TRIM(SPLIT_PART(COALESCE(${alias}.payload->>'DerCustNoName', ''), ' - ', 2)), ''),
    NULLIF(TRIM(COALESCE(${alias}.payload->>'CustName', ${alias}.payload->>'CadName', ${alias}.payload->>'DerCustName', '')), ''),
    NULLIF(TRIM(COALESCE(${alias}.payload->>'DerCustNoName', '')), '')
  )`);
}

function csiCustomerMatchSql(customerId: string, customerName: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (customerId) {
    parts.push(Prisma.sql`(
      NULLIF(TRIM(COALESCE(lines."lineCustomerId", '')), '') = ${customerId}
      OR NULLIF(TRIM(COALESCE(hdr."customerId", '')), '') = ${customerId}
    )`);
  }
  if (customerName) {
    parts.push(Prisma.sql`hdr."customerName" = ${customerName}`);
  }
  if (parts.length === 2) return Prisma.sql`(${parts[0]} OR ${parts[1]})`;
  if (parts.length === 1) return parts[0];
  return Prisma.sql`FALSE`;
}

export async function loadProductRawCustomers(companyId: string): Promise<Array<{ customerId: string; customerName: string }>> {
  const byKey = new Map<string, { customerId: string; customerName: string }>();
  const add = (id: unknown, name: unknown) => {
    const customerId = String(id || '').trim();
    const customerName = String(name || '').trim();
    if (!customerId && !customerName) return;
    const key = customerId || customerName.toUpperCase();
    if (byKey.has(key)) return;
    byKey.set(key, { customerId, customerName: customerName || customerId });
  };

  try {
    const openBook = await resolveOpenBookWindow(companyId);
    if (openBook) {
      const snapshotCustomers = await prisma.$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>(Prisma.sql`
        SELECT DISTINCT s."customerId", s."customerName"
        FROM "CustomerOrderLineSnapshot" s
        WHERE s."companyId" = ${companyId}
          AND s."frequency" = 'daily'
          AND s."snapshotDate" >= ${openBook.start}
          AND s."snapshotDate" < ${openBook.end}
          AND TRIM(COALESCE(s."customerName", '')) <> ''
      `);
      for (const row of snapshotCustomers) add(row.customerId, row.customerName);
    }
  } catch (error) {
    console.warn('[product-raw] snapshot customers failed', error);
  }

  try {
    const headerDayRows = await prisma.$queryRaw<Array<{ start: Date | null }>>(Prisma.sql`
      SELECT DATE_TRUNC('day', MAX(COALESCE("businessDate", "fetchedAt"))) AS start
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" IN ('SLCos', 'SLCohdrs', 'SLCOS', 'SLCOHDRS')
    `);
    const headerStart = headerDayRows[0]?.start;
    if (headerStart) {
      const headerEnd = addUtcDays(headerStart, 1);
      const headerCustomers = await prisma.$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>(Prisma.sql`
        SELECT DISTINCT
          ${csiHeaderCustomerIdExpr('h')} AS "customerId",
          ${csiHeaderCustomerNameExpr('h')} AS "customerName"
        FROM "InforRawRecord" h
        WHERE h."companyId" = ${companyId}
          AND h."miProgram" IN ('SLCos', 'SLCohdrs', 'SLCOS', 'SLCOHDRS')
          AND COALESCE(h."businessDate", h."fetchedAt") >= ${headerStart}
          AND COALESCE(h."businessDate", h."fetchedAt") < ${headerEnd}
      `);
      for (const row of headerCustomers) add(row.customerId, row.customerName);
    }
  } catch (error) {
    console.warn('[product-raw] CSI header customers failed', error);
  }

  try {
    const filledCustomers = await prisma.$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>(Prisma.sql`
      SELECT "customerId", MAX("customerName") AS "customerName"
      FROM "CustomerOrderLineFilled"
      WHERE "companyId" = ${companyId}
        AND TRIM(COALESCE("customerName", '')) <> ''
      GROUP BY 1
      LIMIT 2000
    `);
    for (const row of filledCustomers) add(row.customerId, row.customerName);
  } catch (error) {
    console.warn('[product-raw] filled customers failed', error);
  }

  try {
    const forecastCustomers = await prisma.$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>(Prisma.sql`
      SELECT DISTINCT "customerId", "customerName"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND TRIM(COALESCE("customerName", "customerId", '')) <> ''
      LIMIT 2000
    `);
    for (const row of forecastCustomers) add(row.customerId, row.customerName);
  } catch (error) {
    console.warn('[product-raw] forecast customers failed', error);
  }

  return Array.from(byKey.values()).sort((left, right) =>
    left.customerName.localeCompare(right.customerName, undefined, { sensitivity: 'base' })
  );
}

export async function companyHasCsiCoitems(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT 1 AS n
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND UPPER(COALESCE("miProgram", '')) = 'SLCOITEMS'
    LIMIT 1
  `);
  return rows.length > 0;
}

export async function resolveLatestCsiCoitemsDay(companyId: string): Promise<OpenBookWindow | null> {
  const rows = await prisma.$queryRaw<Array<{ start: Date; end: Date }>>(Prisma.sql`
    WITH day_counts AS (
      SELECT DATE_TRUNC('day', COALESCE(r."businessDate", r."fetchedAt")) AS day_start, COUNT(*)::int AS n
      FROM "InforRawRecord" r
      WHERE r."companyId" = ${companyId}
        AND UPPER(COALESCE(r."miProgram", '')) = 'SLCOITEMS'
      GROUP BY 1
    ),
    latest AS (
      SELECT MAX(day_start) AS max_day FROM day_counts
    ),
    ranked AS (
      SELECT d.day_start, d.n, MAX(d.n) OVER () AS max_n
      FROM day_counts d
      CROSS JOIN latest
      WHERE latest.max_day IS NOT NULL
        AND d.day_start >= latest.max_day - INTERVAL '21 days'
    )
    SELECT day_start AS start, (day_start + INTERVAL '1 day') AS end
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

export async function loadCsiOpenLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
}): Promise<{ rows: any[]; openAsOf: Date | null }> {
  const csiDay = await resolveLatestCsiCoitemsDay(params.companyId);
  if (!csiDay) return { rows: [], openAsOf: null };

  const qtyOrdered = csiNumericSql('r', 'QtyOrdered');
  const qtyShipped = csiNumericSql('r', 'QtyShipped');
  const qtyInvoiced = csiNumericSql('r', 'QtyInvoiced');
  const unitPrice = csiNumericSql('r', 'Price');
  const orderId = csiOrderIdExpr('r');
  const lineId = csiLineIdExpr('r');
  const stat = csiStatExpr('r');
  const orderDate = csiOrderDateExpr('r');
  const headerOrderId = csiOrderIdExpr('h');
  const headerCustomerId = csiHeaderCustomerIdExpr('h');
  const headerCustomerName = csiHeaderCustomerNameExpr('h');
  const customerMatch = csiCustomerMatchSql(params.customerId, params.customerName);

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    WITH headers AS (
      SELECT DISTINCT ON (${headerOrderId})
        ${headerOrderId} AS "orderId",
        ${headerCustomerId} AS "customerId",
        ${headerCustomerName} AS "customerName"
      FROM "InforRawRecord" h
      WHERE h."companyId" = ${params.companyId}
        AND UPPER(COALESCE(h."miProgram", '')) IN ('SLCOS', 'SLCOHDRS')
      ORDER BY ${headerOrderId}, COALESCE(h."businessDate", h."fetchedAt") DESC
    ),
    lines AS (
      SELECT DISTINCT ON (${orderId}, ${lineId})
        COALESCE(r."businessDate", r."fetchedAt") AS "snapshotDate",
        ${orderId} AS "orderId",
        ${lineId} AS "lineId",
        ${orderDate} AS "orderDate",
        NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "itemId",
        NULLIF(TRIM(COALESCE(r.payload->>'Description', r.payload->>'ItemDescription', '')), '') AS "itemName",
        NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "sku",
        NULLIF(TRIM(COALESCE(r.payload->>'CustItem', '')), '') AS "customerPn",
        ${stat} AS "lineStat",
        ${qtyOrdered} AS "qtyOrdered",
        ${qtyShipped} AS "qtyShipped",
        ${qtyInvoiced} AS "qtyInvoiced",
        ${unitPrice} AS "unitPrice",
        NULLIF(TRIM(COALESCE(r.payload->>'CustNum', '')), '') AS "lineCustomerId"
      FROM "InforRawRecord" r
      WHERE r."companyId" = ${params.companyId}
        AND UPPER(COALESCE(r."miProgram", '')) = 'SLCOITEMS'
        AND COALESCE(r."businessDate", r."fetchedAt") >= ${csiDay.start}
        AND COALESCE(r."businessDate", r."fetchedAt") < ${csiDay.end}
        AND TRIM(COALESCE(r.payload->>'CoNum', r.payload->>'CONUM', '')) <> ''
      ORDER BY ${orderId}, ${lineId}, COALESCE(r."businessDate", r."fetchedAt") DESC
    )
    SELECT
      lines."snapshotDate",
      COALESCE(NULLIF(TRIM(COALESCE(lines."lineCustomerId", '')), ''), hdr."customerId") AS "customerId",
      hdr."customerName" AS "customerName",
      lines."orderId",
      lines."lineId",
      lines."orderDate",
      lines."itemId",
      lines."itemName",
      lines."sku",
      lines."customerPn",
      lines."lineStat",
      lines."qtyOrdered",
      lines."qtyShipped",
      lines."qtyInvoiced",
      lines."unitPrice",
      lines."qtyOrdered" * lines."unitPrice" AS "contractValue",
      lines."qtyInvoiced" * lines."unitPrice" AS "invoicedAmount",
      GREATEST(lines."qtyOrdered" - lines."qtyShipped", 0) * lines."unitPrice" AS "remainingAmount",
      NULL AS "sourceTransaction"
    FROM lines
    LEFT JOIN headers hdr ON hdr."orderId" = lines."orderId"
    WHERE ${customerMatch}
      AND GREATEST(COALESCE(lines."qtyOrdered", 0) - COALESCE(lines."qtyShipped", 0), 0) > 0.0001
      AND COALESCE(lines."lineStat", '') NOT IN ('C', 'F')
    ORDER BY lines."orderId", lines."lineId"
  `);

  return { rows, openAsOf: csiDay.start };
}

export async function loadCsiFilledLines(params: {
  companyId: string;
  customerId: string;
  customerName: string;
  startDate: Date;
  endDate: Date;
  limit: number;
}): Promise<any[]> {
  const headerOrderId = csiOrderIdExpr('h');
  const headerCustomerId = csiHeaderCustomerIdExpr('h');
  const headerCustomerName = csiHeaderCustomerNameExpr('h');
  const headerCustomerFilter = (() => {
    const parts: Prisma.Sql[] = [];
    if (params.customerId) {
      parts.push(Prisma.sql`NULLIF(TRIM(COALESCE(${headerCustomerId}, '')), '') = ${params.customerId}`);
    }
    if (params.customerName) {
      parts.push(Prisma.sql`${headerCustomerName} = ${params.customerName}`);
    }
    if (parts.length === 2) return Prisma.sql`(${parts[0]} OR ${parts[1]})`;
    if (parts.length === 1) return parts[0];
    return Prisma.sql`FALSE`;
  })();

  const headerRows = await prisma.$queryRaw<Array<{ orderId: string; customerId: string | null; customerName: string | null }>>(Prisma.sql`
    SELECT DISTINCT ON (${headerOrderId})
      ${headerOrderId} AS "orderId",
      ${headerCustomerId} AS "customerId",
      ${headerCustomerName} AS "customerName"
    FROM "InforRawRecord" h
    WHERE h."companyId" = ${params.companyId}
      AND UPPER(COALESCE(h."miProgram", '')) IN ('SLCOS', 'SLCOHDRS')
      AND ${headerCustomerFilter}
    ORDER BY ${headerOrderId}, COALESCE(h."businessDate", h."fetchedAt") DESC
  `);
  if (headerRows.length === 0) return [];

  const orderIds = [...new Set(headerRows.map((row) => String(row.orderId || '').trim()).filter(Boolean))].slice(0, 8000);
  if (orderIds.length === 0) return [];
  const orderIdList = Prisma.join(orderIds.map((id) => Prisma.sql`${id}`));
  const headerByOrder = new Map(headerRows.map((row) => [String(row.orderId), row]));

  const qtyOrdered = csiNumericSql('r', 'QtyOrdered');
  const qtyShipped = csiNumericSql('r', 'QtyShipped');
  const qtyInvoiced = csiNumericSql('r', 'QtyInvoiced');
  const unitPrice = csiNumericSql('r', 'Price');
  const orderId = csiOrderIdExpr('r');
  const lineId = csiLineIdExpr('r');
  const stat = csiStatExpr('r');
  const orderDate = csiOrderDateExpr('r');

  const lines = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT DISTINCT ON (${orderId}, ${lineId})
      COALESCE(r."businessDate", r."fetchedAt") AS "filledAsOf",
      ${orderId} AS "orderId",
      ${lineId} AS "lineId",
      ${orderDate} AS "orderDate",
      NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "itemId",
      NULLIF(TRIM(COALESCE(r.payload->>'Description', r.payload->>'ItemDescription', '')), '') AS "itemName",
      NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "sku",
      NULLIF(TRIM(COALESCE(r.payload->>'CustItem', '')), '') AS "customerPn",
      ${stat} AS "lineStat",
      ${qtyOrdered} AS "qtyOrdered",
      ${qtyShipped} AS "qtyShipped",
      ${qtyInvoiced} AS "qtyInvoiced",
      ${unitPrice} AS "unitPrice",
      NULLIF(TRIM(COALESCE(r.payload->>'CustNum', '')), '') AS "lineCustomerId"
    FROM "InforRawRecord" r
    WHERE r."companyId" = ${params.companyId}
      AND UPPER(COALESCE(r."miProgram", '')) = 'SLCOITEMS'
      AND ${orderId} IN (${orderIdList})
    ORDER BY ${orderId}, ${lineId}, COALESCE(r."businessDate", r."fetchedAt") DESC
  `);

  return lines
    .filter((row) => isCsiFilledLine(row.lineStat, Number(row.qtyOrdered || 0), row.qtyShipped))
    .filter((row) => {
      const when = row.orderDate || row.filledAsOf;
      if (!when) return false;
      const ts = new Date(when).getTime();
      return ts >= params.startDate.getTime() && ts <= params.endDate.getTime();
    })
    .map((row) => {
      const header = headerByOrder.get(String(row.orderId));
      const qtyOrderedValue = Number(row.qtyOrdered || 0);
      const qtyShippedValue = Number(row.qtyShipped || 0);
      const unitPriceValue = Number(row.unitPrice || 0);
      return {
        ...row,
        customerId: row.lineCustomerId || header?.customerId || null,
        customerName: header?.customerName || params.customerName,
        contractValue: qtyOrderedValue * unitPriceValue,
        invoicedAmount: Number(row.qtyInvoiced || 0) * unitPriceValue,
        remainingAmount: remainingToShip(qtyOrderedValue, qtyShippedValue) * unitPriceValue,
        sourceTransaction: null,
      };
    })
    .sort((left, right) => {
      const leftDate = String(left.orderDate || left.filledAsOf || '');
      const rightDate = String(right.orderDate || right.filledAsOf || '');
      return rightDate.localeCompare(leftDate) || String(right.orderId).localeCompare(String(left.orderId));
    })
    .slice(0, params.limit);
}

async function backfillFilledFromCsiRaw(companyId: string): Promise<number> {
  await prisma.$executeRaw(Prisma.sql`
    CREATE TABLE IF NOT EXISTS "CustomerOrderLineFilledCsiBackfill" (
      "companyId" TEXT NOT NULL,
      "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CustomerOrderLineFilledCsiBackfill_pkey" PRIMARY KEY ("companyId")
    )
  `);
  const existingCsi = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT 1 AS n
    FROM "CustomerOrderLineFilled"
    WHERE "companyId" = ${companyId}
      AND UPPER(COALESCE("lineStat", '')) IN ('C', 'F')
    LIMIT 1
  `);
  if (existingCsi.length > 0) return 0;

  const qtyOrdered = csiNumericSql('r', 'QtyOrdered');
  const qtyShipped = csiNumericSql('r', 'QtyShipped');
  const qtyInvoiced = csiNumericSql('r', 'QtyInvoiced');
  const unitPrice = csiNumericSql('r', 'Price');
  const inserted = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerOrderLineFilled" (
      "id", "companyId", "customerId", "customerName", "orderId", "lineId",
      "orderDate", "filledAsOf", "itemId", "itemName", "sku", "customerPn", "lineStat",
      "qtyOrdered", "qtyShipped", "qtyInvoiced", "unitPrice", "contractValue",
      "invoicedAmount", "remainingAmount", "unbilledAccrual",
      "sourcePlatform", "sourceProgram", "sourceTransaction", "cono", "divi", "createdAt"
    )
    SELECT
      gen_random_uuid()::text,
      ${companyId},
      src."customerId",
      src."customerName",
      src."orderId",
      src."lineId",
      src."orderDate",
      src."filledAsOf",
      src."itemId",
      src."itemName",
      src."sku",
      src."customerPn",
      src."lineStat",
      src."qtyOrdered",
      src."qtyShipped",
      src."qtyInvoiced",
      src."unitPrice",
      src."contractValue",
      src."invoicedAmount",
      src."remainingAmount",
      0,
      'INFOR_M3',
      'SLCoitems',
      NULL,
      NULL,
      NULL,
      NOW()
    FROM (
      SELECT DISTINCT ON (line."orderId", line."lineId", COALESCE(snap."customerName", header."customerName"))
        COALESCE(NULLIF(TRIM(COALESCE(snap."customerId", '')), ''), header."customerId") AS "customerId",
        COALESCE(NULLIF(TRIM(COALESCE(snap."customerName", '')), ''), header."customerName") AS "customerName",
        line."orderId",
        line."lineId",
        line."orderDate",
        line."filledAsOf",
        line."itemId",
        line."itemName",
        line."sku",
        line."customerPn",
        line."lineStat",
        line."qtyOrdered",
        line."qtyShipped",
        line."qtyInvoiced",
        line."unitPrice",
        line."qtyOrdered" * line."unitPrice" AS "contractValue",
        line."qtyInvoiced" * line."unitPrice" AS "invoicedAmount",
        GREATEST(line."qtyOrdered" - line."qtyShipped", 0) * line."unitPrice" AS "remainingAmount"
      FROM (
        SELECT DISTINCT ON (
          COALESCE(NULLIF(REGEXP_REPLACE(TRIM(COALESCE(r.payload->>'CoNum', r.payload->>'CONUM', '')), '^0+', ''), ''), '0'),
          TRIM(COALESCE(r.payload->>'CoLine', '1')) || '-' || TRIM(COALESCE(r.payload->>'CoRelease', '0'))
        )
          COALESCE(NULLIF(REGEXP_REPLACE(TRIM(COALESCE(r.payload->>'CoNum', r.payload->>'CONUM', '')), '^0+', ''), ''), '0') AS "orderId",
          TRIM(COALESCE(r.payload->>'CoLine', '1')) || '-' || TRIM(COALESCE(r.payload->>'CoRelease', '0')) AS "lineId",
          CASE
            WHEN COALESCE(r.payload->>'OrderDate', '') ~ '^[0-9]{4}-'
            THEN (r.payload->>'OrderDate')::timestamp
            ELSE NULL
          END AS "orderDate",
          COALESCE(r."businessDate", r."fetchedAt") AS "filledAsOf",
          NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "itemId",
          NULLIF(TRIM(COALESCE(r.payload->>'Description', r.payload->>'ItemDescription', '')), '') AS "itemName",
          NULLIF(TRIM(COALESCE(r.payload->>'Item', '')), '') AS "sku",
          NULLIF(TRIM(COALESCE(r.payload->>'CustItem', '')), '') AS "customerPn",
          UPPER(TRIM(COALESCE(r.payload->>'Stat', ''))) AS "lineStat",
          ${qtyOrdered} AS "qtyOrdered",
          ${qtyShipped} AS "qtyShipped",
          ${qtyInvoiced} AS "qtyInvoiced",
          ${unitPrice} AS "unitPrice"
        FROM "InforRawRecord" r
        WHERE r."companyId" = ${companyId}
          AND UPPER(COALESCE(r."miProgram", '')) = 'SLCOITEMS'
          AND TRIM(COALESCE(r.payload->>'CoNum', r.payload->>'CONUM', '')) <> ''
          AND (
            UPPER(TRIM(COALESCE(r.payload->>'Stat', ''))) IN ('C', 'F')
            OR (
              ${qtyOrdered} > 0
              AND GREATEST(${qtyOrdered} - ${qtyShipped}, 0) <= 0.0001
            )
          )
        ORDER BY
          COALESCE(NULLIF(REGEXP_REPLACE(TRIM(COALESCE(r.payload->>'CoNum', r.payload->>'CONUM', '')), '^0+', ''), ''), '0'),
          TRIM(COALESCE(r.payload->>'CoLine', '1')) || '-' || TRIM(COALESCE(r.payload->>'CoRelease', '0')),
          COALESCE(r."businessDate", r."fetchedAt") DESC
      ) line
      LEFT JOIN LATERAL (
        SELECT s."customerId", s."customerName"
        FROM "CustomerOrderLineSnapshot" s
        WHERE s."companyId" = ${companyId}
          AND COALESCE(NULLIF(REGEXP_REPLACE(TRIM(s."orderId"), '^0+', ''), ''), '0') = line."orderId"
        ORDER BY s."snapshotDate" DESC
        LIMIT 1
      ) snap ON true
      LEFT JOIN LATERAL (
        SELECT
          NULLIF(TRIM(COALESCE(h.payload->>'CustNum', h.payload->>'CUSTNUM', '')), '') AS "customerId",
          COALESCE(
            NULLIF(TRIM(SPLIT_PART(COALESCE(h.payload->>'DerCustNoName', ''), ' - ', 2)), ''),
            NULLIF(TRIM(COALESCE(h.payload->>'CustName', h.payload->>'CadName', '')), '')
          ) AS "customerName"
        FROM "InforRawRecord" h
        WHERE h."companyId" = ${companyId}
          AND UPPER(COALESCE(h."miProgram", '')) IN ('SLCOS', 'SLCOHDRS')
          AND COALESCE(NULLIF(REGEXP_REPLACE(TRIM(COALESCE(h.payload->>'CoNum', h.payload->>'CONUM', '')), '^0+', ''), ''), '0') = line."orderId"
        ORDER BY COALESCE(h."businessDate", h."fetchedAt") DESC
        LIMIT 1
      ) header ON true
      WHERE COALESCE(NULLIF(TRIM(COALESCE(snap."customerName", '')), ''), header."customerName") IS NOT NULL
      ORDER BY line."orderId", line."lineId", COALESCE(snap."customerName", header."customerName"), line."filledAsOf" DESC
    ) src
    ON CONFLICT ("companyId", "orderId", "lineId", "customerName") DO UPDATE SET
      "lineStat" = COALESCE(EXCLUDED."lineStat", "CustomerOrderLineFilled"."lineStat"),
      "qtyShipped" = COALESCE(EXCLUDED."qtyShipped", "CustomerOrderLineFilled"."qtyShipped"),
      "customerPn" = COALESCE(EXCLUDED."customerPn", "CustomerOrderLineFilled"."customerPn"),
      "customerId" = COALESCE(EXCLUDED."customerId", "CustomerOrderLineFilled"."customerId"),
      "qtyOrdered" = EXCLUDED."qtyOrdered",
      "filledAsOf" = GREATEST("CustomerOrderLineFilled"."filledAsOf", EXCLUDED."filledAsOf")
  `);

  return Number(inserted || 0);
}

export async function ensureFilledHistory(companyId: string): Promise<OpenBookWindow | null> {
  await ensureCustomerOrderLineFilledTables();
  try {
    await backfillFilledFromCsiRaw(companyId);
  } catch (error) {
    console.error('[filled] CSI backfill failed', error);
  }
  const openBook = await resolveOpenBookWindow(companyId);
  if (openBook) await removeReopenedLines(companyId, openBook);
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

  const openBook = (await resolveOpenBookWindow(companyId)) || { start: todayStart, end: todayEnd };
  await removeReopenedLines(companyId, openBook);

  return { closed, disappeared: 0, backfilled: false };
}
