export type OpsDataType =
  | 'customers'
  | 'sales'
  | 'customers-sites'
  | 'ar-aging'
  | 'ap-aging'
  | 'products'
  | 'labor-scheduling'
  | 'hiring'
  | 'inventory'
  | 'cash'
  | 'loans'
  | 'cap-table'
  | 'daily-financials'
  | 'revenue-billables'
  | 'unit-economics'
  // Construction-sector (industrySectorCategory === '23') native modules.
  // Backed by /api/operational-data?type=… mock for M2-M5 and by Vista Cloud
  // snapshot tables in M6+. See docs/CONSTRUCTION_SECTOR_DASHBOARD_DESIGN.md.
  | 'job-cost-control'
  | 'project-portfolio'
  | 'commitments-forecast'
  | 'billing-cash'
  | 'construction-ar'
  | 'construction-ap';

type ModuleDefinition = {
  key: string;
  label: string;
  dataType?: OpsDataType;
};

const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'working_capital_forecast', label: 'Working Capital Forecast' },
  { key: 'working-capital-forecast', label: 'Working Capital Forecast' },
  { key: 'daily_financials', label: 'Daily Financials', dataType: 'daily-financials' },
  { key: 'daily-financials', label: 'Daily Financials', dataType: 'daily-financials' },
  { key: 'cash', label: 'Cash', dataType: 'cash' },
  { key: 'cash_liquidity', label: 'Cash & Liquidity', dataType: 'cash' },
  { key: 'loans', label: 'Loans', dataType: 'loans' },
  { key: 'debt_loans', label: 'Loans', dataType: 'loans' },
  { key: 'cap_table', label: 'Cap Table', dataType: 'cap-table' },
  { key: 'cap-table', label: 'Cap Table', dataType: 'cap-table' },
  { key: 'ar', label: 'AR', dataType: 'ar-aging' },
  { key: 'billing_ar', label: 'Billing & AR', dataType: 'ar-aging' },
  { key: 'ar_receipts', label: 'AR / Receipts', dataType: 'ar-aging' },
  { key: 'receivables', label: 'Receivables', dataType: 'ar-aging' },
  { key: 'ap', label: 'AP', dataType: 'ap-aging' },
  { key: 'payables', label: 'Payables', dataType: 'ap-aging' },
  { key: 'inventory', label: 'Inventory', dataType: 'inventory' },
  { key: 'sales', label: 'Sales', dataType: 'sales' },
  { key: 'orders_sales', label: 'Orders / Sales', dataType: 'customers' },
  { key: 'sales_transactions', label: 'Sales Transactions', dataType: 'customers' },
  { key: 'sales_pipeline', label: 'Sales / Pipeline', dataType: 'customers' },
  { key: 'backlog_sales', label: 'Backlog / Sales', dataType: 'customers' },
  { key: 'leasing_sales', label: 'Leasing / Sales', dataType: 'customers' },
  { key: 'ticketing_sales', label: 'Ticketing / Sales', dataType: 'customers' },
  { key: 'customers', label: 'Customers', dataType: 'customers' },
  { key: 'customers_accounts', label: 'Customers / Accounts', dataType: 'customers' },
  { key: 'customers_members', label: 'Customers / Members', dataType: 'customers' },
  { key: 'clients_customers', label: 'Clients / Customers', dataType: 'customers' },
  { key: 'tenants_customers', label: 'Tenants / Customers', dataType: 'customers' },
  { key: 'guests_customers', label: 'Guests / Customers', dataType: 'customers' },
  { key: 'customers_sites', label: 'Customers / Sites', dataType: 'customers-sites' },
  { key: 'payors_customers', label: 'Payors / Customers', dataType: 'customers' },
  { key: 'products', label: 'Products', dataType: 'products' },
  { key: 'products_skus', label: 'Products / SKUs', dataType: 'products' },
  { key: 'products_assortment', label: 'Products / Assortment', dataType: 'products' },
  { key: 'offerings', label: 'Offerings', dataType: 'products' },
  { key: 'service_catalog', label: 'Service Catalog', dataType: 'products' },
  { key: 'production', label: 'Production', dataType: 'products' },
  { key: 'demand_usage', label: 'Demand & Usage', dataType: 'products' },
  { key: 'projects_wip', label: 'Projects / WIP', dataType: 'products' },
  { key: 'projects_engagements', label: 'Projects / Engagements', dataType: 'products' },
  { key: 'work_orders_service_delivery', label: 'Work Orders / Service Delivery', dataType: 'products' },
  { key: 'patients_encounters', label: 'Patients / Encounters', dataType: 'products' },
  { key: 'events_programming', label: 'Events / Programming', dataType: 'products' },
  { key: 'jobs_work_orders', label: 'Jobs / Work Orders', dataType: 'products' },
  { key: 'product_platform', label: 'Product / Platform', dataType: 'products' },
  { key: 'support_success', label: 'Support / Success', dataType: 'products' },
  { key: 'portfolio_book', label: 'Portfolio / Book', dataType: 'products' },
  { key: 'originations_new_business', label: 'Originations / New Business', dataType: 'products' },
  { key: 'risk_losses', label: 'Risk / Losses', dataType: 'products' },
  { key: 'maintenance_work_orders', label: 'Maintenance / Work Orders', dataType: 'products' },
  { key: 'time_utilization', label: 'Time & Utilization', dataType: 'products' },
  { key: 'labor_scheduling', label: 'Labor & Scheduling', dataType: 'labor-scheduling' },
  { key: 'hiring', label: 'Hiring', dataType: 'hiring' },
  { key: 'assets_routes', label: 'Assets & Routes', dataType: 'products' },
  { key: 'staffing', label: 'Staffing', dataType: 'products' },
  { key: 'staffing_providers', label: 'Staffing / Providers', dataType: 'products' },
  { key: 'outcomes', label: 'Outcomes', dataType: 'products' },
  { key: 'venues_assets', label: 'Venues / Assets', dataType: 'products' },
  { key: 'units_properties', label: 'Units / Properties', dataType: 'products' },
  { key: 'commercial_property_types', label: 'Commercial Property Types', dataType: 'products' },
  { key: 'assets_equipment', label: 'Assets & Equipment', dataType: 'products' },
  { key: 'network_assets', label: 'Network Assets', dataType: 'products' },
  { key: 'routes_lanes_services', label: 'Routes / Lanes / Services', dataType: 'products' },
  { key: 'shipments_orders', label: 'Shipments / Orders', dataType: 'products' },
  { key: 'capacity_assets', label: 'Capacity & Assets', dataType: 'products' },
  { key: 'labor_equipment', label: 'Labor & Equipment', dataType: 'products' },
  { key: 'enrollment_students', label: 'Enrollment / Students', dataType: 'customers' },
  { key: 'programs_courses', label: 'Programs / Courses', dataType: 'products' },
  { key: 'services_procedures', label: 'Services / Procedures', dataType: 'products' },
  { key: 'rates_revenue', label: 'Rates & Revenue', dataType: 'customers' },
  { key: 'revenue_billables', label: 'Revenue & Billables', dataType: 'revenue-billables' },
  { key: 'unit_economics', label: 'Unit Economics', dataType: 'unit-economics' },
  // --- Construction sector ('23') native modules ---
  { key: 'job_cost_control', label: 'Job Cost Control', dataType: 'job-cost-control' },
  { key: 'project_portfolio', label: 'Project Portfolio', dataType: 'project-portfolio' },
  { key: 'commitments_forecast', label: 'Commitments & Forecast', dataType: 'commitments-forecast' },
  { key: 'billing_cash', label: 'Billing & Cash', dataType: 'billing-cash' },
  { key: 'construction_ar', label: 'AR', dataType: 'construction-ar' },
  { key: 'construction_ap', label: 'AP', dataType: 'construction-ap' },
];

