export interface TargetFieldOption {
  value: string;
  label: string;
}

type SectorSchema = {
  revenue: string[];
  cogs: string[];
};

const LEGACY_REVENUE_OPTIONS: TargetFieldOption[] = [{ value: 'revenue', label: 'Revenue' }];

const LEGACY_COGS_OPTIONS: TargetFieldOption[] = [
  { value: 'cogsPayroll', label: 'COGS - Payroll' },
  { value: 'cogsOwnerPay', label: 'COGS - Owner Pay' },
  { value: 'cogsContractors', label: 'COGS - Contractors' },
  { value: 'cogsMaterials', label: 'COGS - Materials' },
  { value: 'cogsCommissions', label: 'COGS - Commissions' },
  { value: 'cogsOther', label: 'COGS - Other' },
];

export const STATIC_TARGET_FIELD_OPTIONS = {
  expense: [
    { value: 'payroll', label: 'Payroll' },
    { value: 'ownerBasePay', label: 'Owner Base Pay' },
    { value: 'benefits', label: 'Benefits' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'professionalFees', label: 'Professional Fees' },
    { value: 'subcontractors', label: 'Subcontractors' },
    { value: 'rent', label: 'Rent' },
    { value: 'taxLicense', label: 'Tax & License' },
    { value: 'stateIncomeTaxes', label: 'State Income Taxes' },
    { value: 'federalIncomeTaxes', label: 'Federal Income Taxes' },
    { value: 'phoneComm', label: 'Phone & Comm' },
    { value: 'infrastructure', label: 'Infrastructure' },
    { value: 'autoTravel', label: 'Auto & Travel' },
    { value: 'salesExpense', label: 'Sales & Marketing' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'trainingCert', label: 'Training & Cert' },
    { value: 'mealsEntertainment', label: 'Meals & Entertainment' },
    { value: 'interestExpense', label: 'Interest Expense' },
    { value: 'depreciationAmortization', label: 'Depreciation' },
    { value: 'otherExpense', label: 'Other Expense' },
  ] as TargetFieldOption[],
  nonOperating: [
    { value: 'nonOperatingIncome', label: 'Non-Operating Income' },
    { value: 'nonOperatingExpense', label: 'Non-Operating Expense' },
  ] as TargetFieldOption[],
  asset: [
    { value: 'cash', label: 'Cash' },
    { value: 'ar', label: 'A/R' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'otherCA', label: 'Other Current Assets' },
    { value: 'fixedAssets', label: 'Fixed Assets' },
    { value: 'otherAssets', label: 'Other Assets' },
  ] as TargetFieldOption[],
  liability: [
    { value: 'ap', label: 'A/P' },
    { value: 'loc', label: 'Line of Credit' },
    { value: 'otherCL', label: 'Other Current Liab' },
    { value: 'ltd', label: 'Long Term Debt' },
  ] as TargetFieldOption[],
  equity: [
    { value: 'ownersCapital', label: "Owner's Capital" },
    { value: 'ownersDraw', label: "Owner's Draw" },
    { value: 'commonStock', label: 'Common Stock' },
    { value: 'preferredStock', label: 'Preferred Stock' },
    { value: 'retainedEarnings', label: 'Retained Earnings' },
    { value: 'additionalPaidInCapital', label: 'Add. Paid-In Capital' },
    { value: 'treasuryStock', label: 'Treasury Stock' },
  ] as TargetFieldOption[],
};

