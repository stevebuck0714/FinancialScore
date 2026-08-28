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
type CompanyProductServiceCategory = {
  category: string;
  productsServices: string;
  primaryCustomers: string[];
};
type CompanyProductServiceProfile = {
  categories: CompanyProductServiceCategory[];
};
type CompanyReportingProfile = {
  managementHierarchy: {
    corporate: string;
    geographies: string[];
    countryMetrics: string[];
  };
  dimensions: Array<{
    name: string;
    levels: string[];
  }>;
  businessLines: Array<{
    name: string;
    offerings: string[];
  }>;
  customerSegments: string[];
  operationalKpis: string[];
  exampleQuestions: string[];
};

const COMPANY_PRODUCT_SERVICE_PROFILES: Record<string, CompanyProductServiceProfile> = {
  cmm21v70k0004kz04h9khgd8l: {
    categories: [
      {
        category: 'Commercial Rooftop Units',
        productsServices: 'Packaged rooftop HVAC units for light commercial buildings, schools, retail centers, and office properties',
        primaryCustomers: ['Keystone Mechanical Supply', 'Summit HVAC Distribution', 'Northstar Commercial Builders'],
      },
      {
        category: 'Air Handling Units',
        productsServices: 'Custom and semi-custom air handlers, blower assemblies, cabinet assemblies, and filtration sections',
        primaryCustomers: ['Metro Facilities Group', 'TriState Mechanical Contractors', 'Civic Campus Services'],
      },
      {
        category: 'Heat Pump Systems',
        productsServices: 'Packaged heat pump systems, split-system assemblies, and electrification retrofit equipment',
        primaryCustomers: ['Evergreen Retrofit Partners', 'Blue Ridge Building Systems', 'Summit HVAC Distribution'],
      },
      {
        category: 'Compressors & Condensing Units',
        productsServices: 'Condensing units, compressor assemblies, refrigerant circuit components, and OEM replacement modules',
        primaryCustomers: ['Pioneer OEM Equipment', 'Keystone Mechanical Supply', 'Allied Service Contractors'],
      },
      {
        category: 'Coils & Heat Exchangers',
        productsServices: 'Evaporator coils, condenser coils, heat exchangers, coil assemblies, and custom replacement coils',
        primaryCustomers: ['Pioneer OEM Equipment', 'TriState Mechanical Contractors', 'Allied Service Contractors'],
      },
      {
        category: 'Controls & Economizers',
        productsServices: 'Unit controls, economizer kits, sensors, dampers, control boards, and building automation interface kits',
        primaryCustomers: ['Metro Facilities Group', 'Summit HVAC Distribution', 'Precision Controls Integrators'],
      },
      {
        category: 'Replacement & Warranty Parts',
        productsServices: 'Warranty parts, field replacement kits, motors, fans, valves, filters, and service inventory',
        primaryCustomers: ['Allied Service Contractors', 'Keystone Mechanical Supply', 'Civic Campus Services'],
      },
      {
        category: 'Custom OEM Assemblies',
        productsServices: 'Private-label HVAC assemblies, engineered cabinet packages, and configured production runs for OEM partners',
        primaryCustomers: ['Pioneer OEM Equipment', 'Northstar Commercial Builders', 'TriState Mechanical Contractors'],
      },
    ],
  },
  cmrc86g8l0001qhbkgcq6wrf9: {
    categories: [
      {
        category: 'Cancer Screening',
        productsServices: 'SPOT-MAS multi-cancer early detection blood test, SPOT-MAS Lung, SPOT-MAS Colorectal',
        primaryCustomers: ['Hospitals', 'cancer centers', 'health systems'],
      },
      {
        category: 'Precision Oncology',
        productsServices: 'K-TRACK, K-4CARE, oncoGS targeted gene panels, ctDNA monitoring, Minimal Residual Disease (MRD) testing',
        primaryCustomers: ['Oncologists', 'cancer hospitals'],
      },
      {
        category: "Women's Health",
        productsServices: 'TriSure non-invasive prenatal testing (NIPT), TriSure Procare, TriSure Carrier',
        primaryCustomers: ['OB/GYNs', 'fertility clinics'],
      },
      {
        category: 'Genetic Diagnostics',
        productsServices: 'Carrier screening, newborn screening, pediatric genetic testing, whole exome sequencing (WES), gene panels',
        primaryCustomers: ['Hospitals', 'diagnostic labs'],
      },
      {
        category: 'Biopharma Services',
        productsServices: 'Biomarker discovery, companion diagnostics, genomic profiling, clinical trial support',
        primaryCustomers: ['Pharmaceutical companies', 'biotech companies'],
      },
      {
        category: 'AI & Bioinformatics',
        productsServices: 'AI-powered genomic analysis, genomic profiling platforms, multi-omics analytics',
        primaryCustomers: ['Research organizations', 'pharma'],
      },
    ],
  },
};

