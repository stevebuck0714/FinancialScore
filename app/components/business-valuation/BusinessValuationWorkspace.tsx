'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import {
  ENGAGEMENT_STATUS_LABELS,
  INDEPENDENCE_FIELDS,
  INDEPENDENCE_STATEMENTS,
} from '@/lib/business-valuation/engagement';
import { FISCAL_YEAR_END_MONTHS } from '@/lib/company/fiscal-year-end';
import { CARD, button, cardSubtitle, cardTitle, fieldLabel, formColumns, formRow, formRowLabel, groupTitle, input, money, td, th } from './styles';
import DealTermsTab from './DealTermsTab';
import EarningsBaseTab from './EarningsBaseTab';
import IncomeApproachTab from './IncomeApproachTab';
import AssetApproachTab from './AssetApproachTab';
import MarketApproachTab from './MarketApproachTab';
import DiligenceTab from './DiligenceTab';
import OutlookTab from './OutlookTab';
import BenchmarkingTab from './BenchmarkingTab';
import DebtServiceTab from './DebtServiceTab';
import ReconciliationTab from './ReconciliationTab';
import ReportTab from './ReportTab';

type Props = { companyId: string };
type Tab =
  | 'engagement'
  | 'snapshot'
  | 'earnings-base'
  | 'market-approach'
  | 'income-approach'
  | 'asset-approach'
  | 'deal-terms'
  | 'diligence'
  | 'outlook'
  | 'benchmarking'
  | 'debt-service'
  | 'reconciliation'
  | 'report';

