import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getReportDataCatalog, type ReportFieldCatalogItem } from '@/lib/custom-reports/report-data-catalog';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';
import {
  extractEntityNameFromPrompt,
  getReportDataset,
  getReportDatasetCatalog,
  inferColumnsFromPrompt,
  inferDatasetDateRangeFromPrompt,
  inferDatasetFiltersFromPrompt,
  inferDatasetFromPrompt,
  normalizeDatasetColumns,
  normalizeDatasetLimit,
  normalizeDatasetSort,
  type ReportDataset,
} from '@/lib/custom-reports/report-datasets';

type ReportChartType = 'line' | 'multi_line' | 'bar' | 'grouped_bar' | 'stacked_bar' | 'combo' | 'table' | 'pie';

const allowedChartTypes = new Set<ReportChartType>(['line', 'multi_line', 'bar', 'grouped_bar', 'stacked_bar', 'combo', 'table', 'pie']);

function safeJsonParse(rawContent: string): any {
  const raw = String(rawContent || '').trim();
  if (!raw) throw new Error('Empty AI response');

  const stripped = raw
    .replace(/^\uFEFF/, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Failed to parse AI JSON');
  }
}

function normalizeChartType(value: unknown, fallback: ReportChartType): ReportChartType {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowedChartTypes.has(normalized as ReportChartType) ? (normalized as ReportChartType) : fallback;
}

function datasetColumnKey(dataset: ReportDataset, key: string): string | null {
  const normalized = String(key || '').trim().toLowerCase();
  return dataset.columns.find((column) => column.key.toLowerCase() === normalized)?.key || null;
}

function inferDimensionColumnKey(dataset: ReportDataset, prompt: string): string | null {
  const normalized = normalizePromptText(prompt).toLowerCase();
  const candidates: string[] = [];
  if (/\b(product|products|item|items|sku|skus|part|parts)\b/.test(normalized)) candidates.push('itemName', 'sku', 'productName');
  if (/\b(customer|customers|client|clients|account|accounts)\b/.test(normalized)) candidates.push('customerName', 'clientName');
  if (/\b(vendor|vendors|supplier|suppliers)\b/.test(normalized)) candidates.push('vendorName');
  if (/\b(category|categories|mix)\b/.test(normalized)) candidates.push('category', 'productServiceCategory', 'department');
  if (/\b(location|locations|warehouse|warehouses|site|sites)\b/.test(normalized)) candidates.push('warehouse', 'location', 'locationName', 'site');
  if (/\b(division|divisions)\b/.test(normalized)) candidates.push('division');
  for (const candidate of candidates) {
    const key = datasetColumnKey(dataset, candidate);
    if (key) return key;
  }
  return null;
}

function normalizeDimensionColumnKey(dataset: ReportDataset, prompt: string, rawDimension: unknown): string | null {
  const rawKey = typeof rawDimension === 'string'
    ? rawDimension
    : typeof rawDimension === 'object' && rawDimension
      ? String((rawDimension as any).field || (rawDimension as any).key || '')
      : '';
  const requestedKey = rawKey ? datasetColumnKey(dataset, rawKey) : null;
  const inferredKey = inferDimensionColumnKey(dataset, prompt);
  const normalized = normalizePromptText(prompt).toLowerCase();
  const asksProduct = /\b(product|products|item|items|part|parts)\b/.test(normalized);
  const explicitlyAsksIdOrSku = /\b(sku|skus|product id|item id|part number|item code)\b/.test(normalized);
  if (asksProduct && !explicitlyAsksIdOrSku) {
    const itemNameKey = datasetColumnKey(dataset, 'itemName') || datasetColumnKey(dataset, 'productName');
    if (itemNameKey) return itemNameKey;
  }
  return requestedKey || inferredKey;
}

function inferTopLimit(prompt: string): number | null {
  const normalized = normalizePromptText(prompt).toLowerCase();
  const numeric = normalized.match(/\btop\s+(\d{1,2})\b/);
  if (numeric) return Math.min(Math.max(Number(numeric[1]), 1), 50);
  const wordMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const word = normalized.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  return word ? wordMap[word[1]] : null;
}