const COMPANY_REPORTING_PROFILES: Record<string, CompanyReportingProfile> = {
  cmm21v70k0004kz04h9khgd8l: {
    managementHierarchy: {
      corporate: 'Corporate',
      geographies: [
        'Northeast',
        'Midwest',
        'Southeast',
        'Texas / South Central',
        'Mountain West',
        'West Coast',
        'Canada',
      ],
      countryMetrics: [
        'Revenue',
        'Gross Margin',
        'Units Shipped',
        'Bookings',
        'Backlog',
        'On-Time Shipment Rate',
        'Warranty Claims',
        'Cash Collections',
      ],
    },
    dimensions: [
      { name: 'Product Line', levels: ['Rooftop Units', 'Air Handlers', 'Heat Pumps', 'Condensing Units', 'Coils', 'Controls', 'Aftermarket Parts'] },
      { name: 'Manufacturing', levels: ['Plant', 'Production Cell', 'Assembly Line', 'Work Center'] },
      { name: 'Channel', levels: ['Distributor', 'Mechanical Contractor', 'OEM / Private Label', 'Direct Institutional', 'Service Parts'] },
      { name: 'Region', levels: ['Territory', 'Region', 'Country'] },
      { name: 'Service / Warranty', levels: ['Warranty', 'Aftermarket', 'Field Service', 'Replacement Parts'] },
      { name: 'Financial', levels: ['Legal Entity', 'Business Unit', 'Cost Center', 'Product Line'] },
    ],
    businessLines: [
      { name: 'Packaged Equipment', offerings: ['Commercial Rooftop Units', 'Packaged Heat Pump Systems', 'Condensing Units'] },
      { name: 'Engineered Air Systems', offerings: ['Air Handling Units', 'Coils & Heat Exchangers', 'Custom OEM Assemblies'] },
      { name: 'Controls & Accessories', offerings: ['Controls & Economizers', 'Sensors', 'Damper Kits', 'Automation Interface Kits'] },
      { name: 'Aftermarket & Warranty', offerings: ['Replacement & Warranty Parts', 'Field Replacement Kits', 'Service Inventory'] },
    ],
    customerSegments: [
      'HVAC Distributors',
      'Mechanical Contractors',
      'Commercial Builders',
      'Facility Managers',
      'OEM / Private-Label Accounts',
      'Service Contractors',
      'Institutional Accounts',
      'Energy Retrofit Contractors',
    ],
    operationalKpis: [
      'Units produced',
      'Units shipped',
      'Bookings',
      'Backlog',
      'On-time shipment rate',
      'Production cycle time',
      'Material cost variance',
      'Inventory turns',
      'Warranty claim rate',
      'Gross margin by product line',
    ],
    exampleQuestions: [
      'Rooftop unit revenue by region',
      'Gross margin by product line',
      'Backlog by production cell',
      'On-time shipment rate by plant',
      'Warranty claims by product family',
      'Inventory value by component category',
      'Distributor revenue versus contractor revenue',
      'Material cost variance for compressors and coils',
      'Aftermarket parts sales by territory',
      'Bookings versus shipments by month',
    ],
  },
  cmrc86g8l0001qhbkgcq6wrf9: {
    managementHierarchy: {
      corporate: 'Corporate (Vietnam)',
      geographies: [
        'Vietnam',
        'Singapore',
        'Thailand',
        'Malaysia',
        'Indonesia',
        'Philippines',
        'Taiwan',
        'India',
        'Emerging Markets',
      ],
      countryMetrics: [
        'Revenue',
        'Gross Margin',
        'Test Volumes',
        'Hospital Accounts',
        'Sales Pipeline',
        'Operating Expenses',
        'EBITDA',
        'Cash Collections',
      ],
    },
    dimensions: [
      { name: 'Geography', levels: ['Corporate', 'Region', 'Country', 'Office/Lab'] },
      { name: 'Product Line', levels: ['Clinical Oncology', "Women's Health", 'Biopharma', 'AI Solutions'] },
      { name: 'Customer Type', levels: ['Hospital', 'Lab', 'Government', 'Pharma', 'Research'] },
      { name: 'Sales', levels: ['Regional Director', 'Country Manager', 'Sales Manager', 'Sales Rep'] },
      { name: 'Laboratory Operations', levels: ['Laboratory', 'Instrument', 'Sequencing Platform', 'Testing Department'] },
      { name: 'Financial', levels: ['Legal Entity', 'Business Unit', 'Cost Center', 'Department', 'Project'] },
    ],
    businessLines: [
      { name: 'Clinical Oncology', offerings: ['SPOT-MAS', 'K-TRACK', 'K-4CARE', 'oncoGS'] },
      { name: "Women's Health", offerings: ['TriSure', 'Carrier Screening', 'NIPT'] },
      { name: 'Biopharma Services', offerings: ['Biomarker discovery', 'companion diagnostics', 'genomic profiling', 'clinical trial support'] },
      { name: 'AI / Bioinformatics', offerings: ['AI-powered genomic analysis', 'genomic profiling platforms', 'multi-omics analytics'] },
    ],
    customerSegments: [
      'Hospitals',
      'Diagnostic Laboratories',
      'Physician Groups',
      'Cancer Centers',
      'Government Screening Programs',
      'Pharmaceutical Companies',
      'Research Institutions',
    ],
    operationalKpis: [
      'Number of tests ordered',
      'Number of tests completed',
      'Turnaround time (TAT)',
      'Sample rejection rate',
      'Laboratory utilization',
      'Sequencing capacity',
      'Revenue per test',
      'Cost per test',
      'Positive detection rates',
      'Backlog',
    ],
    exampleQuestions: [
      'SPOT-MAS revenue by country',
      'Gross margin by laboratory',
      'Revenue by hospital network',
      'Test volume by assay',
      'Sales by country manager',
      'EBITDA by legal entity',
      'Cost per sequencing run',
      'Turnaround time by laboratory',
      'Biopharma revenue by region',
      "Oncology revenue versus Women's Health revenue",
    ],
  },
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
    { key: 'inventory', label: 'Inventory (on-hand, aging, turns)' },
    { key: 'orders_sales', label: 'Orders / Sales (order-to-ship, fill rate)' },
    { key: 'products_skus', label: 'Products' },
    { key: 'vendors', label: 'Vendors' },
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
    { key: 'residential_real_estate', label: 'Residential Real Estate' },
    { key: 'mortgage', label: 'Mortgage' },
    { key: 'title_company', label: 'Title Company' },
    { key: 'insurance_services', label: 'Insurance Services' },
    { key: 'commercial_real_estate', label: 'Commercial Real Estate' },
    { key: 'property_management', label: 'Property Management' },
    { key: 'units_properties', label: 'Units / Properties (occupancy, availability)' },
    { key: 'leasing_sales', label: 'Leasing / Sales (applications, renewals)' },
    { key: 'maintenance_work_orders', label: 'Maintenance / Work Orders' },
    { key: 'commercial_property_types', label: 'Commercial Property Types' },
  ],
  '54': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (billings, WIP, collections)' },
    { key: 'ap', label: 'AP' },
    { key: 'todays_operations', label: "Today's Operations" },
    { key: 'payroll_performance', label: 'Payroll Performance' },
    { key: 'processor_capacity', label: 'Processor Capacity' },
    { key: 'client_economics', label: 'Client Economics' },
    { key: 'payroll', label: 'Payroll (runs, earnings, taxes, GL)' },
    { key: 'projects_engagements', label: 'Projects / Engagements (delivery, margin)' },
    { key: 'time_utilization', label: 'Workforce / Time (census, hours, PTO)' },
    { key: 'hiring', label: 'Hiring / Onboarding' },
    { key: 'sales_pipeline', label: 'Sales / Pipeline (bookings, backlog)' },
    { key: 'clients_customers', label: 'Clients / Customers (retention, expansion)' },
  ],
  '56': [
    { key: 'cash', label: 'Cash' },
    { key: 'ar', label: 'AR (contract billing, service invoices)' },
    { key: 'ap', label: 'AP' },
    { key: 'work_orders_service_delivery', label: 'Work Orders / Service Delivery' },
    { key: 'labor_scheduling', label: 'Labor & Scheduling (staffing, productivity)' },
    { key: 'hiring', label: 'Hiring' },
    { key: 'revenue_billables', label: 'Revenue & Billables' },
    { key: 'unit_economics', label: 'Unit Economics' },
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

function getCompanyProductServiceProfile(companyId: string): CompanyProductServiceProfile | null {
  return COMPANY_PRODUCT_SERVICE_PROFILES[String(companyId || '').trim()] || null;
}

function getCompanyReportingProfile(companyId: string): CompanyReportingProfile | null {
  return COMPANY_REPORTING_PROFILES[String(companyId || '').trim()] || null;
}

function getCompanySkuPrefix(companyId: string): string {
  return String(companyId || '').trim() === 'cmm21v70k0004kz04h9khgd8l' ? 'HVAC' : 'GSL';
}

function getCompanyRegions(companyId: string): string[] {
  return getCompanyReportingProfile(companyId)?.managementHierarchy.geographies || [];
}

function withCompanyReportingProfile<T extends { summary?: Record<string, unknown> }>(
  req: Pick<MockRequest, 'companyId'>,
  payload: T,
): T {
  const reportingProfile = getCompanyReportingProfile(req.companyId);
  if (!reportingProfile) return payload;
  return {
    ...payload,
    summary: {
      ...(payload.summary || {}),
      reportingProfile,
    },
  };
}

function uniqueCompanyCustomerGroups(profile: CompanyProductServiceProfile): string[] {
  const customers = new Set<string>();
  for (const category of profile.categories) {
    for (const customer of category.primaryCustomers) {
      const normalized = String(customer || '').trim();
      if (normalized) customers.add(normalized);
    }
  }
  return Array.from(customers);
}

function mockMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mockMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function buildCompanyMockSalesPage(
  req: MockRequest,
  profile: SectorProfile,
  companyProductProfile: CompanyProductServiceProfile,
) {
  const months = listMonthlyDatesAscending(req.startDate, req.endDate, 36);
  const monthDefs = months.map((date) => ({ monthKey: mockMonthKey(date), monthLabel: mockMonthLabel(date) }));
  const categoryRows = companyProductProfile.categories.map((category, categoryIndex) => {
    const values: Record<string, number> = {};
    monthDefs.forEach((month, monthIndex) => {
      const seasonal = 0.94 + ((monthIndex + categoryIndex) % 6) * 0.025;
      values[month.monthKey] = Math.round(metric(78000 - categoryIndex * 5200, monthIndex + categoryIndex + 1, profile.scale) * seasonal);
    });
    return {
      label: category.category,
      values,
      total: Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0),
    };
  });
  const totalRow = {
    label: 'Total Sales',
    values: monthDefs.reduce((acc: Record<string, number>, month) => {
      acc[month.monthKey] = categoryRows.reduce((sum, row) => sum + Number(row.values[month.monthKey] || 0), 0);
      return acc;
    }, {}),
    total: 0,
  };
  totalRow.total = Object.values(totalRow.values).reduce((sum, value) => sum + Number(value || 0), 0);

  const latestMonth = monthDefs[monthDefs.length - 1];
  const priorMonth = monthDefs[monthDefs.length - 2];
  const latestSales = latestMonth ? Number(totalRow.values[latestMonth.monthKey] || 0) : 0;
  const priorSales = priorMonth ? Number(totalRow.values[priorMonth.monthKey] || 0) : latestSales * 0.96;
  const currentYear = req.endDate.getUTCFullYear();
  const currentYearTotal = monthDefs
    .filter((month) => month.monthKey.startsWith(`${currentYear}-`))
    .reduce((sum, month) => sum + Number(totalRow.values[month.monthKey] || 0), 0);
  const grossMarginRows = monthDefs.map((month, monthIndex) => {
    const sales = Number(totalRow.values[month.monthKey] || 0);
    const gmPct = 31.5 + (monthIndex % 5) * 0.7;
    return {
      monthKey: month.monthKey,
      monthLabel: month.monthLabel,
      gmDollars: Math.round(sales * (gmPct / 100)),
      gmPct,
    };
  });

  return {
    sales: {
      mtdValue: latestSales,
      mtdCompPct: priorSales > 0 ? latestSales / priorSales - 1 : 0,
      totalValue: currentYearTotal,
      indexPct: 1.08,
      currentYearLabel: String(currentYear),
      categoryHistory: {
        months: monthDefs,
        rows: categoryRows,
        totalRow,
        valueFormat: 'currency',
      },
      chartData: monthDefs.map((month) => ({
        month: month.monthLabel,
        [String(currentYear)]: Number(totalRow.values[month.monthKey] || 0),
      })),
    },
    grossMarginHistory: {
      rows: grossMarginRows,
      chartData: grossMarginRows.map((row) => ({
        month: row.monthLabel,
        gmDollars: row.gmDollars,
        gmPct: row.gmPct,
      })),
    },
  };
}

