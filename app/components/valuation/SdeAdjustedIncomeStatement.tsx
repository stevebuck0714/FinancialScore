'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import type { SdeBucket } from '@/lib/sde/adjustment-line-items';
import { formatMonthShort, reportingMonthKeyUtc } from '@/lib/date-utils';

type MonthlyRow = Record<string, unknown>;

type AdjustmentAccount = {
  ownerAmount: number;
  lineItem: string | null;
  targetField: string;
  accountName: string;
  monthly?: Array<{ month: string; value: number }>;
};

type AdjustmentResponse = {
  companyName?: string | null;
  ltmWindow?: { start: string; end: string; months?: string[] };
  buckets?: Array<{ bucket: SdeBucket; accounts: AdjustmentAccount[] }>;
};

type SavedSettings = {
  sdeAnalysisTotals?: Record<string, number>;
  sdeManualInputs?: Record<string, unknown>;
};

type AdjustmentLine = {
  label: string;
  amount: number;
  targetField: string | null;
  /** Amount per report month column; sums to `amount`. */
  byMonth: number[];
};

type MonthlyReportRow = {
  label: string;
  values: number[];
  kind: 'line' | 'adjustment' | 'adjusted' | 'total' | 'adjustedTotal';
};

const sum = (months: MonthlyRow[], field: string) =>
  months.reduce((total, month) => total + (Number(month[field]) || 0), 0);

const spreadEvenly = (amount: number, count: number) =>
  count > 0 ? Array.from({ length: count }, () => amount / count) : [];

const postToMonth = (amount: number, count: number, index: number) =>
  Array.from({ length: count }, (_, i) => (i === index ? amount : 0));

const allocateByWeights = (amount: number, weights: number[]) => {
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  if (weightTotal === 0) return spreadEvenly(amount, weights.length);
  return weights.map((weight) => (amount * weight) / weightTotal);
};

const addSeries = (...series: number[][]) =>
  (series[0] || []).map((_, i) => series.reduce((total, values) => total + (values[i] || 0), 0));

const scaleSeries = (values: number[], factor: number) => values.map((value) => value * factor);

const seriesTotal = (values: number[]) => values.reduce((total, value) => total + value, 0);

const lineLabels: Record<string, string> = {
  ownerSalary: 'Owner salary',
  ownersDraw: 'Owner draws',
  marketReplacementSalary: 'Market replacement salary',
  ownerCompOther: 'Other owner compensation',
  personalTravel: 'Personal travel',
  familyPayroll: 'Family payroll',
  autoLeases: 'Auto leases',
  mealsEntertainment: 'Meals & entertainment',
  clubDues: 'Club dues',
  personalOther: 'Other personal expense',
  legalSettlements: 'Legal settlements',
  majorRepairs: 'Major repairs',
  consulting: 'Consulting',
  erpInstall: 'ERP installation',
  relocation: 'Relocation',
  nonRecurringOther: 'Other non-recurring expense',
  assetSales: 'Asset sales',
  insuranceProceeds: 'Insurance proceeds',
  oneTimeContract: 'One-time contract',
  oneTimeRevenueOther: 'Other one-time revenue',
};

const lineItemTargetFields: Record<string, string> = {
  ownerSalary: 'ownerBasePay',
  ownersDraw: 'ownersDraw',
  marketReplacementSalary: 'ownerBasePay',
  ownerCompOther: 'otherExpense',
  personalTravel: 'autoTravel',
  familyPayroll: 'payroll',
  autoLeases: 'autoTravel',
  mealsEntertainment: 'mealsEntertainment',
  clubDues: 'otherExpense',
  personalOther: 'otherExpense',
  legalSettlements: 'professionalFees',
  majorRepairs: 'otherExpense',
  consulting: 'professionalFees',
  erpInstall: 'otherExpense',
  relocation: 'otherExpense',
  nonRecurringOther: 'otherExpense',
  assetSales: 'revenue',
  insuranceProceeds: 'revenue',
  oneTimeContract: 'revenue',
  oneTimeRevenueOther: 'revenue',
};