const MODULE_MAP: Record<string, ModuleDefinition> = MODULE_DEFINITIONS.reduce((acc, module) => {
  acc[module.key] = module;
  return acc;
}, {} as Record<string, ModuleDefinition>);

function normalizeModuleToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\/&]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const MODULE_KEY_ALIASES: Record<string, string> = MODULE_DEFINITIONS.reduce((acc, module) => {
  const normalizedKey = normalizeModuleToken(module.key);
  if (normalizedKey) acc[normalizedKey] = module.key;
  const normalizedLabel = normalizeModuleToken(module.label);
  if (normalizedLabel && !acc[normalizedLabel]) acc[normalizedLabel] = module.key;
  return acc;
}, {} as Record<string, string>);

const LOANS_DEFAULT_ENABLED_COMPANY_IDS = new Set([
  // Atlantic Precision Resource: first live implementation for GL-derived loan tracking.
  'cmmcp278j0002kz0439rlixdj',
]);

export function resolveModuleKey(moduleKey: string): string {
  const raw = String(moduleKey || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (MODULE_MAP[lowered]) return lowered;
  const normalized = normalizeModuleToken(raw);
  if (!normalized) return lowered;
  return MODULE_KEY_ALIASES[normalized] || normalized;
}

export function mapModuleToDataType(moduleKey: string): OpsDataType | null {
  const key = resolveModuleKey(moduleKey);
  if (!key) return null;
  return MODULE_MAP[key]?.dataType || null;
}

export function getModuleLabel(moduleKey: string): string {
  const key = resolveModuleKey(moduleKey);
  if (!key) return '';
  return MODULE_MAP[key]?.label || key.replace(/_/g, ' ');
}

export function isLoansDefaultEnabledForCompany(companyId: string | null | undefined): boolean {
  return LOANS_DEFAULT_ENABLED_COMPANY_IDS.has(String(companyId || '').trim());
}
