/**
 * Vista Cloud program/resource catalog.
 *
 * Each row maps a Trimble Vista Direct API resource that we may sync for
 * a company. `historyMonths` reflects whether Trimble configured a longer-
 * than-default data window during onboarding (Trimble default is 12 months
 * for several Job Cost / PO / SL / AR / GL endpoints).
 */

export type VistaCloudProgram = {
  module: string;        // 'jc' | 'po' | 'sl' | 'ar' | 'ap' | 'gl' | 'pm' | 'pr' | 'cm'
  resource: string;      // human label, e.g. 'Contract Headers'
  resourcePath: string;  // url segment, e.g. 'contract_headers'
  enabled: boolean;
  historyMonths: number;
};

export const DEFAULT_VISTA_CLOUD_PROGRAMS: VistaCloudProgram[] = [
  // Job Cost — must-have
  { module: 'jc', resource: 'Contract Headers',     resourcePath: 'contract_headers',     enabled: true,  historyMonths: 12 },
  { module: 'jc', resource: 'Contract Items',       resourcePath: 'contract_items',       enabled: true,  historyMonths: 12 },
  { module: 'jc', resource: 'Cost Details',         resourcePath: 'cost_details',         enabled: true,  historyMonths: 12 },
  // Job Cost — recommended
  { module: 'jc', resource: 'Cost Detail Periods',  resourcePath: 'cost_detail_periods',  enabled: false, historyMonths: 12 },
  // Purchase Orders — must-have
  { module: 'po', resource: 'PO Headers',           resourcePath: 'po_headers',           enabled: true,  historyMonths: 12 },
  { module: 'po', resource: 'PO Lines',             resourcePath: 'po_lines',             enabled: true,  historyMonths: 12 },
  // Subcontract Ledger — must-have
  { module: 'sl', resource: 'Subcontracts',         resourcePath: 'subcontracts',         enabled: true,  historyMonths: 12 },
  // Accounts Receivable — must-have + optional detail
  { module: 'ar', resource: 'Transaction Lines',    resourcePath: 'transaction_lines',    enabled: true,  historyMonths: 12 },
  { module: 'ar', resource: 'Invoices',             resourcePath: 'invoices',             enabled: false, historyMonths: 12 },
  { module: 'ar', resource: 'Customers',            resourcePath: 'customers',            enabled: false, historyMonths: 12 },
  // Accounts Payable
  { module: 'ap', resource: 'Invoices',             resourcePath: 'invoices',             enabled: true,  historyMonths: 12 },
  // General Ledger — must-have
  { module: 'gl', resource: 'Chart of Accounts',    resourcePath: 'chart_of_accounts',    enabled: true,  historyMonths: 12 },
  { module: 'gl', resource: 'Transactions',         resourcePath: 'transactions',         enabled: true,  historyMonths: 12 },
  // Optional (only if Trimble enabled the module)
  { module: 'pm', resource: 'Pending Change Orders', resourcePath: 'pending_change_orders', enabled: false, historyMonths: 12 },
  { module: 'cm', resource: 'Bank Transactions',    resourcePath: 'bank_transactions',    enabled: false, historyMonths: 12 },
  { module: 'pr', resource: 'Time Entries',         resourcePath: 'time_entries',         enabled: false, historyMonths: 12 },
];

const ALLOWED_MODULES = new Set(['jc', 'po', 'sl', 'ar', 'ap', 'gl', 'pm', 'pr', 'cm', 'eq']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function sanitizeVistaCloudPrograms(value: unknown): VistaCloudProgram[] {
  if (!Array.isArray(value)) return DEFAULT_VISTA_CLOUD_PROGRAMS;
  const cleaned = value
    .map((row): VistaCloudProgram => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      const moduleRaw = asString(src.module).toLowerCase();
      return {
        module: ALLOWED_MODULES.has(moduleRaw) ? moduleRaw : moduleRaw,
        resource: asString(src.resource),
        resourcePath: asString(src.resourcePath),
        enabled: src.enabled === false ? false : true,
        historyMonths: asPositiveInt(src.historyMonths, 12),
      };
    })
    .filter((row) => row.module || row.resource || row.resourcePath);
  return cleaned.length > 0 ? cleaned : DEFAULT_VISTA_CLOUD_PROGRAMS;
}
