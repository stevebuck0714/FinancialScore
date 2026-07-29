import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getReportDataCatalog, type ReportFieldCatalogItem } from '@/lib/custom-reports/report-data-catalog';
import {
  getDatasetColumn,
  getReportDataset,
  inferDatasetDateRangeFromPrompt,
  normalizeDatasetColumns,
  normalizeDatasetLimit,
  normalizeDatasetSort,
  type ReportDataset,
  type ReportDatasetColumn,
  type ReportDatasetDateRangeConfig,
  type ReportDatasetFilterConfig,
} from '@/lib/custom-reports/report-datasets';
import { buildOperationalMockResponse } from '@/lib/operations/sector-mock-data';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';
import { loadMonthlyFromDfs } from '@/lib/performance-analytics/monthly-from-dfs';
import {
  buildBillingCashMock,
  buildCommitmentsForecastMock,
  buildConstructionApMock,
  buildConstructionArMock,
  buildHiltiInventoryMock,
  buildJobCostControlMock,
  buildProjectPortfolioMock,
} from '@/lib/operations/construction-mock-data';
import { getBambooHrHiringPayload } from '@/lib/operations/bamboohr-workforce-reports';
import { ensurePlatosClosetMonthlyFacts } from '@/lib/operational/platos-closet-monthly-facts';

const PLATOS_CLOSET_SOURCE_CODE = 'PLATOS_CLOSET_STORE_VISIT';

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(value: Date): string {
  const month = value.getUTCMonth() + 1;
  const year = String(value.getUTCFullYear()).slice(-2);
  return `${month}/${year}`;
}