function inferExactDateRangeFromPrompt(dataset: ReportDataset, prompt: string): any | null {
  const normalized = normalizePromptText(prompt).toLowerCase();
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/);
  if (!monthMatch || !dataset.dateField) return null;
  const monthIndex = monthNames.indexOf(monthMatch[1]);
  const year = Number(monthMatch[2]);
  if (monthIndex < 0 || !Number.isFinite(year)) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    field: dataset.dateField,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function normalizeSeries(config: any, chartType: ReportChartType, fieldCatalog: ReportFieldCatalogItem[]) {
  const allowedFields = new Set<string>(fieldCatalog.map((item) => item.field));
  const rawSeries = Array.isArray(config?.series) ? config.series : [];
  const normalized = rawSeries
    .map((item: any, index: number) => {
      const field = allowedFields.has(String(item?.field)) ? String(item.field) : null;
      if (!field) return null;

      const fieldMeta = fieldCatalog.find((meta) => meta.field === field);
      const seriesChartType =
        chartType === 'combo'
          ? normalizeChartType(item?.chartType, index === 0 ? 'bar' : 'line')
          : chartType === 'stacked_bar' || chartType === 'grouped_bar'
            ? 'bar'
            : chartType === 'multi_line'
              ? 'line'
            : chartType === 'pie'
              ? 'pie'
              : chartType;

      return {
        field,
        label: String(item?.label || fieldMeta?.label || field),
        chartType: seriesChartType,
        axis: item?.axis === 'right' ? 'right' : 'left',
        aggregation: String(item?.aggregation || 'sum'),
        stackGroup: chartType === 'stacked_bar' ? String(item?.stackGroup || 'default') : undefined,
        format: String(item?.format || fieldMeta?.format || 'number'),
      };
    })
    .filter(Boolean);

  if (normalized.length > 0) return normalized;

  if (chartType === 'combo') {
    return [
      { field: 'revenue', label: 'Revenue', chartType: 'bar', axis: 'left', aggregation: 'sum', format: 'currency' },
      { field: 'grossMarginPct', label: 'Gross Margin %', chartType: 'line', axis: 'right', aggregation: 'average', format: 'percent' },
    ];
  }

  if (chartType === 'stacked_bar') {
    return [
      { field: 'revenue', label: 'Revenue', chartType: 'bar', axis: 'left', aggregation: 'sum', stackGroup: 'pnl', format: 'currency' },
      { field: 'cogsTotal', label: 'COGS', chartType: 'bar', axis: 'left', aggregation: 'sum', stackGroup: 'pnl', format: 'currency' },
      { field: 'expense', label: 'Operating Expense', chartType: 'bar', axis: 'left', aggregation: 'sum', stackGroup: 'pnl', format: 'currency' },
    ];
  }

  if (chartType === 'grouped_bar') {
    return [
      { field: 'revenue', label: 'Revenue', chartType: 'bar', axis: 'left', aggregation: 'sum', format: 'currency' },
      { field: 'cogsTotal', label: 'COGS', chartType: 'bar', axis: 'left', aggregation: 'sum', format: 'currency' },
      { field: 'expense', label: 'Operating Expense', chartType: 'bar', axis: 'left', aggregation: 'sum', format: 'currency' },
    ];
  }

  if (chartType === 'multi_line') {
    return [
      { field: 'revenue', label: 'Revenue', chartType: 'line', axis: 'left', aggregation: 'sum', format: 'currency' },
      { field: 'grossProfit', label: 'Gross Profit', chartType: 'line', axis: 'left', aggregation: 'sum', format: 'currency' },
    ];
  }

  return [
    {
      field: chartType === 'pie' ? 'expense' : 'revenue',
      label: chartType === 'pie' ? 'Operating Expense' : 'Revenue',
      chartType,
      axis: 'left',
      aggregation: 'sum',
      format: 'currency',
    },
  ];
}

