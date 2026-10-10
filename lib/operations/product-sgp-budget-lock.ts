import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditLog } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';
import { FORECAST_MONTHS, monthQty, type MonthQtyMap } from '@/lib/operations/product-revenue-forecast';

/**
 * Management sign-off on a year's SGP budget (monthly SGP volume, SGP price,
 * and annual base qty). While a year is locked those inputs cannot change
 * through page saves, and workbook imports for that year are rejected.
 */

export type SgpBudgetSummary = {
  lineCount: number;
  monthlyUnits: Record<string, number>;
  annualUnits: number;
  annualBaseQty: number;
  sgpDollars: number;
};

export type SgpBudgetLock = {
  id: string;
  year: number;
  lockedAt: string;
  lockedByName: string;
  note: string;
  summary: SgpBudgetSummary | null;
};

export class SgpBudgetLockedError extends Error {
  readonly year: number;

  constructor(year: number, detail?: string) {
    super(detail || `SGP budget for ${year} is locked — unlock it before importing.`);
    this.name = 'SgpBudgetLockedError';
    this.year = year;
  }
}

let ensureLockTableOnce: Promise<void> | null = null;

export async function ensureSgpBudgetLockTable(): Promise<void> {
  if (!ensureLockTableOnce) {
    ensureLockTableOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProductSgpBudgetLock" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "year" INTEGER NOT NULL,
          "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lockedByUserId" TEXT,
          "lockedByName" TEXT NOT NULL DEFAULT '',
          "note" TEXT NOT NULL DEFAULT '',
          "summary" JSONB,
          "snapshot" JSONB,
          "unlockedAt" TIMESTAMP(3),
          "unlockedByUserId" TEXT,
          "unlockedByName" TEXT,
          "unlockReason" TEXT,
          CONSTRAINT "ProductSgpBudgetLock_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ProductSgpBudgetLock_active_key"
          ON "ProductSgpBudgetLock"("companyId", "year")
          WHERE "unlockedAt" IS NULL
      `);
    })().catch((error) => {
      ensureLockTableOnce = null;
      throw error;
    });
  }
  await ensureLockTableOnce;
}

type LockRow = {
  id: string;
  year: number;
  lockedAt: Date;
  lockedByName: string;
  note: string;
  summary: Prisma.JsonValue | null;
};

function serializeLock(row: LockRow): SgpBudgetLock {
  return {
    id: row.id,
    year: row.year,
    lockedAt: new Date(row.lockedAt).toISOString(),
    lockedByName: row.lockedByName,
    note: row.note,
    summary: (row.summary as SgpBudgetSummary | null) ?? null,
  };
}

export async function getActiveSgpBudgetLock(companyId: string, year: number): Promise<SgpBudgetLock | null> {
  await ensureSgpBudgetLockTable();
  const rows = await prisma.$queryRaw<LockRow[]>`
    SELECT "id", "year", "lockedAt", "lockedByName", "note", "summary"
    FROM "ProductSgpBudgetLock"
    WHERE "companyId" = ${companyId} AND "year" = ${year} AND "unlockedAt" IS NULL
    LIMIT 1
  `;
  return rows[0] ? serializeLock(rows[0]) : null;
}

export async function assertSgpBudgetsUnlocked(companyId: string, years: number[]): Promise<void> {
  for (const year of Array.from(new Set(years.filter((value) => Number.isInteger(value))))) {
    if (await getActiveSgpBudgetLock(companyId, year)) throw new SgpBudgetLockedError(year);
  }
}

/** Company admins of this company and site admins may sign off or unlock. */
export async function canManageSgpBudget(companyId: string): Promise<boolean> {
  const context = await requireAuth().catch(() => null);
  if (!context) return false;
  if (!(await validateCompanyAccess(companyId))) return false;
  if (context.role === 'SITEADMIN') return true;
  if (context.role !== 'USER') return false;
  const membership = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: context.userId, companyId } },
    select: { companyRole: true },
  });
  if (membership) return String(membership.companyRole || '').toLowerCase() === 'admin';
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { companyId: true, companyRole: true },
  });
  return user?.companyId === companyId && String(user?.companyRole || '').toLowerCase() === 'admin';
}

async function actorName(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
  return String(user?.name || '').trim() || email;
}

export async function buildSgpBudgetSummary(companyId: string, year: number): Promise<SgpBudgetSummary> {
  const dataset = await loadRevenueDataset({ companyId, year, includeAllLines: true });
  const monthlyUnits: Record<string, number> = Object.fromEntries(FORECAST_MONTHS.map((month) => [String(month), 0]));
  let annualBaseQty = 0;
  let sgpDollars = 0;
  let lineCount = 0;
  for (const line of dataset.lines) {
    const sgp = (line.sgpForecastQty || {}) as MonthQtyMap;
    const units = FORECAST_MONTHS.reduce((sum, month) => sum + monthQty(sgp, month), 0);
    const base = Number(line.annualBaseQty) || 0;
    if (units === 0 && base === 0) continue;
    lineCount += 1;
    for (const month of FORECAST_MONTHS) monthlyUnits[String(month)] += monthQty(sgp, month);
    annualBaseQty += base;
    sgpDollars += Number(line.annualSgpForecastEstimated) || 0;
  }
  return {
    lineCount,
    monthlyUnits,
    annualUnits: Object.values(monthlyUnits).reduce((sum, value) => sum + value, 0),
    annualBaseQty,
    sgpDollars,
  };
}

async function buildSgpBudgetSnapshot(companyId: string, year: number) {
  const [lines, prices] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "customerId", "customerName", "customerGroup", "itemSku", "customerPartNumber",
             "annualBaseQty", "sgpForecastQty"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId} AND "year" = ${year}
      ORDER BY "customerName", "itemSku", "customerPartNumber"
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "customerGroup", "itemSku", "sgpPrice"
      FROM "ProductRevenuePrice"
      WHERE "companyId" = ${companyId} AND "year" = ${year}
      ORDER BY "customerGroup", "itemSku"
    `,
  ]);
  return { lines, prices };
}

