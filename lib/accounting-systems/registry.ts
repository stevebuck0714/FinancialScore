/**
 * Registry of all accounting-system plugins.
 *
 * Adding a new ERP:
 *   1. Create lib/accounting-systems/{system}/index.ts that exports a
 *      conforming AccountingSystemModule.
 *   2. Import it below and add it to ACCOUNTING_SYSTEM_MODULES.
 * That's it — the profile dropdown, generic API route, and site-admin
 * shell pick it up automatically.
 */

import type { AccountingSystemModule } from './types';
import vistaCloud from './vista-cloud';
import sageIntacct from './sage-intacct';
import acumatica from './acumatica';
import odoo from './odoo';
import dynamics365 from './dynamics-365';
import sapS4Hana from './sap-s4hana';

const modules: AccountingSystemModule<any, any>[] = [
  vistaCloud,
  sageIntacct,
  acumatica,
  odoo,
  dynamics365,
  sapS4Hana,
];

export const ACCOUNTING_SYSTEM_MODULES: ReadonlyArray<AccountingSystemModule<any, any>> = modules;

const byKey = new Map<string, AccountingSystemModule<any, any>>();
for (const m of modules) {
  byKey.set(m.key.toUpperCase(), m);
  for (const alias of m.aliases ?? []) {
    byKey.set(alias.toUpperCase(), m);
  }
}

/**
 * Look up a plugin by its system key (case-insensitive).
 * Returns null when the system isn't yet implemented as a plugin — callers
 * should fall back to legacy inline handling for those.
 */
export function getAccountingSystemModule(systemKey: unknown): AccountingSystemModule<any, any> | null {
  // Accept any of: 'SAGE_INTACCT', 'sage_intacct', 'sage-intacct', 'sageintacct'.
  // Underscores and hyphens are interchangeable in URL paths.
  const normalized = String(systemKey || '').trim().toUpperCase().replace(/-/g, '_');
  if (!normalized) return null;
  return byKey.get(normalized) ?? null;
}

/**
 * True iff this accounting system is implemented through the plugin
 * framework (vs. still using the legacy inline pattern). Use this in
 * SiteAdminDashboard etc. to decide whether to render the new shell.
 */
export function isPluginAccountingSystem(systemKey: unknown): boolean {
  return getAccountingSystemModule(systemKey) !== null;
}

/**
 * Dropdown options derived from the registry, suitable for merging with the
 * legacy ACCOUNTING_SYSTEMS list during migration.
 */
export function getAccountingSystemOptions(): Array<{ value: string; label: string }> {
  return modules.map((m) => ({ value: m.key, label: m.label }));
}
