import prisma from '@/lib/prisma';
import { generateCompanyPulse } from '@/lib/company-pulse/generator';
import { ensureOperationalMetricSnapshotTable } from '@/lib/company-pulse/sector-exceptions';

type MetricSeed = {
  moduleKey: string;
  metricKey: string;
  metricLabel: string;
  unit?: string;
  prior: number;
  current: number;
  entityType?: string;
  entityName?: string;
};

const DEFAULT_COMPANY_ID = 'cmqb6e66i0003qhzgu451he2b';
const SOURCE_SYSTEM = 'mock-sector-pulse';

const SCENARIOS: Record<string, MetricSeed[]> = {
  '01': [
    metric('sales', 'order_volume', 'Order volume', 120, 92),
    metric('customers', 'active_customer_count', 'Active customers', 80, 68),
    metric('inventory', 'inventory_aging_value', 'Aged inventory value', 60000, 78000, '$'),
  ],
  '11': [
    metric('production', 'yield_rate', 'Yield rate', 88, 81, '%'),
    metric('production', 'production_volume', 'Production volume', 1200, 980),
    metric('inventory', 'spoilage_value', 'Spoilage value', 14000, 19000, '$'),
  ],
  '21': [
    metric('production', 'production_volume', 'Production volume', 8400, 7200),
    metric('assets_equipment', 'equipment_downtime_hours', 'Equipment downtime', 12, 18, 'hours'),
    metric('production', 'recovery_rate', 'Recovery rate', 91, 86, '%'),
  ],
  '22': [
    metric('network_assets', 'outage_minutes', 'Outage minutes', 90, 130, 'minutes'),
    metric('demand_usage', 'unserved_demand', 'Unserved demand', 1000, 1260),
    metric('billing_ar', 'collection_overdue_pct', 'Overdue collections', 25, 31, '%'),
  ],
  '23': [
    metric('job_cost_control', 'projected_margin_pct', 'Projected job margin', 14, 10.5, '%', 'job', 'Cedar Medical Buildout'),
    metric('commitments_forecast', 'eac_variance', 'EAC forecast variance', 65000, 91000, '$', 'job', 'Cedar Medical Buildout'),
    metric('billing_cash', 'underbilled_amount', 'Underbilled amount', 110000, 145000, '$', 'job', 'Ridgeview Apartments'),
  ],
  '32': [
    metric('inventory', 'wip_value', 'WIP value', 450000, 530000, '$'),
    metric('production', 'yield_rate', 'Yield rate', 92, 87, '%'),
    metric('orders_sales', 'late_order_count', 'Late orders', 18, 26),
  ],
  '42': [
    metric('orders_sales', 'fill_rate', 'Fill rate', 94, 89, '%'),
    metric('inventory', 'inventory_aging_value', 'Aged inventory value', 180000, 225000, '$'),
    metric('orders_sales', 'backorder_count', 'Backorders', 40, 52),
  ],
  '45': [
    metric('sales_transactions', 'same_store_sales', 'Same-store sales', 250000, 220000, '$'),
    metric('products_assortment', 'sell_through_rate', 'Sell-through rate', 62, 56, '%'),
    metric('products_assortment', 'markdown_pct', 'Markdown rate', 18, 23, '%'),
  ],
  '48': [
    metric('shipments_orders', 'on_time_delivery_pct', 'On-time delivery', 94, 89, '%'),
    metric('routes_lanes_services', 'lane_margin_pct', 'Lane margin', 16, 12, '%', 'lane', 'Dallas to Phoenix'),
    metric('shipments_orders', 'claims_value', 'Claims value', 18000, 26000, '$'),
  ],
  '51': [
    metric('product_platform', 'uptime_pct', 'Platform uptime', 99.7, 98.8, '%'),
    metric('customers_accounts', 'renewal_rate', 'Renewal rate', 91, 86, '%'),
    metric('support_success', 'open_critical_ticket_count', 'Open critical tickets', 4, 7),
  ],
  '52': [
    metric('portfolio_book', 'delinquency_rate', 'Delinquency rate', 3.8, 6.2, '%'),
    metric('risk_losses', 'claims_ratio', 'Claims ratio', 58, 64, '%'),
    metric('originations_new_business', 'new_business_volume', 'New business volume', 420000, 350000, '$'),
  ],
  '53': [
    metric('residential_real_estate', 'closings_count', 'Residential closings', 25, 18, undefined, 'office', 'Denver Office'),
    metric('residential_real_estate', 'pending_pipeline_value', 'Pending residential pipeline', 1200000, 900000, '$', 'office', 'Denver Office'),
    metric('maintenance_work_orders', 'aged_work_order_count', 'Aged maintenance work orders', 4, 9, undefined, 'property', 'North Ridge Portfolio'),
    metric('property_management', 'rent_delinquency_pct', 'Rent delinquency', 5.2, 8.1, '%', 'property', 'North Ridge Portfolio'),
  ],
  '54': [
    metric('time_utilization', 'utilization_pct', 'Utilization', 78, 72, '%'),
    metric('projects_engagements', 'realization_pct', 'Realization', 84, 79, '%'),
    metric('projects_engagements', 'wip_aging_value', 'Aged WIP', 70000, 92000, '$'),
  ],
  '56': [
    metric('work_orders_service_delivery', 'missed_service_count', 'Missed services', 8, 13),
    metric('assets_routes', 'route_productivity', 'Route productivity', 100, 88),
    metric('labor_scheduling', 'unfilled_shift_count', 'Unfilled shifts', 4, 7),
  ],
  '61': [
    metric('enrollment_students', 'enrollment_count', 'Enrollment', 1200, 1080),
    metric('enrollment_students', 'attendance_rate', 'Attendance rate', 92, 87, '%'),
    metric('ar', 'tuition_overdue_pct', 'Overdue tuition', 18, 24, '%'),
  ],
  '62': [
    metric('patients_encounters', 'encounter_volume', 'Encounter volume', 1600, 1430),
    metric('payors_customers', 'denial_rate', 'Denial rate', 7, 10.5, '%'),
    metric('services_procedures', 'authorization_delay_count', 'Authorization delays', 12, 18),
  ],
  '71': [
    metric('ticketing_sales', 'attendance_count', 'Attendance', 9000, 7700),
    metric('events_programming', 'event_margin_pct', 'Event margin', 24, 18, '%'),
    metric('venues_assets', 'venue_utilization_pct', 'Venue utilization', 71, 64, '%'),
  ],
  '72': [
    metric('sales', 'revpar', 'RevPAR', 142, 126, '$'),
    metric('sales', 'covers_count', 'Covers', 4200, 3600),
    metric('inventory', 'food_cost_pct', 'Food cost rate', 31, 35, '%'),
  ],
  '81': [
    metric('jobs_work_orders', 'open_work_order_count', 'Open work orders', 18, 25),
    metric('jobs_work_orders', 'repeat_issue_rate', 'Repeat issue rate', 9, 14, '%'),
    metric('labor_technicians', 'technician_utilization_pct', 'Technician utilization', 79, 73, '%'),
  ],
};