function buildCompanyInventoryMovement(
  req: MockRequest,
  profile: SectorProfile,
  companyProductProfile: CompanyProductServiceProfile,
) {
  const months = listMonthlyDatesAscending(req.startDate, req.endDate, 18);
  const rows = months.flatMap((date, monthIndex) => {
    const monthKey = mockMonthKey(date);
    return companyProductProfile.categories.map((category, categoryIndex) => {
      const currentSales = Math.round(metric(76000 - categoryIndex * 4800, monthIndex + categoryIndex + 1, profile.scale));
      const priorSales = Math.round(currentSales * (0.91 + (categoryIndex % 4) * 0.025));
      const inventoryOnHandDollars = Math.round(metric(188000 - categoryIndex * 9400, monthIndex + categoryIndex + 3, profile.scale));
      const grossMarginPct = 30.5 + (categoryIndex % 5) * 1.2;
      const grossMarginDollars = Math.round(currentSales * (grossMarginPct / 100));
      const department = category.category.includes('Part') || category.category.includes('Warranty')
        ? 'Aftermarket & Warranty'
        : category.category.includes('Control')
          ? 'Controls & Accessories'
          : category.category.includes('Air') || category.category.includes('Coil') || category.category.includes('OEM')
            ? 'Engineered Air Systems'
            : 'Packaged Equipment';
      return {
        monthKey,
        monthLabel: mockMonthLabel(date),
        department,
        category: category.category,
        currentSales,
        priorSales,
        compPct: priorSales > 0 ? ((currentSales - priorSales) / priorSales) * 100 : 0,
        deltaDollars: currentSales - priorSales,
        salesMixPct: 0,
        inventoryMixPct: 0,
        inventoryOnHandDollars,
        imuPct: 42 + (categoryIndex % 4) * 1.5,
        grossMarginPct,
        grossMarginDollars,
      };
    });
  });

  return { rows };
}

function summarizeByDimension<T extends Record<string, any>>(
  rows: T[],
  dimensionKey: keyof T,
  metricKeys: string[],
): Array<Record<string, unknown>> {
  const byDimension = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const dimension = String(row[dimensionKey] || 'Unassigned');
    const current = byDimension.get(dimension) || {};
    for (const metricKey of metricKeys) {
      current[metricKey] = (current[metricKey] || 0) + Number(row[metricKey] || 0);
    }
    byDimension.set(dimension, current);
  }
  return Array.from(byDimension.entries()).map(([name, metrics]) => ({ name, ...metrics }));
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

function listMonthlyDatesAscending(startDate: Date, endDate: Date, maxPoints: number): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dates.slice(-maxPoints);
}

function deterministicNoise(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

const REAL_ESTATE_PROPERTIES = [
  { property: 'Rivergate Retail Center', type: 'Retail', units: 42, rentableSqFt: 186000, marketRent: 32.5 },
  { property: 'Northline Medical Plaza', type: 'Office', units: 28, rentableSqFt: 124000, marketRent: 36.25 },
  { property: 'Parkway Logistics Hub', type: 'Industrial', units: 16, rentableSqFt: 412000, marketRent: 11.8 },
  { property: 'The Meridian Apartments', type: 'Multifamily', units: 168, rentableSqFt: 151200, marketRent: 2.18 },
  { property: 'Cedar Grove Development', type: 'Land & Development', units: 6, rentableSqFt: 94000, marketRent: 0 },
];

const REAL_ESTATE_TENANTS = [
  'Anchor Grocery Co.',
  'Summit Medical Group',
  'Northstar Distribution',
  'Meridian Residential LLC',
  'Urban Growth Partners',
  'Bluebird Fitness',
  'Harbor Dental',
  'Keystone Supply',
];

const REAL_ESTATE_MAINTENANCE_TYPES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Exterior / Grounds',
  'Life Safety',
  'Tenant Improvement',
];

function buildEncompassMortgageMockData(dates: Date[], scale: number) {
  const asOf = dates[0] || new Date();
  const stages = [
    { stage: 'Started / Lead', loans: 980, pullThroughPct: 100, avgDays: 2.4 },
    { stage: 'Application', loans: 642, pullThroughPct: 65.5, avgDays: 4.8 },
    { stage: 'Processing', loans: 511, pullThroughPct: 79.6, avgDays: 8.6 },
    { stage: 'Underwriting', loans: 403, pullThroughPct: 78.9, avgDays: 6.9 },
    { stage: 'Conditional Approval', loans: 318, pullThroughPct: 78.9, avgDays: 5.7 },
    { stage: 'Clear to Close', loans: 224, pullThroughPct: 70.4, avgDays: 3.3 },
    { stage: 'Funded', loans: 176, pullThroughPct: 78.6, avgDays: 1.5 },
  ];
  const branches = ['Buffalo', 'Rochester', 'Syracuse', 'Albany', 'Phoenix', 'Scottsdale'];
  const products = ['Conventional', 'FHA', 'VA', 'Jumbo', 'USDA'];
  const channels = ['Retail', 'Builder', 'Referral', 'Online'];
  const officers = ['Avery Morgan', 'Jordan Hayes', 'Taylor Bennett', 'Riley Parker', 'Casey Collins', 'Morgan Reed', 'Cameron Price', 'Quinn Brooks'];
  const pipelineStages = stages.map((row, index) => {
    const loans = Math.round(row.loans * (0.92 + deterministicNoise(index + 17) * 0.16));
    const avgLoanSize = 392000 + index * 8700;
    return {
      stage: row.stage,
      loans,
      volume: Math.round(loans * avgLoanSize * scale),
      pullThroughPct: Math.round(row.pullThroughPct * 10) / 10,
      avgDaysInStage: Math.round(row.avgDays * 10) / 10,
    };
  });
  const fundedLoans = pipelineStages.find((row) => row.stage === 'Funded')?.loans || 0;
  const fundedVolume = pipelineStages.find((row) => row.stage === 'Funded')?.volume || 0;
  const applicationLoans = pipelineStages.find((row) => row.stage === 'Application')?.loans || 1;
  const pipelineVolume = pipelineStages.reduce((sum, row) => sum + row.volume, 0);
  const revenue = Math.round(fundedVolume * 0.034);
  const cycleTimeRows = [
    { milestone: 'Application to Processing', avgDays: 4.8, targetDays: 4.0, loans: 642 },
    { milestone: 'Processing to Underwriting', avgDays: 8.6, targetDays: 7.0, loans: 511 },
    { milestone: 'Underwriting to Conditional Approval', avgDays: 6.9, targetDays: 5.5, loans: 403 },
    { milestone: 'Conditional Approval to CTC', avgDays: 5.7, targetDays: 4.5, loans: 318 },
    { milestone: 'CTC to Funding', avgDays: 3.3, targetDays: 3.0, loans: 224 },
    { milestone: 'Application to Funding', avgDays: 31.6, targetDays: 29.0, loans: fundedLoans },
  ].map((row, index) => ({
    ...row,
    avgDays: Math.round((row.avgDays + deterministicNoise(index + 31) * 1.1) * 10) / 10,
    varianceDays: Math.round((row.avgDays - row.targetDays) * 10) / 10,
  }));
  const productionByOfficer = officers.map((loanOfficer, index) => {
    const loans = 18 + index * 3 + Math.round(deterministicNoise(index + 5) * 8);
    const avgLoanSize = 382000 + (index % 5) * 24000;
    const volume = Math.round(loans * avgLoanSize);
    return {
      loanOfficer,
      branch: branches[index % branches.length],
      fundedLoans: loans,
      fundedVolume: volume,
      pullThroughPct: Math.round((56 + (index % 6) * 3.4) * 10) / 10,
      avgDaysToClose: Math.round((28.5 + (index % 5) * 1.7) * 10) / 10,
      conditionAgingDays: Math.round((4.2 + (index % 4) * 1.1) * 10) / 10,
    };
  });
  const productionByBranch = branches.map((branch, index) => {
    const branchRows = productionByOfficer.filter((row) => row.branch === branch);
    const branchLoans = branchRows.reduce((sum, row) => sum + row.fundedLoans, 0);
    const branchVolume = branchRows.reduce((sum, row) => sum + row.fundedVolume, 0);
    return {
      branch,
      fundedLoans: branchLoans,
      fundedVolume: branchVolume,
      pullThroughPct: Math.round((58 + index * 2.2) * 10) / 10,
      avgDaysToClose: Math.round((29.4 + index * 0.8) * 10) / 10,
    };
  });
  const productChannelPerformance = products.flatMap((product, productIndex) =>
    channels.map((channel, channelIndex) => {
      const applications = 42 + productIndex * 8 + channelIndex * 5;
      const funded = Math.round(applications * (0.42 + productIndex * 0.025 + channelIndex * 0.018));
      return {
        product,
        channel,
        applications,
        fundedLoans: funded,
        pullThroughPct: Math.round((funded / applications) * 1000) / 10,
        avgLoanSize: Math.round(326000 + productIndex * 36000 + channelIndex * 14000),
      };
    })
  );
  const falloutRows = [
    { reason: 'Credit / FICO', count: 42, falloutPct: 18.7 },
    { reason: 'Debt-to-Income', count: 36, falloutPct: 16.0 },
    { reason: 'Rate / Pricing', count: 31, falloutPct: 13.8 },
    { reason: 'Appraisal / Collateral', count: 28, falloutPct: 12.4 },
    { reason: 'Borrower Withdrew', count: 24, falloutPct: 10.7 },
    { reason: 'Income / Employment Verification', count: 21, falloutPct: 9.3 },
  ];
  const conditionBottlenecks = [
    { bucket: 'Borrower Docs', openConditions: 188, avgAgeDays: 6.8, owner: 'Processor', risk: 'Watch' },
    { bucket: 'Income / VOE', openConditions: 142, avgAgeDays: 8.9, owner: 'Processor', risk: 'High' },
    { bucket: 'Appraisal Review', openConditions: 96, avgAgeDays: 7.6, owner: 'Underwriter', risk: 'Watch' },
    { bucket: 'Title / HOI', openConditions: 84, avgAgeDays: 5.4, owner: 'Closer', risk: 'Normal' },
    { bucket: 'Compliance / TRID', openConditions: 38, avgAgeDays: 3.2, owner: 'Compliance', risk: 'Normal' },
  ];
  const documentBottlenecks = [
    { documentType: 'Initial Disclosure Package', waitingLoans: 34, avgAgeDays: 2.7, eventSource: 'Document delivery webhook' },
    { documentType: 'Income Documents', waitingLoans: 118, avgAgeDays: 6.4, eventSource: 'eFolder attachments' },
    { documentType: 'Appraisal', waitingLoans: 52, avgAgeDays: 7.9, eventSource: 'Services / appraisal' },
    { documentType: 'Closing Disclosure', waitingLoans: 27, avgAgeDays: 2.3, eventSource: 'Compliance disclosures' },
    { documentType: 'Funding Package', waitingLoans: 19, avgAgeDays: 1.8, eventSource: 'Document package metadata' },
  ];
  const pipelineTrend = dates.slice(0, 12).reverse().map((date, index) => ({
    period: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    applications: Math.round(485 + index * 8 + Math.sin(index / 2) * 36),
    approvals: Math.round(348 + index * 7 + Math.sin(index / 2 + 0.4) * 24),
    funded: Math.round(255 + index * 5 + Math.sin(index / 2 + 0.8) * 18),
  }));
  const loanPipelineDetail = Array.from({ length: 18 }, (_, index) => {
    const stage = pipelineStages[index % pipelineStages.length].stage;
    const branch = branches[index % branches.length];
    const product = products[index % products.length];
    const loanAmount = 285000 + index * 24500;
    const created = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), Math.max(1, 24 - index)));
    return {
      loanId: `ENC-${String(71000 + index).padStart(5, '0')}`,
      borrower: `Borrower ${index + 1}`,
      stage,
      branch,
      loanOfficer: officers[index % officers.length],
      product,
      loanAmount,
      daysInStage: 2 + (index % 9),
      closingDate: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 4 + (index % 18))).toISOString().slice(0, 10),
      createdDate: created.toISOString().slice(0, 10),
      risk: index % 7 === 0 ? 'High' : index % 4 === 0 ? 'Watch' : 'Normal',
    };
  });

  return {
    source: 'ICE Encompass Developer Connect mock',
    asOf: asOf.toISOString(),
    summary: {
      activePipelineLoans: pipelineStages.filter((row) => row.stage !== 'Funded').reduce((sum, row) => sum + row.loans, 0),
      pipelineVolume,
      fundedLoans,
      fundedVolume,
      revenue,
      applicationToFundingPct: Math.round((fundedLoans / Math.max(applicationLoans, 1)) * 1000) / 10,
      avgDaysToClose: cycleTimeRows.find((row) => row.milestone === 'Application to Funding')?.avgDays || 0,
      openConditions: conditionBottlenecks.reduce((sum, row) => sum + row.openConditions, 0),
    },
    productionScorecard: [
      { kpi: 'Active Pipeline Loans', value: pipelineStages.filter((row) => row.stage !== 'Funded').reduce((sum, row) => sum + row.loans, 0), detail: 'Open Encompass loan pipeline' },
      { kpi: 'Pipeline Volume', value: pipelineVolume, detail: 'Loan amount in active pipeline' },
      { kpi: 'Funded Loans', value: fundedLoans, detail: 'Current month funded loans' },
      { kpi: 'Funded Volume', value: fundedVolume, detail: 'Current month funded volume' },
      { kpi: 'Application-to-Funding %', value: Math.round((fundedLoans / Math.max(applicationLoans, 1)) * 1000) / 10, detail: 'Pull-through from applications' },
      { kpi: 'Avg Days to Close', value: cycleTimeRows.find((row) => row.milestone === 'Application to Funding')?.avgDays || 0, detail: 'Application to funding' },
    ],
    pipelineStages,
    pipelineTrend,
    productionByOfficer,
    productionByBranch,
    productChannelPerformance,
    cycleTimeRows,
    falloutRows,
    conditionBottlenecks,
    documentBottlenecks,
    loanPipelineDetail,
  };
}