const MONTH_NAMES = FISCAL_YEAR_END_MONTHS;
const FISCAL_YEAR_SOURCE_LABELS: Record<string, string> = {
  COMPANY_PROFILE: 'company profile',
  QOE_ENGAGEMENT_TRACKER: 'QoE Engagement Tracker',
  CASH_PROOF: 'Cash Proof',
  DEFAULT: 'not set in the company profile',
};
const CHANGE_FIELD_LABELS: Record<string, string> = {
  purpose: 'Purpose',
  standardOfValue: 'Standard of value',
  premiseOfValue: 'Premise of value',
  ownershipBasis: 'Ownership basis',
  transactionStructure: 'Transaction structure',
  reportType: 'Report type',
  interestPercent: 'Interest valued (%)',
  valuationDate: 'Valuation date',
  engagementLetterDate: 'Engagement letter date',
  lenderName: 'Lender',
  appraiserName: 'Appraiser',
  reviewerName: 'Reviewer',
  priorServicesNote: 'Prior services',
  independenceConfirmed: 'Independence',
  snapshot: 'Data snapshot',
  feeNotContingent: 'Fee not contingent',
  noInterestInDeal: 'No interest in the deal',
  notActingAsBroker: 'Not acting as broker',
  priorServicesDisclosed: 'Prior services disclosed',
  appraisal: 'Outside appraisal',
  'deal.purchasePrice': 'Deal: purchase price',
  'deal.inventoryAmount': 'Deal: inventory in price',
  'deal.workingCapitalTarget': 'Deal: working capital target',
  'deal.sellerNoteAmount': 'Deal: seller note amount',
  'deal.sellerNoteRatePct': 'Deal: seller note rate',
  'deal.sellerNoteTermMonths': 'Deal: seller note term',
  'deal.sellerNoteStandby': 'Deal: seller note standby',
  'deal.assumedLiabilities': 'Deal: liabilities assumed',
  'deal.assumedLiabilitiesNote': 'Deal: assumed liabilities description',
  'deal.leasesAssumedNote': 'Deal: leases assumed',
  'deal.dealDocumentType': 'Deal: document type',
  'deal.dealDocumentId': 'Deal: data room file',
  'deal.dealDocumentDate': 'Deal: document date',
  'earnings.source': 'Earnings: source',
  'earnings.period': 'Earnings: period',
  'earnings.weights': 'Earnings: period weights',
  'earnings.reason': 'Earnings: reason',
  'earnings.ownerActualComp': 'Earnings: actual owner pay',
  'earnings.ownerMarketSalary': 'Earnings: market salary',
  'earnings.ownerOccupationCode': 'Earnings: market role',
  'earnings.ownerMarketArea': 'Earnings: market area',
  'earnings.ownerMarketStatistic': 'Earnings: market statistic',
  'earnings.ownerMarketSource': 'Earnings: market salary source',
  'earnings.normalizations': 'Earnings: normalizations',
  'earnings.normalCapex': 'Earnings: normal capex',
  'earnings.capexNote': 'Earnings: capex support',
  'earnings.normalWorkingCapitalPct': 'Earnings: normal working capital %',
  'earnings.workingCapitalNote': 'Earnings: working capital support',
  'income.earningsMeasure': 'Income: earnings measure',
  'income.taxRatePct': 'Income: tax rate',
  'income.riskFreeRatePct': 'Income: risk-free rate',
  'income.riskFreeAsOf': 'Income: risk-free rate date',
  'income.riskFreeSource': 'Income: risk-free rate source',
  'income.equityRiskPremiumPct': 'Income: equity risk premium',
  'income.equityRiskPremiumSource': 'Income: equity risk premium source',
  'income.sizePremiumPct': 'Income: size premium',
  'income.sizePremiumSource': 'Income: size premium source',
  'income.industryPremiumPct': 'Income: industry premium',
  'income.industryPremiumSource': 'Income: industry premium source',
  'income.riskFactors': 'Income: company-specific risk',
  'income.longTermGrowthPct': 'Income: long-term growth',
  'income.growthSource': 'Income: growth source',
  'income.addExcessWorkingCapital': 'Income: add excess working capital',
  'asset.adjustments': 'Asset: balance sheet adjustments',
  'asset.useAppraisals': 'Asset: use outside appraisals',
  'asset.realEstateOwnedByCompany': 'Asset: real estate owned by the company',
  'asset.intangibles': 'Asset: identified intangibles',
  'asset.notes': 'Asset: notes',
  'diligence.interviewDate': 'Diligence: interview date',
  'diligence.interviewAttendees': 'Diligence: interview attendees',
  'diligence.interviewMethod': 'Diligence: interview method',
  'diligence.responses': 'Diligence: interview notes',
  'diligence.siteVisitDate': 'Diligence: site visit date',
  'diligence.siteVisitAttendees': 'Diligence: site visit attendees',
  'diligence.siteVisitNotes': 'Diligence: site visit notes',
  'diligence.reliedOnDocumentIds': 'Diligence: documents relied on',
  'diligence.repLetterStatus': 'Diligence: representation letter status',
  'diligence.repLetterSignerName': 'Diligence: representation letter signer',
  'diligence.repLetterSignerTitle': 'Diligence: signer title',
  'diligence.repLetterSentDate': 'Diligence: letter sent',
  'diligence.repLetterSignedDate': 'Diligence: letter signed',
  'diligence.repLetterDocumentId': 'Diligence: signed letter file',
  'market.dataSource': 'Market: data source',
  'market.dataEdition': 'Market: edition',
  'market.searchCriteria': 'Market: search criteria',
  'market.priceExcludesInventory': 'Market: prices exclude inventory',
  'market.notes': 'Market: comparability notes',
  'market.comparables': 'Market: comparable sales',
  'outlook.national': 'Outlook: national economy',
  'outlook.regional': 'Outlook: regional economy',
  'outlook.industry': 'Outlook: industry',
  'outlook.published': 'Outlook: published outlooks',
  'outlook.indicators': 'Outlook: economic indicators',
  'outlook.approved': 'Outlook: approval',
  'benchmark.industryCode': 'Benchmarking: industry code',
  'benchmark.sizeBand': 'Benchmarking: size band',
  'benchmark.rmaEdition': 'Benchmarking: RMA edition',
  'benchmark.rmaIndustry': 'Benchmarking: RMA industry',
  'benchmark.rmaSizeBand': 'Benchmarking: RMA size band',
  'benchmark.rmaValues': 'Benchmarking: RMA figures',
  'benchmark.notes': 'Benchmarking: notes',
  'debt.downPaymentPct': 'Debt service: down payment',
  'debt.sbaRatePct': 'Debt service: SBA rate',
  'debt.sbaTermMonths': 'Debt service: SBA term',
  'debt.realEstateRatePct': 'Debt service: real estate rate',
  'debt.realEstateTermMonths': 'Debt service: real estate term',
  'debt.guaranteeFeePct': 'Debt service: guarantee fee',
  'debt.financeGuaranteeFee': 'Debt service: fee financed',
  'debt.closingCosts': 'Debt service: closing costs',
  'debt.workingCapitalFinanced': 'Debt service: working capital',
  'debt.requiredDscr': 'Debt service: required coverage',
  'debt.existingLoans': 'Debt service: existing loans',
  'debt.notes': 'Debt service: notes',
  'reconciliation.roundingIncrement': 'Reconciliation: rounding',
  'reconciliation.conclusionNote': 'Reconciliation: narrative',
  'reconciliation.concluded': 'Reconciliation: concluded value',
};
const APPROACH_LABELS: Record<string, string> = { MARKET: 'market', INCOME: 'income', ASSET: 'asset' };
const MULTIPLE_LABELS: Record<string, string> = { PRICE_TO_SDE: 'price to SDE', PRICE_TO_EBITDA: 'price to EBITDA', PRICE_TO_REVENUE: 'price to revenue' };
const changeFieldLabel = (field: string) => {
  if (CHANGE_FIELD_LABELS[field]) return CHANGE_FIELD_LABELS[field];
  const approach = field.match(/^reconciliation\.(weight|reason)\.(\w+)$/);
  if (approach) return `Reconciliation: ${APPROACH_LABELS[approach[2]] || approach[2]} approach ${approach[1]}`;
  const multiple = field.match(/^market\.(multiple|weight|reason)\.(\w+)$/);
  if (multiple) return `Market: ${MULTIPLE_LABELS[multiple[2]] || multiple[2]} ${multiple[1] === 'multiple' ? 'selected multiple' : multiple[1]}`;
  if (field.startsWith('deal.included.')) return `Deal: ${field.slice('deal.included.'.length)} included`;
  return field;
};
const SUMMARY_ROWS: Array<{ key: string; label: string }> = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogsTotal', label: 'Cost of goods sold' },
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'expense', label: 'Operating expenses' },
  { key: 'operatingIncome', label: 'Operating income' },
  { key: 'depreciationAmortization', label: 'Depreciation & amortization' },
  { key: 'interestExpense', label: 'Interest expense' },
  { key: 'ebitda', label: 'EBITDA' },
];
const BALANCE_ROWS: Array<{ key: string; label: string }> = [
  { key: 'totalAssets', label: 'Total assets' },
  { key: 'totalLiab', label: 'Total liabilities' },
  { key: 'totalEquity', label: 'Total equity' },
];
const QOE_TOTAL_ROWS: Array<{ key: string; label: string }> = [
  { key: 'ttmEbitdaAnalysis', label: 'TTM EBITDA (reported)' },
  { key: 'qoeTotalAdjustments', label: 'Total QoE adjustments' },
  { key: 'qualityOfEarnings', label: 'Quality of Earnings (adjusted EBITDA)' },
];

