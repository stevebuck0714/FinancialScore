export type FinancialPipelineLane = 'ERP_LEDGER' | 'LIGHTWEIGHT_PAYLOAD' | 'CSV_TRIAL_BALANCE';

const ERP_LEDGER_SYSTEMS = new Set([
  'INFOR_M3',
  'INFOR_CSI',
  'QUICKBOOKS_DESKTOP',
  'DYNAMICS',
  'DYNAMICS365',
  'NETSUITE',
  'ACUMATICA',
  'ODOO',
  'EPICOR',
  'IFS',
]);

const LIGHTWEIGHT_PAYLOAD_SYSTEMS = new Set([
  'QUICKBOOKS',
  'XERO',
  'SAGE',
  'SAGE_INTACCT',
]);

function normalizeAccountingSystem(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function resolveFinancialPipelineLane(accountingSystem: unknown): FinancialPipelineLane {
  const normalized = normalizeAccountingSystem(accountingSystem);
  if (normalized === 'CSV_FILE') return 'CSV_TRIAL_BALANCE';
  if (ERP_LEDGER_SYSTEMS.has(normalized)) return 'ERP_LEDGER';
  if (LIGHTWEIGHT_PAYLOAD_SYSTEMS.has(normalized)) return 'LIGHTWEIGHT_PAYLOAD';
  // Default to payload lane for unknown lightweight-style connectors.
  return 'LIGHTWEIGHT_PAYLOAD';
}

export function supportsPublishFromDailySnapshots(accountingSystem: unknown): boolean {
  const lane = resolveFinancialPipelineLane(accountingSystem);
  return lane === 'ERP_LEDGER' || lane === 'CSV_TRIAL_BALANCE';
}
