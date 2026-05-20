import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getReportDataCatalog, type ReportFieldCatalogItem } from '@/lib/custom-reports/report-data-catalog';

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

function inferCostTypeFilter(prompt: string): { field: string; operator: string; value: string } | null {
  const lower = normalizePromptText(prompt).toLowerCase();
  if (/\blabor\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Labor' };
  if (/\bmaterials?\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Materials' };
  if (/\bsubcontract(or|ors|ing)?\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Subcontract' };
  if (/\bequipment\b/.test(lower)) return { field: 'costType', operator: 'contains', value: 'Equipment' };
  return null;
}

function inferJobFilter(prompt: string): { field: string; operator: string; value: string } | null {
  const cleaned = normalizePromptText(prompt)
    .replace(/\b(line|bar|stacked|grouped|combo|pie|table|chart|graph|report|trend|monthly|daily|date|period|by)\b/gi, ' ')
    .replace(/\b(actual|budget|committed|commitment|variance|costs?|labor|materials?|subcontractors?|subcontracting|equipment|other)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const genericOnly = /^(job|project|jobs|projects|control|portfolio|forecast|billing|cash)$/i.test(cleaned);
  if (!cleaned || genericOnly || cleaned.length < 4) return null;
  return { field: 'jobName', operator: 'contains', value: cleaned };
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

function enhanceConfigFromPrompt(config: ReturnType<typeof validateReportConfig>, prompt: string, fieldCatalog: ReportFieldCatalogItem[]) {
  const lowerPrompt = normalizePromptText(prompt).toLowerCase();
  const hasField = (field: string) => fieldCatalog.some((item) => item.field === field);
  const wantsDatedJobCost = (
    /\b(date|daily|day|trend|line|bar|chart|graph)\b/.test(lowerPrompt) &&
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

  const inferredFilters = [inferJobFilter(prompt), inferredCostType].filter(Boolean);
  const filters = mergeFilters(config.filters || [], inferredFilters);

  return {
    ...config,
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

function validateReportConfig(rawConfig: any, requestedType: ReportChartType, fieldCatalog: ReportFieldCatalogItem[]) {
  const chartType = normalizeChartType(rawConfig?.chartType, requestedType);
  const series = normalizeSeries(rawConfig, chartType, fieldCatalog);
  return {
    title: String(rawConfig?.title || 'Custom Report').slice(0, 120),
    description: String(rawConfig?.description || 'AI-generated custom report configuration.').slice(0, 500),
    chartType,
    dataSource: inferDataSource(series, rawConfig?.dataSource),
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
    filters: Array.isArray(rawConfig?.filters) ? rawConfig.filters.slice(0, 8) : [],
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
        industrySectorCategory: true,
        userDefinedAllocations: true,
      },
    });

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    const customReports = (company.userDefinedAllocations as any)?.customReports || {};
    if (customReports.enabledByAdmin !== true) {
      return NextResponse.json({ error: 'Custom Reports are disabled for this company.' }, { status: 403 });
    }
    const fieldCatalog = getReportDataCatalog(company.industrySectorCategory || null);

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
              'Operational fields are prefixed with op.<module>.<metric>; use them when the user asks for sector, project, customer, product, inventory, cash, AR, AP, or other operational reporting.',
              'When a prompt names an operational slice such as job, project, customer, product, vendor, cost type, or location, express it as a filter instead of inventing a field.',
              'Supported chartType values: line, multi_line, bar, grouped_bar, stacked_bar, combo, table, pie.',
              'For combo charts, each series can use chartType line or bar and can use left/right axis.',
              'For stacked_bar charts, use multiple bar series with the same stackGroup.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              company: {
                name: company.name,
                industrySectorCategory: company.industrySectorCategory || null,
              },
              requestedChartType: requestedType,
              userPrompt: prompt,
              fieldCatalog,
              recentMonthlyRowsSample: recentRows.slice().reverse(),
              requiredJsonShape: {
                title: 'short report title',
                description: 'one sentence explaining the report',
              chartType: 'line | multi_line | bar | grouped_bar | stacked_bar | combo | table | pie',
                dataSource: 'monthlyFinancial | operational',
                timeGrain: 'month',
                xAxis: { field: 'monthDate', label: 'Month' },
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
                filters: [],
                notes: ['short implementation or interpretation notes'],
              },
            }),
          },
        ],
      });

      const parsed = safeJsonParse(aiResult.text);
      reportConfig = validateReportConfig(parsed, requestedType, fieldCatalog);
      generatedBy = {
        model,
        api: aiResult.api,
      };
    } catch (aiError: any) {
      if (process.env.NODE_ENV === 'production' || !isAiAuthOrConfigError(aiError)) {
        throw aiError;
      }

      reportConfig = buildDevFallbackConfig(prompt, requestedType, fieldCatalog);
      generatedBy = {
        model: 'local-dev-fallback',
        api: 'fallback',
        reason: 'AI credentials are not configured for local development.',
      };
    }
    reportConfig = enhanceConfigFromPrompt(reportConfig, prompt, fieldCatalog);

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
