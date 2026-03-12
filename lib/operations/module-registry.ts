export type OpsDataType = 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash' | 'daily-financials';

type ModuleDefinition = {
  key: string;
  label: string;
  dataType: OpsDataType;
};

const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'daily_financials', label: 'Daily Financials', dataType: 'daily-financials' },
  { key: 'daily-financials', label: 'Daily Financials', dataType: 'daily-financials' },
  { key: 'cash', label: 'Cash', dataType: 'cash' },
  { key: 'cash_liquidity', label: 'Cash & Liquidity', dataType: 'cash' },
  { key: 'ar', label: 'AR', dataType: 'ar-aging' },
  { key: 'billing_ar', label: 'Billing & AR', dataType: 'ar-aging' },
  { key: 'ar_receipts', label: 'AR / Receipts', dataType: 'ar-aging' },
  { key: 'receivables', label: 'Receivables', dataType: 'ar-aging' },
  { key: 'ap', label: 'AP', dataType: 'ap-aging' },
  { key: 'payables', label: 'Payables', dataType: 'ap-aging' },
  { key: 'inventory', label: 'Inventory', dataType: 'inventory' },
  { key: 'sales', label: 'Sales', dataType: 'customers' },
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
  { key: 'customers_sites', label: 'Customers / Sites', dataType: 'customers' },
  { key: 'payors_customers', label: 'Payors / Customers', dataType: 'customers' },
  { key: 'products', label: 'Products', dataType: 'products' },
  { key: 'products_skus', label: 'Products / SKUs', dataType: 'products' },
  { key: 'products_assortment', label: 'Products / Assortment', dataType: 'products' },
  { key: 'offerings', label: 'Offerings', dataType: 'products' },
  { key: 'service_catalog', label: 'Service Catalog', dataType: 'products' },
  { key: 'production', label: 'Production', dataType: 'products' },
  { key: 'demand_usage', label: 'Demand & Usage', dataType: 'products' },
  { key: 'projects_wip', label: 'Projects / WIP', dataType: 'products' },
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
  { key: 'labor_scheduling', label: 'Labor & Scheduling', dataType: 'products' },
  { key: 'assets_routes', label: 'Assets & Routes', dataType: 'products' },
  { key: 'staffing', label: 'Staffing', dataType: 'products' },
  { key: 'staffing_providers', label: 'Staffing / Providers', dataType: 'products' },
  { key: 'outcomes', label: 'Outcomes', dataType: 'products' },
  { key: 'venues_assets', label: 'Venues / Assets', dataType: 'products' },
  { key: 'units_properties', label: 'Units / Properties', dataType: 'products' },
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
];

const MODULE_MAP: Record<string, ModuleDefinition> = MODULE_DEFINITIONS.reduce((acc, module) => {
  acc[module.key] = module;
  return acc;
}, {} as Record<string, ModuleDefinition>);

export function mapModuleToDataType(moduleKey: string): OpsDataType | null {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key) return null;
  return MODULE_MAP[key]?.dataType || null;
}

export function getModuleLabel(moduleKey: string): string {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key) return '';
  return MODULE_MAP[key]?.label || key.replace(/_/g, ' ');
}