function dayLabel(value: Date): string {
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  const year = String(value.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function getRequestedFields(config: any, fieldCatalog: ReportFieldCatalogItem[]): string[] {
  const allowedFields = new Set(fieldCatalog.map((item) => item.field));
  const series = Array.isArray(config?.series) ? config.series : [];
  const fields: string[] = series
    .map((item: any) => String(item?.field || '').trim())
    .filter((field: string) => allowedFields.has(field));
  return [...new Set(fields)];
}

function monthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

function buildValues(row: any) {
  const revenue = toNumber(row.revenue);
  const cogsTotal = toNumber(row.cogsTotal);
  const expense = toNumber(row.expense);
  const nonOperatingIncome = toNumber(row.nonOperatingIncome);
  const nonOperatingExpense = toNumber(row.nonOperatingExpense);
  const grossProfit = revenue - cogsTotal;
  const netIncome = revenue - cogsTotal - expense + nonOperatingIncome - nonOperatingExpense;

  return {
    revenue,
    cogsTotal,
    grossProfit,
    grossMarginPct: revenue ? grossProfit / revenue : 0,
    expense,
    // Simplified report-builder EBITDA proxy until a dedicated saved-report metric layer is added.
    ebitda: revenue - cogsTotal - expense,
    netIncome,
    cash: toNumber(row.cash),
    ar: toNumber(row.ar),
    ap: toNumber(row.ap),
    inventory: toNumber(row.inventory),
    loc: toNumber(row.loc),
    totalAssets: toNumber(row.totalAssets),
    totalLiab: toNumber(row.totalLiab),
    totalEquity: toNumber(row.totalEquity),
    nonOperatingIncome,
    nonOperatingExpense,
  };
}

function getOperationalPayload(companyId: string, sectorCategory: string | null, dataType: string) {
  if (dataType === 'job-cost-control') return buildJobCostControlMock(companyId);
  if (dataType === 'project-portfolio') return buildProjectPortfolioMock(companyId);
  if (dataType === 'commitments-forecast') return buildCommitmentsForecastMock(companyId);
  if (dataType === 'billing-cash') return buildBillingCashMock(companyId);
  if (dataType === 'construction-ar') return buildConstructionArMock(companyId);
  if (dataType === 'construction-ap') return buildConstructionApMock(companyId);
  if (dataType === 'hilti-inventory') return buildHiltiInventoryMock(companyId);
  if (dataType === 'hiring') {
    throw new Error('Hiring custom report preview requires live BambooHR data; mock fallback is disabled.');
  }

  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const normalizedType = dataType === 'customers-sites' ? 'customers' : dataType;
  return buildOperationalMockResponse({
    companyId,
    type: normalizedType as any,
    sectorCategory,
    startDate,
    endDate: now,
    frequency: 'monthly',
    limit: 2000,
  });
}

function getRecordDate(row: any): string {
  return row?.monthDate || row?.snapshotDate || row?.date || row?.asOfDate || new Date().toISOString();
}

function getRecordKey(row: any): string {
  return [
    row?.jobName || row?.projectName || row?.title || row?.jobTitle || row?.customerName || row?.vendorName || row?.itemName || row?.accountName || row?.jobId || row?.id || '',
    row?.costType || row?.subType || row?.vendorType || row?.status || '',
    row?.date || row?.snapshotDate || row?.monthDate || '',
  ].join('|');
}

function enrichOperationalRecord(record: any, payload: any): any {
  const jobId = String(record?.jobId || '').trim();
  if (!jobId || record?.jobName) return record;
  const job = Array.isArray(payload?.jobs) ? payload.jobs.find((item: any) => String(item?.jobId || '') === jobId) : null;
  if (!job) return record;
  return {
    ...record,
    jobName: job.jobName,
    projectName: job.jobName,
    customerName: record.customerName || job.customerName,
    pmName: record.pmName || job.pmName,
    division: record.division || job.division,
  };
}

function normalizeFilterText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function filterTerms(value: unknown): string[] {
  const normalized = normalizeFilterText(value);
  const terms = [normalized];
  if (/\bsubcontract(or|ors|ing)?\b/.test(normalized)) {
    terms.push('subcontract', 'subcontractor', 'subcontractors');
  }
  if (/\bproject\b/.test(normalized)) terms.push(normalized.replace(/\bproject\b/g, 'job'));
  if (/\bjob\b/.test(normalized)) terms.push(normalized.replace(/\bjob\b/g, 'project'));
  return Array.from(new Set(terms.filter(Boolean)));
}

function inferCostTypeFilterFromText(value: string): { field: string; operator: string; value: string } | null {
  const normalized = normalizeFilterText(value);
  if (/\blabor\b/.test(normalized)) return { field: 'costType', operator: 'contains', value: 'Labor' };
  if (/\bmaterials?\b/.test(normalized)) return { field: 'costType', operator: 'contains', value: 'Materials' };
  if (/\bsubcontract(or|ors|ing)?\b/.test(normalized)) return { field: 'costType', operator: 'contains', value: 'Subcontract' };
  if (/\bequipment\b/.test(normalized)) return { field: 'costType', operator: 'contains', value: 'Equipment' };
  return null;
}

function inferJobFilterFromText(value: string): { field: string; operator: string; value: string } | null {
  const normalizedValue = normalizeFilterText(value);
  if (/\b(total company|company wide|entire company|overall|all company)\b/.test(normalizedValue)) return null;
  if (/\bby (customer|client|project|job|product|product category|category|vendor|supplier|location|site|branch|division|department)\b/.test(normalizedValue)) return null;
  const cleaned = String(value || '')
    .split(/\bby\b/i)[0]
    .replace(/[–—]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b(line|bar|stacked|grouped|combo|pie|table|chart|graph|report|trend|monthly|daily|date|period|type|source|operational|and|vs|versus)\b/gi, ' ')
    .replace(/\b(revenue|sales|cogs|cost of goods sold|gross profit|gross margin|margin|ebitda|net income|cash|accounts receivable|accounts payable|ar|ap|inventory|expense|expenses)\b/gi, ' ')
    .replace(/\b(actual|budget|committed|commitment|variance|costs?|labor|materials?|subcontractors?|subcontracting|equipment|other|for)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const genericOnly = /^(job|project|jobs|projects|control|portfolio|forecast|billing|cash)$/i.test(cleaned);
  if (!cleaned || genericOnly || cleaned.length < 4) return null;
  return { field: 'jobName', operator: 'contains', value: cleaned };
}

function wantsDatedTransactionDetail(value: string): boolean {
  const normalized = normalizeFilterText(value);
  return /\b(dates?|daily|days?|transactions?|detail|line items?)\b/.test(normalized);
}

function mergeInferredFilters(existingFilters: any[], inferredFilters: any[]) {
  const merged = [...existingFilters];
  inferredFilters.filter(Boolean).forEach((filter) => {
    const exists = merged.some((item) => (
      String(item?.field || '').toLowerCase() === filter.field.toLowerCase() &&
      String(item?.value || '').toLowerCase() === filter.value.toLowerCase()
    ));
    if (!exists) merged.push(filter);
  });
  return merged.slice(0, 8);
}

function scopeFilterField(entityType: string): string {
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
  return fieldByEntity[entityType] || 'jobName';
}

function entityCandidatesForPayload(payload: any, field: ReportFieldCatalogItem): Array<{ field: string; value: string; type: string }> {
  const candidates: Array<{ field: string; value: string; type: string }> = [];
  const addCandidate = (filterField: string, value: unknown, type: string) => {
    const normalized = normalizeFilterText(value);
    if (!normalized || normalized.length < 4) return;
    candidates.push({ field: filterField, value: String(value || '').trim(), type });
  };

  const records = recordsForField(payload, field);
  records.forEach((record: any) => {
    addCandidate('jobName', record.jobName || record.projectName, 'project');
    addCandidate('projectName', record.projectName || record.jobName, 'project');
    addCandidate('customerName', record.customerName || record.customer, 'customer');
    addCandidate('vendorName', record.vendorName || record.vendor, 'vendor');
    addCandidate('itemName', record.itemName || record.productName, 'product');
    addCandidate('productName', record.productName || record.itemName, 'product');
    addCandidate('accountName', record.accountName, 'account');
    addCandidate('division', record.division, 'division');
    addCandidate('locationName', record.locationName || record.location, 'location');
  });

  if (Array.isArray(payload?.jobs)) {
    payload.jobs.forEach((job: any) => {
      addCandidate('jobName', job.jobName || job.projectName, 'project');
      addCandidate('projectName', job.projectName || job.jobName, 'project');
      addCandidate('customerName', job.customerName || job.customer, 'customer');
      addCandidate('division', job.division, 'division');
    });
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = `${candidate.field}|${normalizeFilterText(candidate.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => normalizeFilterText(b.value).length - normalizeFilterText(a.value).length);
}

function inferEntityFiltersFromPayload(context: string, payload: any, field: ReportFieldCatalogItem) {
  const normalizedContext = normalizeFilterText(context);
  if (!normalizedContext || /\b(total company|company wide|entire company|all company|overall)\b/.test(normalizedContext)) {
    return [];
  }

  const matched = entityCandidatesForPayload(payload, field).find((candidate) => {
    const normalizedValue = normalizeFilterText(candidate.value);
    return normalizedContext.includes(normalizedValue);
  });
  if (!matched) return [];

  return [{
    field: matched.field,
    operator: 'contains',
    value: matched.value,
    entityType: matched.type,
  }];
}

function enhancePreviewConfig(config: any, fieldCatalog: ReportFieldCatalogItem[]) {
  const context = [
    config?.sourcePrompt,
    config?.aiReportRequest,
    config?.prompt,
    config?.scope?.entityName,
    config?.title,
    config?.description,
    ...(Array.isArray(config?.notes) ? config.notes : []),
  ].map((item) => String(item || '')).join(' ');
  const normalizedContext = normalizeFilterText(context);
  const hasField = (field: string) => fieldCatalog.some((item) => item.field === field);
  const fields = getRequestedFields(config, fieldCatalog);
  const hasJobCostField = fields.some((field) => field.startsWith('op.job-cost-control.'));
  const alreadyDailyJobCost = fields.includes('op.job-cost-control.dailyCost');
  const wantsDatedJobCost = (
    hasJobCostField &&
    hasField('op.job-cost-control.dailyCost') &&
    (
      alreadyDailyJobCost ||
      wantsDatedTransactionDetail(context) ||
      /\b(trend|line|bar|chart|graph)\b/.test(normalizedContext)
    ) &&
    /\b(cost|labor|materials?|subcontract(or|ors|ing)?|equipment)\b/.test(normalizedContext)
  );
  const inferredCostType = inferCostTypeFilterFromText(context);
  const series = wantsDatedJobCost
    ? (Array.isArray(config?.series) ? config.series : []).map((item: any) => (
        String(item?.field || '').startsWith('op.job-cost-control.')
          ? {
              ...item,
              field: 'op.job-cost-control.dailyCost',
              label: inferredCostType?.value ? `${inferredCostType.value} Cost` : item?.label || 'Daily Job Cost',
              format: 'currency',
            }
          : item
      ))
    : config?.series;

  const dataset = getReportDataset(config?.dataset || config?.datasetId);
  const inferredDateRange = !config?.dateRange && dataset
    ? inferDatasetDateRangeFromPrompt(dataset, context)
    : null;

  return {
    ...config,
    series,
    dateRange: config?.dateRange || inferredDateRange || undefined,
    filters: mergeInferredFilters(
      Array.isArray(config?.filters) ? config.filters : [],
      [
        config?.scope?.entityName && config?.scope?.entityType && config.scope.entityType !== 'total_company'
          ? { field: scopeFilterField(String(config.scope.entityType)), operator: 'contains', value: String(config.scope.entityName), entityType: String(config.scope.entityType) }
          : null,
        inferJobFilterFromText(context),
        inferredCostType,
      ]
    ),
    timeGrain: wantsDatedJobCost ? 'day' : config?.timeGrain,
  };
}

function passesFilters(row: any, filters: any[], fieldMeta: ReportFieldCatalogItem): boolean {
  return filters.every((filter) => {
    const terms = filterTerms(filter?.value);
    if (terms.length === 0) return true;
    const field = String(filter?.field || '').trim();
    const candidateKeys = [
      field,
      fieldMeta.categoryKey,
      'jobName',
      'jobId',
      'projectName',
      'customerName',
      'vendorName',
      'itemName',
      'productName',
      'accountName',
      'costType',
      'subType',
      'vendorType',
    ].filter(Boolean) as string[];
    return candidateKeys.some((key) => {
      const candidate = normalizeFilterText(row?.[key]);
      if (!candidate) return false;
      return terms.some((term) => candidate.includes(term) || term.includes(candidate));
    });
  });
}

function recordsForField(payload: any, field: ReportFieldCatalogItem): any[] {
  const recordSet = field.recordSet || 'records';
  const records = Array.isArray(payload?.[recordSet])
    ? payload[recordSet]
    : Array.isArray(payload?.records)
      ? payload.records
      : [];
  return records.map((record: any) => enrichOperationalRecord(record, payload));
}

function buildOperationalTablePreview(
  companyId: string,
  sectorCategory: string | null,
  fields: string[],
  fieldCatalog: ReportFieldCatalogItem[],
  filters: any[],
  entityContext: string
) {
  const operationalFields = fields
    .map((field) => fieldCatalog.find((item) => item.field === field))
    .filter((field): field is ReportFieldCatalogItem => Boolean(field?.dataType && field?.valueKey));
  if (operationalFields.length === 0) return { columns: [], rows: [] };

  const rowsByKey = new Map<string, Record<string, unknown>>();
  const payloadsByType = new Map<string, any>();

  operationalFields.forEach((field) => {
    const dataType = String(field.dataType || '');
    if (!dataType) return;
    if (!payloadsByType.has(dataType)) {
      payloadsByType.set(dataType, getOperationalPayload(companyId, sectorCategory, dataType));
    }
    const payload = payloadsByType.get(dataType);
    const filtersForField = mergeInferredFilters(
      filters,
      inferEntityFiltersFromPayload(entityContext, payload, field)
    );
    recordsForField(payload, field)
      .filter((record: any) => passesFilters(record, filtersForField, field))
      .forEach((record: any) => {
        const key = `${dataType}|${field.recordSet || 'records'}|${getRecordKey(record)}`;
        const existing = rowsByKey.get(key) || {
          date: record.date || record.snapshotDate || record.monthDate || null,
          jobName: record.jobName || record.projectName || null,
          projectName: record.projectName || record.jobName || null,
          title: record.title || record.jobTitle || null,
          status: record.status || null,
          jobId: record.jobId || null,
          costType: record.costType || null,
          subType: record.subType || null,
          customerName: record.customerName || record.customer || null,
          vendorName: record.vendorName || record.vendor || null,
          itemName: record.itemName || record.productName || null,
          accountName: record.accountName || null,
          values: {},
        };
        (existing.values as Record<string, number>)[field.field] = toNumber(record?.[field.valueKey || '']);
        rowsByKey.set(key, existing);
      });
  });

  const dimensionColumns = [
    { key: 'date', label: 'Date', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'jobName', label: 'Job / Project', type: 'text' },
    { key: 'costType', label: 'Cost Type', type: 'text' },
    { key: 'subType', label: 'Subtype', type: 'text' },
    { key: 'customerName', label: 'Customer', type: 'text' },
    { key: 'vendorName', label: 'Vendor', type: 'text' },
  ].filter((column) => Array.from(rowsByKey.values()).some((row) => row[column.key]));

  const metricColumns = operationalFields.map((field) => ({
    key: field.field,
    label: field.label,
    type: 'metric',
    format: field.format,
  }));

  const rows = Array.from(rowsByKey.values()).slice(0, 250);
  return {
    columns: [...dimensionColumns, ...metricColumns],
    rows,
  };
}

function buildOperationalPreviewRows(
  companyId: string,
  sectorCategory: string | null,
  fields: string[],
  fieldCatalog: ReportFieldCatalogItem[],
  filters: any[],
  timeGrain: string,
  entityContext: string
): Map<string, { month: string; monthDate: string; values: Record<string, number> }> {
  const rowsByMonth = new Map<string, { month: string; monthDate: string; values: Record<string, number> }>();
  const operationalFields = fields
    .map((field) => fieldCatalog.find((item) => item.field === field))
    .filter((field): field is ReportFieldCatalogItem => Boolean(field?.dataType && field?.valueKey));
  const dataTypes = [...new Set(operationalFields.map((field) => field.dataType).filter(Boolean))] as string[];

  dataTypes.forEach((dataType) => {
    const payload = getOperationalPayload(companyId, sectorCategory, dataType);
    const fieldsForType = operationalFields.filter((field) => field.dataType === dataType);
    fieldsForType.forEach((field) => {
      const filtersForField = mergeInferredFilters(
        filters,
        inferEntityFiltersFromPayload(entityContext, payload, field)
      );
      recordsForField(payload, field)
        .filter((record: any) => passesFilters(record, filtersForField, field))
        .forEach((record: any) => {
          const rawDate = getRecordDate(record);
          const key = timeGrain === 'day' ? dayKey(rawDate) : monthKey(rawDate);
          const monthDate = timeGrain === 'day' ? `${key}T00:00:00.000Z` : `${key}-01T00:00:00.000Z`;
          const labelDate = new Date(monthDate);
          const existing = rowsByMonth.get(key) || {
            month: timeGrain === 'day' ? dayLabel(labelDate) : monthLabel(labelDate),
            monthDate,
            values: {},
          };
          existing.values[field.field] = toNumber(existing.values[field.field]) + toNumber(record?.[field.valueKey || '']);
          rowsByMonth.set(key, existing);
        });
    });
  });

  return rowsByMonth;
}

function datasetIdentifier(value: string): Prisma.Sql {
  return Prisma.raw(`"${value.replace(/"/g, '""')}"`);
}

function datasetColumnSql(column: ReportDatasetColumn): Prisma.Sql {
  return column.sqlExpression ? Prisma.raw(`(${column.sqlExpression})`) : datasetIdentifier(column.key);
}

function normalizeDatasetFilters(dataset: ReportDataset, rawFilters: any[]) {
  return (Array.isArray(rawFilters) ? rawFilters : [])
    .map((filter: any) => {
      const field = getDatasetColumn(dataset, filter?.field || filter?.key);
      const entityType = String(filter?.entityType || '').trim();
      const siblingFields = entityType
        ? (dataset.entityFilters || [])
            .filter((item) => item.entityType === entityType)
            .map((item) => item.field)
            .filter((key) => getDatasetColumn(dataset, key))
        : [];
      const rawFields = Array.isArray(filter?.fields) ? filter.fields : [];
      const fields = Array.from(
        new Set(
          [...rawFields, ...siblingFields]
            .map((key) => getDatasetColumn(dataset, key)?.key)
            .filter(Boolean) as string[]
        )
      );
      const value = String(filter?.value ?? '').trim();
      if (!field || !value) return null;
      const operator = String(filter?.operator || 'contains').toLowerCase();
      return {
        field: field.key,
        fields: fields.length > 1 ? fields : undefined,
        operator: ['equals', 'gte', 'lte', 'containsany'].includes(operator) ? operator : 'contains',
        value,
      };
    })
    .filter(Boolean)
    .slice(0, 8) as ReportDatasetFilterConfig[];
}

function normalizeDatasetDateRange(dataset: ReportDataset, rawDateRange: any): ReportDatasetDateRangeConfig | null {
  const field = getDatasetColumn(dataset, rawDateRange?.field)?.key || dataset.dateField;
  const amount = Number(rawDateRange?.amount);
  const unit = String(rawDateRange?.unit || '').replace(/s$/, '') as ReportDatasetDateRangeConfig['unit'];
  if (!field || !Number.isFinite(amount) || amount <= 0) return null;
  if (!['day', 'week', 'month', 'quarter', 'year'].includes(unit)) return null;
  return {
    field,
    preset: 'last',
    amount: Math.min(Math.floor(amount), 120),
    unit,
  };
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function resolveDatasetDateRange(dateRange: ReportDatasetDateRangeConfig): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  if (dateRange.unit === 'month') {
    const currentMonth = startOfUtcMonth(now);
    return {
      start: new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - (dateRange.amount - 1), 1)),
      end,
    };
  }
  if (dateRange.unit === 'quarter') {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth - ((dateRange.amount - 1) * 3), 1)),
      end,
    };
  }
  if (dateRange.unit === 'year') {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear() - (dateRange.amount - 1), 0, 1)),
      end,
    };
  }
  const days = dateRange.unit === 'week' ? dateRange.amount * 7 : dateRange.amount;
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))),
    end,
  };
}

