import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';

type Frequency = 'daily' | 'weekly' | 'monthly';
type DataType = 'customers' | 'ar-aging' | 'ap-aging' | 'products' | 'inventory' | 'cash' | 'ap';

type Bucket = { key: string; label: string };
type SectorProfile = {
  customerPrefix: string;
  vendorPrefix: string;
  productPrefix: string;
  cashAccounts: string[];
  scale: number;
};

const TOP_LINE_BUCKETS_BY_SECTOR: Record<string, Bucket[]> = {
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
    { key: 'ar', label: 'AR (buyers, contracts, settlements)' },
    { key: 'ap', label: 'AP (inputs, labor contractors)' },
    { key: 'inventory', label: 'Inventory (seed/feed/chemicals + harvested goods)' },
    { key: 'production', label: 'Production (planting/harvest, yields, catch logs)' },
    { key: 'products', label: 'Products (crops/species/grades)' },
    { key: 'customers', label: 'Customers (buyers, processors, distributors)' },
  ],
  '21': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (offtake invoices, joint-interest billings)' },
    { key: 'ap', label: 'AP (services, rentals, chemicals, fuel)' },
    { key: 'inventory', label: 'Inventory (parts, consumables, produced stockpiles)' },
    { key: 'production', label: 'Production (tons/bbl/mcf, run time, recovery)' },
    { key: 'assets_equipment', label: 'Assets & Equipment (fleet, rigs, uptime/maintenance)' },
    { key: 'customers', label: 'Customers (offtakers, refiners, industrial buyers)' },
  ],
  '22': [
    { key: 'cash', label: 'Cash' },
    { key: 'billing_ar', label: 'Billing & AR (meter-to-cash, collections)' },
    { key: 'ap', label: 'AP (power/fuel purchases, maintenance vendors)' },
    { key: 'network_assets', label: 'Network Assets (generation, grid, pipes)' },
    { key: 'demand_usage', label: 'Demand & Usage (consumption, peak load)' },
    { key: 'rates_revenue', label: 'Rates & Revenue (tariffs, riders, revenue mix)' },
    { key: 'customers', label: 'Customers (accounts, meters, service orders)' },
  ],
  '23': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (progress billing, retainage, claims)' },
    { key: 'ap', label: 'AP (subs, materials, equipment rental)' },
    { key: 'projects_wip', label: 'Projects / WIP (job cost, percent complete)' },
    { key: 'labor_equipment', label: 'Labor & Equipment (crews, utilization)' },
    { key: 'backlog_sales', label: 'Backlog / Sales (awards, pipeline)' },
    { key: 'customers', label: 'Customers (owners/GCs, job sites)' },
  ],
  '32': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales', label: 'Sales' },
    { key: 'products', label: 'Products' },
    { key: 'customers', label: 'Customers' },
  ],
  '42': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory (on-hand, aging, turns)' },
    { key: 'orders_sales', label: 'Orders / Sales (order-to-ship, fill rate)' },
    { key: 'products_skus', label: 'Products / SKUs (pricing, margin, assortment)' },
    { key: 'customers', label: 'Customers (accounts, terms, buying patterns)' },
  ],
  '45': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar_receipts', label: 'AR / Receipts (settlement)' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory (in-stock, shrink, aging)' },
    { key: 'sales_transactions', label: 'Sales Transactions (traffic, conversion, basket)' },
    { key: 'products_assortment', label: 'Products / Assortment (markdowns, sell-through)' },
    { key: 'customers', label: 'Customers (loyalty, repeat rate)' },
  ],
  '48': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (freight billing, accessorials)' },
    { key: 'ap', label: 'AP (fuel, carriers, maintenance, labor)' },
    { key: 'capacity_assets', label: 'Capacity & Assets (fleet/warehouse utilization)' },
    { key: 'shipments_orders', label: 'Shipments / Orders (on-time, dwell, claims)' },
    { key: 'routes_lanes_services', label: 'Routes / Lanes / Services (cost per lane)' },
    { key: 'customers', label: 'Customers (shippers, contracts, service levels)' },
  ],
  '51': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (subscriptions, billing, renewals)' },
    { key: 'ap', label: 'AP' },
    { key: 'product_platform', label: 'Product / Platform (usage, uptime, releases)' },
    { key: 'sales_pipeline', label: 'Sales / Pipeline (new ARR, bookings)' },
    { key: 'customers_accounts', label: 'Customers / Accounts (retention, churn)' },
    { key: 'support_success', label: 'Support / Success (tickets, time-to-resolve)' },
  ],
  '52': [
    { key: 'cash_liquidity', label: 'Cash & Liquidity' },
    { key: 'receivables', label: 'Receivables (premiums/interest/fees due)' },
    { key: 'payables', label: 'Payables (claims payable, commissions, vendor AP)' },
    { key: 'portfolio_book', label: 'Portfolio / Book (loans, policies, AUM)' },
    { key: 'originations_new_business', label: 'Originations / New Business' },
    { key: 'risk_losses', label: 'Risk / Losses (delinquency, claims severity)' },
    { key: 'customers_members', label: 'Customers / Members (accounts, retention)' },
  ],
  '53': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (rent, CAM, late fees)' },
    { key: 'ap', label: 'AP (repairs, utilities, services)' },
    { key: 'units_properties', label: 'Units / Properties (occupancy, availability)' },
    { key: 'leasing_sales', label: 'Leasing / Sales (applications, renewals)' },
    { key: 'maintenance_work_orders', label: 'Maintenance / Work Orders' },
    { key: 'tenants_customers', label: 'Tenants / Customers (delinquency, retention)' },
  ],
  '54': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (billings, WIP, collections)' },
    { key: 'ap', label: 'AP' },
    { key: 'projects_engagements', label: 'Projects / Engagements (delivery, margin)' },
    { key: 'time_utilization', label: 'Time & Utilization (billable hours, realization)' },
    { key: 'sales_pipeline', label: 'Sales / Pipeline (bookings, backlog)' },
    { key: 'clients_customers', label: 'Clients / Customers (retention, expansion)' },
  ],
  '56': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (contract billing, service invoices)' },
    { key: 'ap', label: 'AP' },
    { key: 'work_orders_service_delivery', label: 'Work Orders / Service Delivery' },
    { key: 'labor_scheduling', label: 'Labor & Scheduling (staffing, productivity)' },
    { key: 'assets_routes', label: 'Assets & Routes (vehicles/equipment, route efficiency)' },
    { key: 'customers_sites', label: 'Customers / Sites (contracts, renewals)' },
  ],
  '61': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (tuition, fees, grants receivable)' },
    { key: 'ap', label: 'AP' },
    { key: 'enrollment_students', label: 'Enrollment / Students (counts, attendance)' },
    { key: 'programs_courses', label: 'Programs / Courses (capacity, utilization)' },
    { key: 'staffing', label: 'Staffing (faculty load, ratios)' },
    { key: 'outcomes', label: 'Outcomes (completion, retention)' },
  ],
  '62': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (claims, patient A/R, denials)' },
    { key: 'ap', label: 'AP' },
    { key: 'patients_encounters', label: 'Patients / Encounters (volume, throughput)' },
    { key: 'services_procedures', label: 'Services / Procedures (mix, utilization)' },
    { key: 'staffing_providers', label: 'Staffing / Providers (coverage, productivity)' },
    { key: 'payors_customers', label: 'Payors / Customers (mix, authorizations)' },
  ],
  '71': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (sponsors, group sales, memberships receivable)' },
    { key: 'ap', label: 'AP' },
    { key: 'events_programming', label: 'Events / Programming (schedule, profitability)' },
    { key: 'ticketing_sales', label: 'Ticketing / Sales (attendance, conversion)' },
    { key: 'venues_assets', label: 'Venues / Assets (capacity utilization)' },
    { key: 'customers_members', label: 'Customers / Members (retention, satisfaction)' },
  ],
  '72': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (group billing, OTAs, corporate accounts)' },
    { key: 'ap', label: 'AP' },
    { key: 'inventory', label: 'Inventory (food/bev, supplies; spoilage/waste)' },
    { key: 'sales', label: 'Sales (rooms/covers, RevPAR or sales per labor hour)' },
    { key: 'offerings', label: 'Offerings (room types, menus, packages)' },
    { key: 'guests_customers', label: 'Guests / Customers (reviews, repeat rate)' },
  ],
  '81': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR' },
    { key: 'ap', label: 'AP' },
    { key: 'jobs_work_orders', label: 'Jobs / Work Orders (volume, cycle time, first-time fix)' },
    { key: 'service_catalog', label: 'Service Catalog (service types, pricing, margin)' },
    { key: 'labor_technicians', label: 'Labor / Technicians (utilization, productivity)' },
    { key: 'customers', label: 'Customers (repeat, warranty/returns)' },
  ],
};

