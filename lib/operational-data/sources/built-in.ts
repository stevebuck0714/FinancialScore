import { BAKERS_COGS_LABEL, BAKERS_COGS_SOURCE_CODE } from '@/lib/operational/bakers-cogs';
import { RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE } from '@/lib/operational/retail-subcategory-history';
import type { OperationalSourceAdapter } from '../types';

/** Spreadsheet sources whose uploads already land in typed tables that Ask Corelytics queries directly. */
function builtIn(sourceCode: string, label: string, datasetPrefix: string, builtInAskDatasets: string[]): OperationalSourceAdapter {
  return {
    sourceCode,
    provider: 'SPREADSHEET_UPLOAD',
    label,
    datasetPrefix,
    datasets: [],
    builtInAskDatasets,
    history: 'file',
    historyNote: 'History is whatever the uploaded reports cover; upload older reports to add earlier months.',
  };
}

export const BUILT_IN_ADAPTERS = {
  PLATOS_CLOSET_STORE_VISIT: builtIn('PLATOS_CLOSET_STORE_VISIT', 'Monthly Store Visit Report', 'platos_store', ['retail_store_monthly_facts']),
  PLATOS_INVENTORY: builtIn('PLATOS_INVENTORY', 'Monthly Inventory Report', 'platos_inventory', ['retail_store_monthly_facts']),
  BAKERS_COGS: builtIn(BAKERS_COGS_SOURCE_CODE, BAKERS_COGS_LABEL, 'bakers_cogs', ['bakery_product_costs']),
} satisfies Record<string, OperationalSourceAdapter>;

export const RETAIL_SUBCATEGORY_HISTORY_ADAPTER = builtIn(
  RETAIL_SUBCATEGORY_HISTORY_SOURCE_CODE,
  'Retail Subcategory History',
  'retail_history',
  ['retail_store_monthly_facts'],
);