export async function lockSgpBudget(params: {
  companyId: string;
  year: number;
  note?: string;
}): Promise<SgpBudgetLock> {
  const context = await requireAuth();
  await ensureSgpBudgetLockTable();
  if (await getActiveSgpBudgetLock(params.companyId, params.year)) {
    throw new SgpBudgetLockedError(params.year, `SGP budget for ${params.year} is already locked.`);
  }

  // Lines with no stored SGP fall back to the live forecast; pin them so the
  // signed-off SGP cannot drift when the forecast is edited later.
  await prisma.$executeRaw`
    UPDATE "ProductRevenueForecastLine"
    SET "sgpForecastQty" = "forecastQty", "updatedAt" = CURRENT_TIMESTAMP
    WHERE "companyId" = ${params.companyId}
      AND "year" = ${params.year}
      AND ("sgpForecastQty" IS NULL OR "sgpForecastQty" = '{}'::jsonb)
  `;

  const [summary, snapshot, name] = await Promise.all([
    buildSgpBudgetSummary(params.companyId, params.year),
    buildSgpBudgetSnapshot(params.companyId, params.year),
    actorName(context.userId, context.email),
  ]);
  const id = randomUUID();
  const note = String(params.note || '').trim().slice(0, 500);
  await prisma.$executeRaw`
    INSERT INTO "ProductSgpBudgetLock" (
      "id", "companyId", "year", "lockedAt", "lockedByUserId", "lockedByName", "note", "summary", "snapshot"
    ) VALUES (
      ${id}, ${params.companyId}, ${params.year}, CURRENT_TIMESTAMP, ${context.userId}, ${name}, ${note},
      ${JSON.stringify(summary)}::jsonb, ${JSON.stringify(snapshot)}::jsonb
    )
  `;
  await auditLog({
    action: 'SGP_BUDGET_LOCKED',
    entityType: 'ProductSgpBudgetLock',
    entityId: id,
    changes: { companyId: params.companyId, year: params.year, note, summary },
  });
  const lock = await getActiveSgpBudgetLock(params.companyId, params.year);
  if (!lock) throw new Error('SGP budget lock was not saved.');
  return lock;
}

export async function unlockSgpBudget(params: {
  companyId: string;
  year: number;
  reason: string;
}): Promise<void> {
  const reason = String(params.reason || '').trim().slice(0, 500);
  if (!reason) throw new Error('A reason is required to unlock the SGP budget.');
  const context = await requireAuth();
  const active = await getActiveSgpBudgetLock(params.companyId, params.year);
  if (!active) throw new Error(`SGP budget for ${params.year} is not locked.`);
  const name = await actorName(context.userId, context.email);
  await prisma.$executeRaw`
    UPDATE "ProductSgpBudgetLock"
    SET "unlockedAt" = CURRENT_TIMESTAMP, "unlockedByUserId" = ${context.userId},
        "unlockedByName" = ${name}, "unlockReason" = ${reason}
    WHERE "id" = ${active.id}
  `;
  await auditLog({
    action: 'SGP_BUDGET_UNLOCKED',
    entityType: 'ProductSgpBudgetLock',
    entityId: active.id,
    changes: { companyId: params.companyId, year: params.year, reason, lockedAt: active.lockedAt, lockedBy: active.lockedByName },
  });
}
