// Company configuration options for profile settings

export const ACCOUNTING_SYSTEMS = [
  { value: '', label: 'Select Accounting System' },
  { value: 'ACUMATICA', label: 'Acumatica' },
  { value: 'CSV_FILE', label: 'CSV file' },
  { value: 'DYNAMICS', label: 'Dynamics' },
  { value: 'EPICOR', label: 'Epicor' },
  { value: 'IFS', label: 'IFS' },
  { value: 'INFOR_M3', label: 'Infor Syteline CSI' },
  { value: 'NETSUITE', label: 'NetSuite' },
  { value: 'ODOO', label: 'Odoo' },
  { value: 'QUICKBOOKS', label: 'QuickBooks Online' },
  { value: 'QUICKBOOKS_DESKTOP', label: 'QuickBooks Desktop' },
  { value: 'SAGE', label: 'Sage' },
  { value: 'SAGE_INTACCT', label: 'Sage Intacct' },
  { value: 'XERO', label: 'Xero' },
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
  { value: '01', label: '01 - Default' },
  { value: '11', label: '11 - Agriculture, Forestry, Fishing & Hunting' },
  { value: '21', label: '21 - Mining, Quarrying, and Oil & Gas Extraction' },
  { value: '22', label: '22 - Utilities' },
  { value: '23', label: '23 - Construction' },
  { value: '32', label: '32 - Manufacturing' },
  { value: '42', label: '42 - Wholesale Trade' },
  { value: '45', label: '45 - Retail Trade' },
  { value: '48', label: '48 - Transportation & Warehousing' },
  { value: '51', label: '51 - Information' },
  { value: '52', label: '52 - Finance & Insurance' },
  { value: '53', label: '53 - Real Estate & Rental & Leasing' },
  { value: '54', label: '54 - Professional, Scientific & Technical Services' },
  { value: '56', label: '56 - Admin & Support + Waste Management/Remediation' },
  { value: '61', label: '61 - Educational Services' },
  { value: '62', label: '62 - Health Care & Social Assistance' },
  { value: '71', label: '71 - Arts, Entertainment & Recreation' },
  { value: '72', label: '72 - Accommodation & Food Services' },
  { value: '81', label: '81 - Other Services' },
] as const;