function normalizeDatasetConfig(rawConfig: any, prompt: string, chartType: ReportChartType) {
  const explicitDataset = getReportDataset(rawConfig?.dataset || rawConfig?.dataSet || rawConfig?.datasetId);
  const inferredDataset = inferDatasetFromPrompt(prompt);
  const dataset = explicitDataset || inferredDataset;
  if (!dataset) return null;

  const promptColumns = inferColumnsFromPrompt(dataset, prompt);
  const rawColumns = Array.isArray(rawConfig?.columns) ? rawConfig.columns : [];
  const columns = normalizeDatasetColumns(dataset, rawColumns.length > 0 ? rawColumns : promptColumns.map((column) => column.key));
  const inferredFilters = inferDatasetFiltersFromPrompt(dataset, prompt);
  const filters = mergeFilters(inferredFilters, Array.isArray(rawConfig?.filters) ? rawConfig.filters : []);
  const dateRange = inferDatasetDateRangeFromPrompt(dataset, prompt) || rawConfig?.dateRange || null;

  return {
    dataset: dataset.id,
    columns: columns.map((column) => ({
      key: column.key,
      label: column.label,
      type: column.type,
      format: column.type === 'currency' ? 'currency' : column.type === 'percent' ? 'percent' : column.type === 'number' ? 'number' : undefined,
    })),
    filters,
    dateRange,
    sort: normalizeDatasetSort(dataset, rawConfig?.sort),
    limit: normalizeDatasetLimit(dataset, rawConfig?.limit),
  };
}

function datasetColumnFormat(column: { type?: string; key?: string }) {
  if (['unitPrice', 'unitCost', 'avgCost'].includes(String(column.key || ''))) return 'unitCurrency';
  if (column.type === 'currency') return 'currency';
  if (column.type === 'percent') return 'percent';
  if (column.type === 'number') return 'number';
  return undefined;
}

function buildDatasetReportConfig(prompt: string, requestedType: ReportChartType, rawConfig: any = {}) {
  const chartType = normalizeChartType(rawConfig?.chartType, requestedType);
  const datasetConfig = normalizeDatasetConfig(rawConfig, prompt, chartType);
  if (!datasetConfig) return null;
  const dataset = getReportDataset(datasetConfig.dataset) as ReportDataset;
  const entityName = extractEntityNameFromPrompt(prompt);
  const dimension = normalizeDimensionColumnKey(
    dataset,
    prompt,
    rawConfig?.dimension || rawConfig?.groupBy || rawConfig?.categoryField
  );
  const topLimit = inferTopLimit(prompt);
  const exactDateRange = inferExactDateRangeFromPrompt(dataset, prompt);
  const metricColumns = datasetConfig.columns.filter((column: any) => (
    column.type === 'number' || column.type === 'currency' || column.type === 'percent'
  ));
  const chartSeries = metricColumns.length > 0
    ? metricColumns
    : dataset.defaultColumns
        .map((key) => dataset.columns.find((column) => column.key === key))
        .filter((column: any) => column?.type === 'number' || column?.type === 'currency' || column?.type === 'percent')
        .slice(0, 2);
  const isDimensionReport = Boolean(dimension) && (
    chartType === 'pie' ||
    /\b(top|by|mix|ranking|rank|distribution|share|slice|slices)\b/i.test(prompt)
  );
  const primaryMetric = chartSeries[0] as any;
  const normalizedChartType = chartType === 'table' || (!dataset.dateField && !isDimensionReport) ? 'table' : chartType;
  return {
    title: String(rawConfig?.title || (entityName ? `${entityName} ${dataset.label}` : dataset.label)).slice(0, 120),
    description: String(rawConfig?.description || `${dataset.description} Filtered and bounded by the report request.`).slice(0, 500),
    chartType: normalizedChartType as ReportChartType,
    dataSource: 'operational',
    timeGrain: String(rawConfig?.timeGrain || (isDimensionReport ? 'category' : normalizedChartType === 'table' ? 'detail' : 'month')),
    xAxis: {
      field: isDimensionReport ? dimension : dataset.dateField || 'snapshotDate',
      label: isDimensionReport
        ? dataset.columns.find((column) => column.key === dimension)?.label || 'Category'
        : normalizedChartType === 'table' ? 'Date' : 'Month',
    },
    yAxes: {
      left: 'Value',
      right: 'Percent',
    },
    series: normalizedChartType === 'table' && !isDimensionReport
      ? []
      : chartSeries.map((column: any, index: number) => ({
          field: column.key,
          label: column.label || column.key,
          chartType: normalizedChartType === 'combo' ? (index === 0 ? 'bar' : 'line') : normalizedChartType,
          axis: column.type === 'percent' ? 'right' : 'left',
          aggregation: column.type === 'percent' ? 'average' : 'sum',
          format: datasetColumnFormat(column),
        })),
    filters: datasetConfig.filters,
    dateRange: exactDateRange || datasetConfig.dateRange,
    dataset: datasetConfig.dataset,
    dimension: isDimensionReport ? dimension : undefined,
    columns: datasetConfig.columns,
    sort: isDimensionReport && primaryMetric?.key
      ? [{ field: String(primaryMetric.key), direction: 'desc' as const }]
      : datasetConfig.sort,
    limit: topLimit || (isDimensionReport ? Math.min(datasetConfig.limit || 10, 10) : datasetConfig.limit),
    notes: [],
  };
}