function resolveDatasetDateBounds(dataset: ReportDataset, rawDateRange: any): { start: Date | null; end: Date | null } | null {
  const exactField = getDatasetColumn(dataset, rawDateRange?.field)?.key || dataset.dateField;
  const rawStart = rawDateRange?.startDate || rawDateRange?.start || rawDateRange?.from;
  const rawEnd = rawDateRange?.endDate || rawDateRange?.end || rawDateRange?.to;
  if (exactField && (rawStart || rawEnd)) {
    const start = rawStart ? new Date(String(rawStart)) : null;
    const end = rawEnd ? new Date(String(rawEnd)) : null;
    if (end && !Number.isNaN(end.getTime())) end.setUTCHours(23, 59, 59, 999);
    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: end && !Number.isNaN(end.getTime()) ? end : null,
    };
  }
  const dateRange = normalizeDatasetDateRange(dataset, rawDateRange);
  if (!dateRange) return null;
  return resolveDatasetDateRange(dateRange);
}

function addDatasetDateRangeClause(dataset: ReportDataset, rawDateRange: any, whereClauses: Prisma.Sql[]) {
  const exactField = getDatasetColumn(dataset, rawDateRange?.field)?.key || dataset.dateField;
  const exactColumn = exactField ? getDatasetColumn(dataset, exactField) : null;
  const rawStart = rawDateRange?.startDate || rawDateRange?.start || rawDateRange?.from;
  const rawEnd = rawDateRange?.endDate || rawDateRange?.end || rawDateRange?.to;
  if (exactColumn && (rawStart || rawEnd)) {
    const field = datasetColumnSql(exactColumn);
    if (rawStart) {
      const start = new Date(String(rawStart));
      if (!Number.isNaN(start.getTime())) whereClauses.push(Prisma.sql`${field} >= ${start}`);
    }
    if (rawEnd) {
      const end = new Date(String(rawEnd));
      if (!Number.isNaN(end.getTime())) {
        end.setUTCHours(23, 59, 59, 999);
        whereClauses.push(Prisma.sql`${field} <= ${end}`);
      }
    }
    return;
  }
  const dateRange = normalizeDatasetDateRange(dataset, rawDateRange);
  if (!dateRange) return;
  const column = getDatasetColumn(dataset, dateRange.field);
  if (!column) return;
  const { start, end } = resolveDatasetDateRange(dateRange);
  const field = datasetColumnSql(column);
  whereClauses.push(Prisma.sql`${field} >= ${start}`);
  whereClauses.push(Prisma.sql`${field} <= ${end}`);
}

