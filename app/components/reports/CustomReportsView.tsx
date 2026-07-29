'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ReportType = 'line' | 'multi_line' | 'bar' | 'grouped_bar' | 'stacked_bar' | 'combo' | 'table' | 'pie';

interface CustomReportsViewProps {
  selectedCompanyId: string;
  companyName?: string;
  industrySectorCategory?: string | null;
}

type SavedCustomReport = {
  id: string;
  title: string;
  description?: string | null;
  chartType?: string | null;
  dataSource?: string | null;
  config: any;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

const reportTypes: Array<{ id: ReportType; label: string; description: string }> = [
  { id: 'line', label: 'Line Chart', description: 'Trend metrics over time.' },
  { id: 'multi_line', label: 'Multi-Line Chart', description: 'Compare two or more trends on one chart.' },
  { id: 'bar', label: 'Bar Chart', description: 'Compare categories, periods, or accounts.' },
  { id: 'grouped_bar', label: 'Grouped Bar', description: 'Show side-by-side bars by period.' },
  { id: 'stacked_bar', label: 'Stacked Bar', description: 'Show multiple components stacked by period.' },
  { id: 'combo', label: 'Combo Chart', description: 'Mix bars and lines with optional dual axes.' },
  { id: 'table', label: 'Table', description: 'Detailed rows for review and export.' },
  { id: 'pie', label: 'Pie Chart', description: 'Show proportional mix for one period.' },
];

const seriesColors = ['#1F70C1', '#16a34a', '#f97316', '#7c3aed', '#dc2626', '#0891b2'];

function formatValue(value: number, format?: string) {
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'unitCurrency') {
    return Number(value || 0).toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (format === 'currency') {
    const abs = Math.abs(value);
    const suffix = abs >= 1_000_000 ? 'M' : abs >= 1_000 ? 'K' : '';
    const divisor = suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
    return `${value < 0 ? '-' : ''}$${(abs / divisor).toFixed(suffix ? 1 : 0)}${suffix}`;
  }
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDate(value?: string) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function createdByLabel(report: SavedCustomReport) {
  return report.createdBy?.name || report.createdBy?.email || 'Unknown';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return String(value || 'custom-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'custom-report';
}

function getReportRequest(config: any): string {
  return String(
    config?.sourcePrompt ||
    config?.aiReportRequest ||
    config?.userPrompt ||
    config?.prompt ||
    ''
  ).trim();
}

function withReportRequest(config: any, request: string) {
  const trimmedRequest = request.trim();
  if (!config || !trimmedRequest) return config;
  return {
    ...config,
    sourcePrompt: trimmedRequest,
    aiReportRequest: trimmedRequest,
  };
}

function shouldShowReportDescription(value: unknown): boolean {
  const description = String(value || '').trim();
  if (!description) return false;
  const normalized = description.toLowerCase();
  return !(
    normalized.includes('filtered and bounded by the report request') ||
    normalized.includes('product sales, quantity sold, revenue, cogs, and gross margin by item/sku')
  );
}

async function readJsonResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const readableText = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    throw new Error(readableText || fallbackMessage);
  }
}

function getSeriesValue(row: any, field: string) {
  return Number(row?.values?.[field] ?? 0);
}

function buildChartRows(rows: any[], series: any[]) {
  return rows.map((row) => {
    const chartRow: Record<string, any> = {
      month: row.month,
      monthDate: row.monthDate,
    };
    series.forEach((item: any) => {
      chartRow[item.field] = getSeriesValue(row, item.field);
    });
    return chartRow;
  });
}

function formatTooltipValue(value: unknown, name: unknown, props: any, series: any[]) {
  const field = props?.dataKey ? String(props.dataKey) : '';
  const meta = series.find((item: any) => item.field === field);
  return [formatValue(Number(value || 0), meta?.format), meta?.label || String(name || field)];
}

function CustomReportPreview({ config, rows, tableRows = [], tableColumns = [] }: { config: any; rows: any[]; tableRows?: any[]; tableColumns?: any[] }) {
  const series = Array.isArray(config?.series) ? config.series : [];
  const chartType = String(config?.chartType || 'line');
  const hasRows = (chartType === 'table' && tableRows.length > 0) || (rows.length > 0 && series.length > 0);
  const isDimensionRows = rows.length > 0 && rows.some((row) => row?.name || row?.dimension);
  const primarySeries = series[0];
  const dimensionChartRows = isDimensionRows
    ? rows.map((row, index) => ({
        name: String(row?.name || row?.dimension || `Item ${index + 1}`),
        value: Number(row?.value ?? row?.values?.[primarySeries?.field] ?? 0),
      }))
    : [];

  if (!hasRows) {
    return (
      <div style={{ marginTop: '18px', padding: '18px', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', fontSize: '13px' }}>
        No preview data is available for this report yet.
      </div>
    );
  }

  if (chartType === 'table') {
    if (tableRows.length > 0 && tableColumns.length > 0) {
      return (
        <div style={{ marginTop: '18px', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {tableColumns.map((column: any) => (
                  <th key={column.key} style={{ textAlign: column.type === 'metric' ? 'right' : 'left', padding: '10px', borderBottom: '1px solid #e2e8f0' }}>
                    {column.label || column.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row: any, rowIndex: number) => (
                <tr key={`${row.jobId || row.jobName || row.date || 'row'}-${rowIndex}`}>
                  {tableColumns.map((column: any) => {
                    const rawValue = column.type === 'metric' ? row?.values?.[column.key] : row?.[column.key];
                    const value = column.type === 'metric'
                      ? formatValue(Number(rawValue || 0), column.format)
                      : column.type === 'date'
                        ? formatDate(String(rawValue || ''))
                        : String(rawValue || '');
                    return (
                      <td key={column.key} style={{ padding: '9px 10px', borderBottom: '1px solid #f1f5f9', textAlign: column.type === 'metric' ? 'right' : 'left', color: '#334155', fontWeight: column.key === 'jobName' ? 700 : 400 }}>
                        {value || '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div style={{ marginTop: '18px', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Month</th>
              {series.map((item: any) => (
                <th key={item.field} style={{ textAlign: 'right', padding: '10px', borderBottom: '1px solid #e2e8f0' }}>{item.label || item.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.monthDate}>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontWeight: 700 }}>{row.month}</td>
                {series.map((item: any) => (
                  <td key={item.field} style={{ padding: '9px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#334155' }}>
                    {formatValue(getSeriesValue(row, item.field), item.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chartType === 'pie') {
    const values = isDimensionRows
      ? dimensionChartRows.map((row, index) => ({
          field: row.name,
          name: row.name,
          value: Math.max(0, row.value),
          color: seriesColors[index % seriesColors.length],
          format: primarySeries?.format,
        }))
      : (() => {
          const latest = rows[rows.length - 1];
          return series.map((item: any, index: number) => ({
            ...item,
            name: item.label || item.field,
            value: Math.max(0, getSeriesValue(latest, item.field)),
            color: seriesColors[index % seriesColors.length],
          }));
        })();

    return (
      <div style={{ marginTop: '18px', height: '340px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip formatter={(value: any, name: any, props: any) => (
              isDimensionRows
                ? [formatValue(Number(value || 0), primarySeries?.format), String(name)]
                : formatTooltipValue(value, name, props, values)
            )} />
            <Legend />
            <Pie
              data={values}
              dataKey="value"
              nameKey="name"
              outerRadius={110}
              label={(entry: any) => formatValue(Number(entry.value || 0), entry.format || primarySeries?.format)}
            >
              {values.map((item: any) => (
                <Cell key={item.field} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (isDimensionRows && (chartType === 'bar' || chartType === 'grouped_bar')) {
    return (
      <div style={{ marginTop: '18px', height: '380px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dimensionChartRows} margin={{ top: 16, right: 24, bottom: 72, left: 22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-35} textAnchor="end" interval={0} height={84} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => formatValue(Number(value || 0), primarySeries?.format)} />
            <Tooltip formatter={(value: any) => [formatValue(Number(value || 0), primarySeries?.format), primarySeries?.label || primarySeries?.field || 'Value']} />
            <Bar dataKey="value" name={primarySeries?.label || primarySeries?.field || 'Value'} fill={seriesColors[0]} radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const chartRows = buildChartRows(rows, series);
  const rightSeries = series.filter((item: any) => item.axis === 'right');
  const barSeries = series.filter((item: any) => chartType === 'bar' || chartType === 'grouped_bar' || chartType === 'stacked_bar' || item.chartType === 'bar');
  const lineSeries = series.filter((item: any) => chartType === 'line' || chartType === 'multi_line' || item.chartType === 'line');
  const leftAxisFormat = (series.find((item: any) => item.axis !== 'right') || series[0])?.format;
  const rightAxisFormat = rightSeries[0]?.format;

  return (
    <div style={{ marginTop: '18px', height: '380px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', background: '#fff' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartRows} margin={{ top: 16, right: rightSeries.length ? 54 : 24, bottom: 64, left: 22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#64748b' }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={64}
            tickMargin={10}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => formatValue(Number(value || 0), leftAxisFormat)}
          />
          {rightSeries.length > 0 && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickFormatter={(value) => formatValue(Number(value || 0), rightAxisFormat)}
            />
          )}
          <Tooltip
            formatter={(value: any, name: any, props: any) => formatTooltipValue(value, name, props, series)}
            labelFormatter={(label) => String(label || '')}
            labelStyle={{ color: '#0f172a', fontWeight: 700 }}
          />
          <Legend />
          {barSeries.map((item: any, index: number) => (
            <Bar
              key={item.field}
              dataKey={item.field}
              name={item.label || item.field}
              yAxisId={item.axis === 'right' ? 'right' : 'left'}
              fill={seriesColors[index % seriesColors.length]}
              stackId={chartType === 'stacked_bar' ? (item.stackGroup || 'stack') : undefined}
              radius={[4, 4, 0, 0]}
            />
          ))}
          {lineSeries.map((item: any, index: number) => (
            <Line
              key={item.field}
              type="linear"
              dataKey={item.field}
              name={item.label || item.field}
              yAxisId={item.axis === 'right' ? 'right' : 'left'}
              stroke={seriesColors[(barSeries.length + index) % seriesColors.length]}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CustomReportsView({ selectedCompanyId }: CustomReportsViewProps) {
  const reportOutputRef = useRef<HTMLDivElement | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('line');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [generatedConfig, setGeneratedConfig] = useState<any | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewTableRows, setPreviewTableRows] = useState<any[]>([]);
  const [previewTableColumns, setPreviewTableColumns] = useState<any[]>([]);
  const [previewError, setPreviewError] = useState('');
  const [savedReports, setSavedReports] = useState<SavedCustomReport[]>([]);
  const [savedReportsError, setSavedReportsError] = useState('');
  const [isLoadingSavedReports, setIsLoadingSavedReports] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [selectedSavedReportId, setSelectedSavedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'saved' | 'view'>('builder');
  const selectedSavedReport = selectedSavedReportId
    ? savedReports.find((report) => report.id === selectedSavedReportId) || null
    : null;

  const loadSavedReports = useCallback(async () => {
    if (!selectedCompanyId) return;
    setSavedReportsError('');
    setIsLoadingSavedReports(true);
    try {
      const response = await fetch(`/api/custom-reports?companyId=${encodeURIComponent(selectedCompanyId)}`, {
        cache: 'no-store',
      });
      const data = await readJsonResponse(response, 'Failed to load saved reports');
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load saved reports');
      }
      setSavedReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch (error: any) {
      setSavedReportsError(error?.message || 'Failed to load saved reports');
    } finally {
      setIsLoadingSavedReports(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    setGeneratedConfig(null);
    setPrompt('');
    setPreviewRows([]);
    setPreviewTableRows([]);
    setPreviewTableColumns([]);
    setPreviewError('');
    setSelectedSavedReportId(null);
    void loadSavedReports();
  }, [loadSavedReports, selectedCompanyId]);

  const loadPreview = async (reportConfig: any) => {
    setPreviewError('');
    setPreviewRows([]);
    setPreviewTableRows([]);
    setPreviewTableColumns([]);
    try {
      const response = await fetch('/api/custom-reports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          reportConfig,
        }),
      });
      const data = await readJsonResponse(response, 'Failed to build report preview');
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to build report preview');
      }
      setPreviewRows(Array.isArray(data?.rows) ? data.rows : []);
      setPreviewTableRows(Array.isArray(data?.tableRows) ? data.tableRows : []);
      setPreviewTableColumns(Array.isArray(data?.tableColumns) ? data.tableColumns : []);
      if (data?.previewError) {
        setPreviewError(String(data.previewError));
      }
    } catch (error: any) {
      setPreviewError(error?.message || 'Failed to build report preview');
    }
  };

  const generateReportConfig = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setGenerationError('Describe the report you want to create first.');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');
    try {
      const response = await fetch('/api/custom-reports/generate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          reportType: selectedReportType,
          prompt: trimmedPrompt,
        }),
      });
      const data = await readJsonResponse(response, 'Failed to generate report config');
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate report config');
      }
      const reportConfig = data?.reportConfig
        ? withReportRequest(data.reportConfig, trimmedPrompt)
        : null;
      setGeneratedConfig(reportConfig);
      if (reportConfig) {
        await loadPreview(reportConfig);
      }
    } catch (error: any) {
      setGenerationError(error?.message || 'Failed to generate report config');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveGeneratedReport = async () => {
    if (!generatedConfig) return;
    const reportConfigToSave = withReportRequest(generatedConfig, prompt);
    setIsSavingReport(true);
    setGenerationError('');
    try {
      const method = selectedSavedReportId ? 'PATCH' : 'POST';
      const response = await fetch('/api/custom-reports', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          reportId: selectedSavedReportId || undefined,
          reportConfig: reportConfigToSave,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save report');
      }
      const savedConfig = data?.report?.config || reportConfigToSave;
      setGeneratedConfig(savedConfig);
      setSelectedSavedReportId(data?.report?.id || selectedSavedReportId || null);
      await loadSavedReports();
      await loadPreview(savedConfig);
      setActiveTab('view');
    } catch (error: any) {
      setGenerationError(error?.message || 'Failed to save report');
    } finally {
      setIsSavingReport(false);
    }
  };

  const openSavedReport = async (report: SavedCustomReport) => {
    const config = report.config || {};
    setGeneratedConfig(config);
    setPrompt(getReportRequest(config));
    setSelectedSavedReportId(report.id);
    setActiveTab('view');
    const chartType = String(config?.chartType || report.chartType || '').replace('-', '_') as ReportType;
    if (reportTypes.some((type) => type.id === chartType)) {
      setSelectedReportType(chartType);
    }
    await loadPreview(config);
  };

  const duplicateSavedReport = async (report: SavedCustomReport) => {
    const config = {
      ...(report.config || {}),
      title: `Copy of ${report.title || report.config?.title || 'Custom Report'}`.slice(0, 120),
    };
    setSavedReportsError('');
    try {
      const response = await fetch('/api/custom-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          reportConfig: config,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to duplicate report');
      }
      await loadSavedReports();
      if (data?.report) {
        await openSavedReport(data.report);
      }
    } catch (error: any) {
      setSavedReportsError(error?.message || 'Failed to duplicate report');
    }
  };

  const exportReportCsv = () => {
    if (!generatedConfig) return;
    if (String(generatedConfig.chartType || '').toLowerCase() === 'table' && previewTableRows.length > 0 && previewTableColumns.length > 0) {
      const lines = [
        previewTableColumns.map((column: any) => column.label || column.key),
        ...previewTableRows.map((row: any) => previewTableColumns.map((column: any) => (
          column.type === 'metric' ? row?.values?.[column.key] : row?.[column.key]
        ) ?? '')),
      ];
      const csv = lines
        .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugify(generatedConfig.title)}.csv`);
      return;
    }

    const series = Array.isArray(generatedConfig?.series) ? generatedConfig.series : [];
    const isDimensionRows = previewRows.some((row) => row?.name || row?.dimension);
    const headers = [isDimensionRows ? 'Category' : 'Month', ...series.map((item: any) => item.label || item.field)];
    const lines = [
      headers,
      ...previewRows.map((row) => [
        isDimensionRows ? (row.name || row.dimension || '') : (row.month || row.monthDate || ''),
        ...series.map((item: any) => String(row?.value ?? row?.values?.[item.field] ?? '')),
      ]),
    ];
    const csv = lines
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugify(generatedConfig.title)}.csv`);
  };

  const exportReportPng = async () => {
    const svg = reportOutputRef.current?.querySelector('svg');
    if (!svg || !generatedConfig) {
      window.alert('PNG export is available for chart reports. Use CSV export for table reports.');
      return;
    }

    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1200, image.width || 1200);
      canvas.height = Math.max(700, image.height || 700);
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) downloadBlob(blob, `${slugify(generatedConfig.title)}.png`);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert('PNG export failed for this chart.');
    };
    image.src = url;
  };

  const exportReportPdf = () => {
    window.print();
  };

  const renameSavedReport = async (report: SavedCustomReport) => {
    const nextTitle = window.prompt('Rename report', report.title || 'Custom Report');
    if (!nextTitle || nextTitle.trim() === report.title) return;
    setSavedReportsError('');
    try {
      const response = await fetch('/api/custom-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          reportId: report.id,
          title: nextTitle.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to rename report');
      }
      if (selectedSavedReportId === report.id && generatedConfig) {
        setGeneratedConfig({ ...generatedConfig, title: data?.report?.title || nextTitle.trim() });
      }
      await loadSavedReports();
    } catch (error: any) {
      setSavedReportsError(error?.message || 'Failed to rename report');
    }
  };

  const deleteSavedReport = async (report: SavedCustomReport) => {
    if (!window.confirm(`Delete "${report.title || 'this report'}"?`)) return;
    setSavedReportsError('');
    try {
      const response = await fetch(`/api/custom-reports?companyId=${encodeURIComponent(selectedCompanyId)}&reportId=${encodeURIComponent(report.id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete report');
      }
      if (selectedSavedReportId === report.id) {
        setSelectedSavedReportId(null);
        setGeneratedConfig(null);
        setPreviewRows([]);
        setPreviewTableRows([]);
        setPreviewTableColumns([]);
      }
      await loadSavedReports();
    } catch (error: any) {
      setSavedReportsError(error?.message || 'Failed to delete report');
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 32px 48px' }}>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          .custom-report-print-area,
          .custom-report-print-area * {
            visibility: visible !important;
          }

          .custom-report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0.25in !important;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
          }

          .custom-report-no-print {
            display: none !important;
          }
        }
      `}</style>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#1F70C1', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          Custom Reports
        </div>
        <p style={{ fontSize: '16px', fontWeight: 700, color: '#475569', margin: '8px 0 0', lineHeight: 1.45 }}>
          Create reusable charts and tables from financial and operational data.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.42fr) minmax(0, 1.65fr)', gap: '18px' }}>
        <section style={{ gridColumn: 2, background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
          <div className="custom-report-no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setActiveTab('builder')}
              style={{
                padding: '0 4px 10px',
                border: 'none',
                borderBottom: activeTab === 'builder' ? '3px solid #1F70C1' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'builder' ? '#1F70C1' : '#64748b',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Report Builder
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              style={{
                padding: '0 4px 10px',
                border: 'none',
                borderBottom: activeTab === 'saved' ? '3px solid #1F70C1' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === 'saved' ? '#1F70C1' : '#64748b',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Saved Reports
            </button>
            {generatedConfig && (
              <button
                type="button"
                onClick={() => setActiveTab('view')}
                style={{
                  padding: '0 4px 10px',
                  border: 'none',
                  borderBottom: activeTab === 'view' ? '3px solid #1F70C1' : '3px solid transparent',
                  background: 'transparent',
                  color: activeTab === 'view' ? '#1F70C1' : '#64748b',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                View Report
              </button>
            )}
          </div>

          {activeTab === 'builder' && (
            <>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                AI report request
              </label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Example: Build a line chart for revenue, gross profit, and cash over the last 12 months."
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#1e293b',
                  minHeight: '82px',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={generateReportConfig}
                  disabled={isGenerating}
                  style={{
                    padding: '10px 14px',
                    border: 'none',
                    borderRadius: '8px',
                    background: isGenerating ? '#94a3b8' : '#1F70C1',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isGenerating ? 'Generating...' : 'Generate Report'}
                </button>
                <span style={{ alignSelf: 'center', fontSize: '12px', color: '#64748b' }}>
                  AI generation will create a validated report config before data is queried.
                </span>
              </div>
              {generationError && (
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>
                  {generationError}
                </div>
              )}
              {generatedConfig && (
                <div style={{ marginTop: '18px', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '260px', flex: '1 1 360px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                          Report Name
                        </label>
                        <input
                          type="text"
                          value={generatedConfig.title || ''}
                          onChange={(event) => setGeneratedConfig((prev: any) => prev ? { ...prev, title: event.target.value } : prev)}
                          placeholder="Report name"
                          style={{
                            width: '100%',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            fontSize: '15px',
                            fontWeight: 800,
                            color: '#1e293b',
                            background: '#fff',
                          }}
                        />
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          Type: {String(generatedConfig.chartType || '').replace('_', ' ')} | Source: {generatedConfig.dataSource || 'monthlyFinancial'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={saveGeneratedReport}
                        disabled={isSavingReport}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #1F70C1',
                          background: isSavingReport ? '#dbeafe' : '#eff6ff',
                          color: '#1F70C1',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: isSavingReport ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingReport ? 'Saving...' : selectedSavedReportId ? 'Update Saved Report' : 'Save Report'}
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '14px' }}>
                    {shouldShowReportDescription(generatedConfig.description) && (
                      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>{generatedConfig.description}</div>
                    )}
                    {Array.isArray(generatedConfig.notes) && generatedConfig.notes.length > 0 && (
                      <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                        {generatedConfig.notes.join(' ')}
                      </div>
                    )}
                    {previewError && (
                      <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: '13px', fontWeight: 700 }}>
                        {previewError}
                      </div>
                    )}
                    {!previewError && (
                      <CustomReportPreview config={generatedConfig} rows={previewRows} tableRows={previewTableRows} tableColumns={previewTableColumns} />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'saved' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', margin: 0, color: '#1e293b' }}>Saved Reports</h2>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Open a saved report to refresh it with current data.</div>
                </div>
                <button
                  type="button"
                  onClick={loadSavedReports}
                  disabled={isLoadingSavedReports}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#fff',
                    color: '#475569',
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isLoadingSavedReports ? 'not-allowed' : 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>
              {savedReportsError && (
                <div style={{ marginBottom: '10px', padding: '8px 10px', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', fontSize: '12px', fontWeight: 700 }}>
                  {savedReportsError}
                </div>
              )}
              {isLoadingSavedReports && savedReports.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '13px' }}>Loading saved reports...</div>
              )}
              {!isLoadingSavedReports && savedReports.length === 0 && !savedReportsError && (
                <div style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.4, padding: '18px', border: '1px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                  No saved reports yet. Generate a report, then save it here.
                </div>
              )}
              {savedReports.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) 120px 130px 150px 170px', gap: '12px', padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div>Report</div>
                    <div>Type</div>
                    <div>Date Created</div>
                    <div>Created By</div>
                    <div>Actions</div>
                  </div>
                  {savedReports.map((report) => (
                    <div key={report.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) 120px 130px 150px 170px', gap: '12px', alignItems: 'center', padding: '12px', borderBottom: '1px solid #e2e8f0', background: selectedSavedReportId === report.id ? '#eff6ff' : '#fff' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>{report.title || 'Custom Report'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>{report.dataSource || 'monthlyFinancial'}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', textTransform: 'capitalize' }}>{String(report.chartType || 'report').replace('_', ' ')}</div>
                      <div style={{ fontSize: '12px', color: '#334155' }}>{formatDate(report.createdAt)}</div>
                      <div style={{ fontSize: '12px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{createdByLabel(report)}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => openSavedReport(report)} style={{ border: '1px solid #1F70C1', borderRadius: '7px', background: '#eff6ff', color: '#1F70C1', padding: '5px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          Open
                        </button>
                        <button type="button" onClick={() => renameSavedReport(report)} style={{ border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff', color: '#475569', padding: '5px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          Rename
                        </button>
                        <button type="button" onClick={() => deleteSavedReport(report)} style={{ border: '1px solid #fecaca', borderRadius: '7px', background: '#fff', color: '#b91c1c', padding: '5px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'view' && generatedConfig && (
            <>
              <div className="custom-report-no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt(getReportRequest(generatedConfig));
                    setActiveTab('builder');
                  }}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#475569', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Edit
                </button>
                {selectedSavedReport && (
                  <button
                    type="button"
                    onClick={() => renameSavedReport(selectedSavedReport)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#475569', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Rename
                  </button>
                )}
                {selectedSavedReport && (
                  <button type="button" onClick={() => duplicateSavedReport(selectedSavedReport)} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#475569', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                    Duplicate
                  </button>
                )}
                <button type="button" onClick={exportReportPdf} style={{ border: '1px solid #1F70C1', borderRadius: '8px', background: '#eff6ff', color: '#1F70C1', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                  Export PDF
                </button>
                <button type="button" onClick={exportReportPng} style={{ border: '1px solid #1F70C1', borderRadius: '8px', background: '#eff6ff', color: '#1F70C1', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                  Export PNG
                </button>
                <button type="button" onClick={exportReportCsv} style={{ border: '1px solid #1F70C1', borderRadius: '8px', background: '#eff6ff', color: '#1F70C1', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                  Export CSV
                </button>
                {selectedSavedReport && (
                  <button type="button" onClick={() => deleteSavedReport(selectedSavedReport)} style={{ border: '1px solid #fecaca', borderRadius: '8px', background: '#fff', color: '#b91c1c', padding: '8px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
                    Delete
                  </button>
                )}
              </div>
              <div ref={reportOutputRef} className="custom-report-print-area">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                    Custom Report
                  </div>
                  <h2 style={{ fontSize: '24px', color: '#0f172a', margin: '0 0 6px', lineHeight: 1.2 }}>
                    {generatedConfig.title || 'Generated Report'}
                  </h2>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '16px' }}>
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Date Range</div>
                  <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, marginTop: '4px' }}>
                    {previewRows.length > 0 ? `${previewRows[0]?.month || 'Start'} - ${previewRows[previewRows.length - 1]?.month || 'End'}` : 'No data'}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Generated</div>
                  <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, marginTop: '4px' }}>
                    {formatDate(selectedSavedReport?.createdAt || new Date().toISOString())}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Data Source</div>
                  <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, marginTop: '4px', textTransform: 'capitalize' }}>
                    {String(generatedConfig.dataSource || selectedSavedReport?.dataSource || 'monthlyFinancial').replace(/([a-z])([A-Z])/g, '$1 $2')}
                  </div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Report Type</div>
                  <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 700, marginTop: '4px', textTransform: 'capitalize' }}>
                    {String(generatedConfig.chartType || 'report').replace('_', ' ')}
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', background: '#fff' }}>
                {previewError && (
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: '13px', fontWeight: 700 }}>
                    {previewError}
                  </div>
                )}
                {!previewError && (
                  <CustomReportPreview config={generatedConfig} rows={previewRows} tableRows={previewTableRows} tableColumns={previewTableColumns} />
                )}
              </div>

              {Array.isArray(generatedConfig.notes) && generatedConfig.notes.length > 0 && (
                <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: '#f8fafc', color: '#475569', fontSize: '12px', lineHeight: 1.5 }}>
                  <strong style={{ color: '#334155' }}>Notes: </strong>
                  {generatedConfig.notes.join(' ')}
                </div>
              )}
              </div>
            </>
          )}
        </section>

        <aside className="custom-report-no-print" style={{ gridColumn: 1, gridRow: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <section style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
            <h2 style={{ fontSize: '16px', margin: '0 0 10px', color: '#1e293b' }}>Report Types</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reportTypes.map((type) => {
                const active = selectedReportType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedReportType(type.id)}
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                      borderRadius: '10px',
                      border: active ? '2px solid #1F70C1' : '1px solid #e2e8f0',
                      background: active ? '#eff6ff' : '#f8fafc',
                      color: '#1e293b',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '3px' }}>{type.label}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>{type.description}</div>
                  </button>
                );
              })}
            </div>
          </section>

        </aside>
      </div>
    </div>
  );
}
