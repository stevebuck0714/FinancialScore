export const REALPAGE_ONESITE_SOURCE_CODE = 'REALPAGE_ONESITE';
export const REALPAGE_ONESITE_LABEL = 'RealPage OneSite';

export type RealPageOneSiteDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

export const DEFAULT_REALPAGE_ONESITE_DATA_DOMAINS: RealPageOneSiteDataDomain[] = [
  { dataDomain: 'Property and Unit Setup', sourceObject: 'Units; Assets', enabled: true },
  { dataDomain: 'General Ledger', sourceObject: 'General Ledger v2; Transactions', enabled: true },
  { dataDomain: 'Accounts Payable', sourceObject: 'Accounts Payable v2', enabled: true },
  { dataDomain: 'Resident Receivables and Collections', sourceObject: 'Resident Management; Collections — aging, payment plans, collections, and legal activity', enabled: true },
  { dataDomain: 'Leasing and Occupancy', sourceObject: 'Resident Management — lease dates, move-ins/outs, occupancy, rent rolls, and scheduled charges', enabled: true },
  { dataDomain: 'Pricing and Revenue', sourceObject: 'Pricing and Availability; Resident Management — market rents, specials, rent changes, and recommended pricing', enabled: true },
  { dataDomain: 'Facilities and Work Orders', sourceObject: 'Facilities — work orders, preventive maintenance, inspections, assets, parts, and labor', enabled: true },
  { dataDomain: 'Budgets', sourceObject: 'Confirm with RealPage', enabled: false },
];