function buildProfitPowerBrokerageMockData(dates: Date[], scale: number) {
  const asOf = dates[0] || new Date();
  const regions = ['Buffalo / Western NY', 'Rochester Region', 'Syracuse / Central NY', 'Albany / Capital Region', 'Arizona'];
  const officeRows = Array.from({ length: 56 }, (_, index) => {
    const closedTransactions = 84 + (index % 14) * 7;
    const avgSalesPrice = 410000 + (index % 10) * 9500;
    const salesVolume = Math.round(closedTransactions * avgSalesPrice * scale);
    const gci = Math.round(salesVolume * (0.0258 + (index % 5) * 0.0004));
    const netRevenue = Math.round(gci * (0.342 + (index % 6) * 0.008));
    const mortgageAttachments = Math.round(closedTransactions * (0.42 + (index % 8) * 0.021));
    const titleAttachments = Math.round(closedTransactions * (0.51 + (index % 7) * 0.024));
    const insuranceAttachments = Math.round(closedTransactions * (0.28 + (index % 6) * 0.022));
    return {
      office: `Office ${String(index + 1).padStart(2, '0')}`,
      region: regions[index % regions.length],
      activeAgents: 3 + (index % 8),
      activeListings: 24 + (index % 12) * 3,
      newListings: 6 + (index % 8),
      underContract: 8 + (index % 10),
      pendingSales: 10 + (index % 11),
      closedTransactions,
      salesVolume,
      gci,
      netRevenue,
      avgSalesPrice,
      avgCommissionPct: Math.round((gci / Math.max(salesVolume, 1)) * 1000) / 10,
      mortgageAttachments,
      titleAttachments,
      insuranceAttachments,
      mortgagePct: Math.round((mortgageAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
      titlePct: Math.round((titleAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
      insurancePct: Math.round((insuranceAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
      agentReceivables: Math.round((18000 + (index % 9) * 2600) * scale),
    };
  });
  const closedTransactions = officeRows.reduce((sum, row) => sum + row.closedTransactions, 0);
  const salesVolume = officeRows.reduce((sum, row) => sum + row.salesVolume, 0);
  const gci = officeRows.reduce((sum, row) => sum + row.gci, 0);
  const netRevenue = officeRows.reduce((sum, row) => sum + row.netRevenue, 0);
  const activeListings = officeRows.reduce((sum, row) => sum + row.activeListings, 0);
  const newListings = officeRows.reduce((sum, row) => sum + row.newListings, 0);
  const underContract = officeRows.reduce((sum, row) => sum + row.underContract, 0);
  const pendingSales = officeRows.reduce((sum, row) => sum + row.pendingSales, 0);
  const listingInventoryValue = Math.round(officeRows.reduce((sum, row) => sum + row.activeListings * row.avgSalesPrice, 0));
  const mortgageAttachments = officeRows.reduce((sum, row) => sum + row.mortgageAttachments, 0);
  const titleAttachments = officeRows.reduce((sum, row) => sum + row.titleAttachments, 0);
  const insuranceAttachments = officeRows.reduce((sum, row) => sum + row.insuranceAttachments, 0);
  const agentRows = Array.from({ length: 18 }, (_, index) => {
    const transactions = 18 + (index % 9) * 4;
    const avgPrice = 390000 + index * 18500;
    const agentSalesVolume = Math.round(transactions * avgPrice);
    const agentGci = Math.round(agentSalesVolume * (0.025 + (index % 5) * 0.0005));
    return {
      agent: `Agent ${index + 1}`,
      office: officeRows[index % officeRows.length].office,
      region: regions[index % regions.length],
      transactions,
      salesVolume: agentSalesVolume,
      gci: agentGci,
      companyDollar: Math.round(agentGci * (0.31 + (index % 4) * 0.025)),
      mortgageReferrals: Math.round(transactions * (0.42 + (index % 7) * 0.023)),
      retentionStatus: index % 11 === 0 ? 'At Risk' : index % 5 === 0 ? 'Watch' : 'Active',
    };
  });
  const topAgentRevenue = [...agentRows].sort((a, b) => b.companyDollar - a.companyDollar).slice(0, 20).reduce((sum, row) => sum + row.companyDollar, 0);
  const totalAgentRevenue = agentRows.reduce((sum, row) => sum + row.companyDollar, 0);
  const forecastRows = ['Current Month', 'Next Month', '90 Days'].map((month, index) => {
    const multiplier = index === 0 ? 0.095 : index === 1 ? 0.102 : 0.304;
    return {
      month,
      expectedClosings: Math.round(closedTransactions * multiplier),
      expectedRevenue: Math.round(netRevenue * multiplier),
      expectedGci: Math.round(gci * multiplier),
    };
  });

  return {
    source: 'Profit Power Enterprise mock',
    asOf: asOf.toISOString(),
    summary: {
      closedTransactions,
      salesVolume,
      gci,
      netRevenue,
      avgSalesPrice: Math.round(salesVolume / Math.max(closedTransactions, 1)),
      avgCommissionPct: Math.round((gci / Math.max(salesVolume, 1)) * 1000) / 10,
      ytdGrowthPct: 10.7,
      budgetVariancePct: 4.8,
      activeListings,
      newListings,
      underContract,
      pendingSales,
      forecastedGci: forecastRows[0]?.expectedGci || 0,
      listingInventoryValue,
      agentCount: agentRows.length,
      inactiveAgents: 16,
      top20AgentRevenuePct: Math.round((topAgentRevenue / Math.max(totalAgentRevenue, 1)) * 1000) / 10,
      avgProductionPerAgent: Math.round(netRevenue / Math.max(agentRows.length, 1)),
      mortgageAttachments,
      titleAttachments,
      insuranceAttachments,
    },
    officePerformance: officeRows,
    agentPerformance: agentRows,
    pipelineForecast: forecastRows,
    pipelineKpis: [
      { metric: 'Active Listings', count: activeListings, value: listingInventoryValue },
      { metric: 'New Listings', count: newListings, value: Math.round(newListings * (salesVolume / Math.max(closedTransactions, 1))) },
      { metric: 'Under Contract', count: underContract, value: Math.round(underContract * (salesVolume / Math.max(closedTransactions, 1))) },
      { metric: 'Pending Sales', count: pendingSales, value: Math.round(pendingSales * (salesVolume / Math.max(closedTransactions, 1))) },
      { metric: 'Expected Closings', count: forecastRows[0]?.expectedClosings || 0, value: Math.round((forecastRows[0]?.expectedClosings || 0) * (salesVolume / Math.max(closedTransactions, 1))) },
      { metric: 'Forecasted GCI', count: 0, value: forecastRows[0]?.expectedGci || 0 },
      { metric: 'Listing Inventory Value', count: 0, value: listingInventoryValue },
    ],
    agentProductivity: [
      { tier: 'Top Producers', agents: 42, salesVolume: Math.round(salesVolume * 0.34), gci: Math.round(gci * 0.34), revenue: Math.round(netRevenue * 0.34), conversionRate: 32.4 },
      { tier: 'Mid Producers', agents: 96, salesVolume: Math.round(salesVolume * 0.39), gci: Math.round(gci * 0.39), revenue: Math.round(netRevenue * 0.39), conversionRate: 24.6 },
      { tier: 'Emerging Producers', agents: 58, salesVolume: Math.round(salesVolume * 0.17), gci: Math.round(gci * 0.17), revenue: Math.round(netRevenue * 0.17), conversionRate: 17.8 },
      { tier: 'Inactive Agents', agents: 16, salesVolume: Math.round(salesVolume * 0.02), gci: Math.round(gci * 0.02), revenue: Math.round(netRevenue * 0.02), conversionRate: 4.2 },
    ],
    customerAttachment: {
      closedTransactions,
      mortgageAttachments,
      titleAttachments,
      insuranceAttachments,
      mortgageAttachRate: Math.round((mortgageAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
      titleAttachRate: Math.round((titleAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
      insuranceAttachRate: Math.round((insuranceAttachments / Math.max(closedTransactions, 1)) * 1000) / 10,
    },
    arAndBackOfficeCharges: officeRows.map((row) => ({
      office: row.office,
      agentReceivables: row.agentReceivables,
      backOfficeCharges: Math.round(row.agentReceivables * 0.42),
      over30Pct: Math.round((16 + deterministicNoise(row.closedTransactions) * 8) * 10) / 10,
    })),
  };
}

function buildRealEstateOperationalHubMockData(req: MockRequest, profile: SectorProfile) {
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const latestDate = dates[0] || req.endDate;
  const monthLabel = latestDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const scale = profile.scale;

  const propertyRows = REAL_ESTATE_PROPERTIES.map((property, index) => {
    const occupiedUnits = Math.max(0, property.units - (index + 2));
    const occupancyPct = property.units > 0 ? (occupiedUnits / property.units) * 100 : 0;
    const averageRent = property.marketRent > 0 ? property.marketRent * (0.96 + index * 0.012) : 0;
    const monthlyRent = property.rentableSqFt * averageRent / 12;
    const delinquentAmount = metric(4200 + index * 950, index + 1, scale);
    return {
      ...property,
      occupiedUnits,
      vacantUnits: property.units - occupiedUnits,
      occupancyPct: Math.round(occupancyPct * 10) / 10,
      averageRent: Math.round(averageRent * 100) / 100,
      monthlyRent: Math.round(monthlyRent),
      delinquentAmount,
      renewalCount: 3 + index,
      expiringLeases: 4 + index * 2,
    };
  });

  const occupancyVacancy = propertyRows.map((row) => ({
    property: row.property,
    propertyType: row.type,
    totalUnits: row.units,
    occupiedUnits: row.occupiedUnits,
    vacantUnits: row.vacantUnits,
    occupancyPct: row.occupancyPct,
  }));

  const unitAvailability = propertyRows.flatMap((row, propertyIndex) =>
    Array.from({ length: Math.min(row.vacantUnits, 4) }, (_, unitIndex) => ({
      property: row.property,
      unit: `${String.fromCharCode(65 + propertyIndex)}-${100 + unitIndex}`,
      propertyType: row.type,
      rentableSqFt: Math.round(row.rentableSqFt / Math.max(row.units, 1)),
      askingRent: row.averageRent,
      availableDate: new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 10 + unitIndex * 4)).toISOString(),
      status: unitIndex % 3 === 0 ? 'Ready' : unitIndex % 3 === 1 ? 'Make-ready' : 'Under LOI',
    }))
  );

  const rentRollSummary = propertyRows.map((row) => ({
    property: row.property,
    propertyType: row.type,
    tenantCount: row.occupiedUnits,
    rentableSqFt: row.rentableSqFt,
    monthlyRent: row.monthlyRent,
    annualizedRent: row.monthlyRent * 12,
    averageRent: row.averageRent,
  }));

  const leaseExpirationSchedule = propertyRows.flatMap((row, propertyIndex) =>
    [30, 60, 90, 180].map((days, bucketIndex) => ({
      property: row.property,
      propertyType: row.type,
      bucket: `${days} days`,
      expiringLeases: Math.max(1, row.expiringLeases - bucketIndex),
      expiringRent: Math.round(row.monthlyRent * (0.08 + bucketIndex * 0.035)),
      largestTenant: REAL_ESTATE_TENANTS[(propertyIndex + bucketIndex) % REAL_ESTATE_TENANTS.length],
    }))
  );

  const moveInsMoveOuts = dates.slice(0, 6).map((date, index) => ({
    period: date.toISOString().slice(0, 10),
    moveIns: Math.round(metric(5 + index, index + 1, 0.85)),
    moveOuts: Math.round(metric(3 + index, index + 2, 0.72)),
    netAbsorption: Math.round(metric(2, index + 1, 0.75)),
  }));

  const rentalRateTrend = dates.slice(0, 8).map((date, index) => ({
    period: date.toISOString().slice(0, 10),
    marketRent: Math.round(metric(27.5, index + 1, 1) * 100) / 100,
    inPlaceRent: Math.round(metric(25.8, index + 1, 1) * 100) / 100,
    renewalRent: Math.round(metric(26.9, index + 1, 1) * 100) / 100,
  }));

  const propertyPerformance = propertyRows.map((row, index) => ({
    property: row.property,
    propertyType: row.type,
    revenue: Math.round(row.monthlyRent * 12),
    noi: Math.round(row.monthlyRent * 12 * (0.58 + index * 0.025)),
    occupancyPct: row.occupancyPct,
    delinquentAmount: row.delinquentAmount,
  }));

  const unitMixPerformance = ['Studio', '1 BR', '2 BR', '3 BR', 'Retail Inline', 'Anchor', 'Industrial Bay'].map((mix, index) => ({
    unitMix: mix,
    unitCount: Math.round(metric(18 + index * 4, index + 1, 0.8)),
    occupancyPct: Math.round((88 + (index % 4) * 2.3) * 10) / 10,
    averageRent: Math.round(metric(1850 + index * 210, index + 2, 0.55)),
    revenue: Math.round(metric(76000 + index * 11000, index + 2, scale)),
  }));

  const delinquencyByProperty = propertyRows.map((row, index) => ({
    property: row.property,
    propertyType: row.type,
    delinquentTenants: 1 + (index % 4),
    delinquentAmount: row.delinquentAmount,
    over30Amount: Math.round(row.delinquentAmount * 0.48),
    over60Amount: Math.round(row.delinquentAmount * 0.22),
  }));

  const renewalPipeline = propertyRows.map((row, index) => ({
    property: row.property,
    propertyType: row.type,
    renewalsDue: row.renewalCount,
    renewalProbabilityPct: 72 + index * 3,
    expectedRenewals: Math.round(row.renewalCount * (0.72 + index * 0.03)),
    atRiskRent: Math.round(row.monthlyRent * (0.07 + index * 0.018)),
  }));

  const leasingRows = REAL_ESTATE_TENANTS.map((tenant, index) => {
    const revenue = metric(52000 + index * 6800, index + 1, scale);
    const unbilled = metric(6800 + index * 850, index + 2, scale);
    const invoiceVelocityDays = 18 + index * 2;
    return {
      customerName: tenant,
      propertyType: REAL_ESTATE_PROPERTIES[index % REAL_ESTATE_PROPERTIES.length].type,
      revenue,
      unbilled,
      invoiceCount: 4 + index,
      grossMargin: revenue * (0.42 + (index % 3) * 0.035),
      invoiceVelocityDays,
      riskStatus: index % 5 === 0 ? 'At Risk' : index % 3 === 0 ? 'Watch' : 'Healthy',
    };
  });
  const leasingTotalRevenue = leasingRows.reduce((sum, row) => sum + row.revenue, 0);

  const leasingSales = {
    wipByCustomer: leasingRows.map((row) => ({
      customerName: row.customerName,
      propertyType: row.propertyType,
      unbilledAmount: Math.round(row.unbilled),
      stage: row.unbilled > 10000 ? 'Awaiting invoice' : 'In progress',
    })),
    topCustomersByRevenue: [...leasingRows]
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({ customerName: row.customerName, propertyType: row.propertyType, revenue: Math.round(row.revenue), invoiceCount: row.invoiceCount })),
    revenueDistributionByCustomer: leasingRows.map((row) => ({
      customerName: row.customerName,
      revenue: Math.round(row.revenue),
      revenueSharePct: Math.round((row.revenue / Math.max(leasingTotalRevenue, 1)) * 1000) / 10,
    })),
    salesMetricCards: {
      activeCustomers: leasingRows.length,
      totalRevenue: Math.round(leasingTotalRevenue),
      averageRevenuePerCustomer: Math.round(leasingTotalRevenue / leasingRows.length),
      atRiskAccounts: leasingRows.filter((row) => row.riskStatus === 'At Risk').length,
    },
    salesHistoryChart: dates.slice(0, 8).map((date, index) => ({
      period: date.toISOString().slice(0, 10),
      revenue: Math.round(metric(88000, index + 1, scale)),
      invoiceCount: Math.round(metric(22, index + 1, 0.9)),
    })),
    salesBuysHistoryTables: leasingRows.map((row) => ({
      customerName: row.customerName,
      sales: Math.round(row.revenue),
      buys: Math.round(row.revenue * 0.58),
      netSpread: Math.round(row.revenue - row.revenue * 0.58),
    })),
    grossMarginHistoryChart: dates.slice(0, 8).map((date, index) => ({
      period: date.toISOString().slice(0, 10),
      revenue: Math.round(metric(88000, index + 1, scale)),
      grossMargin: Math.round(metric(36500, index + 1, scale)),
      grossMarginPct: Math.round((39 + Math.sin(index) * 2.4) * 10) / 10,
    })),
    grossMarginHistoryTable: leasingRows.map((row) => ({
      customerName: row.customerName,
      revenue: Math.round(row.revenue),
      grossMargin: Math.round(row.grossMargin),
      grossMarginPct: Math.round((row.grossMargin / Math.max(row.revenue, 1)) * 1000) / 10,
    })),
    concentrationRisk: {
      top1Pct: Math.round((Math.max(...leasingRows.map((row) => row.revenue)) / Math.max(leasingTotalRevenue, 1)) * 1000) / 10,
      top5Pct: Math.round((leasingRows.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0) / Math.max(leasingTotalRevenue, 1)) * 1000) / 10,
      status: 'Watch',
    },
    revenueRetentionProxy: leasingRows.map((row, index) => ({
      customerName: row.customerName,
      priorRevenue: Math.round(row.revenue * (0.9 + index * 0.01)),
      currentRevenue: Math.round(row.revenue),
      status: row.riskStatus === 'At Risk' ? 'At Risk' : 'Retained',
    })),
    revenueVsInvoiceVelocity: leasingRows.map((row) => ({
      customerName: row.customerName,
      revenue: Math.round(row.revenue),
      invoiceVelocityDays: row.invoiceVelocityDays,
    })),
    atRiskAccountsQueue: leasingRows
      .filter((row) => row.riskStatus !== 'Healthy')
      .map((row) => ({ customerName: row.customerName, revenue: Math.round(row.revenue), riskStatus: row.riskStatus, nextAction: 'Review renewal and AR status' })),
  };

  const workOrders = propertyRows.flatMap((property, propertyIndex) =>
    REAL_ESTATE_MAINTENANCE_TYPES.map((type, typeIndex) => ({
      workOrderId: `WO-${propertyIndex + 1}${String(typeIndex + 1).padStart(2, '0')}`,
      property: property.property,
      unit: `${String.fromCharCode(65 + propertyIndex)}-${100 + typeIndex}`,
      type,
      priority: typeIndex % 4 === 0 ? 'Urgent' : typeIndex % 3 === 0 ? 'High' : typeIndex % 2 === 0 ? 'Medium' : 'Low',
      status: typeIndex % 3 === 0 ? 'Open' : typeIndex % 3 === 1 ? 'In Progress' : 'Scheduled',
      ageDays: 2 + propertyIndex * 3 + typeIndex * 4,
      estimatedCost: Math.round(metric(650 + typeIndex * 180, propertyIndex + typeIndex + 1, scale)),
      vendor: `${profile.vendorPrefix} ${String((typeIndex % 5) + 1).padStart(2, '0')}`,
    }))
  );
  const openWorkOrders = workOrders.filter((row) => row.status !== 'Scheduled');

  const maintenanceWorkOrders = {
    openWorkOrders,
    workOrderAging: ['0-7', '8-14', '15-30', '31+'].map((bucket, index) => ({
      bucket,
      count: openWorkOrders.filter((row) =>
        index === 0 ? row.ageDays <= 7 : index === 1 ? row.ageDays > 7 && row.ageDays <= 14 : index === 2 ? row.ageDays > 14 && row.ageDays <= 30 : row.ageDays > 30
      ).length,
    })),
    backlogByPriority: ['Urgent', 'High', 'Medium', 'Low'].map((priority) => ({
      priority,
      count: openWorkOrders.filter((row) => row.priority === priority).length,
      estimatedCost: openWorkOrders.filter((row) => row.priority === priority).reduce((sum, row) => sum + row.estimatedCost, 0),
    })),
    completionTrend: dates.slice(0, 8).map((date, index) => ({
      period: date.toISOString().slice(0, 10),
      opened: Math.round(metric(18, index + 1, 0.8)),
      completed: Math.round(metric(16, index + 2, 0.82)),
    })),
    responseTimeSla: propertyRows.map((row, index) => ({
      property: row.property,
      avgResponseHours: Math.round((8 + index * 1.7) * 10) / 10,
      slaMetPct: Math.round((92 - index * 2.4) * 10) / 10,
    })),
    costByPropertyUnit: propertyRows.map((row) => ({
      property: row.property,
      totalCost: workOrders.filter((workOrder) => workOrder.property === row.property).reduce((sum, workOrder) => sum + workOrder.estimatedCost, 0),
      costPerUnit: Math.round(workOrders.filter((workOrder) => workOrder.property === row.property).reduce((sum, workOrder) => sum + workOrder.estimatedCost, 0) / Math.max(row.units, 1)),
    })),
    vendorPerformance: Array.from(new Set(workOrders.map((row) => row.vendor))).map((vendor, index) => ({
      vendor,
      completedJobs: 8 + index * 3,
      avgCompletionDays: Math.round((2.8 + index * 0.6) * 10) / 10,
      callbackRatePct: Math.round((3.5 + index * 0.9) * 10) / 10,
    })),
    repeatIssues: REAL_ESTATE_MAINTENANCE_TYPES.map((type, index) => ({
      issueType: type,
      repeatCount: 2 + (index % 4),
      affectedProperties: 1 + (index % 3),
    })),
  };

  const commercialPropertyTypes = {
    propertyTypeOverview: ['Retail', 'Office', 'Industrial', 'Multifamily', 'Land & Development'].map((type, index) => ({
      propertyType: type,
      activeAssignments: 6 + index * 2,
      pipelineValue: Math.round(metric(740000 + index * 185000, index + 1, scale)),
      expectedFees: Math.round(metric(42000 + index * 9200, index + 1, scale)),
      avgDealCycleDays: 48 + index * 9,
    })),
    dealPipelineByType: ['Prospecting', 'Valuation', 'LOI', 'Under Contract', 'Closed'].flatMap((stage, stageIndex) =>
      ['Retail', 'Office', 'Industrial', 'Multifamily', 'Land & Development'].map((type, typeIndex) => ({
        stage,
        propertyType: type,
        dealCount: 1 + ((stageIndex + typeIndex) % 5),
        pipelineValue: Math.round(metric(220000 + typeIndex * 64000, stageIndex + typeIndex + 1, scale)),
      }))
    ),
    revenueMixByType: ['Retail', 'Office', 'Industrial', 'Multifamily', 'Land & Development'].map((type, index) => ({
      propertyType: type,
      revenue: Math.round(metric(112000 + index * 28500, index + 2, scale)),
      advisoryRevenue: Math.round(metric(28000 + index * 6200, index + 1, scale)),
      brokerageRevenue: Math.round(metric(84000 + index * 22300, index + 1, scale)),
    })),
    marketCompsByType: ['Retail', 'Office', 'Industrial', 'Multifamily', 'Land & Development'].map((type, index) => ({
      propertyType: type,
      compCount: 8 + index * 3,
      avgPricePerSqFt: type === 'Multifamily' ? null : Math.round(metric(118 + index * 34, index + 1, 1)),
      avgCapRatePct: Math.round((6.1 + index * 0.28) * 100) / 100,
    })),
    advisoryEngagements: REAL_ESTATE_TENANTS.slice(0, 5).map((client, index) => ({
      client,
      propertyType: ['Retail', 'Office', 'Industrial', 'Multifamily', 'Land & Development'][index],
      engagementType: index % 2 === 0 ? 'Brokerage' : 'Advisory',
      status: index % 3 === 0 ? 'Proposal' : index % 3 === 1 ? 'Active' : 'Final Review',
      expectedFee: Math.round(metric(24000 + index * 7200, index + 1, scale)),
    })),
  };

  return {
    asOf: latestDate.toISOString(),
    periodLabel: monthLabel,
    unitsProperties: {
      occupancyVacancy,
      unitAvailability,
      rentRollSummary,
      leaseExpirationSchedule,
      moveInsMoveOuts,
      rentalRateTrend,
      propertyPerformance,
      unitMixPerformance,
      delinquencyByProperty,
      renewalPipeline,
    },
    leasingSales,
    maintenanceWorkOrders,
    commercialPropertyTypes,
    encompassMortgage: buildEncompassMortgageMockData(dates, scale),
    profitPowerBrokerage: buildProfitPowerBrokerageMockData(dates, scale),
  };
}

export function buildRealEstateOperationalHubMockReports(req: MockRequest) {
  const code = normalizeSectorCategory(req.sectorCategory);
  const profile = SECTOR_PROFILES[code] || SECTOR_PROFILES['01'];
  return buildRealEstateOperationalHubMockData(req, profile);
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
  const companyProductProfile = getCompanyProductServiceProfile(req.companyId);
  if (companyProductProfile) {
    const customers = uniqueCompanyCustomerGroups(companyProductProfile);
    const regions = getCompanyRegions(req.companyId);
    const dates = listDates(req.startDate, req.endDate, req.frequency);
    const records = dates.flatMap((date, i) =>
      customers.map((name, idx) => {
        const region = regions.length ? regions[(idx + i) % regions.length] : 'Unassigned';
        const revenue = metric(7800 + idx * 925, i + idx + 1, profile.scale);
        const invoiceCount = Math.max(1, Math.round(metric(5 + (idx % 4), i + 1, 1)));
        const categoryMatches = companyProductProfile.categories
          .filter((category) => category.primaryCustomers.includes(name))
          .map((category) => category.category);
        return {
          companyId: req.companyId,
          snapshotDate: date.toISOString(),
          frequency: req.frequency,
          customerName: name,
          region,
          country: region,
          revenue,
          invoiceCount,
          categoryMix: categoryMatches.join(', '),
          productServiceCategories: categoryMatches,
        };
      })
    );
    const limited = records.slice(0, req.limit || 1000);
    const totals = customers.map((name) => {
      const rows = limited.filter((row) => row.customerName === name);
      return {
        name,
        totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
        totalInvoices: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
        categoryMix: companyProductProfile.categories
          .filter((category) => category.primaryCustomers.includes(name))
          .map((category) => category.category)
          .join(', '),
      };
    });
    return {
      records: limited,
      summary: {
        topCustomers: totals.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
        revenueByRegion: summarizeByDimension(limited, 'region', ['revenue', 'invoiceCount']),
        productServiceCategories: companyProductProfile.categories,
        sourceSystemSalesPage: buildCompanyMockSalesPage(req, profile, companyProductProfile),
        topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
      },
    };
  }

  if (normalizeSectorCategory(req.sectorCategory) === '32' && req.frequency === 'monthly') {
    const customers = [
      { name: 'Regional Grocery Distributor', share: 0.24 },
      { name: 'Pittsburgh Foodservice Group', share: 0.18 },
      { name: 'Mid-Atlantic Bakery Supply', share: 0.15 },
      { name: 'Independent Market Network', share: 0.13 },
      { name: 'Restaurant Group Accounts', share: 0.11 },
      { name: 'Institutional Food Buyers', share: 0.09 },
      { name: 'Local Retail Partners', share: 0.06 },
      { name: 'Specialty Wholesale Accounts', share: 0.04 },
    ];
    const seasonalFactors = [0.92, 0.94, 1.0, 1.04, 1.06, 1.08, 1.07, 1.09, 1.12, 1.15, 1.24, 1.3];
    const dates = listMonthlyDatesAscending(req.startDate, req.endDate, 36);
    const baseYear = dates[0]?.getUTCFullYear() || req.startDate.getUTCFullYear();
    const records = dates.flatMap((date, monthIndex) => {
      const yearsSinceStart = date.getUTCFullYear() - baseYear + date.getUTCMonth() / 12;
      const annualGrowth = Math.pow(1.085, yearsSinceStart);
      const seasonal = seasonalFactors[date.getUTCMonth()] ?? 1;
      const monthlyRevenue = 392000 * annualGrowth * seasonal;
      return customers.map((customer, customerIndex) => {
        const noise = 0.985 + deterministicNoise(monthIndex * 19 + customerIndex * 7 + 3) * 0.03;
        const revenue = Math.round(monthlyRevenue * customer.share * noise);
        const invoiceCount = Math.max(8, Math.round(revenue / (820 + customerIndex * 28)));
        return {
          companyId: req.companyId,
          snapshotDate: date.toISOString(),
          frequency: req.frequency,
          customerName: customer.name,
          revenue,
          cogs: Math.round(revenue * 0.66),
          grossMargin: Math.round(revenue * 0.34),
          grossMarginPct: 34,
          invoiceCount,
          avgInvoiceSize: revenue / invoiceCount,
          bookings: Math.round(revenue * 1.015),
        };
      });
    });
    const limited = records.slice(0, req.limit || 5000);
    const totals = customers.map((customer) => {
      const rows = limited.filter((row) => row.customerName === customer.name);
      return {
        name: customer.name,
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
      ...(normalizeSectorCategory(req.sectorCategory) === '53'
        ? { realEstateReports: buildRealEstateOperationalHubMockData(req, profile) }
        : {}),
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
      over30Pct: ((latest.days31to60 + latest.days61to90 + latest.days90plus) / latest.totalAR) * 100,
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
      over30Pct: ((latest.days31to60 + latest.days61to90 + latest.days90plus) / latest.totalAP) * 100,
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
  const companyProductProfile = getCompanyProductServiceProfile(req.companyId);
  const companyCategories = companyProductProfile?.categories || [];
  const items = companyCategories.length > 0
    ? companyCategories.map((category) => category.category)
    : topLineNames(profile.productPrefix, 7);
  const dates = listDates(req.startDate, req.endDate, req.frequency);
  const customers = companyProductProfile
    ? uniqueCompanyCustomerGroups(companyProductProfile)
    : topLineNames(profile.customerPrefix, 6);
  const regions = getCompanyRegions(req.companyId);
  const records = dates.flatMap((date, i) =>
    items.map((item, idx) => {
      const categoryMeta = companyCategories[idx];
      const region = regions.length ? regions[(idx + i) % regions.length] : 'Unassigned';
      const quantitySold = metric(42 + idx * 7, i + 1, profile.scale);
      const revenue = metric(4200 + idx * 750, i + idx + 1, profile.scale);
      const cogs = revenue * (companyProductProfile ? 0.38 + ((idx % 3) * 0.035) : 0.58 + ((idx % 3) * 0.04));
      return {
        companyId: req.companyId,
        snapshotDate: date.toISOString(),
        frequency: req.frequency,
        itemName: item,
        category: item,
        productServiceCategory: item,
        region,
        country: region,
        sku: companyProductProfile ? `${getCompanySkuPrefix(req.companyId)}-${idx + 100}` : `SKU-${idx + 100}`,
        quantitySold,
        revenue,
        cogs,
        grossMargin: revenue - cogs,
        grossMarginPct: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
        testVolume: Math.round(quantitySold),
        testsOrdered: Math.round(quantitySold * 1.04),
        testsCompleted: Math.round(quantitySold * 0.97),
        turnaroundTimeDays: Number((2.2 + (idx % 4) * 0.35 + (i % 3) * 0.08).toFixed(2)),
        sampleRejectionRatePct: Number((1.1 + (idx % 3) * 0.25).toFixed(2)),
        labUtilizationPct: Number((72 + (idx % 4) * 4 + (i % 5)).toFixed(1)),
        sequencingCapacity: Math.round(quantitySold * 1.25),
        productsServices: categoryMeta?.productsServices,
        primaryCustomers: categoryMeta?.primaryCustomers.join(', '),
      };
    })
  );
  const latestWholesaleDates = dates.slice(0, Math.min(dates.length, 10));
  const wholesaleOrderLines = latestWholesaleDates.flatMap((date, dateIndex) =>
    items.flatMap((item, itemIndex) =>
      customers.slice(0, 4).map((customer, customerIndex) => {
        const region = regions.length ? regions[(customerIndex + dateIndex + itemIndex) % regions.length] : 'Unassigned';
        const qty = Math.round(metric(18 + itemIndex * 4 + customerIndex * 2, dateIndex + itemIndex + 1, profile.scale));
        const unitPrice = Number((86 + itemIndex * 7.5 + customerIndex * 2.25).toFixed(2));
        const materialCostPerPiece = Number((unitPrice * (0.52 + (itemIndex % 3) * 0.035)).toFixed(2));
        const tariffPerPiece = Number((unitPrice * 0.018).toFixed(2));
        const dutiesPerPiece = Number((unitPrice * 0.012).toFixed(2));
        const freightPerPiece = Number((2.15 + itemIndex * 0.28).toFixed(2));
        const operatingExpensesPerPiece = Number((unitPrice * 0.075).toFixed(2));
        const orderNumber = 41000 + dateIndex * 100 + itemIndex * 10 + customerIndex;
        const customerId = `C${String(1200 + customerIndex).padStart(4, '0')}`;
        const sku = companyProductProfile ? `${getCompanySkuPrefix(req.companyId)}-${itemIndex + 100}` : `SKU-${itemIndex + 100}`;
        const revenue = Number((qty * unitPrice).toFixed(2));
        return {
          key: `mock-wholesale-${dateIndex}-${itemIndex}-${customerIndex}`,
          source: 'mock-customer-order-line',
          snapshotDate: date.toISOString(),
          date: date.toISOString(),
          orderDate: date.toISOString(),
          isoDate: date.toISOString().slice(0, 10),
          monthLabel: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
          quarter: `Q${Math.floor(date.getUTCMonth() / 3) + 1}`,
          year: date.getUTCFullYear(),
          customerId,
          customerName: customer,
          customer,
          region,
          country: region,
          customerGroup: ['Strategic', 'Regional', 'Program', 'Spot'][customerIndex % 4],
          customerPartNumber: `CPN-${customerIndex + 1}${itemIndex + 100}`,
          order: `SO-${orderNumber}`,
          orderId: `SO-${orderNumber}`,
          lineId: String(itemIndex + 1),
          itemId: sku,
          sku,
          item,
          itemName: item,
          productServiceCategory: item,
          partNote: companyCategories[itemIndex]?.productsServices || `${item} mock margin profile for operations demo mode.`,
          quantitySold: qty,
          qty,
          qtyOrdered: qty + (customerIndex % 2),
          qtyShipped: qty,
          qtyInvoiced: qty,
          unitPrice,
          revenue,
          cogs: Number((qty * materialCostPerPiece).toFixed(2)),
          materialCost: Number((qty * materialCostPerPiece).toFixed(2)),
          currentImpactOfTariffPerPiece: tariffPerPiece,
          currentImpactOfDutiesPerPiece: dutiesPerPiece,
          costOfFreightPerPiece: freightPerPiece,
          currentOperatingExpenses: operatingExpensesPerPiece,
          contractValue: revenue,
          invoicedAmount: revenue,
          remainingAmount: 0,
          team: ['North', 'South', 'Key Accounts', 'Inside Sales'][customerIndex % 4],
        };
      })
    )
  ).slice(0, req.limit || 1000);
  const wholesaleVendorPricingRows = items.flatMap((item, itemIndex) => {
    const sku = companyProductProfile ? `${getCompanySkuPrefix(req.companyId)}-${itemIndex + 100}` : `SKU-${itemIndex + 100}`;
    return [0, 1].map((vendorIndex) => {
      const actualNoAdj = Number((45 + itemIndex * 4.15 + vendorIndex * 1.8).toFixed(4));
      const formalContracts = Number((actualNoAdj * (vendorIndex === 0 ? 0.985 : 1.015)).toFixed(4));
      const vendorPricingSheet = formalContracts;
      const difference = Number((actualNoAdj - vendorPricingSheet).toFixed(4));
      return {
        source: 'mock-vendor-pricing',
        snapshotDate: latestWholesaleDates[0]?.toISOString() || req.endDate.toISOString(),
        item: sku,
        vendorId: `V${String(500 + vendorIndex).padStart(4, '0')}`,
        vendorName: `${profile.vendorPrefix} ${vendorIndex + 1}`,
        rank: vendorIndex + 1,
        effectiveDate: (latestWholesaleDates[0] || req.endDate).toISOString().slice(0, 10),
        breakQty1: vendorIndex === 0 ? 1 : 250,
        actualNoAdj,
        formalContracts,
        vendorPricingSheet,
        difference,
        updatedDiff: difference,
        vendorItem: `${sku}-V${vendorIndex + 1}`,
        unitDutyCost: Number((actualNoAdj * 0.012).toFixed(4)),
        unitFreightCost: Number((2.15 + itemIndex * 0.28 + vendorIndex * 0.15).toFixed(4)),
        unitInsuranceCost: Number((actualNoAdj * 0.004).toFixed(4)),
      };
    });
  });
  const totals = items.map((name) => {
    const rows = records.filter((r) => r.itemName === name);
    const categoryMeta = companyCategories.find((category) => category.category === name);
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
      productsServices: categoryMeta?.productsServices,
      primaryCustomers: categoryMeta?.primaryCustomers.join(', '),
    };
  });
  return {
    records: records.slice(0, req.limit || 1000),
    summary: {
      topProducts: totals.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
      revenueByRegion: summarizeByDimension(records, 'region', ['revenue', 'quantitySold', 'testVolume']),
      revenueByProductService: summarizeByDimension(records, 'productServiceCategory', ['revenue', 'quantitySold', 'testVolume']),
      wholesaleOrderLines,
      wholesaleVendorPricingRows,
      productServiceCategories: companyProductProfile?.categories,
      topLineBuckets: getTopLineBucketsForSector(req.sectorCategory),
      ...(normalizeSectorCategory(req.sectorCategory) === '53'
        ? { realEstateReports: buildRealEstateOperationalHubMockData(req, profile) }
        : {}),
    },
  };
}

function buildInventoryResponse(req: MockRequest, profile: SectorProfile) {
  const companyProductProfile = getCompanyProductServiceProfile(req.companyId);
  const items = companyProductProfile?.categories.length
    ? companyProductProfile.categories.map((category) => category.category)
    : topLineNames(profile.productPrefix, 8);
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
        sku: companyProductProfile ? `${getCompanySkuPrefix(req.companyId)}-INV-${idx + 200}` : `INV-${idx + 200}`,
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
      ...(companyProductProfile ? { inventoryMovement: buildCompanyInventoryMovement(req, profile, companyProductProfile) } : {}),
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
  if (req.type === 'customers') return withCompanyReportingProfile(req, buildCustomersResponse(req, profile));
  if (req.type === 'ar-aging') return withCompanyReportingProfile(req, buildArResponse(req, profile));
  if (req.type === 'ap-aging') return withCompanyReportingProfile(req, buildApResponse(req, profile));
  if (req.type === 'products') return withCompanyReportingProfile(req, buildProductResponse(req, profile));
  if (req.type === 'inventory') return withCompanyReportingProfile(req, buildInventoryResponse(req, profile));
  if (req.type === 'ap') return withCompanyReportingProfile(req, buildApBalanceResponse(req, profile));
  return withCompanyReportingProfile(req, buildCashResponse(req, profile));
}

export function buildOperationalMockSummaryCounts(sectorCategory?: string | null, companyId?: string | null) {
  return {
    customerSalesRecords: 96,
    arAgingRecords: 12,
    apAgingRecords: 12,
    productSalesRecords: 84,
    inventoryRecords: 96,
    cashRecords: 24,
    topLineBuckets: getTopLineBucketsForSector(sectorCategory),
    reportingProfile: companyId ? getCompanyReportingProfile(companyId) : null,
  };
}