const SECTOR_PROFILES: Record<string, SectorProfile> = {
  '01': { customerPrefix: 'General', vendorPrefix: 'General', productPrefix: 'Core', cashAccounts: ['Operating Account', 'Reserve Account'], scale: 1.0 },
  '11': { customerPrefix: 'Ag Buyer', vendorPrefix: 'Input Supplier', productPrefix: 'Crop Lot', cashAccounts: ['Farm Operating', 'Harvest Reserve'], scale: 0.95 },
  '21': { customerPrefix: 'Offtaker', vendorPrefix: 'Field Services', productPrefix: 'Production Lot', cashAccounts: ['Operations Treasury', 'Royalty Clearing'], scale: 1.3 },
  '22': { customerPrefix: 'Service Account', vendorPrefix: 'Grid Vendor', productPrefix: 'Rate Program', cashAccounts: ['Utility Cash', 'Collections Account'], scale: 1.4 },
  '23': { customerPrefix: 'Project Owner', vendorPrefix: 'Subcontractor', productPrefix: 'Job Package', cashAccounts: ['Project Cash', 'Retainage Account'], scale: 1.2 },
  '32': { customerPrefix: 'Distributor', vendorPrefix: 'Raw Material Vendor', productPrefix: 'SKU', cashAccounts: ['Operating Cash', 'Payroll Cash'], scale: 1.15 },
  '42': { customerPrefix: 'Wholesale Account', vendorPrefix: 'Supplier', productPrefix: 'SKU', cashAccounts: ['Receipts Account', 'Settlement Account'], scale: 1.1 },
  '45': { customerPrefix: 'Retail Customer', vendorPrefix: 'Merch Vendor', productPrefix: 'Assortment SKU', cashAccounts: ['Store Deposits', 'Corporate Cash'], scale: 1.05 },
  '48': { customerPrefix: 'Shipper', vendorPrefix: 'Carrier Vendor', productPrefix: 'Lane Service', cashAccounts: ['Transit Cash', 'Fuel Clearing'], scale: 1.25 },
  '51': { customerPrefix: 'Account', vendorPrefix: 'Platform Vendor', productPrefix: 'Plan', cashAccounts: ['Subscription Cash', 'Deferred Revenue Clearing'], scale: 1.35 },
  '52': { customerPrefix: 'Member', vendorPrefix: 'Claims Vendor', productPrefix: 'Portfolio Product', cashAccounts: ['Liquidity Pool', 'Reg Capital Cash'], scale: 1.45 },
  '53': { customerPrefix: 'Tenant', vendorPrefix: 'Property Vendor', productPrefix: 'Unit Type', cashAccounts: ['Rent Collections', 'Property Reserve'], scale: 1.2 },
  '54': { customerPrefix: 'Client', vendorPrefix: 'Service Vendor', productPrefix: 'Engagement Type', cashAccounts: ['Operating Cash', 'Partner Distributions'], scale: 1.15 },
  '56': { customerPrefix: 'Contract Site', vendorPrefix: 'Ops Vendor', productPrefix: 'Service Package', cashAccounts: ['Service Receipts', 'Dispatch Cash'], scale: 1.1 },
  '61': { customerPrefix: 'Student Account', vendorPrefix: 'Campus Vendor', productPrefix: 'Program', cashAccounts: ['Tuition Collections', 'Grant Clearing'], scale: 0.9 },
  '62': { customerPrefix: 'Payor Account', vendorPrefix: 'Medical Vendor', productPrefix: 'Procedure Group', cashAccounts: ['Practice Operating', 'Claims Clearing'], scale: 1.3 },
  '71': { customerPrefix: 'Member', vendorPrefix: 'Event Vendor', productPrefix: 'Program Pass', cashAccounts: ['Ticketing Cash', 'Venue Reserve'], scale: 1.0 },
  '72': { customerPrefix: 'Guest Account', vendorPrefix: 'Hospitality Vendor', productPrefix: 'Offering', cashAccounts: ['Front Desk Cash', 'Food Service Cash'], scale: 1.2 },
  '81': { customerPrefix: 'Service Customer', vendorPrefix: 'Local Vendor', productPrefix: 'Service Line', cashAccounts: ['Service Receipts', 'Owner Draw Reserve'], scale: 0.95 },
};