function addDatasetFrequencyClause(dataset: ReportDataset, config: any, whereClauses: Prisma.Sql[]) {
  if (!dataset.frequencyField) return;
  const column = getDatasetColumn(dataset, dataset.frequencyField);
  if (!column) return;
  const requested = String(config?.frequency || config?.snapshotFrequency || '').trim().toLowerCase();
  const frequency = ['daily', 'weekly', 'monthly'].includes(requested) ? requested : 'monthly';
  whereClauses.push(Prisma.sql`${datasetColumnSql(column)} = ${frequency}`);
}

function datasetColumnToTableColumn(column: ReportDatasetColumn) {
  const isMetric = column.type === 'number' || column.type === 'currency' || column.type === 'percent';
  const isUnitCurrency = ['unitPrice', 'unitCost', 'avgCost'].includes(column.key);
  return {
    key: column.key,
    label: column.label,
    type: isMetric ? 'metric' : column.type === 'date' ? 'date' : 'text',
    format: isUnitCurrency
      ? 'unitCurrency'
      : column.type === 'currency'
        ? 'currency'
        : column.type === 'percent'
          ? 'percent'
          : column.type === 'number'
            ? 'number'
            : undefined,
  };
}

function serializeDatasetTableValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isWorkforceDataset(dataset: ReportDataset) {
  return dataset.id === 'workforce_departments' || dataset.id === 'workforce_employee_roster';
}

function isHiringApplicantDataset(dataset: ReportDataset) {
  return dataset.id === 'hiring_applicants';
}

function textMatchesFilter(value: unknown, filter: ReportDatasetFilterConfig) {
  const haystack = normalizeFilterText(value);
  const needle = normalizeFilterText(filter.value);
  if (!needle) return true;
  if (filter.operator === 'equals') return haystack === needle;
  return haystack.includes(needle);
}

function applyInMemoryDatasetFilters(rows: Array<Record<string, unknown>>, filters: ReportDatasetFilterConfig[]) {
  if (filters.length === 0) return rows;
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.operator === 'containsany' && Array.isArray(filter.fields) && filter.fields.length > 0) {
        return filter.fields.some((field) => textMatchesFilter(row[field], filter));
      }
      return textMatchesFilter(row[filter.field], filter);
    })
  );
}

function compareDatasetValues(a: unknown, b: unknown) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  return String(a || '').localeCompare(String(b || ''));
}

async function buildHiringApplicantsDatasetTablePreview(dataset: ReportDataset, config: any) {
  const columns = normalizeDatasetColumns(dataset, Array.isArray(config?.columns) ? config.columns : []);
  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const sort = normalizeDatasetSort(dataset, Array.isArray(config?.sort) ? config.sort : []);
  const limit = normalizeDatasetLimit(dataset, config?.limit);
  const payload = await getBambooHrHiringPayload(String(config.companyId));
  const applications = Array.isArray(payload?.applications) ? payload.applications : [];
  const rows = applyInMemoryDatasetFilters(
    applications.map((application: any) => ({
      applicantName: application.applicantName || '',
      jobTitle: application.jobTitle || '',
      clientName: application.clientName || '',
      division: application.division || '',
      department: application.department || '',
      status: application.status || '',
      appliedDate: application.appliedDate || null,
      lastUpdated: application.lastUpdated || null,
      hiredDate: application.hiredDate || null,
      email: application.email || '',
      phone: application.phone || '',
      source: application.source || '',
      location: application.location || '',
      rating: application.rating ?? null,
    })),
    filters
  ).sort((a, b) => {
    for (const item of sort) {
      const comparison = compareDatasetValues(a[item.field], b[item.field]);
      if (comparison !== 0) return item.direction === 'asc' ? comparison : -comparison;
    }
    return 0;
  }).slice(0, limit);

  const tableRows = rows.map((row) => {
    const output: Record<string, unknown> = { values: {} };
    columns.forEach((column) => {
      const value = serializeDatasetTableValue(row[column.key]);
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        (output.values as Record<string, number>)[column.key] = toNumber(value);
      } else {
        output[column.key] = value;
      }
    });
    return output;
  });

  return {
    rows: [],
    tableColumns: columns.map(datasetColumnToTableColumn),
    tableRows,
    fields: [],
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: dataset.tableName,
      limit,
    },
  };
}

function workforceRosterColumnSql(column: ReportDatasetColumn): Prisma.Sql {
  switch (column.key) {
    case 'employeeName':
      return Prisma.sql`emp->>'employeeName'`;
    case 'clientName':
      return Prisma.sql`emp->>'clientName'`;
    case 'division':
      return Prisma.sql`emp->>'division'`;
    case 'department':
      return Prisma.sql`emp->>'department'`;
    case 'role':
      return Prisma.sql`emp->>'role'`;
    case 'location':
      return Prisma.sql`emp->>'location'`;
    case 'employmentStatus':
      return Prisma.sql`emp->>'employmentStatus'`;
    case 'payType':
      return Prisma.sql`emp->>'payType'`;
    case 'paidPer':
      return Prisma.sql`emp->>'paidPer'`;
    case 'annualCost':
      return Prisma.sql`NULLIF(emp->>'annualCost', '')::double precision`;
    case 'monthlyCost':
      return Prisma.sql`NULLIF(emp->>'monthlyCost', '')::double precision`;
    case 'billRateLevel':
      return Prisma.sql`emp->>'billRateLevel'`;
    default:
      return Prisma.sql`NULL`;
  }
}

function workforceDepartmentColumnSql(column: ReportDatasetColumn): Prisma.Sql {
  switch (column.key) {
    case 'division':
      return Prisma.sql`"division"`;
    case 'clientName':
      return Prisma.sql`"clientName"`;
    case 'department':
      return Prisma.sql`"department"`;
    case 'employeeCount':
      return Prisma.sql`"employeeCount"`;
    default:
      return Prisma.sql`NULL`;
  }
}