const lineItemKeysByBucket: Record<SdeBucket, string[]> = {
  OWNER_COMP: ['ownerSalary', 'ownersDraw', 'marketReplacementSalary', 'ownerCompOther'],
  PERSONAL: ['personalTravel', 'familyPayroll', 'autoLeases', 'mealsEntertainment', 'clubDues', 'personalOther'],
  NON_RECURRING: ['legalSettlements', 'majorRepairs', 'consulting', 'erpInstall', 'relocation', 'nonRecurringOther'],
  ONE_TIME_REVENUE: ['assetSales', 'insuranceProceeds', 'oneTimeContract', 'oneTimeRevenueOther'],
};

function adjustmentLines(
  buckets: AdjustmentResponse['buckets'],
  totals: Record<string, number>,
  manualInputs: Record<string, unknown>,
  bucket: SdeBucket,
  savedTotalKey: string,
  savedToStatementMultiplier: number,
  columns: string[],
): AdjustmentLine[] {
  const lines: AdjustmentLine[] = [];
  const manualMonths = (manualInputs.manualEntryMonths || {}) as Record<string, string>;
  for (const account of buckets?.find((item) => item.bucket === bucket)?.accounts || []) {
    if (!account.lineItem) continue;
    const multiplier = bucket === 'OWNER_COMP' && account.lineItem === 'marketReplacementSalary' ? 1 : -1;
    const amount = (Number(account.ownerAmount) || 0) * multiplier;
    const valueByMonth = new Map((account.monthly || []).map((point) => [point.month, Math.abs(Number(point.value) || 0)]));
    lines.push({
      label: `${lineLabels[account.lineItem] || account.lineItem}${account.accountName ? ` — ${account.accountName}` : ''}`,
      amount,
      targetField: account.targetField || null,
      byMonth: allocateByWeights(amount, columns.map((month) => valueByMonth.get(month) || 0)),
    });
  }
  for (const key of lineItemKeysByBucket[bucket]) {
    if (!Object.prototype.hasOwnProperty.call(manualInputs, key)) continue;
    const raw = Number(manualInputs[key]) || 0;
    if (raw === 0) continue;
    const multiplier = bucket === 'OWNER_COMP' && key === 'marketReplacementSalary' ? 1 : -1;
    const monthIndex = columns.indexOf(manualMonths[key]);
    lines.push({
      label: `${lineLabels[key]} — manual adjustment`,
      amount: raw * multiplier,
      targetField: lineItemTargetFields[key] || null,
      byMonth: postToMonth(raw * multiplier, columns.length, monthIndex >= 0 ? monthIndex : columns.length - 1),
    });
  }
  const assigned = lines.reduce((total, line) => total + line.amount, 0);
  const hasSavedTotal = Object.prototype.hasOwnProperty.call(totals, savedTotalKey);
  const saved = (Number(totals[savedTotalKey]) || 0) * savedToStatementMultiplier;
  const remainder = saved - assigned;
  if (hasSavedTotal && Math.abs(remainder) >= 0.5) {
    lines.push({
      label: 'Manual / derived adjustment',
      amount: remainder,
      byMonth: spreadEvenly(remainder, columns.length),
      targetField:
        bucket === 'OWNER_COMP' ? 'ownerBasePay' :
        bucket === 'PERSONAL' ? 'autoTravel' :
        bucket === 'NON_RECURRING' ? 'otherExpense' :
        'revenue',
    });
  }
  return lines;
}