function metric(
  moduleKey: string,
  metricKey: string,
  metricLabel: string,
  prior: number,
  current: number,
  unit?: string,
  entityType?: string,
  entityName?: string
): MetricSeed {
  return { moduleKey, metricKey, metricLabel, prior, current, unit, entityType, entityName };
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function normalizeSectorCategory(value?: string | null): string {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return raw.padStart(2, '0');
  return raw || '01';
}

function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function rowId(companyId: string, seed: MetricSeed, snapshotDate: Date): string {
  const raw = `oms_${companyId}_${seed.moduleKey}_${seed.metricKey}_${snapshotDate.toISOString().slice(0, 10)}_${seed.entityName || 'company'}`;
  return raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 180);
}

async function insertMetricRow(companyId: string, sectorCategory: string, seed: MetricSeed, snapshotDate: Date, value: number) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OperationalMetricSnapshot"
      ("id", "companyId", "sectorCategory", "moduleKey", "metricKey", "metricLabel", "snapshotDate", "value", "unit", "entityType", "entityId", "entityName", "dimensions", "sourceSystem", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8, $9, $10, $11, $12, $13::jsonb, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT ("id")
     DO UPDATE SET
       "value" = EXCLUDED."value",
       "unit" = EXCLUDED."unit",
       "entityType" = EXCLUDED."entityType",
       "entityId" = EXCLUDED."entityId",
       "entityName" = EXCLUDED."entityName",
       "dimensions" = EXCLUDED."dimensions",
       "sourceSystem" = EXCLUDED."sourceSystem",
       "updatedAt" = CURRENT_TIMESTAMP`,
    rowId(companyId, seed, snapshotDate),
    companyId,
    sectorCategory,
    seed.moduleKey,
    seed.metricKey,
    seed.metricLabel,
    snapshotDate.toISOString(),
    value,
    seed.unit || null,
    seed.entityType || null,
    seed.entityName ? seed.entityName.toLowerCase().replace(/[^a-z0-9]+/g, '_') : null,
    seed.entityName || null,
    JSON.stringify({ seededFor: 'Daily Pulse sector exception testing' }),
    SOURCE_SYSTEM
  );
}

async function main() {
  const companyId = getArg('companyId') || DEFAULT_COMPANY_ID;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, industrySectorCategory: true, industrySector: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);

  const sectorCategory = normalizeSectorCategory(company.industrySectorCategory || String(company.industrySector || '').slice(0, 2));
  const seeds = SCENARIOS[sectorCategory] || SCENARIOS['01'];
  const currentDate = dateOnly(new Date());
  const priorDate = addUtcDays(currentDate, -7);

  await ensureOperationalMetricSnapshotTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "OperationalMetricSnapshot" WHERE "companyId" = $1 AND "sourceSystem" = $2`,
    companyId,
    SOURCE_SYSTEM
  );

  for (const seed of seeds) {
    await insertMetricRow(companyId, sectorCategory, seed, priorDate, seed.prior);
    await insertMetricRow(companyId, sectorCategory, seed, currentDate, seed.current);
  }

  const result = await generateCompanyPulse(companyId, {
    actorEmail: 'sector-pulse-mock-seed',
  });
  const sectorAlerts = result.alerts.filter((alert) => alert.source === 'sector-exception');

  console.log(
    JSON.stringify(
      {
        company: { id: company.id, name: company.name, sectorCategory },
        seededRows: seeds.length * 2,
        generatedAlertCount: result.generatedInputs.alertCount,
        sectorAlertCount: sectorAlerts.length,
        sectorAlerts: sectorAlerts.map((alert) => ({
          title: alert.title,
          detail: alert.detail,
          bucket: alert.bucket,
          priorityScore: alert.priorityScore,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