const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');
const optionLabel = (options: Array<{ value: string; label: string }> | undefined, value: string | null) =>
  options?.find((option) => option.value === value)?.label || value || '—';

export default function BusinessValuationWorkspace({ companyId }: Props) {
  const [tab, setTab] = useState<Tab>('engagement');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (engagementId?: string | null) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyId });
      if (engagementId) query.set('engagementId', engagementId);
      const response = await fetch(`/api/business-valuation?${query}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to load Business Valuation');
      setData(json);
      setPending({});
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (label: string, body: Record<string, unknown>): Promise<boolean> => {
    setSaving(label);
    try {
      const response = await fetch('/api/business-valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, engagementId: data?.engagement?.id, ...body }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to save Business Valuation');
      setData(json);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setSaving(null);
    }
  };

  const engagement = data?.engagement || null;
  const locked = engagement?.status === 'FINAL';
  const hasPending = Object.keys(pending).length > 0;
  const value = (field: string) => (field in pending ? pending[field] : engagement?.[field]);
  const edit = (field: string, next: unknown) => {
    setSaved(false);
    setPending((current) => {
      const original = field === 'valuationDate' || field === 'engagementLetterDate' ? dateOnly(engagement?.[field]) : engagement?.[field] ?? '';
      const copy = { ...current };
      if (String(next ?? '') === String(original ?? '')) delete copy[field];
      else copy[field] = next;
      return copy;
    });
  };
  const saveEngagement = async () => {
    if (await run('engagement', { action: 'update-engagement', ...pending })) {
      setPending({});
      setSaved(true);
    }
  };

  const snapshot = data?.latestSnapshot?.data || null;
  const confirmBlocker = !engagement || locked || engagement.independenceConfirmedAt
    ? null
    : !INDEPENDENCE_FIELDS.every((field) => Boolean(value(field)))
      ? 'Check all four statements.'
      : !String(value('priorServicesNote') || '').trim()
        ? 'Describe prior Corelytics services, or enter "None".'
        : null;
  const confirmIndependence = async () => {
    if (hasPending) {
      if (!(await run('independence', { action: 'update-engagement', ...pending }))) return;
      setPending({});
    }
    await run('independence', { action: 'confirm-independence' });
  };
  const snapshotBlocker = !engagement
    ? 'Create an engagement first.'
    : !engagement.valuationDate
      ? 'Enter the Valuation date at the top of Scope of the engagement on the Engagement tab, then select Save.'
      : !engagement.independenceConfirmedAt
        ? 'Confirm independence on the Engagement tab.'
        : null;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'engagement', label: 'ENGAGEMENT' },
    { id: 'snapshot', label: 'DATA SNAPSHOT' },
    { id: 'earnings-base', label: 'EARNINGS BASE' },
    { id: 'market-approach', label: 'MARKET APPROACH' },
    { id: 'income-approach', label: 'INCOME APPROACH' },
    { id: 'asset-approach', label: 'ASSET APPROACH' },
    { id: 'deal-terms', label: 'DEAL TERMS' },
    { id: 'diligence', label: 'DILIGENCE' },
    { id: 'outlook', label: 'OUTLOOK' },
    { id: 'benchmarking', label: 'BENCHMARKING' },
    { id: 'debt-service', label: 'DEBT SERVICE' },
    { id: 'reconciliation', label: 'RECONCILIATION' },
    { id: 'report', label: 'REPORT' },
  ];

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const rowInput: CSSProperties = { ...input, flex: 1, minWidth: 0, cursor: locked ? 'not-allowed' : 'pointer' };

  const select = (field: string, label: string) =>
    row(
      label,
      <select value={String(value(field) ?? '')} disabled={locked} onChange={(event) => edit(field, event.target.value)} style={rowInput}>
        {(data?.options?.[field] || []).map((option: { value: string; label: string }) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>,
    );

  const staffSelect = (field: 'appraiserUserId' | 'reviewerUserId', label: string) =>
    row(
      label,
      <select value={String(value(field) ?? '')} disabled={locked} onChange={(event) => edit(field, event.target.value)} style={rowInput}>
        <option value="">Not assigned</option>
        {(data?.staff || []).map((user: any) => (
          <option key={user.id} value={user.id}>{user.name || user.email}</option>
        ))}
      </select>,
    );

  const summaryColumns = useMemo(() => {
    if (!snapshot) return [];
    const ttm = snapshot.trailingTwelveMonths;
    return [
      ...(ttm ? [{ key: 'TTM', label: ttm.period?.label || 'Trailing 12 months', summary: ttm, period: ttm.period }] : []),
      ...(snapshot.periodSummaries || []).map((summary: any, index: number) => ({
        key: summary.key || snapshot.periods?.[index]?.key,
        label: snapshot.periods?.[index]?.label || summary.label,
        summary,
        period: snapshot.periods?.[index],
      })),
    ];
  }, [snapshot]);

  const nav = (
    <nav aria-label="Business Valuation" style={{ borderBottom: '1px solid #cbd5e1', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                padding: '7px 12px',
                border: 0,
                borderBottom: active ? '3px solid #1F70C1' : '3px solid transparent',
                marginBottom: '-1px',
                background: active ? '#eff6ff' : 'transparent',
                color: active ? '#1F70C1' : '#475569',
                fontSize: '13px',
                textTransform: 'uppercase',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );

  if (loading && !data) return <>{nav}<div style={{ ...CARD, fontSize: '13px', color: '#64748b' }}>Loading Business Valuation…</div></>;

  return (
    <div>
      {nav}
      {error && (
        <div style={{ ...CARD, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
      )}

      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{data?.companyName || 'Business Valuation'}</div>
        {(data?.engagements || []).length > 1 && (
          <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: '6px' }}>
            Engagement
            <select
              value={engagement?.id || ''}
              onChange={(event) => void load(event.target.value)}
              style={{ ...input, width: 'auto', cursor: 'pointer' }}
            >
              {data.engagements.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.valuationDate
                    ? `Valuation date ${formatEstDateLabel(dateOnly(item.valuationDate))} · ${ENGAGEMENT_STATUS_LABELS[item.status] || item.status} · opened ${formatEstDateLabel(item.createdAt)}`
                    : `${ENGAGEMENT_STATUS_LABELS[item.status] || item.status} · opened ${formatEstDateLabel(item.createdAt)}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {engagement && (
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', background: locked ? '#dcfce7' : '#eef2ff', color: locked ? '#166534' : '#3730a3' }}>
            {ENGAGEMENT_STATUS_LABELS[engagement.status] || engagement.status}
          </span>
        )}
        <button
          type="button"
          disabled={Boolean(saving)}
          onClick={() => void run('create', { action: 'create-engagement' })}
          style={{ ...button, marginLeft: 'auto', opacity: saving ? 0.6 : 1 }}
        >
          {saving === 'create' ? 'Creating…' : 'New engagement'}
        </button>
      </div>

      {!engagement && (
        <div style={{ ...CARD, fontSize: '13px', color: '#475569' }}>
          No business valuation engagements yet. Select <strong>New engagement</strong> to start one.
        </div>
      )}

      {engagement && tab === 'engagement' && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div>
                <div style={cardTitle}>Scope of the engagement</div>
                <div style={cardSubtitle}>Purpose, standard and premise of value, and the interest being valued.</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {hasPending && <span style={{ fontSize: '11px', fontWeight: 600, color: '#b45309' }}>Unsaved changes</span>}
                <button
                  type="button"
                  disabled={!hasPending || Boolean(saving) || locked}
                  onClick={() => void saveEngagement()}
                  style={{ ...button, background: !hasPending && saved ? '#16a34a' : button.background, opacity: !hasPending && !saved ? 0.55 : 1 }}
                >
                  {saving === 'engagement' ? 'Saving…' : !hasPending && saved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
            <div style={formColumns}>
              <div>
                <div style={groupTitle}>Purpose and standard</div>
                {row(
                  'Valuation date',
                  <input
                    type="date"
                    disabled={locked}
                    value={'valuationDate' in pending ? String(pending.valuationDate || '') : dateOnly(engagement.valuationDate)}
                    onClick={(event) => {
                      try {
                        event.currentTarget.showPicker?.();
                      } catch {
                        // Some embedded browsers block showPicker; typing the date still works.
                      }
                    }}
                    onChange={(event) => edit('valuationDate', event.target.value)}
                    style={{ ...input, width: '140px' }}
                  />,
                )}
                {row(
                  'Engagement letter date',
                  <input
                    type="date"
                    disabled={locked}
                    value={'engagementLetterDate' in pending ? String(pending.engagementLetterDate || '') : dateOnly(engagement.engagementLetterDate)}
                    onClick={(event) => {
                      try {
                        event.currentTarget.showPicker?.();
                      } catch {
                        // Some embedded browsers block showPicker; typing the date still works.
                      }
                    }}
                    onChange={(event) => edit('engagementLetterDate', event.target.value)}
                    style={{ ...input, width: '140px' }}
                  />,
                )}
                {select('purpose', 'Purpose')}
                {select('reportType', 'Report type')}
                {select('standardOfValue', 'Standard of value')}
                {select('premiseOfValue', 'Premise of value')}
              </div>
              <div>
                <div style={groupTitle}>Interest valued</div>
                {select('ownershipBasis', 'Ownership basis')}
                {select('transactionStructure', 'Transaction structure')}
                {row(
                  'Interest valued (%)',
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    disabled={locked}
                    value={String(value('interestPercent') ?? '')}
                    onChange={(event) => edit('interestPercent', event.target.value)}
                    style={{ ...input, width: '90px', textAlign: 'right' }}
                  />,
                )}
              </div>
              <div>
                <div style={groupTitle}>Parties</div>
                {row(
                  'Lender',
                  <select value={String(value('lenderId') ?? '')} disabled={locked} onChange={(event) => edit('lenderId', event.target.value)} style={rowInput}>
                    <option value="">No lender</option>
                    {(data?.lenders || []).map((lender: any) => (
                      <option key={lender.id} value={lender.id}>{lender.name}</option>
                    ))}
                  </select>,
                )}
                {staffSelect('appraiserUserId', 'Appraiser')}
                {staffSelect('reviewerUserId', 'Reviewer')}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              Lenders are managed in the QoE Engagement Tracker. The reviewer must be a different person from the appraiser.
            </div>
          </div>

          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div>
                <div style={cardTitle}>Independence</div>
                <div style={cardSubtitle}>Required before data can be frozen. Changing any statement clears the confirmation.</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: engagement.independenceConfirmedAt ? '#166534' : '#b45309', fontWeight: 600 }}>
                {engagement.independenceConfirmedAt ? `Confirmed ${formatEstDateTime(engagement.independenceConfirmedAt)}` : 'Not confirmed'}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '4px' }}>
              {INDEPENDENCE_FIELDS.map((field) => (
                <label key={field} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#1e293b', cursor: locked ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" disabled={locked} checked={Boolean(value(field))} onChange={(event) => edit(field, event.target.checked)} />
                  {INDEPENDENCE_STATEMENTS[field]}
                </label>
              ))}
              <label style={fieldLabel}>
                Prior or current Corelytics services for this company (for example, Quality of Earnings report, Nov 2026)
                <textarea
                  rows={2}
                  disabled={locked}
                  placeholder="Required. Type the services, or None."
                  value={String(value('priorServicesNote') ?? '')}
                  onChange={(event) => edit('priorServicesNote', event.target.value)}
                  style={{ ...input, height: 'auto', marginTop: '3px', resize: 'vertical' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              {confirmBlocker && <span style={{ fontSize: '11px', fontWeight: 600, color: '#b45309' }}>{confirmBlocker}</span>}
              <button
                type="button"
                disabled={locked || Boolean(confirmBlocker) || Boolean(saving) || Boolean(engagement.independenceConfirmedAt)}
                onClick={() => void confirmIndependence()}
                style={{
                  ...button,
                  background: engagement.independenceConfirmedAt ? '#16a34a' : button.background,
                  opacity: locked || confirmBlocker ? 0.55 : 1,
                  cursor: locked || confirmBlocker || engagement.independenceConfirmedAt ? 'default' : 'pointer',
                }}
              >
                {saving === 'independence' ? 'Confirming…' : engagement.independenceConfirmedAt ? 'Independence confirmed' : 'Confirm independence'}
              </button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Change history</div>
            {(engagement.changes || []).length === 0 ? (
              <div style={cardSubtitle}>No changes recorded yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>When</th>
                    <th style={th}>Who</th>
                    <th style={th}>Field</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                  </tr>
                </thead>
                <tbody>
                  {engagement.changes.map((change: any) => {
                    const options = data?.options?.[change.field];
                    return (
                      <tr key={change.id}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatEstDateTime(change.createdAt)}</td>
                        <td style={td}>{change.userName || '—'}</td>
                        <td style={td}>{changeFieldLabel(change.field)}</td>
                        <td style={td}>{options ? optionLabel(options, change.oldValue) : change.oldValue ?? '—'}</td>
                        <td style={td}>{options ? optionLabel(options, change.newValue) : change.newValue ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {engagement && tab === 'earnings-base' && (
        <EarningsBaseTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          companyState={data?.companyState || null}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'market-approach' && (
        <MarketApproachTab key={engagement.id} engagement={engagement} snapshot={snapshot} locked={locked} saving={saving} run={run} />
      )}

      {engagement && tab === 'income-approach' && (
        <IncomeApproachTab key={engagement.id} engagement={engagement} snapshot={snapshot} locked={locked} saving={saving} run={run} />
      )}

      {engagement && tab === 'asset-approach' && (
        <AssetApproachTab key={engagement.id} engagement={engagement} snapshot={snapshot} locked={locked} saving={saving} run={run} />
      )}

      {engagement && tab === 'diligence' && (
        <DiligenceTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          companyName={data?.companyName || ''}
          documents={data?.documents || []}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'outlook' && (
        <OutlookTab
          key={engagement.id}
          engagement={engagement}
          companyName={data?.companyName || ''}
          industryTable={data?.benchmarkContext?.industryTable || null}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'benchmarking' && (
        <BenchmarkingTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          context={data?.benchmarkContext || null}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'reconciliation' && (
        <ReconciliationTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          companyName={data?.companyName || ''}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'report' && (
        <ReportTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          companyName={data?.companyName || ''}
          companyProfile={data?.companyProfile || null}
          benchmarkContext={data?.benchmarkContext || null}
          documents={data?.documents || []}
        />
      )}

      {engagement && tab === 'debt-service' && (
        <DebtServiceTab key={engagement.id} engagement={engagement} snapshot={snapshot} locked={locked} saving={saving} run={run} />
      )}

      {engagement && tab === 'deal-terms' && (
        <DealTermsTab
          key={engagement.id}
          engagement={engagement}
          snapshot={snapshot}
          documents={data?.documents || []}
          locked={locked}
          saving={saving}
          run={run}
        />
      )}

      {engagement && tab === 'snapshot' && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={cardTitle}>Freeze valuation data</div>
              <div style={cardSubtitle}>
                Copies the stored, closed months and saved QoE totals as of the valuation date. Nothing is resynced from the accounting system.
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {snapshotBlocker && <span style={{ fontSize: '11px', fontWeight: 600, color: '#b45309' }}>{snapshotBlocker}</span>}
              <button
                type="button"
                disabled={Boolean(snapshotBlocker) || Boolean(saving) || locked}
                onClick={() => void run('snapshot', { action: 'create-snapshot' })}
                style={{ ...button, opacity: snapshotBlocker || locked ? 0.55 : 1 }}
              >
                {saving === 'snapshot' ? 'Freezing…' : snapshot ? 'Freeze again' : 'Freeze data'}
              </button>
            </div>
          </div>

          {!snapshot && (
            <div style={{ ...CARD, fontSize: '13px', color: '#475569' }}>No data has been frozen for this engagement yet.</div>
          )}

          {snapshot && (
            <>
              <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {[
                  ['Valuation date', formatEstDateLabel(snapshot.valuationDate)],
                  ['Latest closed month used', formatMonthKey(snapshot.asOfMonth)],
                  ['Fiscal year end', `${MONTH_NAMES[(snapshot.fiscalYear?.endMonth || 12) - 1]} (${FISCAL_YEAR_SOURCE_LABELS[snapshot.fiscalYear?.source] || snapshot.fiscalYear?.source})`],
                  ['Frozen', `${formatEstDateTime(snapshot.capturedAt)}${engagement.snapshots?.[0]?.createdByName ? ` by ${engagement.snapshots[0].createdByName}` : ''}`],
                ].map(([label, text]) => (
                  <div key={label}>
                    <div style={fieldLabel}>{label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{text}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...CARD, overflowX: 'auto' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Fiscal year summary</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}></th>
                      {summaryColumns.map((column: any) => (
                        <th key={column.key} style={{ ...th, textAlign: 'right' }}>{column.label}</th>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ ...th, fontWeight: 600, background: '#fff' }}>Months stored</th>
                      {summaryColumns.map((column: any) => (
                        <th key={column.key} style={{ ...th, textAlign: 'right', fontWeight: 600, background: '#fff', color: column.period?.isComplete ? '#166534' : '#b45309' }}>
                          {column.period ? `${column.period.storedMonths.length} of ${column.period.months.length}` : '—'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SUMMARY_ROWS.map((row) => (
                      <tr key={row.key}>
                        <td style={{ ...td, fontWeight: row.key === 'ebitda' || row.key === 'grossProfit' ? 700 : 400 }}>{row.label}</td>
                        {summaryColumns.map((column: any) => (
                          <td key={column.key} style={{ ...td, textAlign: 'right', fontWeight: row.key === 'ebitda' || row.key === 'grossProfit' ? 700 : 400 }}>
                            {column.period?.storedMonths?.length ? money(column.summary?.income?.[row.key]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {BALANCE_ROWS.map((row) => (
                      <tr key={row.key}>
                        <td style={td}>{row.label} (period end)</td>
                        {summaryColumns.map((column: any) => (
                          <td key={column.key} style={{ ...td, textAlign: 'right' }}>
                            {column.summary?.balanceSheet ? money(column.summary.balanceSheet[row.key]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summaryColumns.some((column: any) => column.period && !column.period.isComplete) && (
                  <div style={{ fontSize: '11px', color: '#b45309', marginTop: '8px' }}>
                    Periods with missing months show only the months stored in Corelytics. Older months can be added later with a manual backfill for this company, or covered with tax return figures.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                <div style={CARD}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Quality of Earnings</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    {snapshot.qoe?.savedAt ? `Saved QoE totals as of ${formatEstDateTime(snapshot.qoe.savedAt)}` : 'No saved QoE totals'}
                  </div>
                  {snapshot.qoe?.savedTotals ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {QOE_TOTAL_ROWS.map((row) => (
                          <tr key={row.key}>
                            <td style={{ ...td, fontWeight: row.key === 'qualityOfEarnings' ? 700 : 400 }}>{row.label}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: row.key === 'qualityOfEarnings' ? 700 : 400 }}>{money(snapshot.qoe.savedTotals[row.key])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {snapshot.qoe?.accountAdjustmentsError && (
                    <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '6px' }}>Account adjustments could not be read: {snapshot.qoe.accountAdjustmentsError}</div>
                  )}
                </div>

                <div style={CARD}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Debt and tax returns</div>
                  <div style={{ fontSize: '12px', color: '#1e293b', marginBottom: '6px' }}>
                    Loan instruments captured: <strong>{snapshot.loans?.instruments?.length || 0}</strong>
                    {snapshot.loans?.error && <span style={{ color: '#b91c1c' }}> (could not read loans: {snapshot.loans.error})</span>}
                  </div>
                  {(snapshot.loans?.instruments || []).slice(0, 8).map((loan: any) => (
                    <div key={loan.instrumentKey} style={{ fontSize: '12px', color: '#475569' }}>• {loan.displayName || loan.instrumentKey}</div>
                  ))}
                  <div style={{ fontSize: '12px', color: '#1e293b', marginTop: '10px' }}>
                    Tax return years on file:{' '}
                    <strong>{snapshot.taxReturns ? Object.keys(snapshot.taxReturns.entries || {}).sort().reverse().join(', ') || 'None' : 'None'}</strong>
                  </div>
                </div>
              </div>

              {(snapshot.notes || []).length > 0 && (
                <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Notes</div>
                  {snapshot.notes.map((note: string) => (
                    <div key={note} style={{ fontSize: '12px', color: '#78350f' }}>• {note}</div>
                  ))}
                </div>
              )}

              {(engagement.snapshots || []).length > 1 && (
                <div style={CARD}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Earlier snapshots</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Frozen</th>
                        <th style={th}>By</th>
                        <th style={th}>Valuation date</th>
                        <th style={th}>Latest closed month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {engagement.snapshots.slice(1).map((item: any) => (
                        <tr key={item.id}>
                          <td style={td}>{formatEstDateTime(item.createdAt)}</td>
                          <td style={td}>{item.createdByName || '—'}</td>
                          <td style={td}>{formatEstDateLabel(dateOnly(item.valuationDate))}</td>
                          <td style={td}>{formatMonthKey(item.asOfMonth)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