export default function SdeAdjustedIncomeStatement({
  companyId,
  monthly,
  refreshKey,
}: {
  companyId: string | null | undefined;
  monthly: MonthlyRow[];
  refreshKey: number;
}) {
  const money = useCompanyMoneyFormatter(companyId);
  const reportRef = useRef<HTMLDivElement>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentResponse | null>(null);
  const [settings, setSettings] = useState<SavedSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/sde/ebitda-adjustments?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' }),
      fetch(`/api/valuation-settings?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' }),
    ])
      .then(async ([adjustmentResponse, settingsResponse]) => {
        if (!adjustmentResponse.ok || !settingsResponse.ok) throw new Error('Unable to load saved QoE adjustments');
        return Promise.all([adjustmentResponse.json(), settingsResponse.json()]);
      })
      .then(([adjustmentData, settingsData]) => {
        if (cancelled) return;
        setError(null);
        setAdjustments(adjustmentData as AdjustmentResponse);
        setSettings(settingsData as SavedSettings);
      })
      .catch((loadError) => {
        if (!cancelled) setError(String(loadError?.message || loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  const model = useMemo(() => {
    const months = monthly.slice(-12);
    const rowKey = (row: MonthlyRow) =>
      reportingMonthKeyUtc((row.monthDate ?? row.month ?? null) as string | Date | null);
    const apiMonths = adjustments?.ltmWindow?.months || [];
    const columns = apiMonths.length > 0
      ? apiMonths
      : months.map((row, i) => rowKey(row) || `Month ${i + 1}`);
    const rowsByKey = new Map<string, MonthlyRow>();
    for (const row of monthly) {
      const key = rowKey(row);
      if (key) rowsByKey.set(key, row);
    }
    const columnRows = rowsByKey.size > 0
      ? columns.map((month) => rowsByKey.get(month) || {})
      : columns.map((_, i) => months[i] || {});
    const revenue = sum(columnRows, 'revenue');
    const cogs = sum(columnRows, 'cogsTotal');
    const expenses = sum(columnRows, 'expense');
    const interest = sum(columnRows, 'interestExpense');
    const taxes = sum(columnRows, 'stateIncomeTaxes') + sum(columnRows, 'federalIncomeTaxes');
    const depreciation = sum(columnRows, 'depreciationAmortization');
    const netIncomeAfterTax = revenue - cogs - expenses - taxes;
    const ebitda = netIncomeAfterTax + interest + taxes + depreciation;
    const totals = settings?.sdeAnalysisTotals || {};

    const manualInputs = settings?.sdeManualInputs || {};
    const owner = adjustmentLines(adjustments?.buckets, totals, manualInputs, 'OWNER_COMP', 'qoeOwnerSalaryAdjustment', -1, columns);
    const personal = adjustmentLines(adjustments?.buckets, totals, manualInputs, 'PERSONAL', 'qoePersonalAutoLease', -1, columns);
    const nonRecurring = adjustmentLines(adjustments?.buckets, totals, manualInputs, 'NON_RECURRING', 'qoeOneTimeExpenses', -1, columns);
    const oneTimeRevenue = adjustmentLines(adjustments?.buckets, totals, manualInputs, 'ONE_TIME_REVENUE', 'qoeOneTimeRevenue', 1, columns);
    const lineTotal = (lines: AdjustmentLine[]) => lines.reduce((total, line) => total + line.amount, 0);
    const derivedAdjustmentTotal =
      -lineTotal(owner) - lineTotal(personal) - lineTotal(nonRecurring) + lineTotal(oneTimeRevenue);
    const adjustmentTotal = Object.prototype.hasOwnProperty.call(totals, 'qoeTotalAdjustments')
      ? Number(totals.qoeTotalAdjustments) || 0
      : derivedAdjustmentTotal;
    const adjustedEbitda = Object.prototype.hasOwnProperty.call(totals, 'qualityOfEarnings')
      ? Number(totals.qualityOfEarnings) || 0
      : ebitda + adjustmentTotal;

    return {
      columns,
      columnRows,
      derivedAdjustmentTotal,
      revenue,
      cogs,
      expenses,
      cogsDetails: [
        ['COGS payroll', sum(columnRows, 'cogsPayroll'), 'cogsPayroll'],
        ['Owner pay', sum(columnRows, 'cogsOwnerPay'), 'cogsOwnerPay'],
        ['Contractors', sum(columnRows, 'cogsContractors'), 'cogsContractors'],
        ['Materials', sum(columnRows, 'cogsMaterials'), 'cogsMaterials'],
        ['Commissions', sum(columnRows, 'cogsCommissions'), 'cogsCommissions'],
        ['Other COGS', sum(columnRows, 'cogsOther'), 'cogsOther'],
      ] as Array<[string, number, string]>,
      operatingExpenseDetails: [
        ['Payroll', sum(columnRows, 'payroll'), 'payroll'],
        ['Owner pay', sum(columnRows, 'ownerBasePay'), 'ownerBasePay'],
        ['Benefits', sum(columnRows, 'benefits'), 'benefits'],
        ['Insurance', sum(columnRows, 'insurance'), 'insurance'],
        ['Professional fees', sum(columnRows, 'professionalFees'), 'professionalFees'],
        ['Subcontractors', sum(columnRows, 'subcontractors'), 'subcontractors'],
        ['Rent', sum(columnRows, 'rent'), 'rent'],
        ['Taxes & licenses', sum(columnRows, 'taxLicense'), 'taxLicense'],
        ['Phone & communications', sum(columnRows, 'phoneComm'), 'phoneComm'],
        ['Infrastructure', sum(columnRows, 'infrastructure'), 'infrastructure'],
        ['Auto & travel', sum(columnRows, 'autoTravel'), 'autoTravel'],
        ['Sales expense', sum(columnRows, 'salesExpense'), 'salesExpense'],
        ['Marketing', sum(columnRows, 'marketing'), 'marketing'],
        ['Training & certifications', sum(columnRows, 'trainingCert'), 'trainingCert'],
        ['Meals & entertainment', sum(columnRows, 'mealsEntertainment'), 'mealsEntertainment'],
        ['Other expense', sum(columnRows, 'otherExpense'), 'otherExpense'],
      ] as Array<[string, number, string]>,
      grossProfit: revenue - cogs,
      operatingIncome: revenue - cogs - expenses,
      interest,
      taxes,
      depreciation,
      ebitda,
      owner,
      personal,
      nonRecurring,
      oneTimeRevenue,
      adjustmentTotal,
      adjustedEbitda,
    };
  }, [adjustments?.buckets, adjustments?.ltmWindow?.months, monthly, settings?.sdeAnalysisTotals, settings?.sdeManualInputs]);

  const [view, setView] = useState<'ttm' | 'monthly'>('ttm');
  const fmt = (value: number) => money.fmt(value, 0);
  const signed = (value: number) => `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))}`;
  const totalOf = (lines: AdjustmentLine[]) => lines.reduce((total, line) => total + line.amount, 0);
  const operatingAdjustments = [...model.owner, ...model.personal, ...model.nonRecurring];
  const isCogsLine = (line: AdjustmentLine) => String(line.targetField || '').toLowerCase().startsWith('cogs');
  const cogsAdjustment = totalOf(operatingAdjustments.filter(isCogsLine));
  const operatingExpenseAdjustment = totalOf(operatingAdjustments) - cogsAdjustment;
  const adjustedRevenue = model.revenue + totalOf(model.oneTimeRevenue);
  const adjustedCogs = model.cogs + cogsAdjustment;
  const adjustedExpenses = model.expenses + operatingExpenseAdjustment;
  const detailedExpenseFields = new Set(
    [...model.cogsDetails, ...model.operatingExpenseDetails].map(([, , field]) => field.toLowerCase()),
  );
  const adjustmentLinesFor = (field: string, lines: AdjustmentLine[]) =>
    lines.filter((line) => {
      const target = String(line.targetField || '').toLowerCase();
      if (target === field.toLowerCase()) return true;
      return field === 'otherExpense' && !target.startsWith('cogs') && !detailedExpenseFields.has(target);
    });
  const unclassifiedCogsAdjustments = operatingAdjustments.filter((line) =>
    isCogsLine(line) && !detailedExpenseFields.has(String(line.targetField || '').toLowerCase()),
  );

  const monthCount = model.columns.length;
  const monthLabels = model.columns.map((month) => (/^\d{4}-\d{2}$/.test(month) ? formatMonthShort(month) : month));
  const zeroSeries = Array.from({ length: monthCount }, () => 0);
  const reportedSeries = (field: string) => model.columnRows.map((row) => Number(row[field]) || 0);
  const lineSeries = (lines: AdjustmentLine[]) => addSeries(zeroSeries, ...lines.map((line) => line.byMonth));
  const monthlyRows: MonthlyReportRow[] = [];
  const pushWithAdjustments = (label: string, values: number[], lines: AdjustmentLine[], isTotal = false) => {
    monthlyRows.push({ label, values, kind: isTotal ? 'total' : 'line' });
    for (const line of lines) monthlyRows.push({ label: line.label, values: line.byMonth, kind: 'adjustment' });
    if (lines.length > 0) {
      monthlyRows.push({ label: `Adjusted ${label.toLowerCase()}`, values: addSeries(values, lineSeries(lines)), kind: isTotal ? 'adjustedTotal' : 'adjusted' });
    }
  };
  const pushTotal = (label: string, values: number[], adjustment: number[]) => {
    monthlyRows.push({ label, values, kind: 'total' });
    if (adjustment.some((value) => Math.abs(value) >= 0.005)) {
      monthlyRows.push({ label: `Adjusted ${label.toLowerCase()}`, values: addSeries(values, adjustment), kind: 'adjustedTotal' });
    }
  };
  const pushDetails = (details: Array<[string, number, string]>) => {
    for (const [label, , field] of details) {
      const lines = adjustmentLinesFor(field, operatingAdjustments);
      const values = reportedSeries(field);
      if (lines.length === 0 && values.every((value) => value === 0)) continue;
      pushWithAdjustments(label, values, lines);
    }
  };
  const revenueSeries = reportedSeries('revenue');
  const cogsSeries = reportedSeries('cogsTotal');
  const expenseSeries = reportedSeries('expense');
  const interestSeries = reportedSeries('interestExpense');
  const taxSeries = addSeries(reportedSeries('stateIncomeTaxes'), reportedSeries('federalIncomeTaxes'));
  const depreciationSeries = reportedSeries('depreciationAmortization');
  const revenueAdjustmentSeries = lineSeries(model.oneTimeRevenue);
  const cogsAdjustmentSeries = lineSeries(operatingAdjustments.filter(isCogsLine));
  const expenseAdjustmentSeries = lineSeries(operatingAdjustments.filter((line) => !isCogsLine(line)));
  const grossProfitSeries = addSeries(revenueSeries, scaleSeries(cogsSeries, -1));
  const grossProfitAdjustmentSeries = addSeries(revenueAdjustmentSeries, scaleSeries(cogsAdjustmentSeries, -1));
  const operatingIncomeSeries = addSeries(grossProfitSeries, scaleSeries(expenseSeries, -1));
  const operatingIncomeAdjustmentSeries = addSeries(grossProfitAdjustmentSeries, scaleSeries(expenseAdjustmentSeries, -1));
  const ebitdaSeries = addSeries(operatingIncomeSeries, interestSeries, depreciationSeries);
  const otherQoeAdjustment = model.adjustmentTotal - model.derivedAdjustmentTotal;
  const otherQoeSeries = Math.abs(otherQoeAdjustment) >= 0.5 ? spreadEvenly(otherQoeAdjustment, monthCount) : zeroSeries;
  const qoeAdjustmentSeries = addSeries(operatingIncomeAdjustmentSeries, otherQoeSeries);

  pushWithAdjustments('Revenue', revenueSeries, model.oneTimeRevenue, true);
  pushDetails(model.cogsDetails);
  pushTotal('Cost of goods sold', cogsSeries, cogsAdjustmentSeries);
  for (const line of unclassifiedCogsAdjustments) monthlyRows.push({ label: line.label, values: line.byMonth, kind: 'adjustment' });
  pushTotal('Gross profit', grossProfitSeries, grossProfitAdjustmentSeries);
  pushDetails(model.operatingExpenseDetails);
  pushTotal('Operating expenses', expenseSeries, expenseAdjustmentSeries);
  pushTotal('Operating income', operatingIncomeSeries, operatingIncomeAdjustmentSeries);
  monthlyRows.push({ label: 'Interest expense', values: interestSeries, kind: 'line' });
  monthlyRows.push({ label: 'Income taxes', values: taxSeries, kind: 'line' });
  monthlyRows.push({ label: 'Depreciation & amortization', values: depreciationSeries, kind: 'line' });
  monthlyRows.push({ label: 'EBITDA', values: ebitdaSeries, kind: 'total' });
  if (otherQoeSeries !== zeroSeries) {
    monthlyRows.push({ label: 'Other saved QoE adjustments (spread evenly)', values: otherQoeSeries, kind: 'adjustment' });
  }
  monthlyRows.push({ label: 'Total QoE adjustments', values: qoeAdjustmentSeries, kind: 'adjustment' });
  monthlyRows.push({ label: 'Adjusted EBITDA', values: addSeries(ebitdaSeries, qoeAdjustmentSeries), kind: 'adjustedTotal' });

  const row = (label: string, actual: number, adjustment = 0, adjusted = actual + adjustment, emphasis = false) => (
    <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1fr) 150px 150px 170px', gap: '12px', padding: '7px 10px', borderTop: '1px solid #e2e8f0', fontSize: '13px', fontWeight: emphasis ? 700 : 400, background: emphasis ? '#eff6ff' : 'transparent' }}>
      <span style={{ color: emphasis ? '#1e3a8a' : '#334155' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{fmt(actual)}</span>
      <span style={{ textAlign: 'right', color: adjustment === 0 ? '#64748b' : adjustment > 0 ? '#059669' : '#dc2626' }}>{adjustment === 0 ? '—' : signed(adjustment)}</span>
      <span style={{ textAlign: 'right', color: emphasis ? '#1e3a8a' : '#334155' }}>{fmt(adjusted)}</span>
    </div>
  );
  const adjustmentRow = (line: AdjustmentLine) => (
    <div key={line.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1fr) 150px 150px 170px', gap: '12px', padding: '5px 10px 5px 28px', fontSize: '12px', color: '#475569' }}>
      <span>{line.label}</span><span /><span style={{ textAlign: 'right', color: line.amount > 0 ? '#059669' : '#dc2626' }}>{signed(line.amount)}</span><span />
    </div>
  );
  const monthlyRowBackground = (kind: MonthlyReportRow['kind']) =>
    kind === 'total' ? '#eff6ff' : kind === 'adjustedTotal' ? '#dbeafe' : '#ffffff';
  const monthlyCell = (kind: MonthlyReportRow['kind'], value: number) => {
    if (kind !== 'adjustment') return fmt(value);
    return Math.abs(value) < 0.5 ? '—' : signed(value);
  };
  const monthlyCellColor = (kind: MonthlyReportRow['kind'], value: number) => {
    if (kind === 'adjustment') return Math.abs(value) < 0.5 ? '#94a3b8' : value > 0 ? '#059669' : '#dc2626';
    return kind === 'line' ? '#334155' : '#1e3a8a';
  };

  const companyName = adjustments?.companyName || 'Company';
  const periodLabel = adjustments?.ltmWindow
    ? `${adjustments.ltmWindow.start} through ${adjustments.ltmWindow.end}`
    : 'Trailing 12 Months';
  const safeCompanyName = companyName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'company';
  const downloadCsv = () => {
    const csvRows: Array<Array<string | number>> = view === 'monthly'
      ? [
        [companyName],
        ['QoE Adjusted Income Statement — Monthly'],
        ['Trailing 12-month period', periodLabel],
        [],
        ['Line item', ...monthLabels, 'TTM Total'],
        ...monthlyRows.map((item) => [
          item.kind === 'adjustment' ? `  ${item.label}` : item.label,
          ...item.values.map((value) => Math.round(value * 100) / 100),
          Math.round(seriesTotal(item.values) * 100) / 100,
        ]),
      ]
      : [
        [companyName],
        ['QoE Adjusted Income Statement'],
        ['Trailing 12-month period', periodLabel],
        [],
        ['Line item', 'Trailing 12 Months', 'QoE adjustment', 'Adjusted TTM'],
        ['Revenue', model.revenue, totalOf(model.oneTimeRevenue), adjustedRevenue],
        ...model.oneTimeRevenue.map((line) => [line.label, '', line.amount, '']),
        ...model.cogsDetails.flatMap(([label, amount, field]) => {
          const lines = adjustmentLinesFor(field, operatingAdjustments);
          return [[label, amount, totalOf(lines), amount + totalOf(lines)], ...lines.map((line) => [`  ${line.label}`, '', line.amount, ''])];
        }),
        ['Cost of goods sold', model.cogs, cogsAdjustment, adjustedCogs],
        ...model.operatingExpenseDetails.flatMap(([label, amount, field]) => {
          const lines = adjustmentLinesFor(field, operatingAdjustments);
          return [[label, amount, totalOf(lines), amount + totalOf(lines)], ...lines.map((line) => [`  ${line.label}`, '', line.amount, ''])];
        }),
        ['Operating expenses', model.expenses, operatingExpenseAdjustment, adjustedExpenses],
        ['EBITDA', model.ebitda, model.adjustmentTotal, model.adjustedEbitda],
      ];
    const csv = csvRows
      .map((columns) => columns.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeCompanyName}-${view === 'monthly' ? 'monthly-' : ''}adjusted-income-statement.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const content = reportRef.current?.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!content || !printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`<!doctype html>
      <html><head><title>QoE Adjusted Income Statement</title>
      <style>
        @page { ${view === 'monthly' ? 'size: landscape; margin: 0.3in;' : 'margin: 0.45in;'} }
        * { box-sizing: border-box; }
        body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .no-print { display: none !important; }
        .sde-adjusted-income-statement { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
        .sde-adjusted-income-statement * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sde-monthly-scroll { overflow: visible !important; }
        .sde-monthly-table { min-width: 0 !important; width: 100%; font-size: 8px !important; }
        .sde-monthly-table th, .sde-monthly-table td { padding: 3px 4px !important; position: static !important; }
      </style></head><body><div class="sde-adjusted-income-statement">${content}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div ref={reportRef} className="sde-adjusted-income-statement" style={{ background: 'white', borderRadius: '10px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sde-adjusted-income-statement { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
          .sde-adjusted-income-statement * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '18px', borderBottom: '2px solid #1e3a8a', paddingBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>SDE Valuation</div>
          <h2 style={{ margin: '4px 0 0', fontSize: '24px', color: '#0f172a' }}>{companyName}</h2>
          <div style={{ marginTop: '3px', fontSize: '16px', fontWeight: 600, color: '#334155' }}>
            QoE Adjusted Income Statement{view === 'monthly' ? ' — Monthly' : ''}
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={downloadCsv} style={{ padding: '8px 12px', border: '1px solid #94a3b8', borderRadius: '6px', color: '#334155', background: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Download CSV</button>
          <button type="button" onClick={printReport} style={{ padding: '8px 12px', border: '1px solid #1d4ed8', borderRadius: '6px', color: 'white', background: '#1d4ed8', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Print</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {view === 'monthly'
            ? `Monthly (${periodLabel}). Account adjustments follow each account's monthly activity; manual entries post to the month chosen on the Quality of Earnings tab; other saved adjustments are spread evenly.`
            : `Trailing 12 months (${periodLabel}). Adjustments reflect saved Quality of Earnings inputs only.`}
        </div>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {([
            { id: 'ttm', label: 'Trailing 12 Months' },
            { id: 'monthly', label: 'Monthly' },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              style={{
                border: '1px solid #cbd5e1',
                background: view === option.id ? '#dbeafe' : '#f8fafc',
                color: view === option.id ? '#1d4ed8' : '#334155',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div style={{ marginBottom: '12px', color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
      {view === 'monthly' ? (
        <div className="sde-monthly-scroll" style={{ overflowX: 'auto' }}>
          <table className="sde-monthly-table" style={{ borderCollapse: 'collapse', minWidth: '1500px', width: '100%', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569' }}>
                <th style={{ position: 'sticky', left: 0, zIndex: 1, background: '#f8fafc', textAlign: 'left', padding: '8px 10px', minWidth: '240px' }}>Line item</th>
                {monthLabels.map((label, i) => (
                  <th key={`${model.columns[i]}-${i}`} style={{ textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>{label}</th>
                ))}
                <th style={{ textAlign: 'right', padding: '8px 10px', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0' }}>TTM Total</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((item, rowIndex) => {
                const background = monthlyRowBackground(item.kind);
                const bold = item.kind === 'total' || item.kind === 'adjustedTotal';
                const total = seriesTotal(item.values);
                return (
                  <tr key={`${item.label}-${rowIndex}`} style={{ background, borderTop: item.kind === 'adjustment' ? 'none' : '1px solid #e2e8f0', fontWeight: bold ? 700 : item.kind === 'adjusted' ? 600 : 400 }}>
                    <td style={{ position: 'sticky', left: 0, background, padding: item.kind === 'adjustment' ? '4px 10px 4px 26px' : '6px 10px', color: item.kind === 'adjustment' ? '#475569' : item.kind === 'line' ? '#334155' : '#1e3a8a', fontSize: item.kind === 'adjustment' ? '11px' : '12px' }}>
                      {item.label}
                    </td>
                    {item.values.map((value, i) => (
                      <td key={i} style={{ textAlign: 'right', padding: item.kind === 'adjustment' ? '4px 8px' : '6px 8px', whiteSpace: 'nowrap', color: monthlyCellColor(item.kind, value), fontSize: item.kind === 'adjustment' ? '11px' : '12px' }}>
                        {monthlyCell(item.kind, value)}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', padding: item.kind === 'adjustment' ? '4px 10px' : '6px 10px', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0', color: monthlyCellColor(item.kind, total), fontWeight: 700, fontSize: item.kind === 'adjustment' ? '11px' : '12px' }}>
                      {monthlyCell(item.kind, total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', minWidth: '720px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 1fr) 150px 150px 170px', gap: '12px', padding: '8px 10px', background: '#f8fafc', color: '#475569', fontSize: '12px', fontWeight: 700 }}>
            <span>Line item</span><span style={{ textAlign: 'right' }}>Trailing 12 Months</span><span style={{ textAlign: 'right' }}>QoE adjustment</span><span style={{ textAlign: 'right' }}>Adjusted TTM</span>
          </div>
          {row('Revenue', model.revenue, totalOf(model.oneTimeRevenue), adjustedRevenue, true)}
          {model.oneTimeRevenue.map(adjustmentRow)}
          {model.cogsDetails.filter(([, amount, field]) => amount !== 0 || adjustmentLinesFor(field, operatingAdjustments).length > 0).flatMap(([label, amount, field]) => {
            const adjustmentsForLine = adjustmentLinesFor(field, operatingAdjustments);
            return [row(label, amount, totalOf(adjustmentsForLine), amount + totalOf(adjustmentsForLine)), ...adjustmentsForLine.map(adjustmentRow)];
          })}
          {row('Cost of goods sold', model.cogs, cogsAdjustment, adjustedCogs, true)}
          {unclassifiedCogsAdjustments.map(adjustmentRow)}
          {row('Gross profit', model.grossProfit, totalOf(model.oneTimeRevenue) - cogsAdjustment, adjustedRevenue - adjustedCogs, true)}
          {model.operatingExpenseDetails.filter(([, amount, field]) => amount !== 0 || adjustmentLinesFor(field, operatingAdjustments).length > 0).flatMap(([label, amount, field]) => {
            const adjustmentsForLine = adjustmentLinesFor(field, operatingAdjustments);
            return [row(label, amount, totalOf(adjustmentsForLine), amount + totalOf(adjustmentsForLine)), ...adjustmentsForLine.map(adjustmentRow)];
          })}
          {row('Operating expenses', model.expenses, operatingExpenseAdjustment, adjustedExpenses, true)}
          {row('Operating income', model.operatingIncome, totalOf(model.oneTimeRevenue) - cogsAdjustment - operatingExpenseAdjustment, adjustedRevenue - adjustedCogs - adjustedExpenses, true)}
          {row('Interest expense', model.interest)}
          {row('Income taxes', model.taxes)}
          {row('Depreciation & amortization', model.depreciation)}
          {row('EBITDA', model.ebitda, model.adjustmentTotal, model.adjustedEbitda, true)}
        </div>
      )}
    </div>
  );
}