function titleFromPrompt(prompt: string, fallback: string): string {
  const cleaned = String(prompt || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 90);
  if (!cleaned) return fallback;
  const titled = cleaned.replace(/\b[a-z]/g, (match) => match.toUpperCase());
  return titled.toLowerCase().includes('trend') ? titled : `${titled} Trend`;
}

function inferDataSource(series: ReturnType<typeof normalizeSeries>, rawDataSource: unknown): string {
  const sourceTypes = new Set<string>();
  series.forEach((item: any) => {
    const field = String(item?.field || '');
    sourceTypes.add(field.startsWith('op.') ? 'operational' : 'monthlyFinancial');
  });

  if (sourceTypes.has('operational') && sourceTypes.has('monthlyFinancial')) return 'mixed';
  if (sourceTypes.has('operational')) return 'operational';
  return String(rawDataSource || 'monthlyFinancial');
}

function normalizePromptText(value: string): string {
  return String(value || '')
    .replace(/[–—]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type ReportScope = {
  entityType: 'total_company' | 'customer' | 'project' | 'product' | 'product_category' | 'vendor' | 'location' | 'division' | 'account' | 'unknown';
  entityName: string | null;
};

function inferCostTypeFilter(prompt: string): { field: string; operator: string; value: string } | null {
  const lower = normalizePromptText(prompt).toLowerCase();
  if (/\blabor\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Labor' };
  if (/\bmaterials?\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Materials' };
  if (/\bsubcontract(or|ors|ing)?\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Subcontract' };
  if (/\bequipment\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Equipment' };
  return null;
}

function inferReportScope(prompt: string): ReportScope {
  const lower = normalizePromptText(prompt).toLowerCase();
  if (/\b(total company|company wide|entire company|overall|all company)\b/.test(lower)) {
    return { entityType: 'total_company', entityName: null };
  }
  const cleaned = normalizePromptText(prompt)
    .replace(/\b(line|bar|stacked|grouped|combo|pie|table|chart|graph|report|trend|monthly|daily|date|period|by|category|categories|and|vs|versus)\b/gi, ' ')
    .replace(/\b(revenue|sales|cogs|cost of goods sold|gross profit|gross margin|margin|ebitda|net income|cash|accounts receivable|accounts payable|ar|ap|inventory|expense|expenses)\b/gi, ' ')
    .replace(/\b(actual|budget|committed|commitment|variance|costs?|labor|materials?|subcontractors?|subcontracting|equipment|other)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const genericOnly = /^(job|project|jobs|projects|customer|customers|client|clients|product|products|category|categories|vendor|vendors|supplier|suppliers|location|locations|division|divisions|control|portfolio|forecast|billing|cash)$/i.test(cleaned);
  if (!cleaned || genericOnly || cleaned.length < 4) {
    return { entityType: 'total_company', entityName: null };
  }

  if (/\b(customer|client)\b/.test(lower)) return { entityType: 'customer', entityName: cleaned };
  if (/\b(product category|category)\b/.test(lower) && !/\bcost categor/.test(lower)) return { entityType: 'product_category', entityName: cleaned };
  if (/\b(product|item|sku)\b/.test(lower)) return { entityType: 'product', entityName: cleaned };
  if (/\b(vendor|supplier)\b/.test(lower)) return { entityType: 'vendor', entityName: cleaned };
  if (/\b(location|site|branch)\b/.test(lower)) return { entityType: 'location', entityName: cleaned };
  if (/\b(division|department)\b/.test(lower)) return { entityType: 'division', entityName: cleaned };
  if (/\b(project|job|cost)\b/.test(lower)) return { entityType: 'project', entityName: cleaned };
  return { entityType: 'unknown', entityName: cleaned };
}

function scopeToFilter(scope: ReportScope): { field: string; operator: string; value: string; entityType: string } | null {
  if (!scope.entityName || scope.entityType === 'total_company' || scope.entityType === 'unknown') return null;
  const fieldByEntity: Record<string, string> = {
    customer: 'customerName',
    project: 'jobName',
    product: 'productName',
    product_category: 'productCategory',
    vendor: 'vendorName',
    location: 'locationName',
    division: 'division',
    account: 'accountName',
  };
  const field = fieldByEntity[scope.entityType] || 'jobName';
  return { field, operator: 'contains', value: scope.entityName, entityType: scope.entityType };
}

function mergeFilters(existingFilters: any[], inferredFilters: any[]) {
  const merged = [...existingFilters];
  inferredFilters.forEach((filter) => {
    const exists = merged.some((item) => (
      String(item?.field || '').toLowerCase() === filter.field.toLowerCase() &&
      String(item?.value || '').toLowerCase() === filter.value.toLowerCase()
    ));
    if (!exists) merged.push(filter);
  });
  return merged.slice(0, 8);
}

function wantsDatedTransactionDetail(prompt: string): boolean {
  const lower = normalizePromptText(prompt).toLowerCase();
  return /\b(dates?|daily|days?|transactions?|detail|line items?)\b/.test(lower);
}

function enhanceConfigFromPrompt(config: ReturnType<typeof validateReportConfig>, prompt: string, fieldCatalog: ReportFieldCatalogItem[]) {
  const lowerPrompt = normalizePromptText(prompt).toLowerCase();
  const hasField = (field: string) => fieldCatalog.some((item) => item.field === field);
  const wantsDatedJobCost = (
    (wantsDatedTransactionDetail(prompt) || /\b(trend|line|bar|chart|graph)\b/.test(lowerPrompt)) &&
    /\b(cost|labor|materials?|subcontract(or|ors|ing)?|equipment)\b/.test(lowerPrompt) &&
    hasField('op.job-cost-control.dailyCost')
  );

  const inferredCostType = inferCostTypeFilter(prompt);
  const datedJobCostSeries = {
    field: 'op.job-cost-control.dailyCost',
    label: inferredCostType?.value ? `${inferredCostType.value} Cost` : 'Daily Job Cost',
    chartType: config.chartType === 'table' ? 'table' : config.chartType === 'combo' ? 'bar' : config.chartType,
    axis: 'left',
    aggregation: 'sum',
    format: 'currency',
  };
  const hasOperationalJobCostSeries = config.series.some((item: any) => String(item?.field || '').startsWith('op.job-cost-control.'));
  const series = wantsDatedJobCost
    ? hasOperationalJobCostSeries
      ? config.series.map((item: any) => (
          String(item?.field || '').startsWith('op.job-cost-control.')
            ? { ...item, ...datedJobCostSeries, chartType: item.chartType || datedJobCostSeries.chartType }
            : item
        ))
      : [datedJobCostSeries]
    : config.series;

  const scope = inferReportScope(prompt);
  const inferredFilters = [scopeToFilter(scope), inferredCostType].filter(Boolean);
  const filters = mergeFilters(config.filters || [], inferredFilters);

  return {
    ...config,
    scope,
    description: wantsDatedJobCost
      ? `${inferredCostType?.value || 'Job'} cost by date for the requested project or job.`
      : config.description,
    dataSource: inferDataSource(series, config.dataSource),
    timeGrain: wantsDatedJobCost ? 'day' : config.timeGrain,
    xAxis: wantsDatedJobCost ? { field: 'date', label: 'Date' } : config.xAxis,
    series,
    filters,
  };
}

function validateReportConfig(rawConfig: any, requestedType: ReportChartType, fieldCatalog: ReportFieldCatalogItem[], prompt = '') {
  const chartType = normalizeChartType(rawConfig?.chartType, requestedType);
  const datasetConfig = normalizeDatasetConfig(rawConfig, prompt, chartType);
  const series = datasetConfig ? [] : normalizeSeries(rawConfig, chartType, fieldCatalog);
  return {
    title: String(rawConfig?.title || 'Custom Report').slice(0, 120),
    description: String(rawConfig?.description || 'AI-generated custom report configuration.').slice(0, 500),
    chartType,
    dataSource: datasetConfig ? 'operational' : inferDataSource(series, rawConfig?.dataSource),
    timeGrain: String(rawConfig?.timeGrain || 'month'),
    xAxis: {
      field: 'monthDate',
      label: String(rawConfig?.xAxis?.label || 'Month'),
    },
    yAxes: {
      left: String(rawConfig?.yAxes?.left || 'Dollars'),
      right: String(rawConfig?.yAxes?.right || 'Percent'),
    },
    series,
    filters: datasetConfig?.filters || (Array.isArray(rawConfig?.filters) ? rawConfig.filters.slice(0, 8) : []),
    ...(datasetConfig || {}),
    notes: Array.isArray(rawConfig?.notes) ? rawConfig.notes.slice(0, 6).map((note: any) => String(note)) : [],
  };
}

function isAiAuthOrConfigError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  const status = Number(error?.status || error?.code || 0);
  return (
    status === 401 ||
    message.includes('authentication failed') ||
    message.includes('api key') ||
    message.includes('no ai provider key configured') ||
    message.includes('unauthorized')
  );
}

function buildDevFallbackConfig(prompt: string, requestedType: ReportChartType, fieldCatalog: ReportFieldCatalogItem[]) {
  const lowerPrompt = prompt.toLowerCase();
  const chartType = requestedType;
  const hasField = (field: string) => fieldCatalog.some((item) => item.field === field);

  if (chartType === 'combo') {
    return validateReportConfig({
      title: lowerPrompt.includes('cash') ? 'Cash and Margin Trend' : 'Revenue and Margin Trend',
      description: 'Monthly trend report using financial performance data.',
      chartType,
      series: [
        { field: lowerPrompt.includes('cash') ? 'cash' : 'revenue', label: lowerPrompt.includes('cash') ? 'Cash' : 'Revenue', chartType: 'bar', axis: 'left', format: 'currency' },
        { field: 'grossMarginPct', label: 'Gross Margin %', chartType: 'line', axis: 'right', aggregation: 'average', format: 'percent' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  if (chartType === 'multi_line') {
    return validateReportConfig({
      title: lowerPrompt.includes('cash') ? 'Cash and Revenue Trends' : 'Revenue and Gross Profit Trends',
      description: 'Monthly comparison of multiple financial trends.',
      chartType,
      series: [
        { field: 'revenue', label: 'Revenue', chartType: 'line', axis: 'left', format: 'currency' },
        { field: lowerPrompt.includes('cash') ? 'cash' : 'grossProfit', label: lowerPrompt.includes('cash') ? 'Cash' : 'Gross Profit', chartType: 'line', axis: 'left', format: 'currency' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  if (chartType === 'grouped_bar') {
    return validateReportConfig({
      title: 'Revenue, COGS, and Operating Expense',
      description: 'Monthly side-by-side comparison of revenue, COGS, and operating expenses.',
      chartType,
      series: [
        { field: 'revenue', label: 'Revenue', chartType: 'bar', axis: 'left', format: 'currency' },
        { field: 'cogsTotal', label: 'COGS', chartType: 'bar', axis: 'left', format: 'currency' },
        { field: 'expense', label: 'Operating Expense', chartType: 'bar', axis: 'left', format: 'currency' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  if (chartType === 'stacked_bar') {
    return validateReportConfig({
      title: 'Revenue, COGS, and Operating Expense',
      description: 'Monthly comparison of revenue, COGS, and operating expenses.',
      chartType,
      series: [
        { field: 'revenue', label: 'Revenue', chartType: 'bar', axis: 'left', stackGroup: 'pnl', format: 'currency' },
        { field: 'cogsTotal', label: 'COGS', chartType: 'bar', axis: 'left', stackGroup: 'pnl', format: 'currency' },
        { field: 'expense', label: 'Operating Expense', chartType: 'bar', axis: 'left', stackGroup: 'pnl', format: 'currency' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  if (chartType === 'table') {
    return validateReportConfig({
      title: 'Monthly Financial Summary',
      description: 'Monthly summary of selected financial metrics.',
      chartType,
      series: [
        { field: 'revenue', label: 'Revenue', format: 'currency' },
        { field: 'grossProfit', label: 'Gross Profit', format: 'currency' },
        { field: 'expense', label: 'Operating Expense', format: 'currency' },
        { field: 'cash', label: 'Cash', format: 'currency' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  if (chartType === 'pie') {
    return validateReportConfig({
      title: 'Current Financial Mix',
      description: 'Latest monthly mix of selected financial metrics.',
      chartType,
      series: [
        { field: 'cash', label: 'Cash', format: 'currency' },
        { field: 'ar', label: 'Accounts Receivable', format: 'currency' },
        { field: 'inventory', label: 'Inventory', format: 'currency' },
      ],
      notes: ['Local development fallback used because AI credentials are not configured.'],
    }, chartType, fieldCatalog);
  }

  const operationalCostField =
    (lowerPrompt.includes('job') || lowerPrompt.includes('project') || lowerPrompt.includes('cost') || lowerPrompt.includes('subcontract')) &&
    hasField('op.job-cost-control.dailyCost')
      ? 'op.job-cost-control.dailyCost'
      : null;
  const defaultField = operationalCostField || (lowerPrompt.includes('cash')
    ? 'cash'
    : lowerPrompt.includes('expense')
      ? 'expense'
      : lowerPrompt.includes('profit') || lowerPrompt.includes('margin')
        ? 'grossProfit'
        : 'revenue');
  const fieldMeta = fieldCatalog.find((field) => field.field === defaultField);

  return validateReportConfig({
    title: titleFromPrompt(prompt, `${fieldMeta?.label || 'Financial'} Trend`),
    description: `Monthly trend for ${prompt || fieldMeta?.label || 'the selected metric'}.`,
    chartType,
    series: [
      {
        field: defaultField,
        label: fieldMeta?.label || defaultField,
        chartType,
        axis: 'left',
        format: fieldMeta?.format || 'currency',
      },
    ],
    filters: lowerPrompt.includes('subcontract') ? [{ field: 'costType', operator: 'contains', value: 'subcontract' }] : [],
    notes: ['Local development fallback used because AI credentials are not configured.'],
  }, chartType, fieldCatalog);
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const requestedType = normalizeChartType(body?.reportType, 'line');

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: 'Describe the report you want to create.' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CustomReports', companyId, 'GENERATE_CONFIG');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        industrySector: true,
        industrySectorCategory: true,
        userDefinedAllocations: true,
      },
    });

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    const customReports = (company.userDefinedAllocations as any)?.customReports || {};
    if (customReports.enabledByAdmin !== true) {
      return NextResponse.json({ error: 'Custom Reports are disabled for this company.' }, { status: 403 });
    }
    const sectorCategory = resolveCompanyIndustrySectorCategory(company);
    const fieldCatalog = getReportDataCatalog(sectorCategory);
    const datasetCatalog = getReportDatasetCatalog();

    const recentRows = await prisma.monthlyFinancial.findMany({
      where: { companyId },
      orderBy: { monthDate: 'desc' },
      take: 12,
      select: {
        monthDate: true,
        revenue: true,
        cogsTotal: true,
        expense: true,
        cash: true,
        ar: true,
        ap: true,
        inventory: true,
        loc: true,
        totalAssets: true,
        totalLiab: true,
        totalEquity: true,
        nonOperatingIncome: true,
        nonOperatingExpense: true,
      },
    });

    const model = process.env.OPENAI_MODEL_CUSTOM_REPORTS || process.env.OPENAI_MODEL_ASK || process.env.OPENAI_MODEL || 'gpt-4o';
    let reportConfig: ReturnType<typeof validateReportConfig>;
    let generatedBy: Record<string, unknown>;

    try {
      const aiResult = await createModelText({
        openai: getOpenAiClient(),
        model,
        temperature: 0.1,
        maxTokens: 1200,
        messages: [
          {
            role: 'system',
            content: [
              'You are a senior financial reporting product analyst.',
              'Return only JSON for a validated custom report configuration.',
              'Do not invent database tables or fields. Use only fields from the provided field catalog.',
              'Always identify the report universe/entity first, before choosing metrics.',
              'The report universe can be total_company, customer, project, product, product_category, vendor, location, division, or account.',
              'If the user names a specific entity such as a project, customer, product, vendor, or location, include it in scope and as a filter before applying metrics.',
              'Operational fields are prefixed with op.<module>.<metric>; use them when the user asks for sector, project, customer, product, inventory, cash, AR, AP, or other operational reporting.',
              'For detail/table requests, prefer a reportDataset over metric series. Pick the best dataset from the provided reportDatasetCatalog and return dataset, columns, filters, sort, and limit.',
              'For category, Top-N, ranking, distribution, product mix, customer mix, vendor mix, and pie chart requests, include a reportDataset plus dimension or groupBy using an allowlisted dataset column.',
              'Users do not know database or snapshot table names. Infer datasets from business language such as orders, invoices, payments, inventory, products, vendors, cash, AR, AP, and financials.',
              'Never return SQL. Only return dataset ids, column keys, filters, sort fields, and metric series from the provided catalogs.',
              'When a prompt names an operational slice such as job, project, customer, product, vendor, cost type, or location, express it as a filter instead of inventing a field.',
              'Supported chartType values: line, multi_line, bar, grouped_bar, stacked_bar, combo, table, pie.',
              'For combo charts, each series can use chartType line or bar and can use left/right axis.',
              'For stacked_bar charts, use multiple bar series with the same stackGroup.',
              'If the user asks for dates, transactions, transaction detail, daily detail, or line items for job/project costs, use op.job-cost-control.dailyCost with timeGrain day and xAxis field date.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              company: {
                name: company.name,
                industrySectorCategory: sectorCategory,
              },
              requestedChartType: requestedType,
              userPrompt: prompt,
              fieldCatalog,
              reportDatasetCatalog: datasetCatalog,
              recentMonthlyRowsSample: recentRows.slice().reverse(),
              requiredJsonShape: {
                title: 'short report title',
                description: 'one sentence explaining the report',
                scope: {
                  entityType: 'total_company | customer | project | product | product_category | vendor | location | division | account',
                  entityName: 'specific named entity or null for total_company',
                },
                chartType: 'line | multi_line | bar | grouped_bar | stacked_bar | combo | table | pie',
                dataSource: 'monthlyFinancial | operational',
                timeGrain: 'month | day',
                xAxis: { field: 'monthDate | date', label: 'Month | Date' },
                yAxes: { left: 'Dollars', right: 'Percent' },
                series: [
                  {
                    field: 'revenue',
                    label: 'Revenue',
                    chartType: 'bar',
                    axis: 'left',
                    aggregation: 'sum',
                    stackGroup: 'optional for stacked_bar',
                    format: 'currency | percent | number',
                  },
                ],
                dataset: 'optional reportDatasetCatalog id for detail/table and category reports',
                dimension: 'optional dataset column key for category/pie/top-N reports such as itemName, customerName, vendorName, category',
                columns: [
                  {
                    key: 'optional allowlisted dataset column key',
                    label: 'optional display label',
                  },
                ],
                filters: [],
                sort: [{ field: 'optional allowlisted dataset column key', direction: 'asc | desc' }],
                limit: 250,
                notes: ['short implementation or interpretation notes'],
              },
            }),
          },
        ],
      });

      const parsed = safeJsonParse(aiResult.text);
      reportConfig = buildDatasetReportConfig(prompt, requestedType, parsed) || validateReportConfig(parsed, requestedType, fieldCatalog, prompt);
      generatedBy = {
        model,
        api: aiResult.api,
      };
    } catch (aiError: any) {
      reportConfig = buildDatasetReportConfig(prompt, requestedType, {}) || buildDevFallbackConfig(prompt, requestedType, fieldCatalog);
      generatedBy = {
        model: 'deterministic-fallback',
        api: 'fallback',
        reason: `AI generation failed: ${aiError instanceof Error ? aiError.message : 'unknown error'}`,
      };
    }
    reportConfig = buildDatasetReportConfig(prompt, requestedType, reportConfig) || enhanceConfigFromPrompt(reportConfig, prompt, fieldCatalog);

    return NextResponse.json({
      reportConfig,
      fieldCatalog,
      sourceRowCount: recentRows.length,
      generatedBy,
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to generate report config');
    const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
    console.error('Custom Reports generate-config error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
