import prisma from '@/lib/prisma';
import type { PulseAlertInput } from '@/lib/pulse-alerts';
import { formatMoney as formatMoneyShared } from '@/lib/format/currency';

export type SectorMetricRow = {
  companyId: string;
  sectorCategory: string | null;
  moduleKey: string;
  metricKey: string;
  metricLabel: string | null;
  snapshotDate: Date;
  value: number;
  unit: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  dimensions: Record<string, unknown> | null;
  sourceSystem: string | null;
};

type BadDirection = 'higher_is_bad' | 'lower_is_bad';
type Rollup = 'sum' | 'average' | 'latest';

type SectorMetricRule = {
  moduleKey: string;
  metricKey: string;
  label: string;
  unit?: string;
  badDirection: BadDirection;
  rollup?: Rollup;
  minCurrentValue?: number;
  minPriorValue?: number;
  minDeltaAbs?: number;
  minDeltaPct?: number;
  criticalCurrentValue?: number;
  owner: string;
  drillView: string;
};

type MetricComparison = {
  currentValue: number;
  priorValue: number;
  delta: number;
  deltaPct: number | null;
  currentDate: string;
  priorDate: string;
};

const SECTOR_RULES: Record<string, SectorMetricRule[]> = {
  '01': [
    rule('sales', 'order_volume', 'Order volume', 'lower_is_bad', { minDeltaPct: 15, owner: 'Sales Lead' }),
    rule('customers', 'active_customer_count', 'Active customers', 'lower_is_bad', { minDeltaPct: 10, owner: 'Sales Lead' }),
    rule('inventory', 'inventory_aging_value', 'Aged inventory value', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 25000 }),
  ],
  '11': [
    rule('production', 'yield_rate', 'Yield rate', 'lower_is_bad', { unit: '%', minDeltaAbs: 4, owner: 'Ops Lead' }),
    rule('production', 'production_volume', 'Production volume', 'lower_is_bad', { minDeltaPct: 12, owner: 'Ops Lead' }),
    rule('inventory', 'spoilage_value', 'Spoilage value', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 10000 }),
    rule('ap', 'input_cost_per_unit', 'Input cost per unit', 'higher_is_bad', { minDeltaPct: 8, owner: 'Ops/Finance Owner' }),
  ],
  '21': [
    rule('production', 'production_volume', 'Production volume', 'lower_is_bad', { minDeltaPct: 10, owner: 'Ops Lead' }),
    rule('assets_equipment', 'equipment_downtime_hours', 'Equipment downtime', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 8, unit: 'hours' }),
    rule('production', 'recovery_rate', 'Recovery rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
  '22': [
    rule('network_assets', 'outage_minutes', 'Outage minutes', 'higher_is_bad', { minDeltaPct: 20, minCurrentValue: 60, unit: 'minutes' }),
    rule('demand_usage', 'unserved_demand', 'Unserved demand', 'higher_is_bad', { minDeltaPct: 15 }),
    rule('billing_ar', 'collection_overdue_pct', 'Overdue collections', 'higher_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
  '23': [
    rule('job_cost_control', 'projected_margin_pct', 'Projected job margin', 'lower_is_bad', { minDeltaAbs: 2, unit: '%', owner: 'Project Executive' }),
    rule('job_cost_control', 'cost_variance', 'Job cost variance', 'higher_is_bad', { minDeltaPct: 10, minCurrentValue: 25000, owner: 'Project Executive' }),
    rule('commitments_forecast', 'eac_variance', 'EAC forecast variance', 'higher_is_bad', { minDeltaPct: 10, minCurrentValue: 25000, owner: 'Project Executive' }),
    rule('billing_cash', 'underbilled_amount', 'Underbilled amount', 'higher_is_bad', { minDeltaPct: 10, minCurrentValue: 25000, owner: 'Finance Owner' }),
    rule('project_portfolio', 'schedule_slippage_days', 'Schedule slippage', 'higher_is_bad', { minDeltaAbs: 3, unit: 'days', owner: 'Project Executive' }),
  ],
  '32': [
    rule('inventory', 'wip_value', 'WIP value', 'higher_is_bad', { minDeltaPct: 12, minCurrentValue: 50000 }),
    rule('production', 'yield_rate', 'Yield rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('orders_sales', 'late_order_count', 'Late orders', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5 }),
    rule('products', 'material_cost_variance', 'Material cost variance', 'higher_is_bad', { minDeltaPct: 10, minCurrentValue: 25000 }),
  ],
  '42': [
    rule('orders_sales', 'fill_rate', 'Fill rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('inventory', 'inventory_aging_value', 'Aged inventory value', 'higher_is_bad', { minDeltaPct: 12, minCurrentValue: 50000 }),
    rule('products_skus', 'gross_margin_pct', 'Product gross margin', 'lower_is_bad', { minDeltaAbs: 2, unit: '%' }),
    rule('orders_sales', 'backorder_count', 'Backorders', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 10 }),
  ],
  '45': [
    rule('sales_transactions', 'same_store_sales', 'Same-store sales', 'lower_is_bad', { minDeltaPct: 8, owner: 'Retail Lead' }),
    rule('products_assortment', 'sell_through_rate', 'Sell-through rate', 'lower_is_bad', { minDeltaAbs: 4, unit: '%', owner: 'Retail Lead' }),
    rule('products_assortment', 'markdown_pct', 'Markdown rate', 'higher_is_bad', { minDeltaAbs: 3, unit: '%', owner: 'Retail Lead' }),
    rule('inventory', 'shrink_value', 'Shrink value', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 10000, owner: 'Retail Lead' }),
  ],
  '48': [
    rule('shipments_orders', 'on_time_delivery_pct', 'On-time delivery', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('routes_lanes_services', 'lane_margin_pct', 'Lane margin', 'lower_is_bad', { minDeltaAbs: 2, unit: '%' }),
    rule('capacity_assets', 'asset_utilization_pct', 'Asset utilization', 'lower_is_bad', { minDeltaAbs: 4, unit: '%' }),
    rule('shipments_orders', 'claims_value', 'Claims value', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 10000 }),
  ],
  '51': [
    rule('product_platform', 'uptime_pct', 'Platform uptime', 'lower_is_bad', { minDeltaAbs: 0.5, unit: '%', criticalCurrentValue: 99 }),
    rule('customers_accounts', 'renewal_rate', 'Renewal rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('customers_accounts', 'churn_rate', 'Churn rate', 'higher_is_bad', { minDeltaAbs: 2, unit: '%' }),
    rule('support_success', 'open_critical_ticket_count', 'Open critical tickets', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 3 }),
  ],
  '52': [
    rule('portfolio_book', 'delinquency_rate', 'Delinquency rate', 'higher_is_bad', { minDeltaAbs: 2, unit: '%' }),
    rule('risk_losses', 'claims_ratio', 'Claims ratio', 'higher_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('originations_new_business', 'new_business_volume', 'New business volume', 'lower_is_bad', { minDeltaPct: 12 }),
    rule('customers_members', 'retention_rate', 'Retention rate', 'lower_is_bad', { minDeltaAbs: 2, unit: '%' }),
  ],
  '53': [
    rule('residential_real_estate', 'closings_count', 'Residential closings', 'lower_is_bad', { minDeltaPct: 12, owner: 'Sales Lead' }),
    rule('residential_real_estate', 'pending_pipeline_value', 'Pending residential pipeline', 'lower_is_bad', { minDeltaPct: 10, minCurrentValue: 25000, owner: 'Sales Lead' }),
    rule('residential_real_estate', 'days_on_market', 'Days on market', 'higher_is_bad', { minDeltaPct: 10, minCurrentValue: 30, unit: 'days', rollup: 'average', owner: 'Sales Lead' }),
    rule('residential_real_estate', 'gci', 'Gross commission income', 'lower_is_bad', { minDeltaPct: 12, minCurrentValue: 25000, owner: 'Sales Lead' }),
    rule('mortgage', 'pull_through_rate', 'Mortgage pull-through', 'lower_is_bad', { minDeltaAbs: 4, unit: '%', owner: 'Mortgage Lead' }),
    rule('mortgage', 'loan_cycle_days', 'Mortgage cycle time', 'higher_is_bad', { minDeltaAbs: 3, unit: 'days', rollup: 'average', owner: 'Mortgage Lead' }),
    rule('title_company', 'delayed_file_count', 'Delayed title files', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 3, owner: 'Title Lead' }),
    rule('insurance_services', 'renewal_rate', 'Insurance renewal rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%', owner: 'Insurance Lead' }),
    rule('commercial_real_estate', 'deal_pipeline_value', 'Commercial deal pipeline', 'lower_is_bad', { minDeltaPct: 10, minCurrentValue: 50000, owner: 'Brokerage Lead' }),
    rule('property_management', 'occupancy_pct', 'Occupancy', 'lower_is_bad', { minDeltaAbs: 2, unit: '%', owner: 'Property Management Lead' }),
    rule('property_management', 'rent_delinquency_pct', 'Rent delinquency', 'higher_is_bad', { minDeltaAbs: 2, unit: '%', owner: 'Property Management Lead' }),
    rule('maintenance_work_orders', 'aged_work_order_count', 'Aged maintenance work orders', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5, owner: 'Property Management Lead' }),
  ],
  '54': [
    rule('time_utilization', 'utilization_pct', 'Utilization', 'lower_is_bad', { minDeltaAbs: 4, unit: '%' }),
    rule('projects_engagements', 'realization_pct', 'Realization', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('projects_engagements', 'wip_aging_value', 'Aged WIP', 'higher_is_bad', { minDeltaPct: 12, minCurrentValue: 25000 }),
    rule('sales_pipeline', 'qualified_pipeline_value', 'Qualified pipeline', 'lower_is_bad', { minDeltaPct: 10, minCurrentValue: 25000, owner: 'Sales Lead' }),
  ],
  '56': [
    rule('work_orders_service_delivery', 'missed_service_count', 'Missed services', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5 }),
    rule('assets_routes', 'route_productivity', 'Route productivity', 'lower_is_bad', { minDeltaPct: 8 }),
    rule('labor_scheduling', 'unfilled_shift_count', 'Unfilled shifts', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 3 }),
    rule('customers_sites', 'contract_renewal_rate', 'Contract renewal rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
  '61': [
    rule('enrollment_students', 'enrollment_count', 'Enrollment', 'lower_is_bad', { minDeltaPct: 8 }),
    rule('enrollment_students', 'attendance_rate', 'Attendance rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('programs_courses', 'program_utilization_pct', 'Program utilization', 'lower_is_bad', { minDeltaAbs: 4, unit: '%' }),
    rule('ar', 'tuition_overdue_pct', 'Overdue tuition', 'higher_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
  '62': [
    rule('patients_encounters', 'encounter_volume', 'Encounter volume', 'lower_is_bad', { minDeltaPct: 8, owner: 'Clinical Ops Lead' }),
    rule('payors_customers', 'denial_rate', 'Denial rate', 'higher_is_bad', { minDeltaAbs: 2, unit: '%', owner: 'Revenue Cycle Lead' }),
    rule('staffing_providers', 'provider_productivity', 'Provider productivity', 'lower_is_bad', { minDeltaPct: 8, owner: 'Clinical Ops Lead' }),
    rule('services_procedures', 'authorization_delay_count', 'Authorization delays', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5, owner: 'Revenue Cycle Lead' }),
  ],
  '71': [
    rule('ticketing_sales', 'attendance_count', 'Attendance', 'lower_is_bad', { minDeltaPct: 10 }),
    rule('events_programming', 'event_margin_pct', 'Event margin', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('venues_assets', 'venue_utilization_pct', 'Venue utilization', 'lower_is_bad', { minDeltaAbs: 4, unit: '%' }),
    rule('customers_members', 'membership_retention_rate', 'Membership retention', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
  '72': [
    rule('sales', 'revpar', 'RevPAR', 'lower_is_bad', { minDeltaPct: 8, owner: 'General Manager' }),
    rule('sales', 'covers_count', 'Covers', 'lower_is_bad', { minDeltaPct: 10, owner: 'General Manager' }),
    rule('inventory', 'food_cost_pct', 'Food cost rate', 'higher_is_bad', { minDeltaAbs: 2, unit: '%', owner: 'General Manager' }),
    rule('inventory', 'spoilage_value', 'Spoilage value', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5000, owner: 'General Manager' }),
  ],
  '81': [
    rule('jobs_work_orders', 'open_work_order_count', 'Open work orders', 'higher_is_bad', { minDeltaPct: 15, minCurrentValue: 5 }),
    rule('jobs_work_orders', 'repeat_issue_rate', 'Repeat issue rate', 'higher_is_bad', { minDeltaAbs: 3, unit: '%' }),
    rule('labor_technicians', 'technician_utilization_pct', 'Technician utilization', 'lower_is_bad', { minDeltaAbs: 4, unit: '%' }),
    rule('customers', 'repeat_customer_rate', 'Repeat customer rate', 'lower_is_bad', { minDeltaAbs: 3, unit: '%' }),
  ],
};

function rule(
  moduleKey: string,
  metricKey: string,
  label: string,
  badDirection: BadDirection,
  opts: Partial<Omit<SectorMetricRule, 'moduleKey' | 'metricKey' | 'label' | 'badDirection'>> = {}
): SectorMetricRule {
  return {
    moduleKey,
    metricKey,
    label,
    badDirection,
    rollup: opts.rollup || (opts.unit === '%' ? 'average' : 'sum'),
    minCurrentValue: opts.minCurrentValue ?? 0,
    minPriorValue: opts.minPriorValue ?? 0,
    minDeltaAbs: opts.minDeltaAbs,
    minDeltaPct: opts.minDeltaPct ?? 10,
    criticalCurrentValue: opts.criticalCurrentValue,
    unit: opts.unit,
    owner: opts.owner || 'Ops Lead',
    drillView: opts.drillView || 'operations',
  };
}

function normalizeSectorCategory(value?: string | null): string {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0');
  return raw || '01';
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return (numerator / denominator) * 100;
}

function formatMetricValue(value: number, unit?: string | null, currency: string = 'USD'): string {
  if (unit === '$' || unit === 'currency') {
    return formatMoneyShared(value, { currency, decimals: 0 });
  }
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit) return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDeltaPct(value: number | null): string {
  if (value == null) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function scoreComparison(ruleDef: SectorMetricRule, comparison: MetricComparison): number {
  const pctMagnitude = Math.abs(comparison.deltaPct || 0);
  const thresholdBonus =
    ruleDef.criticalCurrentValue != null &&
    ((ruleDef.badDirection === 'higher_is_bad' && comparison.currentValue >= ruleDef.criticalCurrentValue) ||
      (ruleDef.badDirection === 'lower_is_bad' && comparison.currentValue <= ruleDef.criticalCurrentValue))
      ? 12
      : 0;
  return Math.min(100, Math.round(68 + pctMagnitude / 2 + thresholdBonus));
}

function aggregateValues(values: number[], rollup: Rollup): number {
  if (!values.length) return 0;
  if (rollup === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (rollup === 'latest') return values[values.length - 1];
  return values.reduce((sum, value) => sum + value, 0);
}

function compareMetricRows(rows: SectorMetricRow[], ruleDef: SectorMetricRule): MetricComparison | null {
  const byDate = new Map<string, number[]>();
  rows
    .filter((row) => row.moduleKey === ruleDef.moduleKey && row.metricKey === ruleDef.metricKey)
    .sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime())
    .forEach((row) => {
      const key = dateKey(row.snapshotDate);
      byDate.set(key, [...(byDate.get(key) || []), asNumber(row.value)]);
    });

  const dates = Array.from(byDate.keys()).sort();
  if (dates.length < 2) return null;

  const currentDate = dates[dates.length - 1];
  const priorDate = dates[dates.length - 2];
  const rollup = ruleDef.rollup || 'sum';
  const currentValue = aggregateValues(byDate.get(currentDate) || [], rollup);
  const priorValue = aggregateValues(byDate.get(priorDate) || [], rollup);
  const delta = currentValue - priorValue;
  return {
    currentValue,
    priorValue,
    delta,
    deltaPct: pct(delta, Math.abs(priorValue)),
    currentDate,
    priorDate,
  };
}

function comparisonIsBad(ruleDef: SectorMetricRule, comparison: MetricComparison): boolean {
  if (Math.abs(comparison.currentValue) < (ruleDef.minCurrentValue ?? 0)) return false;
  if (Math.abs(comparison.priorValue) < (ruleDef.minPriorValue ?? 0)) return false;

  const deltaPct = comparison.deltaPct ?? 0;
  const badPct =
    ruleDef.badDirection === 'higher_is_bad'
      ? deltaPct >= (ruleDef.minDeltaPct ?? 10)
      : deltaPct <= -(ruleDef.minDeltaPct ?? 10);
  const badAbs =
    ruleDef.minDeltaAbs != null
      ? ruleDef.badDirection === 'higher_is_bad'
        ? comparison.delta >= ruleDef.minDeltaAbs
        : comparison.delta <= -ruleDef.minDeltaAbs
      : false;
  const critical =
    ruleDef.criticalCurrentValue != null
      ? ruleDef.badDirection === 'higher_is_bad'
        ? comparison.currentValue >= ruleDef.criticalCurrentValue
        : comparison.currentValue <= ruleDef.criticalCurrentValue
      : false;

  return badPct || badAbs || critical;
}

function entityKey(row: SectorMetricRow): string {
  return [row.entityType || 'entity', row.entityId || row.entityName || 'unknown'].join(':');
}

function findWorstEntity(rows: SectorMetricRow[], ruleDef: SectorMetricRule, comparison: MetricComparison): { name: string; comparison: MetricComparison } | null {
  const candidateRows = rows.filter(
    (row) =>
      row.moduleKey === ruleDef.moduleKey &&
      row.metricKey === ruleDef.metricKey &&
      dateKey(row.snapshotDate) === comparison.currentDate &&
      (row.entityName || row.entityId)
  );
  if (!candidateRows.length) return null;

  const candidates = candidateRows
    .map((row) => {
      const key = entityKey(row);
      const related = rows.filter(
        (candidate) =>
          candidate.moduleKey === ruleDef.moduleKey &&
          candidate.metricKey === ruleDef.metricKey &&
          entityKey(candidate) === key &&
          (dateKey(candidate.snapshotDate) === comparison.currentDate || dateKey(candidate.snapshotDate) === comparison.priorDate)
      );
      const entityComparison = compareMetricRows(related, ruleDef);
      if (!entityComparison || !comparisonIsBad(ruleDef, entityComparison)) return null;
      return {
        name: String(row.entityName || row.entityId || '').trim(),
        comparison: entityComparison,
      };
    })
    .filter((candidate): candidate is { name: string; comparison: MetricComparison } => Boolean(candidate));

  return candidates.sort((a, b) => Math.abs(b.comparison.delta) - Math.abs(a.comparison.delta))[0] || null;
}

export async function ensureOperationalMetricSnapshotTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OperationalMetricSnapshot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "sectorCategory" TEXT,
      "moduleKey" TEXT NOT NULL,
      "metricKey" TEXT NOT NULL,
      "metricLabel" TEXT,
      "snapshotDate" TIMESTAMP NOT NULL,
      "value" DOUBLE PRECISION NOT NULL,
      "unit" TEXT,
      "entityType" TEXT,
      "entityId" TEXT,
      "entityName" TEXT,
      "dimensions" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "sourceSystem" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OperationalMetricSnapshot_company_metric_date_idx"
    ON "OperationalMetricSnapshot"("companyId", "moduleKey", "metricKey", "snapshotDate")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OperationalMetricSnapshot_company_sector_idx"
    ON "OperationalMetricSnapshot"("companyId", "sectorCategory")
  `);
}

export async function loadSectorMetricRows(companyId: string, startDate: Date): Promise<SectorMetricRow[]> {
  await ensureOperationalMetricSnapshotTable();
  return prisma.$queryRawUnsafe<SectorMetricRow[]>(
    `SELECT "companyId", "sectorCategory", "moduleKey", "metricKey", "metricLabel", "snapshotDate", "value", "unit", "entityType", "entityId", "entityName", "dimensions", "sourceSystem"
     FROM "OperationalMetricSnapshot"
     WHERE "companyId" = $1
       AND "snapshotDate" >= $2
     ORDER BY "snapshotDate" ASC`,
    companyId,
    startDate
  );
}

export function buildSectorExceptionAlerts(params: {
  companyId: string;
  sectorCategory?: string | null;
  rows: SectorMetricRow[];
  nowIso: string;
  currency?: string | null;
}): PulseAlertInput[] {
  const sectorCategory = normalizeSectorCategory(params.sectorCategory);
  const rules = SECTOR_RULES[sectorCategory] || SECTOR_RULES['01'];
  if (!params.rows.length || !rules.length) return [];
  const currency = String(params.currency || 'USD').toUpperCase();

  return rules
    .map((ruleDef) => {
      const metricRows = params.rows.filter((row) => row.moduleKey === ruleDef.moduleKey && row.metricKey === ruleDef.metricKey);
      const comparison = compareMetricRows(metricRows, ruleDef);
      if (!comparison || !comparisonIsBad(ruleDef, comparison)) return null;

      const unit = ruleDef.unit || metricRows[0]?.unit;
      const worstEntity = findWorstEntity(metricRows, ruleDef, comparison);
      const current = formatMetricValue(comparison.currentValue, unit, currency);
      const prior = formatMetricValue(comparison.priorValue, unit, currency);
      const deltaPct = formatDeltaPct(comparison.deltaPct);
      const directionWord = ruleDef.badDirection === 'higher_is_bad' ? 'increased' : 'fell';
      const whereText = worstEntity ? ` The largest issue is ${worstEntity.name}.` : '';
      const priorityScore = scoreComparison(ruleDef, comparison);

      return {
        fingerprint: `sector:${sectorCategory}:${ruleDef.moduleKey}:${ruleDef.metricKey}:${comparison.currentDate}`,
        source: 'sector-exception',
        title: `${ruleDef.label} deteriorated`,
        detail: `${ruleDef.label} ${directionWord} to ${current} from ${prior} (${deltaPct}) versus the prior snapshot.${whereText}`,
        owner: ruleDef.owner,
        drillView: ruleDef.drillView,
        deltaText: deltaPct,
        updatedAt: `${comparison.currentDate}T00:00:00.000Z`,
        itemLabel: worstEntity?.name || ruleDef.label,
        priorityScore,
        bucket: priorityScore >= 70 ? 'attention' : 'monitoring',
        explainability: {
          triggerName: `Sector ${sectorCategory} ${ruleDef.label} exception`,
          formula: `Compare ${ruleDef.moduleKey}.${ruleDef.metricKey} latest snapshot to prior snapshot; emit only when movement is material and in the bad direction.`,
          threshold: [
            ruleDef.minDeltaPct != null ? `bad-direction change >= ${ruleDef.minDeltaPct}%` : '',
            ruleDef.minDeltaAbs != null ? `absolute bad-direction change >= ${formatMetricValue(ruleDef.minDeltaAbs, unit, currency)}` : '',
            ruleDef.criticalCurrentValue != null ? `critical value ${formatMetricValue(ruleDef.criticalCurrentValue, unit, currency)}` : '',
          ]
            .filter(Boolean)
            .join(' OR '),
          reasonNow: `${comparison.currentDate}: ${current}; ${comparison.priorDate}: ${prior}; delta ${formatMetricValue(comparison.delta, unit)} (${deltaPct}).`,
          policySource: 'Company Pulse sector exception playbook',
          dataRefs: ['OperationalMetricSnapshot'],
          sourceTimestamp: `${comparison.currentDate}T00:00:00.000Z`,
        },
      } satisfies PulseAlertInput;
    })
    .filter(Boolean) as PulseAlertInput[];
}

export function getSectorMetricCoverage(rows: SectorMetricRow[]): { count: number; latestDate: string | null } {
  const latest = rows.reduce<Date | null>((max, row) => {
    if (!max || row.snapshotDate.getTime() > max.getTime()) return row.snapshotDate;
    return max;
  }, null);
  return {
    count: rows.length,
    latestDate: latest ? latest.toISOString() : null,
  };
}