function addDatasetFilterClauses(
  dataset: ReportDataset,
  filters: ReportDatasetFilterConfig[],
  whereClauses: Prisma.Sql[],
  columnSql: (column: ReportDatasetColumn) => Prisma.Sql
) {
  filters.forEach((filter) => {
    const column = getDatasetColumn(dataset, filter.field);
    if (!column) return;
    const field = columnSql(column);
    if (filter.operator === 'containsany' && Array.isArray(filter.fields) && filter.fields.length > 0) {
      const orClauses = filter.fields
        .map((fieldKey) => getDatasetColumn(dataset, fieldKey))
        .filter((item): item is ReportDatasetColumn => Boolean(item))
        .map((item) => Prisma.sql`${columnSql(item)}::text ILIKE ${`%${filter.value}%`}`);
      if (orClauses.length > 0) whereClauses.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`);
    } else if (filter.operator === 'equals') {
      whereClauses.push(Prisma.sql`${field}::text = ${filter.value}`);
    } else if (filter.operator === 'gte') {
      whereClauses.push(Prisma.sql`${field} >= ${filter.value}::double precision`);
    } else if (filter.operator === 'lte') {
      whereClauses.push(Prisma.sql`${field} <= ${filter.value}::double precision`);
    } else {
      whereClauses.push(Prisma.sql`${field}::text ILIKE ${`%${filter.value}%`}`);
    }
  });
}

async function buildWorkforceDatasetTablePreview(dataset: ReportDataset, config: any) {
  const columns = normalizeDatasetColumns(dataset, Array.isArray(config?.columns) ? config.columns : []);
  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const sort = normalizeDatasetSort(dataset, Array.isArray(config?.sort) ? config.sort : []);
  const limit = normalizeDatasetLimit(dataset, config?.limit);
  const selectColumnSql = dataset.id === 'workforce_departments' ? workforceDepartmentColumnSql : workforceRosterColumnSql;
  const filterColumnSql = selectColumnSql;
  const whereClauses: Prisma.Sql[] = [];
  addDatasetFilterClauses(dataset, filters, whereClauses, filterColumnSql);

  const selectFields = columns.map((column) => Prisma.sql`${selectColumnSql(column)} AS ${datasetIdentifier(column.key)}`);
  const orderBy = sort
    .map((item) => {
      const column = getDatasetColumn(dataset, item.field);
      return column ? Prisma.sql`${selectColumnSql(column)} ${Prisma.raw(item.direction === 'asc' ? 'ASC' : 'DESC')}` : null;
    })
    .filter(Boolean) as Prisma.Sql[];

  const rows = dataset.id === 'workforce_departments'
    ? await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        WITH roster AS (
          SELECT
            COALESCE(NULLIF(emp->>'clientName', ''), 'Unassigned') AS "clientName",
            NULLIF(emp->>'division', '') AS "division",
            NULLIF(emp->>'department', '') AS "department"
          FROM "OperationalSystemConnection" osc
          CROSS JOIN LATERAL jsonb_array_elements(
            osc."connectionMetadata"->'bambooHrWorkforceReportSnapshot'->'dimensions'->'employeeCompensationRoster'
          ) AS emp
          WHERE osc."companyId" = ${String(config.companyId)}
            AND osc."provider" = 'BAMBOOHR'
            AND osc."sourceCode" = 'BAMBOOHR_STANDARD'
            AND NULLIF(emp->>'department', '') IS NOT NULL
        ),
        grouped AS (
          SELECT
            COALESCE("division", 'Unassigned') AS "division",
            "clientName",
            "department",
            COUNT(*)::double precision AS "employeeCount"
          FROM roster
          GROUP BY "clientName", COALESCE("division", 'Unassigned'), "department"
        )
        SELECT ${Prisma.join(selectFields, ', ')}
        FROM grouped
        ${whereClauses.length > 0 ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}` : Prisma.empty}
        ${orderBy.length > 0 ? Prisma.sql`ORDER BY ${Prisma.join(orderBy, ', ')}` : Prisma.empty}
        LIMIT ${limit}
      `)
    : await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT ${Prisma.join(selectFields, ', ')}
        FROM "OperationalSystemConnection" osc
        CROSS JOIN LATERAL jsonb_array_elements(
          osc."connectionMetadata"->'bambooHrWorkforceReportSnapshot'->'dimensions'->'employeeCompensationRoster'
        ) AS emp
        WHERE osc."companyId" = ${String(config.companyId)}
          AND osc."provider" = 'BAMBOOHR'
          AND osc."sourceCode" = 'BAMBOOHR_STANDARD'
          ${whereClauses.length > 0 ? Prisma.sql`AND ${Prisma.join(whereClauses, ' AND ')}` : Prisma.empty}
        ${orderBy.length > 0 ? Prisma.sql`ORDER BY ${Prisma.join(orderBy, ', ')}` : Prisma.empty}
        LIMIT ${limit}
      `);

  const tableRows = rows.map((row) => {
    const output: Record<string, unknown> = { values: {} };
    columns.forEach((column) => {
      const value = serializeDatasetTableValue(row[column.key]);
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        (output.values as Record<string, number>)[column.key] = toNumber(value);
      } else {
        output[column.key] = value;
      }
    });
    return output;
  });

  return {
    rows: [],
    tableColumns: columns.map(datasetColumnToTableColumn),
    tableRows,
    fields: [],
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: dataset.tableName,
      limit,
    },
  };
}

async function buildDatasetTablePreview(config: any) {
  const dataset = getReportDataset(config?.dataset || config?.datasetId);
  if (!dataset) return null;
  if (isHiringApplicantDataset(dataset)) return buildHiringApplicantsDatasetTablePreview(dataset, config);
  if (isWorkforceDataset(dataset)) return buildWorkforceDatasetTablePreview(dataset, config);

  const columns = normalizeDatasetColumns(dataset, Array.isArray(config?.columns) ? config.columns : []);
  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const sort = normalizeDatasetSort(dataset, Array.isArray(config?.sort) ? config.sort : []);
  const limit = normalizeDatasetLimit(dataset, config?.limit);

  const selectFields = columns.map((column) => Prisma.sql`${datasetColumnSql(column)} AS ${datasetIdentifier(column.key)}`);
  const whereClauses: Prisma.Sql[] = [Prisma.sql`"companyId" = ${String(config.companyId)}`];
  addDatasetDateRangeClause(dataset, config?.dateRange, whereClauses);
  addDatasetFrequencyClause(dataset, config, whereClauses);

  filters.forEach((filter) => {
    const column = getDatasetColumn(dataset, filter.field);
    if (!column) return;
    const field = datasetColumnSql(column);
    if (filter.operator === 'containsany' && Array.isArray(filter.fields) && filter.fields.length > 0) {
      const orClauses = filter.fields
        .map((fieldKey) => getDatasetColumn(dataset, fieldKey))
        .filter((item): item is ReportDatasetColumn => Boolean(item))
        .map((item) => Prisma.sql`${datasetColumnSql(item)}::text ILIKE ${`%${filter.value}%`}`);
      if (orClauses.length > 0) whereClauses.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`);
    } else if (filter.operator === 'equals') {
      whereClauses.push(Prisma.sql`${field}::text = ${filter.value}`);
    } else if (filter.operator === 'gte') {
      whereClauses.push(Prisma.sql`${field} >= ${filter.value}::timestamp`);
    } else if (filter.operator === 'lte') {
      whereClauses.push(Prisma.sql`${field} <= ${filter.value}::timestamp`);
    } else {
      whereClauses.push(Prisma.sql`${field}::text ILIKE ${`%${filter.value}%`}`);
    }
  });

  const orderBy = sort
    .map((item) => {
      const column = getDatasetColumn(dataset, item.field);
      return column
        ? Prisma.sql`${datasetColumnSql(column)} ${Prisma.raw(item.direction === 'asc' ? 'ASC' : 'DESC')}`
        : null;
    })
    .filter(Boolean) as Prisma.Sql[];

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT ${Prisma.join(selectFields, ', ')}
    FROM ${datasetIdentifier(dataset.tableName)}
    WHERE ${Prisma.join(whereClauses, ' AND ')}
    ${orderBy.length > 0 ? Prisma.sql`ORDER BY ${Prisma.join(orderBy, ', ')}` : Prisma.empty}
    LIMIT ${limit}
  `);

  const tableRows = rows.map((row) => {
    const output: Record<string, unknown> = { values: {} };
    columns.forEach((column) => {
      const value = serializeDatasetTableValue(row[column.key]);
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        (output.values as Record<string, number>)[column.key] = toNumber(value);
      } else {
        output[column.key] = value;
      }
    });
    return output;
  });

  const dateColumn = columns.find((column) => column.key === dataset.dateField) || columns.find((column) => column.type === 'date');
  const previewRows = dateColumn
    ? rows
        .map((row) => {
          const rawDate = row[dateColumn.key];
          const date = rawDate instanceof Date ? rawDate : new Date(String(rawDate || ''));
          if (Number.isNaN(date.getTime())) return null;
          return {
            month: monthLabel(date),
            monthDate: date.toISOString(),
            values: {},
          };
        })
        .filter(Boolean) as Array<{ month: string; monthDate: string; values: Record<string, number> }>
    : [];

  return {
    rows: previewRows,
    tableColumns: columns.map(datasetColumnToTableColumn),
    tableRows,
    fields: [],
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: dataset.tableName,
      limit,
    },
  };
}