const SECTOR_SCHEMA_BY_CODE: Record<string, SectorSchema> = {
  '11': {
    revenue: [
      'Primary Commodity Sales',
      'Contract Farming / Production Agreements',
      'Processing & Value-Added Products',
      'Government Subsidies',
      'Crop Insurance Proceeds',
      'Equipment Rental / Custom Services',
      'Byproduct / Scrap Sales',
      'Shipping Revenue',
      'Other Revenue',
    ],
    cogs: ['Direct Materials & Inputs', 'Direct Labor', 'Equipment & Fuel', 'Processing & Packaging', 'Other COGS'],
  },
  '21': {
    revenue: [
      'Raw Resource Sales',
      'Long-Term Offtake Contracts',
      'Processing & Refinement Revenue',
      'Transportation & Handling Revenue',
      'Royalty Income',
      'Hedging / Commodity Settlement Gains',
      'Other Revenue',
    ],
    cogs: ['Extraction Materials & Supplies', 'Direct Labor', 'Equipment & Fuel', 'Processing & Refining Costs', 'Other COGS'],
  },
  '22': {
    revenue: [
      'Energy Sales',
      'Transmission / Distribution Charges',
      'Capacity Charges',
      'Renewable Energy Credits',
      'Connection / Hook-Up Fees',
      'Government Incentives',
      'Other Revenue',
    ],
    cogs: ['Energy Production Costs', 'Direct Labor', 'Transmission & Grid Costs', 'Infrastructure Depreciation', 'Other COGS'],
  },
  '23': {
    revenue: [
      'Contract Revenue',
      'Time & Materials Revenue',
      'Progress / Milestone Billing',
      'Change Orders',
      'Service & Maintenance Contracts',
      'Equipment Rental Revenue',
      'Other Revenue',
    ],
    cogs: [
      'Direct Materials',
      'Direct Labor (Field)',
      'Subcontractors',
      'Equipment Rental & Job Equipment',
      'Job-Specific Permits / Fees',
      'Other COGS',
    ],
  },
  '32': {
    revenue: [
      'Finished Goods Sales',
      'Custom / Project Revenue',
      'OEM / Contract Manufacturing',
      'Aftermarket & Service Revenue',
      'Tooling / Engineering Revenue',
      'Scrap & Other Revenue',
      'Other Revenue',
    ],
    cogs: [
      'Raw Materials & Components',
      'Direct Production Labor',
      'Manufacturing Overhead',
      'Production Equipment Depreciation',
      'Scrap / Yield Loss',
      'Other COGS',
    ],
  },
  '42': {
    revenue: [
      'Product Resale Revenue',
      'Contract / Program Revenue',
      'Drop Ship Revenue',
      'Freight & Surcharge Revenue',
      'Vendor Rebates & Incentives',
      'Value-Added Services',
      'Other Revenue',
    ],
    cogs: [
      'Product Cost',
      'Inbound Logistics',
      'Inventory Adjustments',
      'Tariffs',
      'Handling & Preparation',
      'Outbound Fulfillment',
      'Contra COGS',
      'Other COGS',
    ],
  },
  '45': {
    revenue: [
      'In-Store Sales',
      'E-Commerce Sales',
      'Subscription / Membership Revenue',
      'Private Label Sales',
      'Warranty & Protection Plans',
      'Vendor Rebates / Co-Op',
      'Other Revenue',
    ],
    cogs: ['Merchandise Purchases', 'Freight-In', 'Inventory Shrinkage & Write-Offs', 'Distribution Center Labor', 'Other COGS'],
  },
  '48': {
    revenue: [
      'Freight Revenue',
      'Dedicated Contract Services',
      'Fuel Surcharges',
      'Warehousing & Storage Fees',
      'Logistics / 3PL Revenue',
      'Accessorial Charges',
      'Other Revenue',
    ],
    cogs: ['Direct Driver Labor', 'Fuel', 'Equipment Costs', 'Insurance - Fleet', 'Toll & Accessorial Service Costs', 'Other COGS'],
  },
  '51': {
    revenue: [
      'Subscription Revenue',
      'Advertising Revenue',
      'Licensing Revenue',
      'Data & Analytics Revenue',
      'Implementation / Setup Fees',
      'Support & Maintenance Revenue',
      'Other Revenue',
    ],
    cogs: ['Hosting & Infrastructure', 'Direct Service Labor', 'Content Licensing / Royalties', 'Payment Processing Costs', 'Other COGS'],
  },
  '52': {
    revenue: [
      'Interest Income',
      'Fee Income',
      'Asset Management Fees',
      'Commission Revenue',
      'Insurance Premium Revenue',
      'Performance / Incentive Fees',
      'Other Revenue',
    ],
    cogs: ['Cost of Funds', 'Claims Expense', 'Commission Expense', 'Servicing & Processing Costs', 'Other COGS'],
  },
  '53': {
    revenue: [
      'Rental Income',
      'CAM / Operating Cost Recoveries',
      'Property Management Fees',
      'Lease Termination Fees',
      'Development / Disposition Gains',
      'Ancillary Income',
      'Other Revenue',
    ],
    cogs: ['Property Operating Costs', 'Direct Property Labor', 'Property Management Costs', 'Building Depreciation', 'Other COGS'],
  },
  '54': {
    revenue: [
      'Billable Service Revenue',
      'Retainer Revenue',
      'Project-Based Revenue',
      'Licensing / IP Revenue',
      'Success / Performance Fees',
      'Reimbursable Expenses',
      'Other Revenue',
    ],
    cogs: [
      'Direct Billable Labor',
      'Subcontractor Fees',
      'Project-Specific Travel & Expenses',
      'Reimbursable Direct Costs',
      'Other COGS',
    ],
  },
  '56': {
    revenue: [
      'Service Contract Revenue',
      'Staffing Revenue',
      'Waste Collection Revenue',
      'Environmental Service Revenue',
      'Facility Management Contracts',
      'Surcharges / Environmental Fees',
      'Other Revenue',
    ],
    cogs: ['Direct Service Labor', 'Disposal / Landfill Fees', 'Fleet & Equipment Costs', 'Supplies & Consumables', 'Other COGS'],
  },
  '61': {
    revenue: [
      'Tuition Revenue',
      'Certification / Exam Fees',
      'Subscription / Online Course Revenue',
      'Corporate Training Contracts',
      'Grants & Government Funding',
      'Ancillary Revenue (materials, housing)',
      'Other Revenue',
    ],
    cogs: ['Instructional Labor', 'Curriculum & Materials', 'Platform / Delivery Costs', 'Other COGS'],
  },
  '62': {
    revenue: [
      'Patient Service Revenue',
      'Insurance Reimbursements',
      'Capitation Revenue',
      'Government Program Revenue',
      'Lab / Ancillary Services',
      'Grants / Subsidies',
      'Other Revenue',
    ],
    cogs: ['Clinical Labor', 'Medical Supplies', 'Lab / Imaging Costs', 'Pharmaceuticals', 'Other COGS'],
  },
  '71': {
    revenue: [
      'Ticket Sales',
      'Membership Revenue',
      'Sponsorship Revenue',
      'Merchandise Sales',
      'Licensing / Media Revenue',
      'Concessions Revenue',
      'Other Revenue',
    ],
    cogs: ['Performer / Talent Costs', 'Production Costs', 'Venue Rental', 'Event-Specific Labor', 'Other COGS'],
  },
  '72': {
    revenue: [
      'Room Revenue',
      'Food & Beverage Revenue',
      'Event / Banquet Revenue',
      'Franchise Fees',
      'Delivery / Catering Revenue',
      'Ancillary Services',
      'Other Revenue',
    ],
    cogs: ['Food & Beverage Cost', 'Kitchen Labor', 'Housekeeping Labor', 'Guest Supplies', 'Other COGS'],
  },
  '81': {
    revenue: [
      'Service Revenue',
      'Maintenance Contracts',
      'Membership Revenue',
      'Product Sales',
      'Commission Revenue',
      'Miscellaneous Fees',
      'Other Revenue',
    ],
    cogs: ['Direct Service Labor', 'Parts & Materials', 'Subcontractor Costs', 'Other COGS'],
  },
};

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildOptions(prefix: 'rev' | 'cogs', labels: string[]): TargetFieldOption[] {
  return labels.map((label) => ({ value: `${prefix}_${slugifyLabel(label)}`, label }));
}

