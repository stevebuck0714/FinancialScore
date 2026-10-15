import prisma from '@/lib/prisma';
import { AI_USAGE_FEATURES, ensureAiUsageTable } from '@/lib/ai-usage/record';
import { APP_TIME_ZONE, formatEstDate } from '@/lib/time/eastern';

export const AI_USAGE_HISTORY_MONTHS = 7;

export type AiUsagePricing = { monthlyTokenAllowance: number; overagePricePer1MTokens: number };

export type AiUsageMonth = {
  month: string;
  interactions: number;
  billableTokens: number;
  totalTokens: number;
  costUsd: number;
  billableCostUsd: number;
  allowance: number;
  overageTokens: number;
  overageChargeUsd: number;
};

export type AiUsageFeatureRow = {
  feature: string;
  label: string;
  billable: boolean;
  interactions: number;
  billableTokens: number;
  totalTokens: number;
  costUsd: number;
  billableCostUsd: number;
};

export function readAiUsagePricing(userDefinedAllocations: unknown): AiUsagePricing {
  const uda = userDefinedAllocations && typeof userDefinedAllocations === 'object' && !Array.isArray(userDefinedAllocations)
    ? (userDefinedAllocations as Record<string, any>)
    : {};
  const aiUsage = uda.aiUsage && typeof uda.aiUsage === 'object' ? uda.aiUsage : {};
  const allowance = Number(aiUsage.monthlyTokenAllowance);
  const price = Number(aiUsage.overagePricePer1MTokens);
  return {
    monthlyTokenAllowance: Number.isFinite(allowance) && allowance > 0 ? Math.floor(allowance) : 0,
    overagePricePer1MTokens: Number.isFinite(price) && price > 0 ? price : 0,
  };
}

/** Overage is prorated per token at the per-1M price, rounded to cents. */
export function computeOverage(billableTokens: number, pricing: AiUsagePricing): { overageTokens: number; overageChargeUsd: number } {
  const overageTokens = Math.max(0, billableTokens - pricing.monthlyTokenAllowance);
  const overageChargeUsd = Math.round((overageTokens / 1_000_000) * pricing.overagePricePer1MTokens * 100) / 100;
  return { overageTokens, overageChargeUsd };
}

export function currentEstMonth(): string {
  return formatEstDate().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

type MonthRow = { month: string; interactions: number; billableTokens: number; totalTokens: number; costUsd: number; billableCostUsd: number };

/** Current EST month totals for every company with usage. */
export async function loadCurrentMonthAiUsageByCompany(): Promise<Array<MonthRow & { companyId: string }>> {
  await ensureAiUsageTable();
  const month = currentEstMonth();
  return prisma.$queryRaw<Array<MonthRow & { companyId: string }>>`
    SELECT "companyId",
      ${month} AS month,
      COUNT(*)::int AS interactions,
      COALESCE(SUM(CASE WHEN "billable" THEN "totalTokens" ELSE 0 END), 0)::float8 AS "billableTokens",
      COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
      COALESCE(SUM("costUsd"), 0)::float8 AS "costUsd",
      COALESCE(SUM(CASE WHEN "billable" THEN "costUsd" ELSE 0 END), 0)::float8 AS "billableCostUsd"
    FROM "AiUsageEvent"
    WHERE "companyId" IS NOT NULL
      AND to_char("createdAt" AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM') = ${month}
    GROUP BY "companyId"
  `;
}

export async function loadCompanyAiUsage(companyId: string, pricing: AiUsagePricing): Promise<{
  months: AiUsageMonth[];
  currentMonthByFeature: AiUsageFeatureRow[];
}> {
  await ensureAiUsageTable();
  const current = currentEstMonth();
  const firstMonth = shiftMonth(current, -(AI_USAGE_HISTORY_MONTHS - 1));
  const [monthRows, featureRows] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char("createdAt" AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM') AS month,
        COUNT(*)::int AS interactions,
        COALESCE(SUM(CASE WHEN "billable" THEN "totalTokens" ELSE 0 END), 0)::float8 AS "billableTokens",
        COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
        COALESCE(SUM("costUsd"), 0)::float8 AS "costUsd",
        COALESCE(SUM(CASE WHEN "billable" THEN "costUsd" ELSE 0 END), 0)::float8 AS "billableCostUsd"
      FROM "AiUsageEvent"
      WHERE "companyId" = ${companyId}
        AND ("createdAt" AT TIME ZONE ${APP_TIME_ZONE}) >= ${`${firstMonth}-01`}::timestamp
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<Omit<AiUsageFeatureRow, 'label'>>>`
      SELECT "feature",
        BOOL_OR("billable") AS billable,
        COUNT(*)::int AS interactions,
        COALESCE(SUM(CASE WHEN "billable" THEN "totalTokens" ELSE 0 END), 0)::float8 AS "billableTokens",
        COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
        COALESCE(SUM("costUsd"), 0)::float8 AS "costUsd",
        COALESCE(SUM(CASE WHEN "billable" THEN "costUsd" ELSE 0 END), 0)::float8 AS "billableCostUsd"
      FROM "AiUsageEvent"
      WHERE "companyId" = ${companyId}
        AND to_char("createdAt" AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM') = ${current}
      GROUP BY "feature"
      ORDER BY SUM("totalTokens") DESC
    `,
  ]);

  const byMonth = new Map(monthRows.map((row) => [row.month, row]));
  const months: AiUsageMonth[] = [];
  for (let i = 0; i < AI_USAGE_HISTORY_MONTHS; i += 1) {
    const month = shiftMonth(current, -i);
    const row = byMonth.get(month);
    const billableTokens = Number(row?.billableTokens ?? 0);
    months.push({
      month,
      interactions: Number(row?.interactions ?? 0),
      billableTokens,
      totalTokens: Number(row?.totalTokens ?? 0),
      costUsd: Number(row?.costUsd ?? 0),
      billableCostUsd: Number(row?.billableCostUsd ?? 0),
      allowance: pricing.monthlyTokenAllowance,
      ...computeOverage(billableTokens, pricing),
    });
  }

  return {
    months,
    currentMonthByFeature: featureRows.map((row) => ({
      ...row,
      label: AI_USAGE_FEATURES[row.feature as keyof typeof AI_USAGE_FEATURES] ?? row.feature,
      interactions: Number(row.interactions),
      billableTokens: Number(row.billableTokens),
      totalTokens: Number(row.totalTokens),
      costUsd: Number(row.costUsd),
      billableCostUsd: Number(row.billableCostUsd),
    })),
  };
}