async function buildDatasetChartPreview(config: any) {
  const dataset = getReportDataset(config?.dataset || config?.datasetId);
  if (!dataset) return null;
  const series = Array.isArray(config?.series) ? config.series : [];
  const metrics = series
    .map((item: any) => {
      const column = getDatasetColumn(dataset, item?.field);
      if (!column || (column.type !== 'number' && column.type !== 'currency' && column.type !== 'percent')) return null;
      return {
        column,
        aggregation: String(item?.aggregation || (column.type === 'percent' ? 'average' : 'sum')).toLowerCase(),
      };
    })
    .filter((item): item is { column: ReportDatasetColumn; aggregation: string } => Boolean(item));
  if (metrics.length === 0) return null;

  const dateColumn = getDatasetColumn(dataset, dataset.dateField || 'snapshotDate') || dataset.columns.find((column) => column.type === 'date');
  if (!dateColumn) return null;

  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const whereClauses: Prisma.Sql[] = [Prisma.sql`"companyId" = ${String(config.companyId)}`];
  addDatasetDateRangeClause(dataset, config?.dateRange, whereClauses);
  addDatasetFrequencyClause(dataset, config, whereClauses);
  filters.forEach((filter) => {
    const column = getDatasetColumn(dataset, filter.field);
    if (!column) return;
    const field = datasetColumnSql(column);
    if (filter.operator === 'containsany' && Array.isArray(filter.fields) && filter.fields.length > 0) {
      const orClauses = filter.fields
        .map((fieldKey) => getDatasetColumn(dataset, fieldKey))
        .filter((item): item is ReportDatasetColumn => Boolean(item))
        .map((item) => Prisma.sql`${datasetColumnSql(item)}::text ILIKE ${`%${filter.value}%`}`);
      if (orClauses.length > 0) whereClauses.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`);
    } else if (filter.operator === 'equals') {
      whereClauses.push(Prisma.sql`${field}::text = ${filter.value}`);
    } else if (filter.operator === 'gte') {
      whereClauses.push(Prisma.sql`${field} >= ${filter.value}::timestamp`);
    } else if (filter.operator === 'lte') {
      whereClauses.push(Prisma.sql`${field} <= ${filter.value}::timestamp`);
    } else {
      whereClauses.push(Prisma.sql`${field}::text ILIKE ${`%${filter.value}%`}`);
    }
  });

  const metricSelects = metrics.map(({ column, aggregation }) => {
    const aggregate = aggregation === 'average' || aggregation === 'avg' ? 'AVG' : 'SUM';
    return Prisma.sql`${Prisma.raw(aggregate)}(${datasetColumnSql(column)})::double precision AS ${datasetIdentifier(column.key)}`;
  });

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      date_trunc('month', ${datasetColumnSql(dateColumn)})::date AS "monthDate",
      ${Prisma.join(metricSelects, ', ')}
    FROM ${datasetIdentifier(dataset.tableName)}
    WHERE ${Prisma.join(whereClauses, ' AND ')}
      AND ${datasetColumnSql(dateColumn)} IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
    LIMIT 120
  `);

  return {
    rows: rows.map((row) => {
      const date = row.monthDate instanceof Date ? row.monthDate : new Date(String(row.monthDate || ''));
      const values: Record<string, number> = {};
      metrics.forEach(({ column }) => {
        values[column.key] = toNumber(row[column.key]);
      });
      return {
        month: monthLabel(date),
        monthDate: date.toISOString(),
        values,
      };
    }),
    tableColumns: [],
    tableRows: [],
    fields: metrics.map(({ column }) => column.key),
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: dataset.tableName,
    },
  };
}

function getDatasetDimensionColumn(dataset: ReportDataset, config: any): ReportDatasetColumn | null {
  const rawDimension =
    config?.dimension ||
    config?.dimensionField ||
    config?.groupBy ||
    config?.categoryField ||
    config?.category?.field ||
    config?.xAxis?.dimension ||
    config?.xAxis?.category;
  if (!rawDimension) return null;
  const requestedColumn = typeof rawDimension === 'string'
    ? getDatasetColumn(dataset, rawDimension)
    : getDatasetColumn(dataset, rawDimension?.field || rawDimension?.key);
  const promptContext = [
    config?.sourcePrompt,
    config?.aiReportRequest,
    config?.prompt,
    config?.title,
    config?.description,
  ].map((item) => String(item || '')).join(' ').toLowerCase();
  const asksProduct = /\b(product|products|item|items|part|parts)\b/.test(promptContext);
  const explicitlyAsksIdOrSku = /\b(sku|skus|product id|item id|part number|item code)\b/.test(promptContext);
  if (asksProduct && !explicitlyAsksIdOrSku && ['itemId', 'productId', 'sku'].includes(String(requestedColumn?.key || ''))) {
    return getDatasetColumn(dataset, 'itemName') || getDatasetColumn(dataset, 'productName') || requestedColumn || null;
  }
  return requestedColumn || null;
}

function canonicalProductKey(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

async function loadCompanyScopedProductDisplayNameMap(companyId: string) {
  const displayNameByKey = new Map<string, string>();
  const looksLikeProductCode = (value: unknown) => {
    const text = String(value || '').trim();
    return Boolean(text && /\d/.test(text) && !/[a-z]/.test(text) && /^[A-Z0-9\-_.\/: ]+$/.test(text));
  };
  const setDisplayName = (aliases: unknown[], displayName: unknown) => {
    const name = String(displayName || '').trim();
    if (!name || looksLikeProductCode(name)) return;
    for (const alias of aliases) {
      const key = canonicalProductKey(alias);
      if (key && !displayNameByKey.has(key)) displayNameByKey.set(key, name);
    }
  };

  // Keep each product-name source scoped to the selected company. Do not use
  // cross-company or cross-source product-name fallbacks in report previews.
  const bakersRows = await prisma.$queryRaw<Array<{ productId: string; productName: string }>>`
    SELECT DISTINCT ON ("productId")
      "productId",
      "productName"
    FROM "BakersCogsFact"
    WHERE "companyId" = ${companyId}
      AND "sourceCode" = 'BAKERS_COGS'
      AND "productName" IS NOT NULL
    ORDER BY "productId", "formulaDate" DESC, "updatedAt" DESC
  `;
  for (const row of bakersRows) {
    const productName = String(row.productName || '').trim();
    setDisplayName([row.productId, row.productName], productName);
  }

  const inforRows = await prisma.$queryRaw<Array<{ itemNumber: string; description: string | null }>>`
    SELECT DISTINCT ON ("itemNumber")
      "itemNumber",
      "description"
    FROM "InforItemOverviewCache"
    WHERE "companyId" = ${companyId}
      AND "platform" IN ('INFOR_M3', 'INFOR_CSI')
      AND NULLIF(TRIM(COALESCE("description", '')), '') IS NOT NULL
    ORDER BY "itemNumber", "recordDate" DESC NULLS LAST, "updatedAt" DESC
  `;
  for (const row of inforRows) {
    const description = String(row.description || '').trim();
    setDisplayName([row.itemNumber, row.description], description);
  }

  const operationalRows = await prisma.$queryRaw<Array<{ itemId: string | null; sku: string | null; itemName: string | null }>>(Prisma.sql`
    SELECT "itemId", "sku", "itemName"
    FROM "ProductSalesSnapshot"
    WHERE "companyId" = ${companyId}
      AND NULLIF(TRIM(COALESCE("itemName", '')), '') IS NOT NULL
    UNION ALL
    SELECT "itemId", "sku", "itemName"
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = ${companyId}
      AND NULLIF(TRIM(COALESCE("itemName", '')), '') IS NOT NULL
    UNION ALL
    SELECT "itemId", "sku", "itemName"
    FROM "InventorySnapshot"
    WHERE "companyId" = ${companyId}
      AND NULLIF(TRIM(COALESCE("itemName", '')), '') IS NOT NULL
  `);
  for (const row of operationalRows) {
    setDisplayName([row.itemId, row.sku, row.itemName], row.itemName);
  }

  return displayNameByKey;
}

function resolveProductDisplayName(rawName: unknown, displayNameByKey: Map<string, string>): string {
  const raw = String(rawName || '').trim();
  const candidates = [
    raw,
    ...raw.split(/[:|,/\\]+/).map((part) => part.trim()).filter(Boolean).reverse(),
  ];
  for (const candidate of candidates) {
    const displayName = displayNameByKey.get(canonicalProductKey(candidate));
    if (displayName) return displayName;
  }
  return raw || 'Unassigned';
}

function isProductSalesDataset(dataset: ReportDataset): boolean {
  return dataset.tableName === 'ProductSalesSnapshot' && (dataset.id === 'products' || dataset.id === 'product_unit_economics');
}

function isProductDimensionColumn(column: ReportDatasetColumn): boolean {
  return ['itemName', 'sku', 'itemId'].includes(column.key);
}

function platosMetricSql(metricKey: string, aggregation: string): Prisma.Sql | null {
  if (metricKey === 'revenue') {
    return aggregation === 'average' || aggregation === 'avg'
      ? Prisma.sql`AVG(COALESCE("valueNumber", 0))::double precision`
      : Prisma.sql`SUM(COALESCE("valueNumber", 0))::double precision`;
  }
  if (metricKey === 'grossMargin') {
    return aggregation === 'average' || aggregation === 'avg'
      ? Prisma.sql`AVG(COALESCE("auxNumber", 0))::double precision`
      : Prisma.sql`SUM(COALESCE("auxNumber", 0))::double precision`;
  }
  if (metricKey === 'cogs') {
    return aggregation === 'average' || aggregation === 'avg'
      ? Prisma.sql`AVG(COALESCE("valueNumber", 0) - COALESCE("auxNumber", 0))::double precision`
      : Prisma.sql`SUM(COALESCE("valueNumber", 0) - COALESCE("auxNumber", 0))::double precision`;
  }
  return null;
}

function platosFilterClauses(filters: ReportDatasetFilterConfig[]): Prisma.Sql[] {
  return filters
    .map((filter) => {
      if (!['itemName', 'sku', 'itemId'].includes(filter.field)) return null;
      if (filter.operator === 'equals') {
        return Prisma.sql`(COALESCE("dimensionLabel", '') = ${filter.value} OR COALESCE("dimensionKey", '') = ${filter.value})`;
      }
      return Prisma.sql`(COALESCE("dimensionLabel", '') ILIKE ${`%${filter.value}%`} OR COALESCE("dimensionKey", '') ILIKE ${`%${filter.value}%`})`;
    })
    .filter(Boolean) as Prisma.Sql[];
}

async function buildPlatosProductDimensionChartPreview(
  dataset: ReportDataset,
  config: any,
  dimensionColumn: ReportDatasetColumn,
  metricConfig: { column: ReportDatasetColumn; aggregation: string; label: string; format: string }
) {
  if (!isProductSalesDataset(dataset) || !isProductDimensionColumn(dimensionColumn)) return null;
  const metricSql = platosMetricSql(metricConfig.column.key, metricConfig.aggregation);
  if (!metricSql) return null;

  const hasFacts = await ensurePlatosClosetMonthlyFacts(String(config.companyId));
  if (!hasFacts) return null;

  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const filterClauses = platosFilterClauses(filters);
  const bounds = resolveDatasetDateBounds(dataset, config?.dateRange);
  const limit = Math.min(Math.max(Number(config?.limit) || 10, 1), 50);
  const dateClauses: Prisma.Sql[] = [];
  if (bounds?.start) dateClauses.push(Prisma.sql`"monthStart" >= ${bounds.start}`);
  if (bounds?.end) dateClauses.push(Prisma.sql`"monthStart" <= ${bounds.end}`);
  const extraClauses = [...dateClauses, ...filterClauses];

  const rows = bounds
    ? await prisma.$queryRaw<Array<{ name: string; value: number }>>(Prisma.sql`
        SELECT
          COALESCE(NULLIF("dimensionLabel", ''), NULLIF("dimensionKey", ''), 'Unassigned') AS "name",
          ${metricSql} AS "value"
        FROM "PlatosClosetMonthlyFact"
        WHERE "companyId" = ${String(config.companyId)}
          AND "sourceCode" = ${PLATOS_CLOSET_SOURCE_CODE}
          AND "factType" = 'category_metric'
          AND "metricName" = 'net_sales'
          AND "dimensionType" = 'category'
          ${extraClauses.length > 0 ? Prisma.sql`AND ${Prisma.join(extraClauses, ' AND ')}` : Prisma.empty}
        GROUP BY 1
        HAVING ${metricSql} IS NOT NULL
        ORDER BY "value" DESC
        LIMIT ${limit}
      `)
    : await prisma.$queryRaw<Array<{ name: string; value: number }>>(Prisma.sql`
        WITH month_scope AS (
          SELECT DISTINCT "monthStart"
          FROM "PlatosClosetMonthlyFact"
          WHERE "companyId" = ${String(config.companyId)}
            AND "sourceCode" = ${PLATOS_CLOSET_SOURCE_CODE}
            AND "factType" = 'category_metric'
            AND "metricName" = 'net_sales'
            AND "dimensionType" = 'category'
          ORDER BY "monthStart" DESC
          LIMIT 12
        )
        SELECT
          COALESCE(NULLIF(f."dimensionLabel", ''), NULLIF(f."dimensionKey", ''), 'Unassigned') AS "name",
          ${metricSql} AS "value"
        FROM "PlatosClosetMonthlyFact" f
        INNER JOIN month_scope ms ON ms."monthStart" = f."monthStart"
        WHERE f."companyId" = ${String(config.companyId)}
          AND f."sourceCode" = ${PLATOS_CLOSET_SOURCE_CODE}
          AND f."factType" = 'category_metric'
          AND f."metricName" = 'net_sales'
          AND f."dimensionType" = 'category'
          ${filterClauses.length > 0 ? Prisma.sql`AND ${Prisma.join(filterClauses, ' AND ')}` : Prisma.empty}
        GROUP BY 1
        HAVING ${metricSql} IS NOT NULL
        ORDER BY "value" DESC
        LIMIT ${limit}
      `);

  const displayRows = rows
    .map((row) => ({ name: String(row.name || 'Unassigned'), value: toNumber(row.value) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  if (displayRows.length === 0) return null;

  return {
    rows: displayRows.map((row) => ({
      name: row.name,
      dimension: row.name,
      value: row.value,
      values: {
        [metricConfig.column.key]: row.value,
      },
    })),
    tableColumns: [
      { key: 'name', label: dimensionColumn.label, type: 'text' },
      { key: metricConfig.column.key, label: metricConfig.label, type: 'metric', format: metricConfig.format },
    ],
    tableRows: displayRows.map((row) => ({
      name: row.name,
      values: {
        [metricConfig.column.key]: row.value,
      },
    })),
    fields: [metricConfig.column.key],
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: 'PlatosClosetMonthlyFact',
      dimension: dimensionColumn.key,
      metric: metricConfig.column.key,
      limit,
      source: 'platos-closet-monthly-facts',
    },
  };
}

async function buildDatasetDimensionChartPreview(config: any) {
  const dataset = getReportDataset(config?.dataset || config?.datasetId);
  if (!dataset) return null;
  const dimensionColumn = getDatasetDimensionColumn(dataset, config);
  if (!dimensionColumn) return null;

  const metricConfig = (Array.isArray(config?.series) ? config.series : [])
    .map((item: any) => {
      const column = getDatasetColumn(dataset, item?.field);
      if (!column || (column.type !== 'number' && column.type !== 'currency' && column.type !== 'percent')) return null;
      return {
        column,
        aggregation: String(item?.aggregation || (column.type === 'percent' ? 'average' : 'sum')).toLowerCase(),
        label: String(item?.label || column.label || column.key),
        format: String(item?.format || (column.type === 'currency' ? 'currency' : column.type === 'percent' ? 'percent' : 'number')),
      };
    })
    .filter(Boolean)[0] as { column: ReportDatasetColumn; aggregation: string; label: string; format: string } | undefined;
  if (!metricConfig) return null;

  const filters = normalizeDatasetFilters(dataset, Array.isArray(config?.filters) ? config.filters : []);
  const whereClauses: Prisma.Sql[] = [Prisma.sql`"companyId" = ${String(config.companyId)}`];
  addDatasetDateRangeClause(dataset, config?.dateRange, whereClauses);
  addDatasetFrequencyClause(dataset, config, whereClauses);
  filters.forEach((filter) => {
    const column = getDatasetColumn(dataset, filter.field);
    if (!column) return;
    const field = datasetColumnSql(column);
    if (filter.operator === 'containsany' && Array.isArray(filter.fields) && filter.fields.length > 0) {
      const orClauses = filter.fields
        .map((fieldKey) => getDatasetColumn(dataset, fieldKey))
        .filter((item): item is ReportDatasetColumn => Boolean(item))
        .map((item) => Prisma.sql`${datasetColumnSql(item)}::text ILIKE ${`%${filter.value}%`}`);
      if (orClauses.length > 0) whereClauses.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`);
    } else if (filter.operator === 'equals') {
      whereClauses.push(Prisma.sql`${field}::text = ${filter.value}`);
    } else if (filter.operator === 'gte') {
      whereClauses.push(Prisma.sql`${field} >= ${filter.value}::timestamp`);
    } else if (filter.operator === 'lte') {
      whereClauses.push(Prisma.sql`${field} <= ${filter.value}::timestamp`);
    } else {
      whereClauses.push(Prisma.sql`${field}::text ILIKE ${`%${filter.value}%`}`);
    }
  });

  const aggregate = metricConfig.aggregation === 'average' || metricConfig.aggregation === 'avg' ? 'AVG' : 'SUM';
  const limit = Math.min(Math.max(Number(config?.limit) || 10, 1), 50);
  const queryLimit = dataset.tableName === 'ProductSalesSnapshot' ? Math.max(limit * 3, limit) : limit;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      COALESCE(NULLIF(${datasetColumnSql(dimensionColumn)}::text, ''), 'Unassigned') AS "name",
      ${Prisma.raw(aggregate)}(${datasetColumnSql(metricConfig.column)})::double precision AS "value"
    FROM ${datasetIdentifier(dataset.tableName)}
    WHERE ${Prisma.join(whereClauses, ' AND ')}
      AND ${datasetColumnSql(dimensionColumn)} IS NOT NULL
    GROUP BY 1
    HAVING ${Prisma.raw(aggregate)}(${datasetColumnSql(metricConfig.column)}) IS NOT NULL
    ORDER BY "value" DESC
    LIMIT ${queryLimit}
  `);
  if (rows.length === 0) {
    const platosPreview = await buildPlatosProductDimensionChartPreview(dataset, config, dimensionColumn, metricConfig);
    if (platosPreview) return platosPreview;
  }
  const displayNameByKey = dataset.tableName === 'ProductSalesSnapshot'
    ? await loadCompanyScopedProductDisplayNameMap(String(config.companyId))
    : new Map<string, string>();
  const displayRows = rows.reduce<Array<{ name: string; value: number }>>((acc, row) => {
    const name = displayNameByKey.size > 0
      ? resolveProductDisplayName(row.name, displayNameByKey)
      : String(row.name || 'Unassigned');
    const value = toNumber(row.value);
    const existing = acc.find((item) => item.name === name);
    if (existing) {
      existing.value += value;
    } else {
      acc.push({ name, value });
    }
    return acc;
  }, []).sort((a, b) => b.value - a.value).slice(0, limit);

  return {
    rows: displayRows.map((row) => ({
      name: row.name,
      dimension: row.name,
      value: row.value,
      values: {
        [metricConfig.column.key]: row.value,
      },
    })),
    tableColumns: [
      { key: 'name', label: dimensionColumn.label, type: 'text' },
      { key: metricConfig.column.key, label: metricConfig.label, type: 'metric', format: metricConfig.format },
    ],
    tableRows: displayRows.map((row) => ({
      name: row.name,
      values: {
        [metricConfig.column.key]: row.value,
      },
    })),
    fields: [metricConfig.column.key],
    fieldCatalog: [],
    dataset: {
      id: dataset.id,
      label: dataset.label,
      tableName: dataset.tableName,
      dimension: dimensionColumn.key,
      metric: metricConfig.column.key,
      limit,
    },
  };
}

async function loadMonthlyFinancialContextRows(companyId: string) {
  const endDate = new Date();
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear() - 3, endDate.getUTCMonth(), 1));
  const dfsMonthly = await loadMonthlyFromDfs(companyId, startDate, endDate);
  if (dfsMonthly?.rows?.length) {
    return dfsMonthly.rows
      .slice()
      .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())
      .slice(0, 36);
  }

  return prisma.monthlyFinancial.findMany({
    where: { companyId },
    orderBy: { monthDate: 'desc' },
    take: 36,
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
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const config = body?.reportConfig || {};

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CustomReports', companyId, 'PREVIEW');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySector: true, industrySectorCategory: true, userDefinedAllocations: true, forceOperationalMockData: true },
    });
    const customReports = (company?.userDefinedAllocations as any)?.customReports || {};
    if (customReports.enabledByAdmin !== true) {
      return NextResponse.json({ error: 'Custom Reports are disabled for this company.' }, { status: 403 });
    }
    const sectorCategory = resolveCompanyIndustrySectorCategory(company);
    const fieldCatalog = getReportDataCatalog(sectorCategory);
    const previewConfig = enhancePreviewConfig(config, fieldCatalog);
    const entityContext = [
      previewConfig?.scope?.entityName,
      previewConfig?.title,
      previewConfig?.description,
      ...(Array.isArray(previewConfig?.notes) ? previewConfig.notes : []),
    ].map((item) => String(item || '')).join(' ');
    if (String(previewConfig?.chartType || '').toLowerCase() === 'table' && previewConfig?.dataset) {
      const datasetPreview =
        (await buildDatasetDimensionChartPreview({ ...previewConfig, companyId })) ||
        (await buildDatasetTablePreview({ ...previewConfig, companyId }));
      if (datasetPreview) return NextResponse.json(datasetPreview);
    }
    if (previewConfig?.dataset) {
      const datasetPreview =
        (await buildDatasetDimensionChartPreview({ ...previewConfig, companyId })) ||
        (await buildDatasetChartPreview({ ...previewConfig, companyId }));
      if (datasetPreview) return NextResponse.json(datasetPreview);
    }

    const fields = getRequestedFields(previewConfig, fieldCatalog);
    if (fields.length === 0) return NextResponse.json({ error: 'Report config has no supported series fields.' }, { status: 400 });
    const hasOperationalFields = fields.some((field) => field.startsWith('op.'));
    if (hasOperationalFields && company?.forceOperationalMockData !== true) {
      return NextResponse.json(
        {
          error: 'Operational custom report preview requires live operational data for this company. Mock data is disabled.',
          code: 'MOCK_DATA_DISABLED',
        },
        { status: 409 }
      );
    }

    const rows = await loadMonthlyFinancialContextRows(companyId);

    const previewRowsByMonth = new Map<string, { month: string; monthDate: string; values: Record<string, number> }>();
    const financialFields = fields.filter((field) => !field.startsWith('op.'));

    if (financialFields.length > 0) {
      rows
        .slice()
        .reverse()
        .forEach((row) => {
          const values = buildValues(row);
          previewRowsByMonth.set(monthKey(row.monthDate), {
            month: monthLabel(row.monthDate),
            monthDate: row.monthDate.toISOString(),
            values: financialFields.reduce<Record<string, number>>((acc, field) => {
              if ((values as Record<string, number>)[field] !== undefined) {
                acc[field] = toNumber((values as Record<string, number>)[field]);
              }
              return acc;
            }, {}),
          });
        });
    }

    const operationalRows = buildOperationalPreviewRows(
      companyId,
      sectorCategory,
      fields,
      fieldCatalog,
      Array.isArray(previewConfig?.filters) ? previewConfig.filters : [],
      String(previewConfig?.timeGrain || 'month'),
      entityContext
    );
    operationalRows.forEach((row, key) => {
      const existing = previewRowsByMonth.get(key) || row;
      previewRowsByMonth.set(key, {
        ...existing,
        values: {
          ...existing.values,
          ...row.values,
        },
      });
    });

    const previewRows = Array.from(previewRowsByMonth.values()).sort((a, b) => a.monthDate.localeCompare(b.monthDate));
    const tablePreview = String(previewConfig?.chartType || '').toLowerCase() === 'table'
      ? buildOperationalTablePreview(
          companyId,
          sectorCategory,
          fields,
          fieldCatalog,
          Array.isArray(previewConfig?.filters) ? previewConfig.filters : [],
          entityContext
        )
      : { columns: [], rows: [] };

    return NextResponse.json({
      rows: previewRows,
      tableColumns: tablePreview.columns,
      tableRows: tablePreview.rows,
      fields,
      fieldCatalog: fieldCatalog.filter((field) => fields.includes(field.field)),
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to build report preview');
    const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
    console.error('Custom Reports preview error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