export function getSectorSchema(industrySectorCategory?: string | null): SectorSchema | null {
  if (!industrySectorCategory) return null;
  return SECTOR_SCHEMA_BY_CODE[industrySectorCategory] || null;
}

export function getRevenueTargetFieldOptions(industrySectorCategory?: string | null): TargetFieldOption[] {
  const schema = getSectorSchema(industrySectorCategory);
  if (!schema) return LEGACY_REVENUE_OPTIONS;
  return buildOptions('rev', schema.revenue);
}

export function getCogsTargetFieldOptions(industrySectorCategory?: string | null): TargetFieldOption[] {
  const schema = getSectorSchema(industrySectorCategory);
  if (!schema) return LEGACY_COGS_OPTIONS;
  return buildOptions('cogs', schema.cogs);
}

export function getTargetFieldOptions(industrySectorCategory?: string | null) {
  return {
    revenue: getRevenueTargetFieldOptions(industrySectorCategory),
    cogs: getCogsTargetFieldOptions(industrySectorCategory),
    ...STATIC_TARGET_FIELD_OPTIONS,
  };
}

export function getAllowedTargetFieldSet(industrySectorCategory?: string | null): Set<string> {
  const options = getTargetFieldOptions(industrySectorCategory);
  const allowed = new Set<string>();
  Object.values(options).forEach((list) => list.forEach((opt) => allowed.add(opt.value)));
  // Backward compatibility for previously saved mappings during migration.
  LEGACY_REVENUE_OPTIONS.forEach((opt) => allowed.add(opt.value));
  LEGACY_COGS_OPTIONS.forEach((opt) => allowed.add(opt.value));
  return allowed;
}