type MockRequest = {
  type: DataType;
  companyId: string;
  sectorCategory?: string | null;
  frequency: Frequency;
  startDate: Date;
  endDate: Date;
  limit?: number;
};

function normalizeSectorCategory(sectorCategory?: string | null): string {
  if (!sectorCategory) return '01';
  const trimmed = String(sectorCategory).trim();
  if (TOP_LINE_BUCKETS_BY_SECTOR[trimmed]) return trimmed;
  const normalized = normalizeIndustrySectorCategory(trimmed);
  const fromNormalized: Record<string, string> = {
    DEFAULT: '01',
    AGRICULTURE: '11',
    MINING: '21',
    UTILITIES: '22',
    CONSTRUCTION: '23',
    MANUFACTURING: '32',
    WHOLESALE_TRADE: '42',
    RETAIL_TRADE: '45',
    TRANSPORTATION: '48',
    INFORMATION: '51',
    FINANCE_INSURANCE: '52',
    REAL_ESTATE: '53',
    PROFESSIONAL_SERVICES: '54',
    ADMIN_SUPPORT_WASTE: '56',
    EDUCATIONAL_SERVICES: '61',
    HEALTH_CARE_SOCIAL_ASSISTANCE: '62',
    ARTS_ENTERTAINMENT_RECREATION: '71',
    ACCOMMODATION_FOOD_SERVICES: '72',
    OTHER_SERVICES: '81',
  };
  return fromNormalized[normalized] || '01';
}

