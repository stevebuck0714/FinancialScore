// Company configuration options for profile settings

export const ACCOUNTING_SYSTEMS = [
  { value: '', label: 'Select Accounting System' },
  { value: 'QUICKBOOKS', label: 'QuickBooks' },
  { value: 'XERO', label: 'Xero' },
  { value: 'NETSUITE', label: 'NetSuite' },
  { value: 'SAGE', label: 'Sage' },
  { value: 'SAGE_INTACCT', label: 'Sage Intacct' },
  { value: 'DYNAMICS', label: 'Dynamics' },
  { value: 'INFOR_M3', label: 'Infor M3' },
  { value: 'ACUMATICA', label: 'Acumatica' },
  { value: 'FUSION_CLOUD', label: 'Fusion Cloud' },
  { value: 'EPICOR', label: 'Epicor' },
  { value: 'IFS', label: 'IFS' },
  { value: 'QAD', label: 'QAD' },
  { value: 'CERTINIA', label: 'Certinia' },
] as const;

export const COMPANY_SIZES = [
  { value: '', label: 'Select Company Size' },
  { value: 'DEFAULT', label: 'Default' },
  { value: 'SMB', label: 'SMB' },
  { value: 'MID_MARKET', label: 'Mid-Market' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
] as const;

export const INDUSTRY_SECTORS = [
  { value: '', label: 'Select Industry Sector' },
  { value: 'DEFAULT', label: 'Default' },
  { value: 'AGRICULTURE', label: 'Agriculture, Fishing, Forestry and Hunting' },
  { value: 'MINING', label: 'Mining' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'WHOLESALE_TRADE', label: 'Wholesale Trade' },
  { value: 'RETAIL_TRADE', label: 'Retail Trade' },
  { value: 'TRANSPORTATION', label: 'Transportation and Warehousing' },
  { value: 'INFORMATION', label: 'Information' },
  { value: 'FINANCE_INSURANCE', label: 'Finance and Insurance' },
  { value: 'REAL_ESTATE', label: 'Real Estate, Rental and Leasing' },
  { value: 'PROFESSIONAL_SERVICES', label: 'Professional, Scientific and Technical Services' },
] as const;

