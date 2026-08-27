export type SectorMasterTab = {
  key: string;
  label: string;
};

const UNIVERSAL_LEADING_TABS: SectorMasterTab[] = [
  { key: 'dashboard', label: 'Overview' },
  { key: 'forecast', label: 'Forecast' },
];

const UNIVERSAL_TRAILING_TABS: SectorMasterTab[] = [
  { key: 'daily_financials', label: 'Daily Financials' },
  { key: 'loans', label: 'Loans' },
];

const SECTOR_BODY_TABS: Record<string, SectorMasterTab[]> = {
  '01': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales', label: 'Sales' },
    { key: 'products', label: 'Products' },
    { key: 'customers', label: 'Customers' },
  ],
  '11': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'production', label: 'Production' },
    { key: 'products', label: 'Products' },
    { key: 'customers', label: 'Customers' },
  ],
  '21': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'production', label: 'Production' },
    { key: 'assets_equipment', label: 'Assets & Equipment' },
    { key: 'customers', label: 'Customers' },
  ],
  '22': [
    { key: 'cash', label: 'Cash' },
    { key: 'billing_ar', label: 'Billing & AR' },
    { key: 'ap', label: 'AP' },
    { key: 'network_assets', label: 'Network Assets' },
    { key: 'demand_usage', label: 'Demand & Usage' },
    { key: 'rates_revenue', label: 'Rates & Revenue' },
    { key: 'customers', label: 'Customers' },
  ],
  '23': [
    { key: 'cash', label: 'Cash' },
    { key: 'construction_ar', label: 'AR' },
    { key: 'construction_ap', label: 'AP' },
    { key: 'construction_inventory', label: 'Inventory' },
    { key: 'project_portfolio', label: 'Project Portfolio' },
    { key: 'job_cost_control', label: 'Job Cost Control' },
    { key: 'commitments_forecast', label: 'Commitments & Forecast' },
    { key: 'billing_cash', label: 'Billing & Cash' },
  ],
  '32': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales', label: 'Sales' },
    { key: 'products', label: 'Products' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'customers', label: 'Customers' },
  ],
  '42': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'orders_sales', label: 'Orders / Sales' },
    { key: 'products_skus', label: 'Products' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'customers', label: 'Customers' },
  ],
  '45': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar_receipts', label: 'AR / Receipts' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales_transactions', label: 'Sales Transactions' },
    { key: 'products_assortment', label: 'Products / Assortment' },
    { key: 'customers', label: 'Customers' },
  ],
  '48': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'capacity_assets', label: 'Capacity & Assets' },
    { key: 'shipments_orders', label: 'Shipments / Orders' },
    { key: 'routes_lanes_services', label: 'Routes / Lanes / Services' },
    { key: 'customers', label: 'Customers' },
  ],
  '51': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'product_platform', label: 'Product / Platform' },
    { key: 'sales_pipeline', label: 'Sales / Pipeline' },
    { key: 'customers_accounts', label: 'Customers / Accounts' },
    { key: 'support_success', label: 'Support / Success' },
  ],
  '52': [
    { key: 'cash_liquidity', label: 'Cash & Liquidity' },
    { key: 'receivables', label: 'Receivables' },
    { key: 'payables', label: 'Payables' },
    { key: 'portfolio_book', label: 'Portfolio / Book' },
    { key: 'originations_new_business', label: 'Originations / New Business' },
    { key: 'risk_losses', label: 'Risk / Losses' },
    { key: 'customers_members', label: 'Customers / Members' },
  ],
  '53': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'residential_real_estate', label: 'Residential Real Estate' },
    { key: 'mortgage', label: 'Mortgage' },
    { key: 'title_company', label: 'Title Company' },
    { key: 'insurance_services', label: 'Insurance Services' },
    { key: 'commercial_real_estate', label: 'Commercial Real Estate' },
    { key: 'property_management', label: 'Property Management' },
    { key: 'units_properties', label: 'Units / Properties' },
    { key: 'leasing_sales', label: 'Leasing / Sales' },
    { key: 'maintenance_work_orders', label: 'Maintenance / Work Orders' },
    { key: 'commercial_property_types', label: 'Commercial Property Types' },
  ],
  '54': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'projects_engagements', label: 'Projects / Engagements' },
    { key: 'time_utilization', label: 'Time & Utilization' },
    { key: 'sales_pipeline', label: 'Sales / Pipeline' },
    { key: 'clients_customers', label: 'Clients / Customers' },
  ],
  '56': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'work_orders_service_delivery', label: 'Work Orders / Service Delivery' },
    { key: 'labor_scheduling', label: 'Labor & Scheduling' },
    { key: 'hiring', label: 'Hiring' },
    { key: 'revenue_billables', label: 'Revenue & Billables' },
    { key: 'unit_economics', label: 'Unit Economics' },
    { key: 'assets_routes', label: 'Assets & Routes' },
    { key: 'customers_sites', label: 'Customers / Sites' },
  ],
  '61': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'enrollment_students', label: 'Enrollment / Students' },
    { key: 'programs_courses', label: 'Programs / Courses' },
    { key: 'staffing', label: 'Staffing' },
    { key: 'outcomes', label: 'Outcomes' },
  ],
  '62': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'patients_encounters', label: 'Patients / Encounters' },
    { key: 'services_procedures', label: 'Services / Procedures' },
    { key: 'staffing_providers', label: 'Staffing / Providers' },
    { key: 'payors_customers', label: 'Payors / Customers' },
  ],
  '71': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'events_programming', label: 'Events / Programming' },
    { key: 'ticketing_sales', label: 'Ticketing / Sales' },
    { key: 'venues_assets', label: 'Venues / Assets' },
    { key: 'customers_members', label: 'Customers / Members' },
  ],
  '72': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales', label: 'Sales' },
    { key: 'offerings', label: 'Offerings' },
    { key: 'guests_customers', label: 'Guests / Customers' },
  ],
  '81': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'jobs_work_orders', label: 'Jobs / Work Orders' },
    { key: 'service_catalog', label: 'Service Catalog' },
    { key: 'labor_technicians', label: 'Labor / Technicians' },
    { key: 'customers', label: 'Customers' },
  ],
};

function normalizeSector(sectorCategory?: string | null): string {
  const sector = String(sectorCategory || '').trim();
  return SECTOR_BODY_TABS[sector] ? sector : '01';
}

export function getSectorMasterTabs(sectorCategory?: string | null): SectorMasterTab[] {
  const body = SECTOR_BODY_TABS[normalizeSector(sectorCategory)] || SECTOR_BODY_TABS['01'];
  const seen = new Set<string>();
  return [...UNIVERSAL_LEADING_TABS, ...body, ...UNIVERSAL_TRAILING_TABS].filter((tab) => {
    if (seen.has(tab.key)) return false;
    seen.add(tab.key);
    return true;
  });
}

export function getSectorMasterTabKeys(sectorCategory?: string | null): string[] {
  return getSectorMasterTabs(sectorCategory).map((tab) => tab.key);
}

export function isSectorMasterTab(sectorCategory: string | null | undefined, moduleKey: string): boolean {
  return getSectorMasterTabKeys(sectorCategory).includes(String(moduleKey || '').trim());
}

export function getSectorMasterTabLabel(
  sectorCategory: string | null | undefined,
  moduleKey: string
): string | null {
  const key = String(moduleKey || '').trim();
  const match = getSectorMasterTabs(sectorCategory).find((tab) => tab.key === key);
  return match?.label || null;
}