export function getSectorMockProfile(sectorCategory?: string | null): SectorProfile & { sectorCategory: string } {
  const code = normalizeSectorCategory(sectorCategory);
  const profile = SECTOR_PROFILES[code] || SECTOR_PROFILES['01'];
  return { sectorCategory: code, ...profile };
}

function listDates(startDate: Date, endDate: Date, frequency: Frequency): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dates.push(new Date(cursor));
    if (frequency === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (frequency === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  const maxPoints = frequency === 'daily' ? 30 : frequency === 'weekly' ? 20 : 12;
  return dates.slice(-maxPoints).reverse();
}

function metric(base: number, index: number, scale: number): number {
  const seasonal = 1 + Math.sin(index / 2.2) * 0.08;
  const trend = 1 + index * 0.012;
  return Math.round(base * seasonal * trend * scale * 100) / 100;
}

function topLineNames(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${String(i + 1).padStart(2, '0')}`);
}

export function getTopLineBucketsForSector(sectorCategory?: string | null): Bucket[] {
  const code = normalizeSectorCategory(sectorCategory);
  return TOP_LINE_BUCKETS_BY_SECTOR[code] || TOP_LINE_BUCKETS_BY_SECTOR['01'];
}

export function getSectorArApFallbacks(sectorCategory?: string | null) {
  const code = normalizeSectorCategory(sectorCategory);
  const profile = SECTOR_PROFILES[code] || SECTOR_PROFILES['01'];
  const customers = topLineNames(profile.customerPrefix, 12);
  const vendors = topLineNames(profile.vendorPrefix, 12);
  const scale = profile.scale;

  const unpaidByCustomer = customers.map((name, i) => {
    const current = metric(3800, i + 2, scale);
    const days1to30 = metric(1200, i + 2, scale);
    const days31to60 = metric(700, i + 2, scale);
    const days61to90 = metric(360, i + 2, scale);
    const days90plus = metric(180, i + 2, scale);
    return { customerName: name, current, days1to30, days31to60, days61to90, days90plus };
  });

  const unpaidByVendor = vendors.map((name, i) => {
    const current = metric(3400, i + 2, scale);
    const days1to30 = metric(1000, i + 2, scale);
    const days31to60 = metric(600, i + 2, scale);
    const days61to90 = metric(320, i + 2, scale);
    const days90plus = metric(140, i + 2, scale);
    return { vendorName: name, current, days1to30, days31to60, days61to90, days90plus };
  });

  const unpaidInvoices = unpaidByCustomer.slice(0, 10).map((row, i) => ({
    customerName: row.customerName,
    customerNumber: `C-${1000 + i}`,
    invoiceDate: `2026-01-${String((i % 20) + 1).padStart(2, '0')}`,
    dueDate: `2026-02-${String((i % 20) + 1).padStart(2, '0')}`,
    amountDue: row.current + row.days1to30,
  }));

  const unpaidBills = unpaidByVendor.slice(0, 10).map((row, i) => ({
    vendorName: row.vendorName,
    billNo: `B-${2000 + i}`,
    date: `2026-01-${String((i % 20) + 1).padStart(2, '0')}`,
    dueDate: `2026-02-${String((i % 20) + 1).padStart(2, '0')}`,
    amountDue: row.current + row.days1to30,
  }));

  const paidInvoices = unpaidByCustomer.slice(0, 10).map((row, i) => ({
    customerName: row.customerName,
    currentMonth: metric(1100, i + 1, scale),
    lastMonth: metric(1400, i + 1, scale),
    last12Months: metric(14500, i + 1, scale),
  }));

  const paidBills = unpaidByVendor.slice(0, 10).map((row, i) => ({
    vendorName: row.vendorName,
    currentMonth: metric(980, i + 1, scale),
    lastMonth: metric(1260, i + 1, scale),
    last12Months: metric(12600, i + 1, scale),
  }));

  const customerInvoices = unpaidInvoices.map((row, i) => ({
    customerName: row.customerName,
    invoiceNo: `INV-${3000 + i}`,
    date: row.invoiceDate,
    dueDate: row.dueDate,
    amountCurrency: row.amountDue,
    amountHome: row.amountDue,
    amountDueHome: i % 3 === 0 ? row.amountDue : 0,
  }));

  const vendorBills = unpaidBills.map((row, i) => ({
    vendorName: row.vendorName,
    billNo: `VB-${4000 + i}`,
    date: row.date,
    dueDate: row.dueDate,
    amountCurrency: row.amountDue,
    amountHome: row.amountDue,
    amountDueHome: i % 3 === 0 ? row.amountDue : 0,
  }));

  return {
    unpaidByCustomer,
    unpaidInvoices,
    paidInvoices,
    customerInvoices,
    unpaidByVendor,
    unpaidBills,
    paidBills,
    vendorBills,
  };
}

function buildCustomersResponse(req: MockRequest, profile: SectorProfile) {
  const customers = topLineNames(profile.customerPrefix, 8);
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.flatMap((date, i) =>
    customers.map((name, idx) => {
      const revenue = metric(5200 + idx * 550, i + idx + 1, profile.scale);
      const invoiceCount = Math.max(1, Math.round(metric(6 + idx, i + 1, 1)));
      return {
        companyId: req.companyId,
        snapshotDate: date.toISOString(),
        frequency: req.frequency,
        customerName: name,
        revenue,
        invoiceCount,
      };
    })
  );
  const limited = records.slice(0, req.limit || 1000);
  const totals = customers.map((name) => {
    const rows = limited.filter((r) => r.customerName === name);
    return {
      name,
      totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      totalInvoices: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
    };
  });
  return {
    records: limited,
    summary: {
      topCustomers: totals.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildArResponse(req: MockRequest, profile: SectorProfile) {
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.map((date, i) => {
    const totalAR = metric(88000, i + 1, profile.scale);
    const current = totalAR * 0.62;
    const days1to30 = totalAR * 0.18;
    const days31to60 = totalAR * 0.11;
    const days61to90 = totalAR * 0.06;
    const days90plus = totalAR * 0.03;
    return {
      companyId: req.companyId,
      snapshotDate: date.toISOString(),
      frequency: req.frequency,
      totalAR,
      current,
      days1to30,
      days31to60,
      days61to90,
      days90plus,
    };
  });
  const latest = records[0];
  const detail = getSectorArApFallbacks(req.sectorCategory);
  return {
    records,
    summary: {
      totalAR: latest.totalAR,
      currentPct: (latest.current / latest.totalAR) * 100,
      over30Pct: ((latest.days1to30 + latest.days31to60 + latest.days61to90 + latest.days90plus) / latest.totalAR) * 100,
      over90Pct: (latest.days90plus / latest.totalAR) * 100,
      dso: 42 + Math.round(profile.scale * 3),
      unpaidByCustomer: detail.unpaidByCustomer,
      unpaidInvoices: detail.unpaidInvoices,
      paidInvoices: detail.paidInvoices,
      customerInvoices: detail.customerInvoices,
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildApResponse(req: MockRequest, profile: SectorProfile) {
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.map((date, i) => {
    const totalAP = metric(72000, i + 1, profile.scale);
    const current = totalAP * 0.58;
    const days1to30 = totalAP * 0.2;
    const days31to60 = totalAP * 0.12;
    const days61to90 = totalAP * 0.07;
    const days90plus = totalAP * 0.03;
    return {
      companyId: req.companyId,
      snapshotDate: date.toISOString(),
      frequency: req.frequency,
      totalAP,
      current,
      days1to30,
      days31to60,
      days61to90,
      days90plus,
    };
  });
  const latest = records[0];
  const detail = getSectorArApFallbacks(req.sectorCategory);
  return {
    records,
    summary: {
      totalAP: latest.totalAP,
      currentPct: (latest.current / latest.totalAP) * 100,
      over30Pct: ((latest.days1to30 + latest.days31to60 + latest.days61to90 + latest.days90plus) / latest.totalAP) * 100,
      over90Pct: (latest.days90plus / latest.totalAP) * 100,
      dpo: 31 + Math.round(profile.scale * 2),
      unpaidByVendor: detail.unpaidByVendor,
      unpaidBills: detail.unpaidBills,
      paidBills: detail.paidBills,
      vendorBills: detail.vendorBills,
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildProductResponse(req: MockRequest, profile: SectorProfile) {
  const items = topLineNames(profile.productPrefix, 7);
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.flatMap((date, i) =>
    items.map((item, idx) => {
      const quantitySold = metric(42 + idx * 7, i + 1, profile.scale);
      const revenue = metric(4200 + idx * 750, i + idx + 1, profile.scale);
      const cogs = revenue * (0.58 + ((idx % 3) * 0.04));
      return {
        companyId: req.companyId,
        snapshotDate: date.toISOString(),
        frequency: req.frequency,
        itemName: item,
        sku: `SKU-${idx + 100}`,
        quantitySold,
        revenue,
        cogs,
      };
    })
  );
  const totals = items.map((name) => {
    const rows = records.filter((r) => r.itemName === name);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalCogs = rows.reduce((sum, row) => sum + row.cogs, 0);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantitySold, 0);
    return {
      name,
      sku: rows[0]?.sku,
      totalRevenue,
      totalCogs,
      totalQuantity,
      grossMargin: totalRevenue - totalCogs,
      grossMarginPct: totalRevenue ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0,
    };
  });
  return {
    records: records.slice(0, req.limit || 1000),
    summary: {
      topProducts: totals.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildInventoryResponse(req: MockRequest, profile: SectorProfile) {
  const items = topLineNames(profile.productPrefix, 8);
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.flatMap((date, i) =>
    items.map((item, idx) => {
      const qtyOnHand = metric(250 + idx * 18, i + 1, profile.scale);
      const avgCost = metric(24 + idx * 3.2, i + 1, profile.scale);
      const assetValue = qtyOnHand * avgCost;
      return {
        companyId: req.companyId,
        snapshotDate: date.toISOString(),
        frequency: req.frequency,
        itemName: item,
        sku: `INV-${idx + 200}`,
        qtyOnHand,
        avgCost,
        assetValue,
      };
    })
  );
  const latestDate = records[0]?.snapshotDate;
  const latest = records.filter((r) => r.snapshotDate === latestDate);
  return {
    records: records.slice(0, req.limit || 1000),
    summary: {
      totalValue: latest.reduce((sum, row) => sum + row.assetValue, 0),
      itemCount: latest.length,
      topItems: [...latest].sort((a, b) => b.assetValue - a.assetValue).slice(0, 10),
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildCashResponse(req: MockRequest, profile: SectorProfile) {
  const accounts = profile.cashAccounts;
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.flatMap((date, i) =>
    accounts.map((name, idx) => ({
      companyId: req.companyId,
      snapshotDate: date.toISOString(),
      frequency: req.frequency,
      accountName: name,
      accountNumber: `${4000 + idx}`,
      cashBalance: metric(118000 - idx * 18000, i + idx + 1, profile.scale),
    }))
  );
  const latestDate = records[0]?.snapshotDate;
  const latest = records.filter((r) => r.snapshotDate === latestDate);
  const previousDate = records.find((r) => r.snapshotDate !== latestDate)?.snapshotDate;
  const previous = previousDate ? records.filter((r) => r.snapshotDate === previousDate) : [];
  const totalCash = latest.reduce((sum, row) => sum + row.cashBalance, 0);
  const prevTotal = previous.reduce((sum, row) => sum + row.cashBalance, 0);
  const changeAmount = totalCash - prevTotal;
  const changePercent = prevTotal ? (changeAmount / prevTotal) * 100 : 0;
  const accountSummaries = accounts.map((name) => {
    const rows = records.filter((r) => r.accountName === name);
    const balances = rows.map((r) => r.cashBalance);
    return {
      accountName: name,
      currentBalance: rows[0]?.cashBalance || 0,
      avgBalance: balances.reduce((sum, b) => sum + b, 0) / Math.max(balances.length, 1),
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances),
    };
  });
  return {
    records: records.slice(0, req.limit || 1000),
    summary: {
      totalCash,
      changeAmount,
      changePercent,
      accountCount: latest.length,
      accounts: accountSummaries,
      avgTotalCash: records.reduce((sum, row) => sum + row.cashBalance, 0) / Math.max(records.length, 1),
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

function buildApBalanceResponse(req: MockRequest, profile: SectorProfile) {
  const apAccounts = [`${profile.vendorPrefix} — Trade AP`, `${profile.vendorPrefix} — Accrued`];
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const records = dates.flatMap((date, i) =>
    apAccounts.map((name, idx) => ({
      companyId: req.companyId,
      snapshotDate: date.toISOString(),
      frequency: req.frequency,
      accountName: name,
      accountNumber: `${30100 + idx}`,
      apBalance: metric(420000 - idx * 90000, i + idx + 3, profile.scale),
    }))
  );
  const latestDate = records[0]?.snapshotDate;
  const latest = records.filter((r) => r.snapshotDate === latestDate);
  const previousDate = records.find((r) => r.snapshotDate !== latestDate)?.snapshotDate;
  const previous = previousDate ? records.filter((r) => r.snapshotDate === previousDate) : [];
  const totalAP = latest.reduce((sum, row) => sum + row.apBalance, 0);
  const prevTotal = previous.reduce((sum, row) => sum + row.apBalance, 0);
  const changeAmount = totalAP - prevTotal;
  const changePercent = prevTotal ? (changeAmount / prevTotal) * 100 : 0;
  const accountSummaries = apAccounts.map((name) => {
    const rows = records.filter((r) => r.accountName === name);
    const balances = rows.map((r) => r.apBalance);
    return {
      accountName: name,
      currentBalance: rows[0]?.apBalance || 0,
      avgBalance: balances.reduce((sum, b) => sum + b, 0) / Math.max(balances.length, 1),
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances),
    };
  });
  return {
    records: records.slice(0, req.limit || 1000),
    summary: {
      totalAP,
      changeAmount,
      changePercent,
      accountCount: latest.length,
      accounts: accountSummaries,
      avgTotalAP: records.reduce((sum, row) => sum + row.apBalance, 0) / Math.max(records.length, 1),
      anchorDateIso: null,
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
    },
  };
}

export function buildOperationalMockResponse(req: MockRequest) {
  const code = normalizeSectorCategory(req.sectorCategory);
  const profile = SECTOR_PROFILES[code] || SECTOR_PROFILES['01'];
  if (req.type === 'customers') return buildCustomersResponse(req, profile);
  if (req.type === 'ar-aging') return buildArResponse(req, profile);
  if (req.type === 'ap-aging') return buildApResponse(req, profile);
  if (req.type === 'products') return buildProductResponse(req, profile);
  if (req.type === 'inventory') return buildInventoryResponse(req, profile);
  if (req.type === 'ap') return buildApBalanceResponse(req, profile);
  return buildCashResponse(req, profile);
}

export function buildOperationalMockSummaryCounts(sectorCategory?: string | null) {
  return {
    customerSalesRecords: 96,
    arAgingRecords: 12,
    apAgingRecords: 12,
    productSalesRecords: 84,
    inventoryRecords: 96,
    cashRecords: 24,
    topLineBuckets: getTopLineBucketsForSector(sectorCategory),
  };
}
