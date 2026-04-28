'use client';

import React from 'react';
import { US_STATES } from '@/app/constants';
import { INDUSTRY_SECTORS } from '@/data/industrySectors';
import { formatPhoneNumber } from '@/app/utils/phone';
import PasswordInput from '@/app/components/common/PasswordInput';
import BillingDashboard from '@/app/components/billing/BillingDashboard';
import { getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { getModuleLabel, mapModuleToDataType } from '@/lib/operations/module-registry';
import AccountingSystemPanel from '@/app/components/accounting-systems/AccountingSystemPanel';
import { isPluginAccountingSystem } from '@/lib/accounting-systems/registry';

const OPERATIONAL_HUB_SECTION_OPTIONS: Array<{ key: string; label: string; group: string }> = [
  { key: 'productsPriceCostComparison', label: 'Weekly Price-Cost Comparison', group: 'Products' },
  { key: 'productsPareto', label: 'Top Products Pareto', group: 'Products' },
  { key: 'productsScatter', label: 'Profitability Scatter', group: 'Products' },
  { key: 'productsScopeSelector', label: 'Scope Selector', group: 'Products' },
  { key: 'productsPriceCostTrend', label: 'Price-Cost Trend', group: 'Products' },
  { key: 'productsPriceCostWaterfall', label: 'Price-Cost Waterfall', group: 'Products' },
  { key: 'productsBottomLossMakers', label: 'Bottom Products (Loss Makers)', group: 'Products' },
  { key: 'productsFreightOtherTracker', label: 'Freight/Other Tracker', group: 'Products' },
  { key: 'inventoryValueTrend', label: 'Value Trend', group: 'Inventory' },
  { key: 'inventoryCurrentTable', label: 'Current Inventory Table', group: 'Inventory' },
  { key: 'inventoryDistribution', label: 'Value Distribution', group: 'Inventory' },
  { key: 'cashBankAccounts', label: 'Bank Accounts Table', group: 'Cash' },
  { key: 'cashDistributionByAccount', label: 'Distribution by Account', group: 'Cash' },
  { key: 'dailySummaryCards', label: 'Summary KPI Cards', group: 'Daily Financials' },
  { key: 'dailyTrendChart', label: 'Daily Trend Chart', group: 'Daily Financials' },
  { key: 'dailyIncomeStatement', label: 'Income Statement View', group: 'Daily Financials' },
  { key: 'dailyBalanceSheet', label: 'Balance Sheet View', group: 'Daily Financials' },
  { key: 'dailyCashflowStatement', label: 'Cash Flow View', group: 'Daily Financials' },
  { key: 'arCollectionsTrend', label: 'Collections Trend / DSO Proxy', group: 'AR' },
  { key: 'arCollectionsRiskQueue', label: 'Collections Risk Queue', group: 'AR' },
  { key: 'arAgingByClient', label: 'AR Aging by Client', group: 'AR' },
  { key: 'arDsoTrend', label: 'DSO Trend', group: 'AR' },
  { key: 'arCollectionsByClient', label: 'Collections by Client', group: 'AR' },
  { key: 'arInvoiceToCashCycle', label: 'Invoice-to-Cash Cycle', group: 'AR' },
  { key: 'arTopPastDueClients', label: 'Top Past Due Clients', group: 'AR' },
  { key: 'apPaymentCadenceTrend', label: 'Payment Cadence / DPO Proxy', group: 'AP' },
  { key: 'apPastDueRiskQueue', label: 'Past-Due Risk Queue', group: 'AP' },
  { key: 'apUpcomingDueCalendar', label: 'Upcoming Due Calendar', group: 'AP' },
  { key: 'apAging', label: 'AP Aging', group: 'AP' },
  { key: 'apVendorSpend', label: 'Vendor Spend (insurance, benefits, job boards)', group: 'AP' },
  { key: 'apAccruedPayrollLiabilities', label: 'Accrued Payroll Liabilities', group: 'AP' },
  { key: 'apExpenseRunRate', label: 'Expense Run Rate', group: 'AP' },
  { key: 'cash13WeekTrend', label: '13-Week Trend', group: 'Cash' },
  { key: 'cashBridge', label: 'Bridge (Receipts vs Disbursements)', group: 'Cash' },
  { key: 'cashCovenantMonitor', label: 'Minimum Covenant Monitor', group: 'Cash' },
  { key: 'customersConcentrationRisk', label: 'Concentration Risk', group: 'Customers' },
  { key: 'customersRetentionProxy', label: 'Revenue Retention Proxy', group: 'Customers' },
  { key: 'customersInvoiceVelocity', label: 'Revenue vs Invoice Velocity', group: 'Customers' },
  { key: 'customersAtRiskQueue', label: 'At-Risk Accounts Queue', group: 'Customers' },
  { key: 'lsUtilizationPct', label: 'Utilization % (billable vs paid hours)', group: 'Labor & Scheduling' },
  { key: 'lsFillRate', label: 'Fill Rate (positions filled)', group: 'Labor & Scheduling' },
  { key: 'lsTimeToFill', label: 'Time-to-Fill', group: 'Labor & Scheduling' },
  { key: 'lsAssignmentDuration', label: 'Assignment Duration', group: 'Labor & Scheduling' },
  { key: 'lsIdleWorkforceCost', label: 'Idle Workforce Cost', group: 'Labor & Scheduling' },
  { key: 'lsOvertimeAnalysis', label: 'Overtime Analysis', group: 'Labor & Scheduling' },
  { key: 'csRevenueByClient', label: 'Revenue by Client', group: 'Customers / Sites' },
  { key: 'csClientProfitability', label: 'Client Profitability', group: 'Customers / Sites' },
  { key: 'csRevenueConcentration', label: 'Revenue Concentration (Top 5 / Top 10)', group: 'Customers / Sites' },
  { key: 'csContractRateCards', label: 'Contract Rate Cards', group: 'Customers / Sites' },
  { key: 'csClientRetentionChurn', label: 'Client Retention / Churn', group: 'Customers / Sites' },
  { key: 'csLowMarginClients', label: 'Low-Margin Clients', group: 'Customers / Sites' },
  { key: 'csClientLifetimeValue', label: 'Client Lifetime Value (proxy)', group: 'Customers / Sites' },
  { key: 'rbBillableHoursByClient', label: 'Billable Hours by Client', group: 'Revenue & Billables' },
  { key: 'rbRevenueFormula', label: 'Revenue = Hours × Bill Rate', group: 'Revenue & Billables' },
  { key: 'rbRevenueByJobType', label: 'Revenue by Job Type', group: 'Revenue & Billables' },
  { key: 'rbAverageBillRateByRole', label: 'Average Bill Rate by Role', group: 'Revenue & Billables' },
  { key: 'rbRevenuePerEmployee', label: 'Revenue per Employee', group: 'Revenue & Billables' },
  { key: 'ueSpreadPerHour', label: 'Spread per Hour', group: 'Unit Economics' },
  { key: 'ueGrossMarginByClient', label: 'Gross Margin % by Client', group: 'Unit Economics' },
  { key: 'uePayVsBillRate', label: 'Pay Rate vs Bill Rate Analysis', group: 'Unit Economics' },
  { key: 'ueBurdenCostPerHour', label: 'Burden Cost per Hour', group: 'Unit Economics' },
  { key: 'ueContributionMarginByAssignment', label: 'Contribution Margin by Assignment', group: 'Unit Economics' },
  { key: 'ueMarginCompressionAlerts', label: 'Margin Compression Alerts', group: 'Unit Economics' },
  // ── Construction sector ('23') tab sub-sections ──────────────────────────
  // Project Portfolio
  { key: 'ppPortfolioSummary', label: 'Portfolio Summary', group: 'Project Portfolio' },
  { key: 'ppMonthlyMetrics', label: 'MTD + Job Counts', group: 'Project Portfolio' },
  { key: 'ppRevenueVsCostChart', label: 'Revenue vs Cost (12 mo)', group: 'Project Portfolio' },
  { key: 'ppOverheadTrendChart', label: 'Overhead Trend (12 mo)', group: 'Project Portfolio' },
  { key: 'ppScheduleSlippage', label: 'Schedule Slippage Impact', group: 'Project Portfolio' },
  { key: 'ppJobProfitability', label: 'Job Profitability Table', group: 'Project Portfolio' },
  { key: 'ppRiskFlags', label: 'Risk Flags', group: 'Project Portfolio' },
  { key: 'ppTopBottomJobs', label: 'Top / Bottom Jobs', group: 'Project Portfolio' },
  // Job Cost Control
  { key: 'jccJobPicker', label: 'Job Picker', group: 'Job Cost Control' },
  { key: 'jccProfitabilitySnapshot', label: 'Profitability Snapshot', group: 'Job Cost Control' },
  { key: 'jccDailyCost', label: 'Daily Cost vs Budget', group: 'Job Cost Control' },
  { key: 'jccCostCodeVariance', label: 'Cost Code Variance', group: 'Job Cost Control' },
  { key: 'jccCostByType', label: 'Cost by Type', group: 'Job Cost Control' },
  { key: 'jccLaborDetail', label: 'Labor + Equipment Detail', group: 'Job Cost Control' },
  { key: 'jccJobSpecificAr', label: 'Job-Specific AR (drill)', group: 'Job Cost Control' },
  { key: 'jccJobSpecificAp', label: 'Job-Specific AP (drill)', group: 'Job Cost Control' },
  // Commitments & Forecast
  { key: 'cfEacSummary', label: 'EAC Summary', group: 'Commitments & Forecast' },
  { key: 'cfCommitmentExposure', label: 'Commitment Exposure', group: 'Commitments & Forecast' },
  { key: 'cfChangeOrderImpact', label: 'Change Order Impact', group: 'Commitments & Forecast' },
  { key: 'cfOpenCommitments', label: 'Open Commitments', group: 'Commitments & Forecast' },
  // Billing & Cash
  { key: 'bcSummary', label: 'Summary', group: 'Billing & Cash' },
  { key: 'bcArByJob', label: 'AR by Job', group: 'Billing & Cash' },
  { key: 'bcApByJob', label: 'AP by Job', group: 'Billing & Cash' },
  { key: 'bcPriorityList', label: 'Priority List', group: 'Billing & Cash' },
  // Construction AR (project-aware)
  { key: 'caArSummary', label: 'Aging Summary', group: 'Construction AR' },
  { key: 'caArMainTable', label: 'Main Table (toggle)', group: 'Construction AR' },
  { key: 'caArCollectionsPriority', label: 'Collections Priority', group: 'Construction AR' },
  // Construction AP (project-aware)
  { key: 'caApSummary', label: 'Aging Summary', group: 'Construction AP' },
  { key: 'caApMainTable', label: 'Main Table (toggle)', group: 'Construction AP' },
  { key: 'caApPaymentPriority', label: 'Payment Priority', group: 'Construction AP' },
];

const OPERATIONAL_HUB_SECTIONS_BY_DATATYPE_GROUP: Record<string, string> = {
  customers: 'Customers',
  'customers-sites': 'Customers / Sites',
  'ar-aging': 'AR',
  'ap-aging': 'AP',
  products: 'Products',
  'labor-scheduling': 'Labor & Scheduling',
  inventory: 'Inventory',
  cash: 'Cash',
  'daily-financials': 'Daily Financials',
  'revenue-billables': 'Revenue & Billables',
  'unit-economics': 'Unit Economics',
  // Construction sector ('23') native tabs.
  'project-portfolio': 'Project Portfolio',
  'job-cost-control': 'Job Cost Control',
  'commitments-forecast': 'Commitments & Forecast',
  'billing-cash': 'Billing & Cash',
  'construction-ar': 'Construction AR',
  'construction-ap': 'Construction AP',
};

type OperationalHubCustomReport = {
  id: string;
  label: string;
  tabKey: string;
  dataType: string;
  scope: 'company' | 'global';
  createdAt: string;
  createdByCompanyId: string;
};

export default function SiteAdminDashboard(props: any) {
  const {
    siteAdminTab, setSiteAdminTab, consultants, companies, siteAdmins,
    selectedConsultantId, setSelectedConsultantId, expandedCompanyIds, setExpandedCompanyIds,
    isLoading, expandedBusinessIds, setExpandedBusinessIds,
    editingPricing, setEditingPricing,
    defaultBusinessMonthlyPrice, setDefaultBusinessMonthlyPrice,
    defaultBusinessQuarterlyPrice, setDefaultBusinessQuarterlyPrice,
    defaultBusinessAnnualPrice, setDefaultBusinessAnnualPrice,
    defaultBusinessSetupFee, setDefaultBusinessSetupFee,
    defaultConsultantMonthlyPrice, setDefaultConsultantMonthlyPrice,
    defaultConsultantQuarterlyPrice, setDefaultConsultantQuarterlyPrice,
    defaultConsultantAnnualPrice, setDefaultConsultantAnnualPrice,
    defaultConsultantSetupFee, setDefaultConsultantSetupFee,
    defaultDataRoomBusinessMonthlyPrice, setDefaultDataRoomBusinessMonthlyPrice,
    defaultDataRoomBusinessQuarterlyPrice, setDefaultDataRoomBusinessQuarterlyPrice,
    defaultDataRoomBusinessAnnualPrice, setDefaultDataRoomBusinessAnnualPrice,
    defaultDataRoomConsultantMonthlyPrice, setDefaultDataRoomConsultantMonthlyPrice,
    defaultDataRoomConsultantQuarterlyPrice, setDefaultDataRoomConsultantQuarterlyPrice,
    defaultDataRoomConsultantAnnualPrice, setDefaultDataRoomConsultantAnnualPrice,
    affiliates, setAffiliates,
    showAddAffiliateForm, setShowAddAffiliateForm,
    editingAffiliate, setEditingAffiliate,
    expandedAffiliateId, setExpandedAffiliateId,
    newAffiliateCode, setNewAffiliateCode,
    editingAffiliateCode, setEditingAffiliateCode,
    editingConsultantInfo, setEditingConsultantInfo,
    users, getCompanyUsers,
    showAddConsultantForm, setShowAddConsultantForm,
    newConsultantType, setNewConsultantType,
    newConsultantFullName, setNewConsultantFullName,
    newConsultantEmail, setNewConsultantEmail,
    newConsultantPhone, setNewConsultantPhone,
    newConsultantPassword, setNewConsultantPassword,
    newConsultantAddress, setNewConsultantAddress,
    newConsultantCompanyName, setNewConsultantCompanyName,
    newConsultantCompanyAddress1, setNewConsultantCompanyAddress1,
    newConsultantCompanyAddress2, setNewConsultantCompanyAddress2,
    newConsultantCompanyCity, setNewConsultantCompanyCity,
    newConsultantCompanyState, setNewConsultantCompanyState,
    newConsultantCompanyZip, setNewConsultantCompanyZip,
    newConsultantCompanyWebsite, setNewConsultantCompanyWebsite,
    addConsultant, deleteConsultant, updateConsultantInfo, getConsultantCompanies,
    setCurrentUser, setSiteAdminViewingAs, setCurrentView, setLoadedConsultantId, setCompanies, currentUser,
    setSelectedCompanyId, setCompanyToDelete, setShowDeleteConfirmation,
    inforConnected, inforStatus, inforLastSync, inforError, inforBusy, inforBusyAction,
    inforCredentials, setInforCredentials, inforProbePath, setInforProbePath, inforProbeSummary,
    inforOperationalSyncStatus,
    checkInforM3Status, loadInforM3Credentials, saveInforM3Credentials, connectInforM3, testInforM3Token, probeInforM3, disconnectInforM3, runInforM3OperationalSync, resetInforM3OperationalSyncState,
    runPlatformOperationalSync,
    newSiteAdminFirstName, setNewSiteAdminFirstName,
    newSiteAdminLastName, setNewSiteAdminLastName,
    newSiteAdminEmail, setNewSiteAdminEmail,
    newSiteAdminPassword, setNewSiteAdminPassword,
    showAddSiteAdminForm, setShowAddSiteAdminForm
  } = props;
  const businessesLoading = Boolean(props.businessesLoading);

  const updateCompanyPricing = props.updateCompanyPricing as
    | undefined
    | ((companyId: string, pricing: { monthly: number; quarterly: number; annual: number; setupFee: number }) => void);
  const [editingTier1RoutingByCompany, setEditingTier1RoutingByCompany] = React.useState<
    Record<string, { owner: 'CORELYTICS' | 'CONSULTANT'; consultantId: string; supportEmail: string }>
  >({});
  const [savingTier1RoutingCompanyId, setSavingTier1RoutingCompanyId] = React.useState<string | null>(null);
  const [savingOperationalDataModeCompanyId, setSavingOperationalDataModeCompanyId] = React.useState<string | null>(null);
  const [savingOperationalHubConfigCompanyId, setSavingOperationalHubConfigCompanyId] = React.useState<string | null>(null);
  const [editingOperationalHubConfigByCompany, setEditingOperationalHubConfigByCompany] = React.useState<Record<string, Record<string, boolean>>>({});
  const [addingOperationalHubReportCompanyId, setAddingOperationalHubReportCompanyId] = React.useState<string | null>(null);
  const [newOperationalHubReportByCompany, setNewOperationalHubReportByCompany] = React.useState<
    Record<string, { label: string; tabKey: string; scope: 'company' | 'global' }>
  >({});
  const [savingDataRoomCompanyId, setSavingDataRoomCompanyId] = React.useState<string | null>(null);
  const [editingDataRoomPricingByCompany, setEditingDataRoomPricingByCompany] = React.useState<
    Record<string, { monthly: number; quarterly: number; annual: number }>
  >({});
  const [savingDataRoomPricingCompanyId, setSavingDataRoomPricingCompanyId] = React.useState<string | null>(null);
  const [savingValuationCompanyId, setSavingValuationCompanyId] = React.useState<string | null>(null);
  const [editingValuationPricingByCompany, setEditingValuationPricingByCompany] = React.useState<
    Record<string, { monthly: number; quarterly: number; annual: number }>
  >({});
  const [savingValuationPricingCompanyId, setSavingValuationPricingCompanyId] = React.useState<string | null>(null);
  const [runningFinancialImportByCompany, setRunningFinancialImportByCompany] = React.useState<Record<string, boolean>>({});

  const getAccountingSystemLabel = (value: unknown): string => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return 'Not selected';
    if (normalized === 'INFOR_M3') return 'Infor M3';
    if (normalized === 'INFOR_CSI') return 'Infor SyteLine CSI';
    if (normalized === 'QUICKBOOKS') return 'QuickBooks Online';
    if (normalized === 'QUICKBOOKS_DESKTOP') return 'QuickBooks Desktop';
    if (normalized === 'DYNAMICS' || normalized === 'DYNAMICS365') return 'Dynamics 365';
    if (normalized === 'ACUMATICA') return 'Acumatica';
    if (normalized === 'SAGE_INTACCT') return 'Sage Intacct';
    if (normalized === 'SAGE') return 'Sage';
    if (normalized === 'ODOO') return 'Odoo';
    if (normalized === 'VISTA_CLOUD') return 'Viewpoint Vista Cloud';
    return String(value);
  };

  const rerunSuggestedWindow = (companyId: string, startDate: string, endDate: string) => {
    if (!runInforM3OperationalSync) {
      alert('Operational sync handler is unavailable. Refresh and try again.');
      return;
    }
    if (!startDate || !endDate) {
      alert('Missing start/end dates for suggested rerun window.');
      return;
    }
    const site = requireCompanyCsiSite(companyId);
    if (site === null) return;
    const syncSettings = getCompanyOperationalSettings(companyId);
    runInforM3OperationalSync(companyId, syncSettings.frequency, site, {
      mode: 'business_day_backfill',
      backfillMonths: syncSettings.backfillMonths,
      lookbackDays: syncSettings.lookbackDays,
      startDate,
      endDate,
    });
  };

  const renderInforSyncStatusPanel = (companyId: string) => {
    const status = inforOperationalSyncStatus;
    if (!status || status.companyId !== companyId) {
      return (
        <div
          style={{
            gridColumn: '1 / -1',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '8px',
            background: '#f8fafc',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
            Sync Status: Idle
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            No active or recently polled sync status for this company yet.
          </div>
        </div>
      );
    }
    const isAutoChunkedBackfill = status.runMode === 'business_day_backfill';
    const stateColors =
      status.state === 'running'
        ? { text: '#0f766e', border: '#99f6e4', bg: '#f0fdfa' }
        : status.state === 'failed'
          ? { text: '#b91c1c', border: '#fecaca', bg: '#fef2f2' }
          : { text: '#166534', border: '#bbf7d0', bg: '#f0fdf4' };
    const stateLabel = status.state === 'running' ? 'Running' : status.state === 'failed' ? 'Failed' : 'Done';
    const queueSignals = (status as any)?.queueSignals || null;
    const runTimeline = Array.isArray((status as any)?.runTimeline) ? (status as any).runTimeline : [];
    const activeRuns = runTimeline.filter((run: any) => run?.isActive === true);
    const stalledRuns = runTimeline.filter((run: any) => run?.isStalled === true);
    const watchdogState = String(queueSignals?.watchdogState || '').toLowerCase();
    const heartbeatTone =
      watchdogState === 'stale' ? '#b91c1c' : watchdogState === 'at_risk' ? '#92400e' : '#065f46';
    const heartbeatBg =
      watchdogState === 'stale' ? '#fef2f2' : watchdogState === 'at_risk' ? '#fffbeb' : '#ecfdf5';
    const heartbeatBorder =
      watchdogState === 'stale' ? '#fecaca' : watchdogState === 'at_risk' ? '#fcd34d' : '#a7f3d0';
    return (
      <div style={{ gridColumn: '1 / -1', border: `1px solid ${stateColors.border}`, borderRadius: '6px', padding: '8px', background: stateColors.bg }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: stateColors.text, marginBottom: '4px' }}>
          Sync Status: {stateLabel}
        </div>
        {isAutoChunkedBackfill && (
          <div
            style={{
              display: 'inline-block',
              fontSize: '10px',
              fontWeight: 700,
              color: '#0f766e',
              background: '#ccfbf1',
              border: '1px solid #5eead4',
              borderRadius: '999px',
              padding: '2px 8px',
              marginBottom: '6px',
            }}
          >
            AUTO-CHUNKED BACKFILL ACTIVE
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', fontSize: '11px', color: '#334155' }}>
          <div><strong>Run ID:</strong> {status.syncRunId || 'Pending...'}</div>
          <div><strong>Chunks:</strong> {Number(status.chunkCount || 0).toLocaleString('en-US')}</div>
          <div><strong>Records:</strong> {Number(status.recordsCreated || 0).toLocaleString('en-US')}</div>
          <div><strong>Last Chunk:</strong> {status.lastChunkAt ? new Date(status.lastChunkAt).toLocaleTimeString() : '-'}</div>
        </div>
        {status.message && (
          <div style={{ fontSize: '11px', color: stateColors.text, marginTop: '4px' }}>
            {status.message}
          </div>
        )}
        {status.state !== 'failed' && status.lastError && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '6px' }}>
            Alert: {status.lastError}
          </div>
        )}
        {queueSignals && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: heartbeatTone, background: heartbeatBg, border: `1px solid ${heartbeatBorder}`, borderRadius: '6px', padding: '6px' }}>
            <div style={{ fontWeight: 700, marginBottom: '3px' }}>
              Queue heartbeat: {watchdogState === 'stale' ? 'STALE' : watchdogState === 'at_risk' ? 'AT RISK' : 'HEALTHY'}
            </div>
            <div>
              Last chunk age: {Number.isFinite(Number(queueSignals.secondsSinceLastChunk)) ? `${Math.max(0, Number(queueSignals.secondsSinceLastChunk)).toLocaleString('en-US')}s` : 'n/a'} | Last task age: {Number.isFinite(Number(queueSignals.secondsSinceLastTaskAttempt)) ? `${Math.max(0, Number(queueSignals.secondsSinceLastTaskAttempt)).toLocaleString('en-US')}s` : 'n/a'} | Watchdog: {Number(queueSignals.staleThresholdMinutes || 0)}m
            </div>
            <div>
              Tasks — pending: {Math.max(0, Number(queueSignals?.queueTaskCounts?.pending || 0)).toLocaleString('en-US')}, leased: {Math.max(0, Number(queueSignals?.queueTaskCounts?.leased || 0)).toLocaleString('en-US')}, done: {Math.max(0, Number(queueSignals?.queueTaskCounts?.done || 0)).toLocaleString('en-US')}, failed: {Math.max(0, Number(queueSignals?.queueTaskCounts?.failed || 0)).toLocaleString('en-US')}
            </div>
            {watchdogState === 'stale' && (
              <div style={{ marginTop: '4px' }}>
                No queue heartbeat detected near the stale threshold. Verify cron `/api/cron/process-infor-sync-runs` is running.
              </div>
            )}
          </div>
        )}
        {runTimeline.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#1f2937', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              Live run monitor
            </div>
            <div style={{ marginBottom: '4px', color: stalledRuns.length > 0 ? '#b91c1c' : '#475569' }}>
              Active: {activeRuns.length} | Stalled: {stalledRuns.length} | Showing last {runTimeline.length} runs
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '170px 90px 100px 120px minmax(0,1fr)', gap: '6px', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: '#475569' }}>Run ID</div>
              <div style={{ fontWeight: 700, color: '#475569' }}>Status</div>
              <div style={{ fontWeight: 700, color: '#475569' }}>Chunks</div>
              <div style={{ fontWeight: 700, color: '#475569' }}>Records</div>
              <div style={{ fontWeight: 700, color: '#475569' }}>Progress</div>
              {runTimeline.map((run: any) => {
                const runId = String(run?.id || '').trim();
                const runStatus = String(run?.status || '').trim().toLowerCase();
                const statusColor =
                  runStatus === 'running'
                    ? '#0f766e'
                    : runStatus === 'queued'
                      ? '#1d4ed8'
                      : runStatus === 'failed'
                        ? '#b91c1c'
                        : '#166534';
                const progressSeconds = Number.isFinite(Number(run?.secondsSinceProgress))
                  ? Math.max(0, Number(run.secondsSinceProgress))
                  : null;
                return (
                  <React.Fragment key={runId}>
                    <div style={{ fontFamily: 'monospace', color: '#334155' }}>{runId.slice(0, 18)}{runId.length > 18 ? '...' : ''}</div>
                    <div style={{ color: statusColor, fontWeight: 700 }}>{String(run?.status || '').toUpperCase()}</div>
                    <div>{Math.max(0, Number(run?.chunkCount || 0)).toLocaleString('en-US')}</div>
                    <div>{Math.max(0, Number(run?.recordsCreated || 0)).toLocaleString('en-US')}</div>
                    <div style={{ color: run?.isStalled ? '#b91c1c' : '#475569' }}>
                      {run?.isStalled ? 'STALLED' : run?.isActive ? 'ACTIVE' : 'IDLE'} ·{' '}
                      {progressSeconds === null ? 'n/a' : `${progressSeconds.toLocaleString('en-US')}s ago`}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
        {(status as any)?.rawIngestOnlyMode && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '6px' }}>
            RAW INGEST ONLY is enabled. This run ingests raw records but does not hydrate operational snapshots.
          </div>
        )}
        {status.state === 'failed' && status.lastError && (
          <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px' }}>
            Error: {status.lastError}
          </div>
        )}
        {Array.isArray((status as any)?.queueTaskPreview) && (status as any).queueTaskPreview.length > 0 && (
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#334155' }}>
            <strong>Latest Task:</strong>{' '}
            {(() => {
              const task = (status as any).queueTaskPreview[0];
              const mode = String(task?.mode || 'n/a');
              const businessDateIso = String(task?.businessDateIso || 'n/a');
              const programOffset = Number.isFinite(Number(task?.programOffset)) ? Number(task.programOffset) : 0;
              const programEndOffset =
                Number.isFinite(Number(task?.programEndOffset)) ? Number(task.programEndOffset) : null;
              const requestOffset = Number.isFinite(Number(task?.requestOffset)) ? Number(task.requestOffset) : 0;
              return `${mode} | ${businessDateIso} | program ${programOffset}${programEndOffset !== null ? `..${programEndOffset}` : ''} | request ${requestOffset}`;
            })()}
          </div>
        )}
        {(status as any)?.diagnostics && (
          <div style={{ marginTop: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              COVERAGE & GAPS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', fontSize: '11px', color: '#334155' }}>
              <div><strong>Failed Chunks:</strong> {Math.max(0, Number((status as any).diagnostics?.failedChunks || 0))}</div>
              <div><strong>Skipped Chunks:</strong> {Math.max(0, Number((status as any).diagnostics?.skippedChunks || 0))}</div>
              <div><strong>Programs Affected:</strong> {Array.isArray((status as any).diagnostics?.failedPrograms) ? (status as any).diagnostics.failedPrograms.length : 0}</div>
            </div>
            {Array.isArray((status as any).diagnostics?.failedPrograms) && (status as any).diagnostics.failedPrograms.length > 0 && (
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>
                {(status as any).diagnostics.failedPrograms.slice(0, 4).join(', ')}
                {(status as any).diagnostics.failedPrograms.length > 4 ? ` +${(status as any).diagnostics.failedPrograms.length - 4} more` : ''}
              </div>
            )}
            {Array.isArray((status as any).diagnostics?.suggestedRerunWindows) && (status as any).diagnostics.suggestedRerunWindows.length > 0 && (
              <div style={{ marginTop: '6px', padding: '6px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                <div style={{ fontSize: '11px', color: '#1e3a8a', marginBottom: '4px' }}>
                  Suggested rerun window: {(status as any).diagnostics.suggestedRerunWindows[0].startDate} to {(status as any).diagnostics.suggestedRerunWindows[0].endDate}
                </div>
                <button
                  onClick={() =>
                    rerunSuggestedWindow(
                      companyId,
                      String((status as any).diagnostics.suggestedRerunWindows[0].startDate || ''),
                      String((status as any).diagnostics.suggestedRerunWindows[0].endDate || '')
                    )
                  }
                  disabled={inforBusy}
                  style={{ padding: '6px 10px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                >
                  {inforBusy && inforBusyAction === 'operational_sync' ? 'Starting...' : 'Rerun Missing Slice'}
                </button>
              </div>
            )}
            {Array.isArray((status as any).diagnostics?.staleSourceWarnings) &&
              (status as any).diagnostics.staleSourceWarnings.length > 0 && (
                <div style={{ marginTop: '6px', padding: '6px', borderRadius: '6px', border: '1px solid #fcd34d', background: '#fffbeb' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                    DATA FRESHNESS WARNING
                  </div>
                  <div style={{ fontSize: '11px', color: '#78350f' }}>
                    {(status as any).diagnostics.staleSourceWarnings[0].message}
                  </div>
                  {(status as any).diagnostics.staleSourceWarnings[0].targetSnapshotDate && (
                    <div style={{ marginTop: '2px', fontSize: '11px', color: '#92400e' }}>
                      Target date: {(status as any).diagnostics.staleSourceWarnings[0].targetSnapshotDate}
                    </div>
                  )}
                  {Array.isArray((status as any).diagnostics.staleSourceWarnings[0].staleSources) &&
                    (status as any).diagnostics.staleSourceWarnings[0].staleSources.length > 0 && (
                      <div style={{ marginTop: '2px', fontSize: '11px', color: '#92400e' }}>
                        Sources: {(status as any).diagnostics.staleSourceWarnings[0].staleSources.join(', ')}
                      </div>
                    )}
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  const [editingBusinessInfoByCompany, setEditingBusinessInfoByCompany] = React.useState<
    Record<string, { email: string; name: string; phone: string; addressStreet: string; addressCity: string; addressState: string; addressZip: string; addressCountry: string }>
  >({});
  const [savingBusinessInfoCompanyId, setSavingBusinessInfoCompanyId] = React.useState<string | null>(null);

  const getBusinessInfoDraft = (company: any, user: any) => {
    if (editingBusinessInfoByCompany[company?.id]) return editingBusinessInfoByCompany[company.id];
    return {
      email: user?.email || '',
      name: user?.name || '',
      phone: user?.phone || '',
      addressStreet: company?.addressStreet || '',
      addressCity: company?.addressCity || '',
      addressState: company?.addressState || '',
      addressZip: company?.addressZip || '',
      addressCountry: company?.addressCountry || '',
    };
  };

  const saveBusinessInfo = async (companyId: string, userId: string, draft: { email: string; name: string; phone: string; addressStreet: string; addressCity: string; addressState: string; addressZip: string; addressCountry: string }) => {
    setSavingBusinessInfoCompanyId(companyId);
    try {
      const companyRes = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          addressStreet: draft.addressStreet,
          addressCity: draft.addressCity,
          addressState: draft.addressState,
          addressZip: draft.addressZip,
          addressCountry: draft.addressCountry,
        }),
      });
      if (!companyRes.ok) {
        const err = await companyRes.json();
        throw new Error(err?.error || 'Failed to update company info');
      }
      const companyData = await companyRes.json();

      const userRes = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: userId,
          email: draft.email,
          name: draft.name,
          phone: draft.phone,
        }),
      });
      if (!userRes.ok) {
        const err = await userRes.json();
        throw new Error(err?.error || 'Failed to update user info');
      }
      const userData = await userRes.json();

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((c: any) =>
              c.id === companyId
                ? { ...c, ...companyData.company }
                : c
            )
          : prev
      );

      const userObj = users.find((u: any) => u.id === userId);
      if (userObj && userData.user) {
        Object.assign(userObj, userData.user);
      }

      setEditingBusinessInfoByCompany((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
    } catch (error: any) {
      alert(error.message || 'Failed to save business info');
    } finally {
      setSavingBusinessInfoCompanyId(null);
    }
  };

  const getEffectiveTier1Routing = (company: any): { owner: 'CORELYTICS' | 'CONSULTANT'; consultantId: string; supportEmail: string } => {
    const ownerRaw =
      typeof company?.tier1SupportOwner === 'string'
        ? company.tier1SupportOwner.trim().toUpperCase()
        : '';
    const owner =
      ownerRaw === 'CONSULTANT'
        ? 'CONSULTANT'
        : company?.consultantId
          ? 'CONSULTANT'
          : 'CORELYTICS';
    const consultantIdRaw =
      typeof company?.tier1SupportConsultantId === 'string'
        ? company.tier1SupportConsultantId.trim()
        : '';
    const consultantId = consultantIdRaw || (typeof company?.consultantId === 'string' ? company.consultantId : '') || '';
    const supportEmail =
      typeof company?.tier1SupportContactEmail === 'string' && company.tier1SupportContactEmail.trim()
        ? company.tier1SupportContactEmail.trim()
        : owner === 'CORELYTICS' ? 'support@corelytics.com' : '';
    return { owner, consultantId, supportEmail };
  };

  const saveTier1Routing = async (companyId: string, owner: 'CORELYTICS' | 'CONSULTANT', consultantId: string, supportEmail: string) => {
    if (owner === 'CONSULTANT' && !consultantId) {
      alert('Please select a consultant for consultant-owned Tier 1 support.');
      return;
    }

    setSavingTier1RoutingCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          tier1SupportOwner: owner,
          tier1SupportConsultantId: owner === 'CONSULTANT' ? consultantId : null,
          tier1SupportContactEmail: supportEmail || (owner === 'CORELYTICS' ? 'support@corelytics.com' : null),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save Tier 1 support routing');
      }

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((company: any) =>
              company.id === companyId
                ? {
                    ...company,
                    tier1SupportOwner: data?.company?.tier1SupportOwner ?? owner,
                    tier1SupportConsultantId: data?.company?.tier1SupportConsultantId ?? (owner === 'CONSULTANT' ? consultantId : null),
                    tier1SupportContactEmail: data?.company?.tier1SupportContactEmail ?? (owner === 'CONSULTANT' ? supportEmail : null),
                  }
                : company
            )
          : prev
      );

      setEditingTier1RoutingByCompany((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      alert('Tier 1 support routing saved.');
    } catch (error: any) {
      alert(error?.message || 'Failed to save Tier 1 support routing');
    } finally {
      setSavingTier1RoutingCompanyId(null);
    }
  };

  const saveOperationalDataMode = async (companyId: string, forceOperationalMockData: boolean) => {
    setSavingOperationalDataModeCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          forceOperationalMockData,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update operational data mode');
      }

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((company: any) =>
              company.id === companyId
                ? {
                    ...company,
                    forceOperationalMockData:
                      data?.company?.forceOperationalMockData ?? forceOperationalMockData,
                    hasRealOperationalData:
                      data?.company?.hasRealOperationalData ?? company.hasRealOperationalData,
                    realDataActivatedAt:
                      data?.company?.realDataActivatedAt ?? company.realDataActivatedAt,
                  }
                : company
            )
          : prev
      );

      alert(
        forceOperationalMockData
          ? 'Demo mode enabled for this company. Company Pulse and Operations will use mock data.'
          : 'Demo mode disabled. Company Pulse and Operations will use real data when available.',
      );
    } catch (error: any) {
      alert(error?.message || 'Failed to update operational data mode');
    } finally {
      setSavingOperationalDataModeCompanyId(null);
    }
  };

  const getOperationalHubSettings = (company: any): Record<string, any> => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    return (
      uda?.operationalHub &&
      typeof uda.operationalHub === 'object' &&
      !Array.isArray(uda.operationalHub)
        ? uda.operationalHub
        : {}
    );
  };

  const getOperationalHubConfig = (company: any): Record<string, any> => {
    const operationalHub = getOperationalHubSettings(company);
    const sections =
      operationalHub?.sections &&
      typeof operationalHub.sections === 'object' &&
      !Array.isArray(operationalHub.sections)
        ? operationalHub.sections
        : {};
    return sections;
  };

  const getOperationalHubCustomReports = (company: any): OperationalHubCustomReport[] => {
    const operationalHub = getOperationalHubSettings(company);
    const customReports = Array.isArray(operationalHub?.customReports) ? operationalHub.customReports : [];
    return customReports
      .map((entry: any) => {
        const id = String(entry?.id || '').trim();
        const label = String(entry?.label || '').trim();
        const tabKey = String(entry?.tabKey || '').trim();
        const dataType = String(entry?.dataType || '').trim();
        const scope = entry?.scope === 'global' ? 'global' : 'company';
        const createdAt = String(entry?.createdAt || new Date().toISOString());
        const createdByCompanyId = String(entry?.createdByCompanyId || company?.id || '');
        if (!id || !label || !tabKey || !dataType) return null;
        return { id, label, tabKey, dataType, scope, createdAt, createdByCompanyId } as OperationalHubCustomReport;
      })
      .filter(Boolean) as OperationalHubCustomReport[];
  };

  const getOperationalHubTabCategoryOptions = (company: any): Array<{ key: string; label: string; group: string }> => {
    const sectorModules = getTopLineBucketsForSector(company?.industrySectorCategory || null).map((bucket) => String(bucket.key || '').trim());
    const moduleSet = Array.from(new Set(['dashboard', ...sectorModules, 'cash', 'daily_financials'].filter(Boolean)));
    return moduleSet.map((moduleKey) => ({
      key: `tab:${moduleKey}`,
      label:
        moduleKey === 'dashboard'
          ? 'Overview'
          : getModuleLabel(moduleKey) || moduleKey.replace(/_/g, ' '),
      group: 'Tab Categories',
    }));
  };

  const getOperationalHubReportTabOptions = (company: any): Array<{ key: string; label: string; group: string }> =>
    getOperationalHubTabCategoryOptions(company);

  const getSelectedTabCategoryKeys = (company: any, draft?: Record<string, boolean>): Set<string> => {
    const tabOptions = getOperationalHubTabCategoryOptions(company);
    const enabledTabKeys = new Set<string>();
    tabOptions.forEach((option) => {
      const sectionKey = option.key;
      const explicit = draft ? draft[sectionKey] : undefined;
      const enabled = explicit === undefined ? true : explicit !== false;
      if (enabled && sectionKey.startsWith('tab:')) {
        enabledTabKeys.add(sectionKey.slice(4));
      }
    });
    return enabledTabKeys;
  };

  const getSelectedTabCategoryCardGroups = (company: any, draft?: Record<string, boolean>): string[] => {
    const tabOptions = getOperationalHubTabCategoryOptions(company);
    return tabOptions
      .filter((option) => {
        const explicit = draft ? draft[option.key] : undefined;
        return explicit === undefined ? true : explicit !== false;
      })
      .map((option) => option.label);
  };

  const getSectorNameForCompany = (company: any): string => {
    const sectorCategory = String(company?.industrySectorCategory || '').trim();
    const sectorCode = Number.parseInt(sectorCategory, 10);
    const sectorByCode = INDUSTRY_SECTORS.find((item) => Number(item?.sectorCode) === sectorCode);
    return sectorByCode?.sectorName || `Sector ${sectorCategory}`;
  };

  const getOperationalHubSectionOptionsForCompany = (company: any, draft?: Record<string, boolean>): Array<{ key: string; label: string; group: string }> => {
    const tabOptions = getOperationalHubTabCategoryOptions(company);
    const selectedTabOptions = tabOptions.filter((option) => {
      const explicit = draft ? draft[option.key] : undefined;
      return explicit === undefined ? true : explicit !== false;
    });
    const sectionOptionsBySelectedTab = selectedTabOptions.flatMap((option) => {
      const moduleKey = option.key.startsWith('tab:') ? option.key.slice(4) : option.key;
      const dataType = mapModuleToDataType(moduleKey);
      const sourceGroup = dataType ? OPERATIONAL_HUB_SECTIONS_BY_DATATYPE_GROUP[dataType] : null;
      if (!sourceGroup) return [];
      return OPERATIONAL_HUB_SECTION_OPTIONS.filter((item) => item.group === sourceGroup).map((item) => ({
        ...item,
        group: option.label,
      }));
    });
    const customReportOptionsBySelectedTab = selectedTabOptions.flatMap((option) => {
      const moduleKey = option.key.startsWith('tab:') ? option.key.slice(4) : option.key;
      return getOperationalHubCustomReports(company)
        .filter((report) => report.tabKey === moduleKey)
        .map((report) => ({
          key: `customReport:${report.id}`,
          label: report.scope === 'global' ? `${report.label} (global)` : report.label,
          group: option.label,
        }));
    });
    return [...tabOptions, ...sectionOptionsBySelectedTab, ...customReportOptionsBySelectedTab];
  };

  const getOperationalHubDraft = (company: any): Record<string, boolean> => {
    const existing = editingOperationalHubConfigByCompany[company?.id];
    if (existing) return existing;
    const sections = getOperationalHubConfig(company);
    const options = getOperationalHubSectionOptionsForCompany(company, sections);
    return options.reduce<Record<string, boolean>>((acc, option) => {
      const explicit = sections[option.key];
      acc[option.key] = explicit === undefined ? true : explicit !== false;
      return acc;
    }, {});
  };

  const setOperationalHubSection = (company: any, key: string, enabled: boolean) => {
    const draft = getOperationalHubDraft(company);
    setEditingOperationalHubConfigByCompany((prev) => ({
      ...prev,
      [company.id]: {
        ...draft,
        [key]: enabled,
      },
    }));
  };

  const resetOperationalHubConfig = (companyId: string) => {
    setEditingOperationalHubConfigByCompany((prev) => {
      const next = { ...prev };
      delete next[companyId];
      return next;
    });
  };

  const saveOperationalHubConfig = async (companyId: string, draft: Record<string, boolean>) => {
    setSavingOperationalHubConfigCompanyId(companyId);
    try {
      const targetCompany = Array.isArray(companies)
        ? companies.find((company: any) => company?.id === companyId)
        : null;
      const existingOperationalHub = targetCompany ? getOperationalHubSettings(targetCompany) : {};
      const existingSections = targetCompany ? getOperationalHubConfig(targetCompany) : {};
      const mergedSections = { ...existingSections, ...draft };
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          operationalHubConfig: {
            ...existingOperationalHub,
            sections: mergedSections,
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save Operational Hub customization');
      }

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((company: any) =>
              company.id === companyId
                ? {
                    ...company,
                    ...data?.company,
                  }
                : company
            )
          : prev
      );
      resetOperationalHubConfig(companyId);
      alert('Operational Hub customization saved.');
    } catch (error: any) {
      alert(error?.message || 'Failed to save Operational Hub customization');
    } finally {
      setSavingOperationalHubConfigCompanyId(null);
    }
  };

  const getNewOperationalHubReportDraft = (company: any): { label: string; tabKey: string; scope: 'company' | 'global' } => {
    const existing = newOperationalHubReportByCompany[company?.id];
    if (existing) return existing;
    const firstTabKey = getOperationalHubReportTabOptions(company)[0]?.key?.replace(/^tab:/, '') || '';
    return { label: '', tabKey: firstTabKey, scope: 'company' };
  };

  const setNewOperationalHubReportDraft = (
    companyId: string,
    patch: Partial<{ label: string; tabKey: string; scope: 'company' | 'global' }>
  ) => {
    setNewOperationalHubReportByCompany((prev) => {
      const current = prev[companyId] || { label: '', tabKey: '', scope: 'company' as const };
      return {
        ...prev,
        [companyId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const upsertOperationalHubCustomReport = (
    company: any,
    report: OperationalHubCustomReport
  ): Record<string, any> => {
    const currentConfig = getOperationalHubSettings(company);
    const existingReports = getOperationalHubCustomReports(company);
    const nextReports = [...existingReports, report];
    return {
      ...currentConfig,
      customReports: nextReports,
      updatedAt: new Date().toISOString(),
    };
  };

  const createOperationalHubCustomReport = async (company: any) => {
    const draft = getNewOperationalHubReportDraft(company);
    const label = draft.label.trim();
    const tabKey = String(draft.tabKey || '').trim();
    if (!label) {
      alert('Enter a report name.');
      return;
    }
    if (!tabKey) {
      alert('Select a tab category.');
      return;
    }
    const dataType = mapModuleToDataType(tabKey) || (tabKey === 'dashboard' ? 'dashboard' : '');
    if (!dataType) {
      alert('Selected tab category is not mapped to a report family yet.');
      return;
    }
    const report: OperationalHubCustomReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      tabKey,
      dataType,
      scope: draft.scope,
      createdAt: new Date().toISOString(),
      createdByCompanyId: String(company?.id || ''),
    };

    setAddingOperationalHubReportCompanyId(company.id);
    try {
      const targetCompanies =
        draft.scope === 'global'
          ? (Array.isArray(companies) ? companies : [])
          : [company];
      for (const target of targetCompanies) {
        const nextOperationalHubConfig = upsertOperationalHubCustomReport(target, report);
        const response = await fetch('/api/companies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: target.id,
            operationalHubConfig: nextOperationalHubConfig,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || `Failed to add report for ${target?.name || 'company'}`);
        }
        setCompanies((prev: any[]) =>
          Array.isArray(prev)
            ? prev.map((entry: any) =>
                entry.id === target.id
                  ? {
                      ...entry,
                      ...data?.company,
                    }
                  : entry
              )
            : prev
        );
      }

      setNewOperationalHubReportByCompany((prev) => {
        const next = { ...prev };
        next[company.id] = {
          ...getNewOperationalHubReportDraft(company),
          label: '',
        };
        return next;
      });
      alert(draft.scope === 'global' ? 'Report added for all companies.' : 'Report added for this company.');
    } catch (error: any) {
      alert(error?.message || 'Failed to add custom report');
    } finally {
      setAddingOperationalHubReportCompanyId(null);
    }
  };

  const renderOperationalHubCustomizationCard = (company: any) => {
    const draft = getOperationalHubDraft(company);
    const options = getOperationalHubSectionOptionsForCompany(company, draft);
    const newReportDraft = getNewOperationalHubReportDraft(company);
    const tabOptions = getOperationalHubReportTabOptions(company);
    const selectedTabGroups = getSelectedTabCategoryCardGroups(company, draft);
    const groups = Array.from(new Set(['Tab Categories', ...selectedTabGroups, ...options.map((option) => option.group)]));
    return (
      <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>Operational Hub Customization</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Company-level section overrides (takes precedence over sector defaults).
            </div>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newReportDraft.label}
                onChange={(event) => setNewOperationalHubReportDraft(company.id, { label: event.target.value })}
                placeholder="New report name"
                style={{ fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', minWidth: '180px', background: 'white' }}
              />
              <select
                value={newReportDraft.tabKey}
                onChange={(event) => setNewOperationalHubReportDraft(company.id, { tabKey: event.target.value })}
                style={{ fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', background: 'white' }}
              >
                {tabOptions.map((option) => (
                  <option key={`${company.id}-new-report-${option.key}`} value={option.key.replace(/^tab:/, '')}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={newReportDraft.scope}
                onChange={(event) => setNewOperationalHubReportDraft(company.id, { scope: event.target.value === 'global' ? 'global' : 'company' })}
                style={{ fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', background: 'white' }}
              >
                <option value="company">Company only</option>
                <option value="global">All companies (global)</option>
              </select>
              <button
                onClick={() => createOperationalHubCustomReport(company)}
                disabled={addingOperationalHubReportCompanyId === company.id}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #0f766e',
                  borderRadius: '6px',
                  background: '#0f766e',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: addingOperationalHubReportCompanyId === company.id ? 'not-allowed' : 'pointer',
                }}
              >
                Add Report
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => resetOperationalHubConfig(company.id)}
              disabled={savingOperationalHubConfigCompanyId === company.id}
              style={{
                padding: '6px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                background: 'white',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 600,
                cursor: savingOperationalHubConfigCompanyId === company.id ? 'not-allowed' : 'pointer',
              }}
            >
              Reset
            </button>
            <button
              onClick={() => saveOperationalHubConfig(company.id, draft)}
              disabled={savingOperationalHubConfigCompanyId === company.id}
              style={{
                padding: '6px 10px',
                border: '1px solid #1d4ed8',
                borderRadius: '6px',
                background: '#1d4ed8',
                color: 'white',
                fontSize: '12px',
                fontWeight: 600,
                cursor: savingOperationalHubConfigCompanyId === company.id ? 'not-allowed' : 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', gap: '8px' }}>
          {groups.map((group) => (
            <div
              key={`${company.id}-${group}`}
              style={{
                background: group === 'Tab Categories' ? '#eff6ff' : 'white',
                border: group === 'Tab Categories' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '8px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                {group === 'Tab Categories' ? (
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <span>TAB CATEGORIES</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase' }}>
                      SECTOR: {getSectorNameForCompany(company)}
                    </span>
                  </div>
                ) : (
                  group
                )}
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {(() => {
                  const groupOptions = options.filter((option) => option.group === group);
                  if (groupOptions.length === 0) {
                    return (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        No section-level toggles available for this tab yet.
                      </div>
                    );
                  }
                  return groupOptions.map((option) => (
                    <label key={`${company.id}-${option.key}`} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft[option.key])}
                        onChange={(event) => setOperationalHubSection(company, option.key, event.target.checked)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ));
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getDataRoomEnabledByAdmin = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const dataRoom =
      uda?.dataRoom &&
      typeof uda.dataRoom === 'object' &&
      !Array.isArray(uda.dataRoom)
        ? uda.dataRoom
        : {};
    if (typeof dataRoom.enabledByAdmin === 'boolean') {
      return dataRoom.enabledByAdmin;
    }
    // Default new/unspecified companies to enabled for DataRoom controls.
    return true;
  };

  const getDataRoomSubscriptionStatus = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const dataRoom =
      uda?.dataRoom &&
      typeof uda.dataRoom === 'object' &&
      !Array.isArray(uda.dataRoom)
        ? uda.dataRoom
        : {};
    return String(dataRoom?.subscription?.status || 'inactive').toLowerCase();
  };

  const getDataRoomPricing = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const dataRoom =
      uda?.dataRoom &&
      typeof uda.dataRoom === 'object' &&
      !Array.isArray(uda.dataRoom)
        ? uda.dataRoom
        : {};
    const pricing =
      dataRoom?.pricing &&
      typeof dataRoom.pricing === 'object' &&
      !Array.isArray(dataRoom.pricing)
        ? dataRoom.pricing
        : {};

    const isBusinessCompany = company?.consultantId === null;
    const defaultMonthly = isBusinessCompany
      ? Number(defaultDataRoomBusinessMonthlyPrice ?? 0)
      : Number(defaultDataRoomConsultantMonthlyPrice ?? 0);
    const defaultQuarterly = isBusinessCompany
      ? Number(defaultDataRoomBusinessQuarterlyPrice ?? 0)
      : Number(defaultDataRoomConsultantQuarterlyPrice ?? 0);
    const defaultAnnual = isBusinessCompany
      ? Number(defaultDataRoomBusinessAnnualPrice ?? 0)
      : Number(defaultDataRoomConsultantAnnualPrice ?? 0);

    return {
      monthly: Number(pricing?.monthly ?? defaultMonthly),
      quarterly: Number(pricing?.quarterly ?? defaultQuarterly),
      annual: Number(pricing?.annual ?? defaultAnnual),
    };
  };

  const saveDataRoomPricing = async (companyId: string, pricing: { monthly: number; quarterly: number; annual: number }) => {
    setSavingDataRoomPricingCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          dataRoomMonthlyPrice: Number(pricing.monthly || 0),
          dataRoomQuarterlyPrice: Number(pricing.quarterly || 0),
          dataRoomAnnualPrice: Number(pricing.annual || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save DataRoom pricing');
      }
      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((c: any) => (c.id === companyId ? { ...c, ...(data?.company || {}) } : c))
          : prev
      );
      setEditingDataRoomPricingByCompany((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      alert('DataRoom pricing saved.');
    } catch (error: any) {
      alert(error?.message || 'Failed to save DataRoom pricing');
    } finally {
      setSavingDataRoomPricingCompanyId(null);
    }
  };

  const saveDataRoomEnabledByAdmin = async (companyId: string, enabled: boolean) => {
    setSavingDataRoomCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          dataRoomEnabledByAdmin: enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update DataRoom setting');
      }

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((c: any) => (c.id === companyId ? { ...c, ...(data?.company || {}) } : c))
          : prev
      );

      alert(enabled ? 'DataRoom enabled for this company.' : 'DataRoom disabled for this company.');
    } catch (error: any) {
      alert(error?.message || 'Failed to update DataRoom setting');
    } finally {
      setSavingDataRoomCompanyId(null);
    }
  };
  const getValuationEnabledByAdmin = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const valuation =
      uda?.valuation &&
      typeof uda.valuation === 'object' &&
      !Array.isArray(uda.valuation)
        ? uda.valuation
        : {};
    if (typeof valuation.enabledByAdmin === 'boolean') {
      return valuation.enabledByAdmin;
    }
    return true;
  };

  const getValuationSubscriptionStatus = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const valuation =
      uda?.valuation &&
      typeof uda.valuation === 'object' &&
      !Array.isArray(uda.valuation)
        ? uda.valuation
        : {};
    return String(valuation?.subscription?.status || 'inactive').toLowerCase();
  };

  const getValuationPricing = (company: any) => {
    const uda =
      company?.userDefinedAllocations &&
      typeof company.userDefinedAllocations === 'object' &&
      !Array.isArray(company.userDefinedAllocations)
        ? company.userDefinedAllocations
        : {};
    const valuation =
      uda?.valuation &&
      typeof uda.valuation === 'object' &&
      !Array.isArray(uda.valuation)
        ? uda.valuation
        : {};
    const pricing =
      valuation?.pricing &&
      typeof valuation.pricing === 'object' &&
      !Array.isArray(valuation.pricing)
        ? valuation.pricing
        : {};
    return {
      monthly: Number(pricing?.monthly ?? 0),
      quarterly: Number(pricing?.quarterly ?? 0),
      annual: Number(pricing?.annual ?? 0),
    };
  };

  const saveValuationPricing = async (companyId: string, pricing: { monthly: number; quarterly: number; annual: number }) => {
    setSavingValuationPricingCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          valuationMonthlyPrice: Number(pricing.monthly || 0),
          valuationQuarterlyPrice: Number(pricing.quarterly || 0),
          valuationAnnualPrice: Number(pricing.annual || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.message || data?.error || 'Failed to save Valuation pricing';
        if (response.status === 401) {
          alert(message);
          if (typeof window !== 'undefined') {
            window.location.href = '/?sessionExpired=1';
          }
          return;
        }
        throw new Error(message);
      }
      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((c: any) => (c.id === companyId ? { ...c, ...(data?.company || {}) } : c))
          : prev
      );
      setEditingValuationPricingByCompany((prev) => {
        const next = { ...prev };
        delete next[companyId];
        return next;
      });
      alert('Valuation pricing saved.');
    } catch (error: any) {
      alert(error?.message || 'Failed to save Valuation pricing');
    } finally {
      setSavingValuationPricingCompanyId(null);
    }
  };

  const saveValuationEnabledByAdmin = async (companyId: string, enabled: boolean) => {
    setSavingValuationCompanyId(companyId);
    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: companyId,
          valuationEnabledByAdmin: enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.message || data?.error || 'Failed to update Valuation setting';
        if (response.status === 401) {
          alert(message);
          if (typeof window !== 'undefined') {
            window.location.href = '/?sessionExpired=1';
          }
          return;
        }
        throw new Error(message);
      }

      setCompanies((prev: any[]) =>
        Array.isArray(prev)
          ? prev.map((c: any) => (c.id === companyId ? { ...c, ...(data?.company || {}) } : c))
          : prev
      );

      alert(enabled ? 'Valuation enabled for this company.' : 'Valuation disabled for this company.');
    } catch (error: any) {
      alert(error?.message || 'Failed to update Valuation setting');
    } finally {
      setSavingValuationCompanyId(null);
    }
  };
  const [operationalSyncSettingsByCompany, setOperationalSyncSettingsByCompany] = React.useState<
    Record<
      string,
      {
        frequency: 'daily' | 'weekly' | 'monthly';
        pullTime: string;
        syncMode: 'daily_overlap' | 'backfill' | 'business_day_backfill';
        backfillMonths: number;
        lookbackDays: number;
        autoSyncWindowDays: number;
        useCustomMonthRange: boolean;
        customStartMonth: string;
        customEndMonth: string;
        useCustomDateRange: boolean;
        customStartDate: string;
        customEndDate: string;
      }
    >
  >({});
  const currentMonthKey = React.useMemo(() => {
    const now = new Date();
    // UTC bucketing — see lib/date-utils.ts
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [financialImportSettingsByCompany, setFinancialImportSettingsByCompany] = React.useState<
    Record<string, { targetMonth: string }>
  >({});

  const getCompanyOperationalSettings = (companyId: string) =>
    operationalSyncSettingsByCompany[companyId] || {
      frequency: 'daily',
      pullTime: '08:00',
      syncMode: 'business_day_backfill',
      backfillMonths: 36,
      lookbackDays: 30,
      autoSyncWindowDays: 3,
      useCustomMonthRange: false,
      customStartMonth: '',
      customEndMonth: '',
      useCustomDateRange: false,
      customStartDate: '',
      customEndDate: '',
    };

  const setCompanyOperationalSettings = (
    companyId: string,
    next: Partial<{
      frequency: 'daily' | 'weekly' | 'monthly';
      pullTime: string;
      syncMode: 'daily_overlap' | 'backfill' | 'business_day_backfill';
      backfillMonths: number;
      lookbackDays: number;
      autoSyncWindowDays: number;
      useCustomMonthRange: boolean;
      customStartMonth: string;
      customEndMonth: string;
      useCustomDateRange: boolean;
      customStartDate: string;
      customEndDate: string;
    }>
  ) => {
    setOperationalSyncSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        frequency: next.frequency || prev[companyId]?.frequency || 'daily',
        pullTime: next.pullTime || prev[companyId]?.pullTime || '08:00',
        syncMode: next.syncMode || prev[companyId]?.syncMode || 'business_day_backfill',
        backfillMonths: Math.max(1, Number(next.backfillMonths || prev[companyId]?.backfillMonths || 36)),
        lookbackDays: Math.max(1, Number(next.lookbackDays || prev[companyId]?.lookbackDays || 30)),
        autoSyncWindowDays: Math.max(1, Number(next.autoSyncWindowDays || prev[companyId]?.autoSyncWindowDays || 3)),
        useCustomMonthRange:
          typeof next.useCustomMonthRange === 'boolean'
            ? next.useCustomMonthRange
            : prev[companyId]?.useCustomMonthRange || false,
        customStartMonth: next.customStartMonth ?? prev[companyId]?.customStartMonth ?? '',
        customEndMonth: next.customEndMonth ?? prev[companyId]?.customEndMonth ?? '',
        useCustomDateRange:
          typeof next.useCustomDateRange === 'boolean'
            ? next.useCustomDateRange
            : prev[companyId]?.useCustomDateRange || false,
        customStartDate: next.customStartDate ?? prev[companyId]?.customStartDate ?? '',
        customEndDate: next.customEndDate ?? prev[companyId]?.customEndDate ?? '',
      },
    }));
  };

  const monthToRangeStartIso = (monthToken: string): string | null => {
    const raw = String(monthToken || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return null;
    return `${raw}-01T00:00:00.000Z`;
  };

  const monthToRangeEndIso = (monthToken: string): string | null => {
    const raw = String(monthToken || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return null;
    const [yearRaw, monthRaw] = raw.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return end.toISOString();
  };

  const dayToRangeStartIso = (dayToken: string): string | null => {
    const raw = String(dayToken || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    return `${raw}T00:00:00.000Z`;
  };

  const dayToRangeEndIso = (dayToken: string): string | null => {
    const raw = String(dayToken || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    return `${raw}T23:59:59.999Z`;
  };

  const resolveCompanyCsiSite = (companyId: string): string => {
    const programs = getCompanyPrograms(companyId);
    const sites = programs
      .filter((row) => row.enabled !== false)
      .map((row) => String(row.site || '').trim())
      .filter(Boolean);
    return sites[0] || '';
  };

  const requireCompanyCsiSite = (companyId: string): string | null => {
    const company = Array.isArray(companies) ? companies.find((entry: any) => entry.id === companyId) : null;
    const isCsi = String(company?.accountingSystem || '').trim().toUpperCase() === 'INFOR_CSI';
    if (!isCsi) return '';
    const site = resolveCompanyCsiSite(companyId);
    if (site) return site;
    alert('Site is required for CSI probe and sync. Set Site in Accounting Programs first.');
    return null;
  };

  const getCompanyFinancialImportSettings = (companyId: string) =>
    financialImportSettingsByCompany[companyId] || { targetMonth: currentMonthKey };

  const setCompanyFinancialImportSettings = (
    companyId: string,
    next: Partial<{ targetMonth: string }>
  ) => {
    setFinancialImportSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        targetMonth: next.targetMonth || prev[companyId]?.targetMonth || currentMonthKey,
      },
    }));
  };

  type InforAccountingProgramRow = {
    module: string;
    miProgram?: string;
    transactions: string[];
    cono: string;
    divi: string;
    endpointPath?: string;
    mongooseConfig?: string;
    site?: string;
    recordCap?: number;
    properties?: string[];
    enabled: boolean;
  };

  const createEmptyInforAccountingProgramRow = (): InforAccountingProgramRow => ({
    module: '',
    miProgram: '',
    transactions: [],
    cono: '',
    divi: '',
    endpointPath: '',
    mongooseConfig: '',
    site: '',
    enabled: true,
  });

  // Preserve line breaks while typing; backend will normalize on save.
  const parseTransactionsFromInput = (value: string): string[] =>
    value
      .replace(/\r/g, '')
      .split('\n');

  const formatTransactionsForInput = (transactions: string[] | undefined): string =>
    Array.isArray(transactions) ? transactions.join('\n') : '';

  const [accountingProgramsByCompany, setAccountingProgramsByCompany] = React.useState<
    Record<string, InforAccountingProgramRow[]>
  >({});
  const [loadingAccountingProgramsByCompany, setLoadingAccountingProgramsByCompany] = React.useState<
    Record<string, boolean>
  >({});
  const [savingAccountingProgramsByCompany, setSavingAccountingProgramsByCompany] = React.useState<
    Record<string, boolean>
  >({});
  const accountingProgramLoadSeqRef = React.useRef<Record<string, number>>({});

  const isCompanyProgramsLoading = (companyId: string): boolean =>
    Boolean(loadingAccountingProgramsByCompany[companyId]);
  const isCompanyProgramsSaving = (companyId: string): boolean =>
    Boolean(savingAccountingProgramsByCompany[companyId]);

  const getCompanyPrograms = (companyId: string) =>
    accountingProgramsByCompany[companyId] ?? [];

  const setCompanyPrograms = (companyId: string, programs: InforAccountingProgramRow[]) => {
    setAccountingProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };

  const updateCompanyProgram = (
    companyId: string,
    index: number,
    field: keyof InforAccountingProgramRow,
    value: string | boolean | string[]
  ) => {
    const current = getCompanyPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setCompanyPrograms(companyId, next);
  };

  const addCompanyProgram = (companyId: string) => {
    const current = getCompanyPrograms(companyId);
    setCompanyPrograms(companyId, [...current, createEmptyInforAccountingProgramRow()]);
  };

  const deleteCompanyProgram = (companyId: string, index: number) => {
    const current = getCompanyPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setCompanyPrograms(companyId, next.length > 0 ? next : [createEmptyInforAccountingProgramRow()]);
  };

  const loadCompanyPrograms = async (companyId: string, options?: { force?: boolean }) => {
    const cachedPrograms = accountingProgramsByCompany[companyId];
    const hasLoadedPrograms = Array.isArray(cachedPrograms);
    const hasNonEmptyPrograms = hasLoadedPrograms && cachedPrograms.length > 0;
    if (!options?.force && (isCompanyProgramsLoading(companyId) || hasNonEmptyPrograms)) {
      return;
    }
    const requestSeq = (accountingProgramLoadSeqRef.current[companyId] || 0) + 1;
    accountingProgramLoadSeqRef.current[companyId] = requestSeq;
    setLoadingAccountingProgramsByCompany((prev) => ({ ...prev, [companyId]: true }));
    try {
      let response: Response | null = null;
      let data: unknown = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await fetch(`/api/infor-m3/programs?companyId=${companyId}`, { cache: 'no-store' });
          data = await response.json();
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        throw lastError;
      }
      if (!response) {
        throw new Error('Accounting programs request returned no response.');
      }
      if (accountingProgramLoadSeqRef.current[companyId] !== requestSeq) {
        // A newer request completed after this one started; ignore stale payload.
        return;
      }
      const parsed = data as { ok?: boolean; programs?: unknown };
      if (!response.ok || !parsed?.ok || !Array.isArray(parsed?.programs)) {
        // Keep existing edits untouched if reload fails.
        return;
      }
      setCompanyPrograms(companyId, parsed.programs as InforAccountingProgramRow[]);
    } catch (error) {
      console.error('Failed to load accounting programs:', error);
    } finally {
      if (accountingProgramLoadSeqRef.current[companyId] === requestSeq) {
        setLoadingAccountingProgramsByCompany((prev) => ({ ...prev, [companyId]: false }));
      }
    }
  };

  const saveCompanyPrograms = async (companyId: string) => {
    if (isCompanyProgramsSaving(companyId)) return;
    setSavingAccountingProgramsByCompany((prev) => ({ ...prev, [companyId]: true }));
    try {
      const programs = getCompanyPrograms(companyId);
      const response = await fetch('/api/infor-m3/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          programs,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Failed to save accounting programs');
      }
      if (Array.isArray(data?.programs)) {
        setCompanyPrograms(companyId, data.programs as InforAccountingProgramRow[]);
      }
      await loadCompanyPrograms(companyId, { force: true });
      alert('Accounting programs saved for this company.');
    } catch (error: any) {
      alert(`Failed to save accounting programs: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingAccountingProgramsByCompany((prev) => ({ ...prev, [companyId]: false }));
    }
  };

  const [qbDesktopSettingsByCompany, setQbDesktopSettingsByCompany] = React.useState<
    Record<
      string,
      {
        integrationType: 'WEB_CONNECTOR' | 'SDK' | '';
        applicationName: string;
        soapEndpointUrl: string;
        supportUrl: string;
        ownerId: string;
        fileId: string;
        webConnectorUsername: string;
        pollingIntervalMinutes: string;
        permissionScope: 'READ_ONLY' | 'READ_WRITE' | '';
        unattendedAccessRequired: 'YES' | 'NO' | '';
        desktopEditionYear: string;
        countryVersion: string;
        companyFilePath: string;
        hostMachineName: string;
        hostOnlineForSync: 'YES' | 'NO' | '';
        syncDirection: 'QB_TO_PLATFORM' | 'TWO_WAY' | '';
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
      }
    >
  >({});
  const [qbDesktopProgramsByCompany, setQbDesktopProgramsByCompany] = React.useState<
    Record<string, Array<{ dataDomain: string; qbEntity: string }>>
  >({});
  const [qboSettingsByCompany, setQboSettingsByCompany] = React.useState<
    Record<
      string,
      {
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
        operationalLoadMode: 'rolling_90' | 'backfill_3y';
        operationalSyncMode: 'BACKFILL' | 'INCREMENTAL';
        initialSyncStartDate: string;
        incrementalSync: 'YES' | 'NO' | '';
        webhookEnabled: 'YES' | 'NO' | '';
        cdcEnabled: 'YES' | 'NO' | '';
        reconciliationEnabled: 'YES' | 'NO' | '';
      }
    >
  >({});
  const [qboProgramsByCompany, setQboProgramsByCompany] = React.useState<
    Record<string, Array<{ dataDomain: string; qboEntity: string; enabled: boolean }>>
  >({});
  const [dynamicsSettingsByCompany, setDynamicsSettingsByCompany] = React.useState<
    Record<
      string,
      {
        tenantId: string;
        environmentUrl: string;
        legalEntity: string;
        region: string;
        clientId: string;
        clientSecret: string;
        authorityUrl: string;
        scope: string;
        redirectUri: string;
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
        initialSyncStartDate: string;
        incrementalSync: 'YES' | 'NO' | '';
      }
    >
  >({});
  const [dynamicsProgramsByCompany, setDynamicsProgramsByCompany] = React.useState<
    Record<string, Array<{ module: string; entityOrEndpoint: string }>>
  >({});
  const [acumaticaSettingsByCompany, setAcumaticaSettingsByCompany] = React.useState<
    Record<
      string,
      {
        tenantId: string;
        instanceUrl: string;
        companyCode: string;
        branch: string;
        clientId: string;
        clientSecret: string;
        username: string;
        password: string;
        endpointName: string;
        endpointVersion: string;
        contractBasedApiPath: string;
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
        initialSyncStartDate: string;
        incrementalSync: 'YES' | 'NO' | '';
      }
    >
  >({});
  const [acumaticaProgramsByCompany, setAcumaticaProgramsByCompany] = React.useState<
    Record<string, Array<{ module: string; endpointOrEntity: string }>>
  >({});
  const [sageIntacctSettingsByCompany, setSageIntacctSettingsByCompany] = React.useState<
    Record<
      string,
      {
        senderId: string;
        senderPassword: string;
        companyId: string;
        userId: string;
        userPassword: string;
        entityId: string;
        endpointUrl: string;
        dtdVersion: string;
        locationId: string;
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
        initialSyncStartDate: string;
        incrementalSync: 'YES' | 'NO' | '';
      }
    >
  >({});
  const [sageIntacctProgramsByCompany, setSageIntacctProgramsByCompany] = React.useState<
    Record<string, Array<{ module: string; objectName: string }>>
  >({});
  const [odooSettingsByCompany, setOdooSettingsByCompany] = React.useState<
    Record<
      string,
      {
        baseUrl: string;
        database: string;
        username: string;
        password: string;
        apiKey: string;
        companyId: string;
        odooVersion: string;
        authMethod: 'PASSWORD' | 'API_KEY' | '';
        syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
        syncTime: string;
        initialSyncStartDate: string;
        incrementalSync: 'YES' | 'NO' | '';
      }
    >
  >({});
  const [odooProgramsByCompany, setOdooProgramsByCompany] = React.useState<
    Record<string, Array<{ module: string; modelOrEndpoint: string }>>
  >({});

  const defaultQbDesktopSettings = {
    integrationType: 'WEB_CONNECTOR' as 'WEB_CONNECTOR' | 'SDK' | '',
    applicationName: '',
    soapEndpointUrl: '',
    supportUrl: '',
    ownerId: '',
    fileId: '',
    webConnectorUsername: '',
    pollingIntervalMinutes: '60',
    permissionScope: 'READ_ONLY' as 'READ_ONLY' | 'READ_WRITE' | '',
    unattendedAccessRequired: 'YES' as 'YES' | 'NO' | '',
    desktopEditionYear: '',
    countryVersion: '',
    companyFilePath: '',
    hostMachineName: '',
    hostOnlineForSync: 'YES' as 'YES' | 'NO' | '',
    syncDirection: 'QB_TO_PLATFORM' as 'QB_TO_PLATFORM' | 'TWO_WAY' | '',
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
  };

  const defaultQbDesktopPrograms = [
    { dataDomain: 'Chart of Accounts', qbEntity: 'AccountQuery' },
    { dataDomain: 'Customers', qbEntity: 'CustomerQuery' },
    { dataDomain: 'Vendors', qbEntity: 'VendorQuery' },
    { dataDomain: 'Invoices', qbEntity: 'InvoiceQuery' },
    { dataDomain: 'Bills', qbEntity: 'BillQuery' },
    { dataDomain: 'Payments', qbEntity: 'ReceivePaymentQuery' },
  ];
  const defaultQboSettings = {
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
    operationalLoadMode: 'rolling_90' as 'rolling_90' | 'backfill_3y',
    operationalSyncMode: 'BACKFILL' as 'BACKFILL' | 'INCREMENTAL',
    initialSyncStartDate: '',
    incrementalSync: 'YES' as 'YES' | 'NO' | '',
    webhookEnabled: 'YES' as 'YES' | 'NO' | '',
    cdcEnabled: 'YES' as 'YES' | 'NO' | '',
    reconciliationEnabled: 'YES' as 'YES' | 'NO' | '',
  };
  const defaultQboPrograms = [
    { dataDomain: 'Customers', qboEntity: 'Customer', enabled: true },
    { dataDomain: 'Vendors', qboEntity: 'Vendor', enabled: true },
    { dataDomain: 'Products', qboEntity: 'Item', enabled: true },
    { dataDomain: 'AR', qboEntity: 'Invoice', enabled: true },
    { dataDomain: 'AR Payments', qboEntity: 'Payment', enabled: true },
    { dataDomain: 'AP', qboEntity: 'Bill', enabled: true },
    { dataDomain: 'AP Payments', qboEntity: 'BillPayment', enabled: true },
  ];
  const defaultDynamicsSettings = {
    tenantId: '',
    environmentUrl: '',
    legalEntity: '',
    region: '',
    clientId: '',
    clientSecret: '',
    authorityUrl: '',
    scope: '',
    redirectUri: '',
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
    initialSyncStartDate: '',
    incrementalSync: 'YES' as 'YES' | 'NO' | '',
  };
  const defaultDynamicsPrograms = [
    { module: 'Accounts', entityOrEndpoint: 'accounts' },
    { module: 'Customers', entityOrEndpoint: 'customers' },
    { module: 'Vendors', entityOrEndpoint: 'vendors' },
    { module: 'AR', entityOrEndpoint: 'customerledgerentries' },
    { module: 'AP', entityOrEndpoint: 'vendorledgerentries' },
    { module: 'Sales', entityOrEndpoint: 'salesinvoices' },
  ];
  const defaultAcumaticaSettings = {
    tenantId: '',
    instanceUrl: '',
    companyCode: '',
    branch: '',
    clientId: '',
    clientSecret: '',
    username: '',
    password: '',
    endpointName: '',
    endpointVersion: '',
    contractBasedApiPath: '',
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
    initialSyncStartDate: '',
    incrementalSync: 'YES' as 'YES' | 'NO' | '',
  };
  const defaultAcumaticaPrograms = [
    { module: 'Chart of Accounts', endpointOrEntity: 'GLAccounts' },
    { module: 'Customers', endpointOrEntity: 'Customers' },
    { module: 'Vendors', endpointOrEntity: 'Vendors' },
    { module: 'AR', endpointOrEntity: 'ARInvoices' },
    { module: 'AP', endpointOrEntity: 'APBills' },
    { module: 'Sales', endpointOrEntity: 'SalesOrders' },
  ];
  const defaultSageIntacctSettings = {
    senderId: '',
    senderPassword: '',
    companyId: '',
    userId: '',
    userPassword: '',
    entityId: '',
    endpointUrl: '',
    dtdVersion: '3.0',
    locationId: '',
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
    initialSyncStartDate: '',
    incrementalSync: 'YES' as 'YES' | 'NO' | '',
  };
  const defaultSageIntacctPrograms = [
    { module: 'Chart of Accounts', objectName: 'GLACCOUNT' },
    { module: 'Customers', objectName: 'CUSTOMER' },
    { module: 'Vendors', objectName: 'VENDOR' },
    { module: 'AR', objectName: 'ARINVOICE' },
    { module: 'AP', objectName: 'APBILL' },
    { module: 'Sales', objectName: 'SODOCUMENT' },
  ];
  const defaultOdooSettings = {
    baseUrl: '',
    database: '',
    username: '',
    password: '',
    apiKey: '',
    companyId: '',
    odooVersion: '',
    authMethod: 'PASSWORD' as 'PASSWORD' | 'API_KEY' | '',
    syncFrequency: 'daily' as 'daily' | 'weekly' | 'monthly' | '',
    syncTime: '08:00',
    initialSyncStartDate: '',
    incrementalSync: 'YES' as 'YES' | 'NO' | '',
  };
  const defaultOdooPrograms = [
    { module: 'Chart of Accounts', modelOrEndpoint: 'account.account' },
    { module: 'Customers', modelOrEndpoint: 'res.partner' },
    { module: 'Vendors', modelOrEndpoint: 'res.partner' },
    { module: 'AR', modelOrEndpoint: 'account.move (out_invoice)' },
    { module: 'AP', modelOrEndpoint: 'account.move (in_invoice)' },
    { module: 'Sales', modelOrEndpoint: 'sale.order' },
  ];

  const getQbDesktopSettings = (companyId: string) =>
    qbDesktopSettingsByCompany[companyId] || defaultQbDesktopSettings;
  const getQbDesktopPrograms = (companyId: string) =>
    qbDesktopProgramsByCompany[companyId] || defaultQbDesktopPrograms;
  const getQboSettings = (companyId: string) =>
    qboSettingsByCompany[companyId] || defaultQboSettings;
  const getQboPrograms = (companyId: string) =>
    qboProgramsByCompany[companyId] || defaultQboPrograms;
  const getDynamicsSettings = (companyId: string) =>
    dynamicsSettingsByCompany[companyId] || defaultDynamicsSettings;
  const getDynamicsPrograms = (companyId: string) =>
    dynamicsProgramsByCompany[companyId] || defaultDynamicsPrograms;
  const getAcumaticaSettings = (companyId: string) =>
    acumaticaSettingsByCompany[companyId] || defaultAcumaticaSettings;
  const getAcumaticaPrograms = (companyId: string) =>
    acumaticaProgramsByCompany[companyId] || defaultAcumaticaPrograms;
  const getSageIntacctSettings = (companyId: string) =>
    sageIntacctSettingsByCompany[companyId] || defaultSageIntacctSettings;
  const getSageIntacctPrograms = (companyId: string) =>
    sageIntacctProgramsByCompany[companyId] || defaultSageIntacctPrograms;
  const getOdooSettings = (companyId: string) =>
    odooSettingsByCompany[companyId] || defaultOdooSettings;
  const getOdooPrograms = (companyId: string) =>
    odooProgramsByCompany[companyId] || defaultOdooPrograms;

  const setQbDesktopSetting = (
    companyId: string,
    field: keyof typeof defaultQbDesktopSettings,
    value: string
  ) => {
    setQbDesktopSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultQbDesktopSettings),
        [field]: value,
      },
    }));
  };

  const setQbDesktopPrograms = (companyId: string, programs: Array<{ dataDomain: string; qbEntity: string }>) => {
    setQbDesktopProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };
  const setQboSetting = (
    companyId: string,
    field: keyof typeof defaultQboSettings,
    value: string
  ) => {
    setQboSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultQboSettings),
        [field]: value,
      },
    }));
  };
  const setQboPrograms = (
    companyId: string,
    programs: Array<{ dataDomain: string; qboEntity: string; enabled: boolean }>
  ) => {
    setQboProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };
  const setDynamicsSetting = (
    companyId: string,
    field: keyof typeof defaultDynamicsSettings,
    value: string
  ) => {
    setDynamicsSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultDynamicsSettings),
        [field]: value,
      },
    }));
  };
  const setDynamicsPrograms = (companyId: string, programs: Array<{ module: string; entityOrEndpoint: string }>) => {
    setDynamicsProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };
  const setAcumaticaSetting = (
    companyId: string,
    field: keyof typeof defaultAcumaticaSettings,
    value: string
  ) => {
    setAcumaticaSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultAcumaticaSettings),
        [field]: value,
      },
    }));
  };
  const setAcumaticaPrograms = (companyId: string, programs: Array<{ module: string; endpointOrEntity: string }>) => {
    setAcumaticaProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };
  const setSageIntacctSetting = (
    companyId: string,
    field: keyof typeof defaultSageIntacctSettings,
    value: string
  ) => {
    setSageIntacctSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultSageIntacctSettings),
        [field]: value,
      },
    }));
  };
  const setSageIntacctPrograms = (companyId: string, programs: Array<{ module: string; objectName: string }>) => {
    setSageIntacctProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };
  const setOdooSetting = (
    companyId: string,
    field: keyof typeof defaultOdooSettings,
    value: string
  ) => {
    setOdooSettingsByCompany((prev) => ({
      ...prev,
      [companyId]: {
        ...(prev[companyId] || defaultOdooSettings),
        [field]: value,
      },
    }));
  };
  const setOdooPrograms = (companyId: string, programs: Array<{ module: string; modelOrEndpoint: string }>) => {
    setOdooProgramsByCompany((prev) => ({
      ...prev,
      [companyId]: programs,
    }));
  };

  const updateQbDesktopProgram = (
    companyId: string,
    index: number,
    field: 'dataDomain' | 'qbEntity',
    value: string
  ) => {
    const current = getQbDesktopPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setQbDesktopPrograms(companyId, next);
  };

  const addQbDesktopProgram = (companyId: string) => {
    const current = getQbDesktopPrograms(companyId);
    setQbDesktopPrograms(companyId, [...current, { dataDomain: '', qbEntity: '' }]);
  };
  const updateQboProgram = (
    companyId: string,
    index: number,
    field: 'dataDomain' | 'qboEntity' | 'enabled',
    value: string | boolean
  ) => {
    const current = getQboPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setQboPrograms(companyId, next);
  };
  const addQboProgram = (companyId: string) => {
    const current = getQboPrograms(companyId);
    setQboPrograms(companyId, [...current, { dataDomain: '', qboEntity: '', enabled: true }]);
  };
  const updateDynamicsProgram = (
    companyId: string,
    index: number,
    field: 'module' | 'entityOrEndpoint',
    value: string
  ) => {
    const current = getDynamicsPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setDynamicsPrograms(companyId, next);
  };
  const addDynamicsProgram = (companyId: string) => {
    const current = getDynamicsPrograms(companyId);
    setDynamicsPrograms(companyId, [...current, { module: '', entityOrEndpoint: '' }]);
  };
  const updateAcumaticaProgram = (
    companyId: string,
    index: number,
    field: 'module' | 'endpointOrEntity',
    value: string
  ) => {
    const current = getAcumaticaPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setAcumaticaPrograms(companyId, next);
  };
  const addAcumaticaProgram = (companyId: string) => {
    const current = getAcumaticaPrograms(companyId);
    setAcumaticaPrograms(companyId, [...current, { module: '', endpointOrEntity: '' }]);
  };
  const updateSageIntacctProgram = (
    companyId: string,
    index: number,
    field: 'module' | 'objectName',
    value: string
  ) => {
    const current = getSageIntacctPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setSageIntacctPrograms(companyId, next);
  };
  const addSageIntacctProgram = (companyId: string) => {
    const current = getSageIntacctPrograms(companyId);
    setSageIntacctPrograms(companyId, [...current, { module: '', objectName: '' }]);
  };
  const updateOdooProgram = (
    companyId: string,
    index: number,
    field: 'module' | 'modelOrEndpoint',
    value: string
  ) => {
    const current = getOdooPrograms(companyId);
    const next = current.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    setOdooPrograms(companyId, next);
  };
  const addOdooProgram = (companyId: string) => {
    const current = getOdooPrograms(companyId);
    setOdooPrograms(companyId, [...current, { module: '', modelOrEndpoint: '' }]);
  };
  const deleteDynamicsProgram = (companyId: string, index: number) => {
    const current = getDynamicsPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setDynamicsPrograms(companyId, next.length > 0 ? next : [{ module: '', entityOrEndpoint: '' }]);
  };
  const deleteAcumaticaProgram = (companyId: string, index: number) => {
    const current = getAcumaticaPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setAcumaticaPrograms(companyId, next.length > 0 ? next : [{ module: '', endpointOrEntity: '' }]);
  };
  const deleteSageIntacctProgram = (companyId: string, index: number) => {
    const current = getSageIntacctPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setSageIntacctPrograms(companyId, next.length > 0 ? next : [{ module: '', objectName: '' }]);
  };
  const deleteOdooProgram = (companyId: string, index: number) => {
    const current = getOdooPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setOdooPrograms(companyId, next.length > 0 ? next : [{ module: '', modelOrEndpoint: '' }]);
  };

  const deleteQbDesktopProgram = (companyId: string, index: number) => {
    const current = getQbDesktopPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setQbDesktopPrograms(companyId, next.length > 0 ? next : [{ dataDomain: '', qbEntity: '' }]);
  };
  const deleteQboProgram = (companyId: string, index: number) => {
    const current = getQboPrograms(companyId);
    const next = current.filter((_, i) => i !== index);
    setQboPrograms(companyId, next.length > 0 ? next : [{ dataDomain: '', qboEntity: '', enabled: true }]);
  };

  const loadQbDesktopSettings = async (companyId: string) => {
    try {
      const response = await fetch(`/api/quickbooks-desktop/settings?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      if (data?.settings && typeof data.settings === 'object') {
        setQbDesktopSettingsByCompany((prev) => ({
          ...prev,
          [companyId]: { ...defaultQbDesktopSettings, ...data.settings },
        }));
      }
      if (Array.isArray(data?.programs)) {
        setQbDesktopPrograms(companyId, data.programs);
      }
    } catch (error) {
      console.error('Failed to load QuickBooks Desktop settings:', error);
    }
  };
  const loadQboSettings = async (companyId: string) => {
    try {
      const response = await fetch(`/api/quickbooks-online/settings?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      if (data?.settings && typeof data.settings === 'object') {
        setQboSettingsByCompany((prev) => ({
          ...prev,
          [companyId]: { ...defaultQboSettings, ...data.settings },
        }));
      }
      if (Array.isArray(data?.programs)) {
        setQboPrograms(companyId, data.programs);
      }
    } catch (error) {
      console.error('Failed to load QuickBooks Online settings:', error);
    }
  };
  // Dynamics 365 / Acumatica / Sage Intacct / Odoo settings are now handled by
  // the plugin framework (lib/accounting-systems/* + AccountingSystemPanel).
  // The legacy load/save handlers below are no-ops kept only so the inactive
  // legacy inline JSX further down still compiles. They never execute because
  // the new panel renders in their place via isPluginAccountingSystem().
  const loadDynamicsSettings = async (_companyId: string) => {};
  const loadAcumaticaSettings = async (_companyId: string) => {};
  const loadSageIntacctSettings = async (_companyId: string) => {};
  const loadOdooSettings = async (_companyId: string) => {};

  const saveQbDesktopSettings = async (companyId: string) => {
    try {
      const response = await fetch('/api/quickbooks-desktop/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          settings: getQbDesktopSettings(companyId),
          programs: getQbDesktopPrograms(companyId),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Failed to save QuickBooks Desktop settings');
      }
      await loadQbDesktopSettings(companyId);
      alert('QuickBooks Desktop settings saved for this company.');
    } catch (error: any) {
      alert(`Failed to save QuickBooks Desktop settings: ${error?.message || 'Unknown error'}`);
    }
  };
  const saveQboSettings = async (companyId: string) => {
    try {
      const response = await fetch('/api/quickbooks-online/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          settings: getQboSettings(companyId),
          programs: getQboPrograms(companyId),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Failed to save QuickBooks Online settings');
      }
      await loadQboSettings(companyId);
      alert('QuickBooks Online settings saved for this company.');
    } catch (error: any) {
      alert(`Failed to save QuickBooks Online settings: ${error?.message || 'Unknown error'}`);
    }
  };
  // See note above — these saves are no-ops; the new AccountingSystemPanel
  // owns persistence for all plugin-native systems via the generic route at
  // /api/accounting-systems/[system]/settings.
  const saveDynamicsSettings = async (_companyId: string) => {};
  const saveAcumaticaSettings = async (_companyId: string) => {};
  const saveSageIntacctSettings = async (_companyId: string) => {};
  const saveOdooSettings = async (_companyId: string) => {};

  // Rehydrate integration/program settings when returning to Site Admin tabs.
  // This prevents stale in-memory state from showing old values until a hard refresh.
  React.useEffect(() => {
    if (siteAdminTab !== 'consultants' && siteAdminTab !== 'businesses') return;

    const expandedIds = new Set<string>();
    if (siteAdminTab === 'consultants' && Array.isArray(expandedCompanyIds)) {
      expandedCompanyIds.forEach((id) => {
        if (id) expandedIds.add(String(id));
      });
    }
    if (siteAdminTab === 'businesses' && expandedBusinessIds instanceof Set) {
      expandedBusinessIds.forEach((id) => {
        if (id) expandedIds.add(String(id));
      });
    }
    if (expandedIds.size === 0) return;

    expandedIds.forEach((companyId) => {
      const company =
        Array.isArray(companies) ? companies.find((entry: any) => String(entry?.id || '') === companyId) : null;
      if (!company) return;
      const system = String(company?.accountingSystem || '').trim().toUpperCase();

      if (system === 'INFOR_M3' || system === 'INFOR_CSI') {
        loadInforM3Credentials?.(companyId);
        loadCompanyPrograms(companyId);
        checkInforM3Status?.(companyId).then((statusData: any) => {
          if (!statusData) return;
          const frequency = String(statusData.syncFrequency || 'daily').toLowerCase();
          const pullTime = typeof statusData.autoSyncTime === 'string' ? statusData.autoSyncTime : '08:00';
          const autoSyncWindowDays = Math.max(
            1,
            Number.parseInt(String(statusData.autoSyncWindowDays || ''), 10) || 3
          );
          if (frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') {
            setCompanyOperationalSettings(companyId, {
              frequency,
              pullTime,
              autoSyncWindowDays,
            });
          }
        });
        return;
      }

      if (system === 'QUICKBOOKS_DESKTOP') {
        loadQbDesktopSettings(companyId);
        return;
      }
      if (system === 'QUICKBOOKS') {
        loadQboSettings(companyId);
        return;
      }
      if (system === 'DYNAMICS' || system === 'DYNAMICS365') {
        loadDynamicsSettings(companyId);
        return;
      }
      if (system === 'ACUMATICA') {
        loadAcumaticaSettings(companyId);
        return;
      }
      if (system === 'SAGE_INTACCT' || system === 'SAGE') {
        loadSageIntacctSettings(companyId);
        return;
      }
      if (system === 'ODOO') {
        loadOdooSettings(companyId);
      }
    });
  }, [siteAdminTab, expandedCompanyIds, expandedBusinessIds, companies]);

  const parseInforCredentialsFromJson = (raw: string) => {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid JSON object');
    }

    const source = parsed as Record<string, unknown>;
    const read = (...keys: string[]) => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          return value.trim();
        }
      }
      return '';
    };

    const mapped = {
      tenantId: read('tenantId', 'ti'),
      clientName: read('clientName', 'cn'),
      clientId: read('clientId', 'ci'),
      clientSecret: read('clientSecret', 'cs'),
      ionApiBaseUrl: read('ionApiBaseUrl', 'iu'),
      ssoBaseUrl: read('ssoBaseUrl', 'pu'),
      oauthAuthPath: read('oauthAuthPath', 'oa'),
      oauthTokenPath: read('oauthTokenPath', 'ot'),
      oauthRevokePath: read('oauthRevokePath', 'or'),
      serviceAccountAccessKey: read('serviceAccountAccessKey', 'saak'),
      serviceAccountSecretKey: read('serviceAccountSecretKey', 'sask'),
    };

    const requiredMissing = [
      'tenantId',
      'clientId',
      'clientSecret',
      'ionApiBaseUrl',
      'ssoBaseUrl',
      'serviceAccountAccessKey',
      'serviceAccountSecretKey',
    ].filter((key) => !(mapped as Record<string, string>)[key]);

    if (requiredMissing.length > 0) {
      throw new Error(`Missing required keys in file: ${requiredMissing.join(', ')}`);
    }

    return mapped;
  };

  const parseQbDesktopFinancialPayloadFromJson = (raw: string): Record<string, unknown> => {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid JSON object');
    }
    const source = parsed as Record<string, unknown>;
    const payload =
      source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : source;
    const monthlyData = payload.monthlyData;
    if (!Array.isArray(monthlyData) || monthlyData.length === 0) {
      throw new Error('Missing required payload.monthlyData array');
    }
    return payload;
  };

  const handleInforCredentialsFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
    companyId: string,
    companyName: string
  ) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const mapped = parseInforCredentialsFromJson(raw);
      setInforCredentials?.((prev: any) => ({
        ...prev,
        ...mapped,
      }));
      alert(`Imported Infor credentials into form for ${companyName}. Click Save to persist for this company.`);
    } catch (error: any) {
      alert(`Failed to import Infor credentials file: ${error?.message || 'Invalid file format'}`);
    } finally {
      input.value = '';
    }
  };

  const handleQbDesktopFinancialPayloadFileImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
    companyId: string,
    companyName: string
  ) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const payload = parseQbDesktopFinancialPayloadFromJson(raw);
      const financialImportSettings = getCompanyFinancialImportSettings(companyId);
      const response = await fetch('/api/quickbooks-desktop/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          frequency: getCompanyOperationalSettings(companyId).frequency,
          targetMonth: financialImportSettings.targetMonth,
          mode: 'through',
          payload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Failed to import QB Desktop JSON payload');
      }
      await loadQbDesktopSettings(companyId);
      const recordsImported =
        typeof data?.recordsImported === 'number'
          ? data.recordsImported
          : typeof data?.rowsUpserted === 'number'
            ? data.rowsUpserted
            : null;
      alert(
        recordsImported !== null
          ? `Imported QB Desktop JSON for ${companyName}. ${recordsImported} records processed through ${financialImportSettings.targetMonth}.`
          : `Imported QB Desktop JSON for ${companyName} through ${financialImportSettings.targetMonth}.`
      );
    } catch (error: any) {
      alert(`Failed to import QB Desktop JSON file: ${error?.message || 'Invalid file format'}`);
    } finally {
      input.value = '';
    }
  };

  const runInforM3FinancialImport = async (companyId: string, companyName: string) => {
    if (runningFinancialImportByCompany[companyId]) {
      alert('Financial import is already running for this company.');
      return;
    }
    const financialImportSettings = getCompanyFinancialImportSettings(companyId);
    if (!/^\d{4}-\d{2}$/.test(financialImportSettings.targetMonth)) {
      alert('Select a valid target month first (YYYY-MM).');
      return;
    }
    const company = Array.isArray(companies) ? companies.find((entry: any) => entry.id === companyId) : null;
    const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();
    const isCsi = accountingSystem === 'INFOR_CSI';

    setRunningFinancialImportByCompany((prev) => ({ ...prev, [companyId]: true }));
    try {
      const response = await fetch(isCsi ? '/api/financials/publish-month' : '/api/financials/reprocess-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          ...(isCsi
            ? { month: financialImportSettings.targetMonth, force: true }
            : { targetMonth: financialImportSettings.targetMonth, mode: 'through' }),
        }),
      });
      const raw = await response.text();
      const requestId = response.headers.get('x-vercel-id') || '';
      const data = (() => {
        try {
          return raw ? JSON.parse(raw) : {};
        } catch {
          return { error: `Non-JSON response: ${String(raw || '').slice(0, 240)}` };
        }
      })();
      if (!response.ok || (!isCsi && !data?.ok)) {
        const details = data?.details ? ` Details: ${data.details}` : '';
        const rid = requestId ? ` Request ID: ${requestId}` : '';
        throw new Error(`${data?.error || 'Failed to run Infor financial import'}${details}${rid}`);
      }

      const recordsImported = typeof data?.recordsImported === 'number' ? data.recordsImported : null;
      alert(
        isCsi
          ? `CSI month publish complete for ${companyName} (${financialImportSettings.targetMonth}).`
          : recordsImported !== null
            ? `Infor financial import complete for ${companyName}. ${recordsImported} records processed through ${financialImportSettings.targetMonth}.`
            : `Infor financial import complete for ${companyName} through ${financialImportSettings.targetMonth}.`
      );
      await checkInforM3Status?.(companyId);
    } catch (error: any) {
      alert(`Infor financial import failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setRunningFinancialImportByCompany((prev) => ({ ...prev, [companyId]: false }));
    }
  };

  const runInforM3FinancialPayloadPush = async (companyId: string, companyName: string) => {
    const financialImportSettings = getCompanyFinancialImportSettings(companyId);
    if (!/^\d{4}-\d{2}$/.test(financialImportSettings.targetMonth)) {
      alert('Select a valid target month first (YYYY-MM).');
      return;
    }

    try {
      const response = await fetch('/api/infor-m3/financial-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          frequency: getCompanyOperationalSettings(companyId).frequency,
          targetMonth: financialImportSettings.targetMonth,
          mode: 'through',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.details || data?.error || 'Failed to push Infor financial payload');
      }

      const recordsImported = typeof data?.recordsImported === 'number' ? data.recordsImported : null;
      alert(
        recordsImported !== null
          ? `Infor financial payload push complete for ${companyName}. ${recordsImported} records processed through ${financialImportSettings.targetMonth}.`
          : `Infor financial payload push complete for ${companyName}.`
      );
      await checkInforM3Status?.(companyId);
    } catch (error: any) {
      alert(`Infor financial payload push failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const showAccountingWorkflowGuide = (companyName: string) => {
    const label = String(companyName || 'this company').trim() || 'this company';
    alert(
      `Data Load Instructions: ${label}\n\n` +
      `Initial setup / backfill:\n` +
      `1) Run Ops Sync Now\n` +
      `   - Starts background extraction from Infor (chunked run).\n` +
      `   - Wait for sync status to stop showing Running.\n\n` +
      `2) Open Data Mapping (client-owned step)\n` +
      `   - Review account mapping coverage.\n` +
      `   - Map any unmapped/new accounts.\n\n` +
      `3) Save mapping changes\n` +
      `   - Confirm mappings are complete enough for reporting.\n\n` +
      `4) Run Financial Import\n` +
      `   - Reprocesses mapping outputs and builds monthly financials through selected month.\n\n` +
      `5) Validate outputs\n` +
      `   - Review statements/charts.\n` +
      `   - If totals look off, update mapping and rerun Financial Import.\n\n` +
      `Recurring month-end close (client-owned):\n` +
      `1) Close month in ERP\n` +
      `2) Review/save Data Mapping\n` +
      `3) Run Financial Import for closed month/through month\n` +
      `4) Validate published financials`
    );
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Site Administration</h1>
      
      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0' }}>
                <button
                  onClick={() => setSiteAdminTab('consultants')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'consultants' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'consultants' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'consultants' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Consultants
                </button>
                <button
                  onClick={() => setSiteAdminTab('businesses')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'businesses' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'businesses' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'businesses' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Businesses
                </button>
                <button
                  onClick={() => setSiteAdminTab('affiliates')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'affiliates' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'affiliates' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'affiliates' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Affiliates
                </button>
                <button
                  onClick={() => setSiteAdminTab('default-pricing')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'default-pricing' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'default-pricing' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'default-pricing' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Default Pricing
                </button>
                <button
                  onClick={() => setSiteAdminTab('billing')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'billing' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'billing' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'billing' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  💰 Billing & Revenue
                </button>
                <button
                  onClick={() => setSiteAdminTab('siteadmins')}
                  style={{
                    padding: '8px 16px',
                    background: siteAdminTab === 'siteadmins' ? '#667eea' : 'transparent',
                    color: siteAdminTab === 'siteadmins' ? 'white' : '#64748b',
                    border: 'none',
                    borderBottom: siteAdminTab === 'siteadmins' ? '3px solid #667eea' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.2s'
                  }}
                >
                  Site Administrators
                </button>
              </div>

              {/* Consultants Tab */}
              {siteAdminTab === 'consultants' && (
                <>
                  {/* Add Consultant Form */}
                  <div style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddConsultantForm ? '12px' : '0' }}>
                      <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Add New Consultant</h2>
                      <button
                        onClick={() => setShowAddConsultantForm(!showAddConsultantForm)}
                        style={{ 
                          padding: '4px 12px', 
                          background: showAddConsultantForm ? '#f1f5f9' : '#667eea', 
                          color: showAddConsultantForm ? '#475569' : 'white', 
                          border: 'none', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          cursor: 'pointer' 
                        }}
                      >
                        {showAddConsultantForm ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    {showAddConsultantForm && (
                      <>
                        {/* Personal Information Section */}
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Contact Person Information</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Type *"
                          value={newConsultantType}
                          onChange={(e) => setNewConsultantType(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Contact Person *"
                          value={newConsultantFullName}
                          onChange={(e) => setNewConsultantFullName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="email"
                          placeholder="Email *"
                          value={newConsultantEmail}
                          onChange={(e) => setNewConsultantEmail(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <PasswordInput
                          placeholder="Password *"
                          value={newConsultantPassword}
                          onChange={setNewConsultantPassword}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="tel"
                          placeholder="(555) 777-1212"
                          value={newConsultantPhone}
                          onChange={(e) => setNewConsultantPhone(formatPhoneNumber(e.target.value))}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <div style={{ gridColumn: 'span 3', fontSize: '11px', color: '#64748b', lineHeight: '1.4', alignSelf: 'center' }}>
                          Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
                        </div>
                      </div>
                    </div>

                    {/* Company Information Section */}
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company Information (Optional)</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Company Name"
                          value={newConsultantCompanyName}
                          onChange={(e) => setNewConsultantCompanyName(e.target.value)}
                          style={{ gridColumn: 'span 2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Company Address Line 1"
                          value={newConsultantCompanyAddress1}
                          onChange={(e) => setNewConsultantCompanyAddress1(e.target.value)}
                          style={{ gridColumn: 'span 2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="url"
                          placeholder="Company Website"
                          value={newConsultantCompanyWebsite}
                          onChange={(e) => setNewConsultantCompanyWebsite(e.target.value)}
                          style={{ gridColumn: 'span 2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Company Address Line 2"
                          value={newConsultantCompanyAddress2}
                          onChange={(e) => setNewConsultantCompanyAddress2(e.target.value)}
                          style={{ gridColumn: 'span 2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="City"
                          value={newConsultantCompanyCity}
                          onChange={(e) => setNewConsultantCompanyCity(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <select
                          value={newConsultantCompanyState}
                          onChange={(e) => setNewConsultantCompanyState(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: 'white' }}
                        >
                          {US_STATES.map(state => (
                            <option key={state.code} value={state.code}>{state.code || 'State'}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="ZIP"
                          value={newConsultantCompanyZip}
                          onChange={(e) => setNewConsultantCompanyZip(e.target.value)}
                          maxLength={10}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={addConsultant}
                      disabled={isLoading}
                      style={{ 
                        padding: '8px 20px', 
                        background: isLoading ? '#94a3b8' : '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? 'Adding...' : 'Add Consultant'}
                    </button>
                  </>
                )}
                  </div>

                  {/* Consultants List */}
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '10px' }}>
                    Total Consultants: {consultants.filter(c => c.type !== 'business').length}
                  </div>

                  {consultants.filter(c => c.type !== 'business').length === 0 ? (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>👥</div>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>No Consultants</h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Add your first consultant to get started</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {consultants
                        .filter(c => c.type !== 'business')
                        .sort((a: any, b: any) =>
                          (a.companyName || a.fullName || '').localeCompare(
                            b.companyName || b.fullName || '',
                            undefined,
                            { numeric: true, sensitivity: 'base' }
                          )
                        )
                        .map((consultant) => {
                    const consultantCompanies = getConsultantCompanies(consultant.id);
                    const expanded = selectedConsultantId === consultant.id;

                    return (
                      <div key={consultant.id} style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                        {/* Consultant Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div>
                              <h3 
                                onClick={() => {
                                  // Save original site-admin identity once per preview session.
                                  // Do not overwrite with consultant/user identities while drilling deeper.
                                  setSiteAdminViewingAs((prev: any) => prev || currentUser);
                                  // Seed preview with this consultant's companies while background reload runs.
                                  setCompanies(consultantCompanies);
                                  setLoadedConsultantId(null);
                                  // Switch to viewing this consultant's dashboard
                                  setCurrentUser({
                                    ...consultant.user,
                                    role: 'consultant',
                                    consultantId: consultant.id,
                                    consultantType: consultant.type,
                                    consultantCompanyName: consultant.companyName || consultant.fullName,
                                    isPrimaryContact: true // Site admin viewing as primary consultant
                                  });
                                  setCurrentView('consultant-dashboard');
                                  // Scroll main content to top
                                  setTimeout(() => {
                                    const mainElement = document.querySelector('main');
                                    if (mainElement) mainElement.scrollTop = 0;
                                  }, 0);
                                }}
                                style={{ 
                                  fontSize: '15px', 
                                  fontWeight: '600', 
                                  color: '#667eea', 
                                  margin: 0,
                                  marginBottom: '2px',
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#5568d3'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#667eea'}
                              >
                                {consultant.companyName || consultant.fullName}
                              </h3>
                              {consultant.companyName && (
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                                  Contact: {consultant.fullName}
                                </p>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setSelectedConsultantId(expanded ? '' : consultant.id)}
                              style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              {expanded ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                              onClick={() => {
                                const displayName = consultant.companyName || consultant.fullName;
                                if (window.confirm(`Are you sure you want to delete ${displayName}? This action cannot be undone.`)) {
                                  deleteConsultant(consultant.id);
                                }
                              }}
                              style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expanded && (
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '8px' }}>
                            {/* Consultant Information */}
                            <div style={{ marginBottom: '10px', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#475569', margin: 0 }}>Consultant Information</h4>
                                {!editingConsultantInfo[consultant.id] && (
                                  <button
                                    onClick={() => {
                                      setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: {
                                          fullName: consultant.fullName,
                                          email: consultant.email,
                                          address: consultant.address || '',
                                          phone: consultant.phone || '',
                                          type: consultant.type || '',
                                          companyName: consultant.companyName || '',
                                          companyAddress1: consultant.companyAddress1 || '',
                                          companyAddress2: consultant.companyAddress2 || '',
                                          companyCity: consultant.companyCity || '',
                                          companyState: consultant.companyState || '',
                                          companyZip: consultant.companyZip || '',
                                          companyWebsite: consultant.companyWebsite || '',
                                          revenueSharePercentage: consultant.revenueSharePercentage ?? 50
                                        }
                                      });
                                    }}
                                    style={{ padding: '3px 8px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              
                              {editingConsultantInfo[consultant.id] ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Contact Person</label>
                                      <input
                                        type="text"
                                        value={editingConsultantInfo[consultant.id].fullName}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], fullName: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Phone</label>
                                      <input
                                        type="text"
                                        value={editingConsultantInfo[consultant.id].phone}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], phone: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Email</label>
                                    <input
                                      type="email"
                                      value={editingConsultantInfo[consultant.id].email}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], email: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Company Name</label>
                                    <input
                                      type="text"
                                      value={editingConsultantInfo[consultant.id].companyName || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyName: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Company Address</label>
                                    <input
                                      type="text"
                                      placeholder="Address Line 1"
                                      value={editingConsultantInfo[consultant.id].companyAddress1 || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyAddress1: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', marginBottom: '4px' }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Address Line 2 (Optional)"
                                      value={editingConsultantInfo[consultant.id].companyAddress2 || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyAddress2: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', marginBottom: '4px' }}
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '4px' }}>
                                      <input
                                        type="text"
                                        placeholder="City"
                                        value={editingConsultantInfo[consultant.id].companyCity || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyCity: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                      <select
                                        value={editingConsultantInfo[consultant.id].companyState || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyState: e.target.value }
                                        })}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', backgroundColor: 'white' }}
                                      >
                                        {US_STATES.map(state => (
                                          <option key={state.code} value={state.code}>{state.code || 'State'}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        placeholder="ZIP"
                                        value={editingConsultantInfo[consultant.id].companyZip || ''}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], companyZip: e.target.value }
                                        })}
                                        maxLength={10}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </div>
                                  </div>
                                  <div style={{ marginTop: '6px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '2px' }}>Company Website</label>
                                    <input
                                      type="url"
                                      value={editingConsultantInfo[consultant.id].companyWebsite || ''}
                                      onChange={(e) => setEditingConsultantInfo({
                                        ...editingConsultantInfo,
                                        [consultant.id]: { ...editingConsultantInfo[consultant.id], companyWebsite: e.target.value }
                                      })}
                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                    />
                                  </div>
                                  <div style={{ marginTop: '6px', padding: '10px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                    <label style={{ fontSize: '10px', fontWeight: '600', color: '#92400e', display: 'block', marginBottom: '4px' }}>💰 Revenue Share Percentage</label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={editingConsultantInfo[consultant.id].revenueSharePercentage ?? 50}
                                        onChange={(e) => setEditingConsultantInfo({
                                          ...editingConsultantInfo,
                                          [consultant.id]: { ...editingConsultantInfo[consultant.id], revenueSharePercentage: parseFloat(e.target.value) || 0 }
                                        })}
                                        style={{ width: '80px', padding: '4px 6px', border: '1px solid #fbbf24', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                      <span style={{ fontSize: '11px', color: '#92400e' }}>%</span>
                                      <span style={{ fontSize: '10px', color: '#92400e', marginLeft: '8px' }}>
                                        (Platform: {(100 - (editingConsultantInfo[consultant.id].revenueSharePercentage ?? 50)).toFixed(1)}%)
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '9px', color: '#92400e', marginTop: '4px' }}>
                                      ℹ️ This is the consultant's share of revenue from their companies. Default is 50%.
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                    <button
                                      onClick={() => {
                                        updateConsultantInfo(consultant.id, editingConsultantInfo[consultant.id]);
                                      }}
                                      style={{ padding: '4px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingConsultantInfo((prev) => {
                                          const newState = { ...prev };
                                          delete newState[consultant.id];
                                          return newState;
                                        });
                                      }}
                                      style={{ padding: '4px 12px', background: '#64748b', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                  <div><span style={{ fontWeight: '600' }}>Email:</span> {consultant.email}</div>
                                  <div><span style={{ fontWeight: '600' }}>Phone:</span> {consultant.phone || 'N/A'}</div>
                                  <div style={{ gridColumn: '1 / -1' }}><span style={{ fontWeight: '600' }}>Company Name:</span> {consultant.companyName || 'N/A'}</div>
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ fontWeight: '600' }}>Company Address:</span> {
                                      consultant.companyAddress1 ? (
                                        <>
                                          {consultant.companyAddress1}
                                          {consultant.companyAddress2 && `, ${consultant.companyAddress2}`}
                                          {consultant.companyCity && `, ${consultant.companyCity}`}
                                          {consultant.companyState && `, ${consultant.companyState}`}
                                          {consultant.companyZip && ` ${consultant.companyZip}`}
                                        </>
                                      ) : 'N/A'
                                    }
                                  </div>
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ fontWeight: '600' }}>Company Website:</span> {consultant.companyWebsite ? (
                                      <a 
                                        href={consultant.companyWebsite.startsWith('http://') || consultant.companyWebsite.startsWith('https://') 
                                          ? consultant.companyWebsite 
                                          : `https://${consultant.companyWebsite}`
                                        } 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ color: '#667eea', textDecoration: 'underline', marginLeft: '4px' }}
                                      >
                                        {consultant.companyWebsite}
                                      </a>
                                    ) : 'N/A'}
                                  </div>
                                  <div style={{ gridColumn: '1 / -1', padding: '6px', background: '#fef3c7', borderRadius: '4px', marginTop: '4px' }}>
                                    <span style={{ fontWeight: '600', color: '#92400e' }}>💰 Revenue Share:</span> 
                                    <span style={{ color: '#92400e', marginLeft: '4px' }}>
                                      {consultant.revenueSharePercentage ?? 50}% consultant / {100 - (consultant.revenueSharePercentage ?? 50)}% platform
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                              Companies ({consultantCompanies.length})
                            </h4>
                            
                            {consultantCompanies.length === 0 ? (
                              <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '10px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No companies yet</p>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: '6px' }}>
                                {consultantCompanies.map((company) => {
                                  const companyUsers = getCompanyUsers(company.id);
                                  const isCompanyExpanded = expandedCompanyIds.includes(company.id);
                                  const editing = editingPricing[company.id];
                                  
                                  return (
                                    <div key={company.id} style={{ background: '#f8fafc', borderRadius: '6px', padding: '6px 8px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCompanyExpanded ? '6px' : '0' }}>
                                        <div style={{ flex: 1 }}>
                                          <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0, lineHeight: '1.2' }}>{company.name}</h5>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#667eea' }}>
                                            {companyUsers.length} user{companyUsers.length !== 1 ? 's' : ''}
                                          </div>
                                          <button
                                            onClick={() => {
                                              setExpandedCompanyIds(prev => {
                                                const isExpandedNow = prev.includes(company.id);
                                                if (isExpandedNow) {
                                                  return prev.filter(id => id !== company.id);
                                                }
                                                setSelectedCompanyId(company.id);
                                                if (['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase())) {
                                                  loadInforM3Credentials?.(company.id);
                                                  loadCompanyPrograms(company.id);
                                                  checkInforM3Status?.(company.id).then((statusData: any) => {
                                                    if (!statusData) return;
                                                    const frequency = String(statusData.syncFrequency || 'daily').toLowerCase();
                                                    const pullTime =
                                                      typeof statusData.autoSyncTime === 'string' ? statusData.autoSyncTime : '08:00';
                                                    if (frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') {
                                                      setCompanyOperationalSettings(company.id, {
                                                        frequency,
                                                        pullTime,
                                                      });
                                                    }
                                                  });
                                                } else if (company.accountingSystem === 'QUICKBOOKS_DESKTOP') {
                                                  loadQbDesktopSettings(company.id);
                                                } else if (company.accountingSystem === 'QUICKBOOKS') {
                                                  loadQboSettings(company.id);
                                                } else if (company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365') {
                                                  loadDynamicsSettings(company.id);
                                                } else if (company.accountingSystem === 'ACUMATICA') {
                                                  loadAcumaticaSettings(company.id);
                                                } else if (company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE') {
                                                  loadSageIntacctSettings(company.id);
                                                } else if (company.accountingSystem === 'ODOO') {
                                                  loadOdooSettings(company.id);
                                                }
                                                return [...prev, company.id];
                                              });
                                            }}
                                            style={{ 
                                              padding: '4px 10px', 
                                              background: isCompanyExpanded ? '#f1f5f9' : '#667eea', 
                                              color: isCompanyExpanded ? '#475569' : 'white', 
                                              border: 'none', 
                                              borderRadius: '4px', 
                                              fontSize: '12px', 
                                              fontWeight: '600', 
                                              cursor: 'pointer' 
                                            }}
                                          >
                                            {isCompanyExpanded ? 'Collapse' : 'Expand'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Expanded Details */}
                                      {isCompanyExpanded && (
                                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px', marginTop: '8px' }}>
                                          <div style={{ marginBottom: '8px' }}>
                                            <div style={{ padding: '0 12px 12px 12px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Information</h4>
                                              <div
                                                style={{
                                                  display: 'grid',
                                                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                                                  gap: '6px 14px',
                                                  fontSize: '13px',
                                                  color: '#64748b',
                                                  lineHeight: '1.5',
                                                }}
                                              >
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Company Name:</strong> {company?.name || 'Not found'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{company?.id}</span></div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Sector:</strong> {company?.industrySectorCategory ? `${company.industrySectorCategory} - ${getSectorNameForCompany(company)}` : 'Not set'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Industry:</strong> {company?.industrySector ? `${company.industrySector} - ${INDUSTRY_SECTORS.find(s => s.id === company.industrySector)?.name || 'Unknown'}` : 'Not set'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Type:</strong> Consultant Business</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Address Street:</strong> {company?.addressStreet || 'Not provided'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Address City:</strong> {company?.addressCity || 'Not provided'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Address State:</strong> {company?.addressState || 'Not provided'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Address ZIP:</strong> {company?.addressZip || 'Not provided'}</div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>Address Country:</strong> {company?.addressCountry || 'Not provided'}</div>
                                              </div>
                                            </div>
                                          </div>

                                          {['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase()) && (
                                            <div style={{ marginBottom: '8px', padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                                <div>
                                                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration</h4>
                                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {getAccountingSystemLabel(company.accountingSystem)}
                                                  </div>
                                                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                      onClick={() => connectInforM3?.(company.id)}
                                                      disabled={inforBusy}
                                                      style={{ padding: '8px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      {inforBusy && inforBusyAction === 'connect' ? 'Working...' : (inforConnected ? 'Connected' : 'Reconnect')}
                                                    </button>
                                                    <button
                                                      onClick={() => disconnectInforM3?.(company.id)}
                                                      disabled={inforBusy || !inforConnected}
                                                      style={{ padding: '8px 12px', background: 'white', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      Disconnect
                                                    </button>
                                                  </div>
                                                </div>
                                                <input
                                                  id={`consultant-infor-json-file-${company.id}`}
                                                  type="file"
                                                  accept=".json,.txt,.ionapi"
                                                  style={{ display: 'none' }}
                                                  onChange={(event) =>
                                                    handleInforCredentialsFileImport(event, company.id, company.name)
                                                  }
                                                />
                                                <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(0, 1fr) minmax(0, 1.12fr) minmax(0, 0.7fr)', gap: '8px' }}>
                                                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>CONNECTION</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', alignItems: 'center', justifyContent: 'start' }}>
                                                      <button
                                                        onClick={() => {
                                                          const fileInput = document.getElementById(`consultant-infor-json-file-${company.id}`) as HTMLInputElement | null;
                                                          fileInput?.click();
                                                        }}
                                                        disabled={inforBusy}
                                                        style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        Import JSON
                                                      </button>
                                                      <button
                                                        onClick={() => testInforM3Token?.(company.id)}
                                                        disabled={inforBusy || !inforConnected}
                                                        style={{ padding: '8px 12px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        Test Token
                                                      </button>
                                                      <button
                                                        onClick={async () => {
                                                          await saveInforM3Credentials?.(company.id, {
                                                            frequency: getCompanyOperationalSettings(company.id).frequency,
                                                            pullTime: getCompanyOperationalSettings(company.id).pullTime,
                                                            autoSyncWindowDays:
                                                              getCompanyOperationalSettings(company.id).autoSyncWindowDays,
                                                          });
                                                          await saveCompanyPrograms(company.id);
                                                        }}
                                                        disabled={inforBusy}
                                                        style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        Save
                                                      </button>
                                                      <input
                                                        type="month"
                                                        value={getCompanyFinancialImportSettings(company.id).targetMonth}
                                                        onChange={(e) =>
                                                          setCompanyFinancialImportSettings(company.id, { targetMonth: e.target.value })
                                                        }
                                                        style={{ width: '100%', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      />
                                                      <button
                                                        onClick={() => runInforM3FinancialPayloadPush(company.id, company.name)}
                                                        disabled={inforBusy || !inforConnected}
                                                        style={{ width: '100%', minWidth: 0, padding: '8px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        Push Financial Payload
                                                      </button>
                                                      <button
                                                        onClick={() => runInforM3FinancialImport(company.id, company.name)}
                                                        disabled={inforBusy || !inforConnected || !!runningFinancialImportByCompany[company.id]}
                                                        style={{ width: '100%', minWidth: 0, padding: '8px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected || !!runningFinancialImportByCompany[company.id] ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        {runningFinancialImportByCompany[company.id] ? 'Running Financial Import...' : 'Run Financial Import'}
                                                      </button>
                                                    </div>
                                                  </div>
                                                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>SYNC ACTIONS</div>
                                                    {renderInforSyncStatusPanel(company.id)}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', alignItems: 'center' }}>
                                                      <button
                                                        onClick={() => {
                                                          if (!runInforM3OperationalSync) {
                                                            alert('Operational sync handler is unavailable. Refresh and try again.');
                                                            return;
                                                          }
                                                          const site = requireCompanyCsiSite(company.id);
                                                          if (!site) return;
                                                          const syncSettings = getCompanyOperationalSettings(company.id);
                                                          const useCustomDayRange = Boolean(syncSettings.useCustomDateRange);
                                                          const useCustomMonthRange = Boolean(syncSettings.useCustomMonthRange);
                                                          const startDate = useCustomDayRange
                                                            ? dayToRangeStartIso(syncSettings.customStartDate)
                                                            : useCustomMonthRange
                                                              ? monthToRangeStartIso(syncSettings.customStartMonth)
                                                              : undefined;
                                                          const endDate = useCustomDayRange
                                                            ? dayToRangeEndIso(syncSettings.customEndDate)
                                                            : useCustomMonthRange
                                                              ? monthToRangeEndIso(syncSettings.customEndMonth)
                                                              : undefined;
                                                          // Month-range inputs are normalized to concrete day-level
                                                          // start/end dates before dispatch; allow either mode.
                                                          if (syncSettings.syncMode === 'business_day_backfill' && !useCustomDayRange && !useCustomMonthRange) {
                                                            alert('Historical Daily Backfill requires a custom Start/End range (day-level or month-level).');
                                                            return;
                                                          }
                                                          if (useCustomDayRange || useCustomMonthRange) {
                                                            if (!startDate || !endDate) {
                                                              alert(
                                                                useCustomDayRange
                                                                  ? 'Set both Start Date and End Date for custom range sync.'
                                                                  : 'Set both Start Month and End Month for custom range sync.'
                                                              );
                                                              return;
                                                            }
                                                            if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
                                                              alert(
                                                                useCustomDayRange
                                                                  ? 'Custom range is invalid: Start Date must be before End Date.'
                                                                  : 'Custom range is invalid: Start Month must be before End Month.'
                                                              );
                                                              return;
                                                            }
                                                          }
                                                          // Explicit date ranges (day or month) ALWAYS require day-level fan-out
                                                          // ('business_day_backfill'). Single-shot 'manual' over a multi-day window
                                                          // only processes one chunk and silently leaves snapshots incomplete
                                                          // (this is the trap that broke the AR Jan 2026 backfill on 2026-04-17).
                                                          runInforM3OperationalSync(company.id, syncSettings.frequency, site, {
                                                            mode:
                                                              useCustomDayRange || useCustomMonthRange
                                                                ? 'business_day_backfill'
                                                                : syncSettings.syncMode,
                                                            backfillMonths:
                                                              useCustomDayRange || useCustomMonthRange ? undefined : syncSettings.backfillMonths,
                                                            lookbackDays:
                                                              useCustomDayRange || useCustomMonthRange ? undefined : syncSettings.lookbackDays,
                                                            startDate,
                                                            endDate,
                                                          });
                                                        }}
                                                        disabled={inforBusy}
                                                        style={{ justifySelf: 'start', padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        {inforBusy && inforBusyAction === 'operational_sync' ? 'Working...' : 'Run Ops Sync Now'}
                                                      </button>
                                                      <button
                                                        onClick={() => resetInforM3OperationalSyncState?.(company.id)}
                                                        disabled={inforBusy}
                                                        style={{ justifySelf: 'start', padding: '8px 12px', background: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                                      >
                                                        {inforBusy && inforBusyAction === 'operational_sync_reset' ? 'Resetting...' : 'Reset Sync State'}
                                                      </button>
                                                    </div>
                                                  </div>
                                                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: '#f8fafc', gridColumn: '4', gridRow: '1' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>OPERATIONAL DATA MODE</div>
                                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                                      {company.forceOperationalMockData
                                                        ? 'Demo mode is ON. Mock data is being served.'
                                                        : company.hasRealOperationalData
                                                          ? `Real data mode is ON${company.realDataActivatedAt ? ` (activated ${new Date(company.realDataActivatedAt).toLocaleString()})` : ''}.`
                                                          : 'Demo mode is active until real operational data is detected.'}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                      <button
                                                        onClick={() => saveOperationalDataMode(company.id, true)}
                                                        disabled={savingOperationalDataModeCompanyId === company.id || company.forceOperationalMockData}
                                                        style={{
                                                          padding: '6px 10px',
                                                          background: company.forceOperationalMockData ? '#0f766e' : 'white',
                                                          color: company.forceOperationalMockData ? 'white' : '#0f766e',
                                                          border: '1px solid #0f766e',
                                                          borderRadius: '6px',
                                                          fontSize: '12px',
                                                          fontWeight: '600',
                                                          cursor: savingOperationalDataModeCompanyId === company.id || company.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                        }}
                                                      >
                                                        Force Demo Mode
                                                      </button>
                                                      <button
                                                        onClick={() => saveOperationalDataMode(company.id, false)}
                                                        disabled={savingOperationalDataModeCompanyId === company.id || !company.forceOperationalMockData}
                                                        style={{
                                                          padding: '6px 10px',
                                                          background: !company.forceOperationalMockData ? '#1d4ed8' : 'white',
                                                          color: !company.forceOperationalMockData ? 'white' : '#1d4ed8',
                                                          border: '1px solid #1d4ed8',
                                                          borderRadius: '6px',
                                                          fontSize: '12px',
                                                          fontWeight: '600',
                                                          cursor: savingOperationalDataModeCompanyId === company.id || !company.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                        }}
                                                      >
                                                        Use Real Data
                                                      </button>
                                                    </div>
                                                  </div>
                                                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: '#f8fafc', gridColumn: '3', gridRow: '1' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>SYNC WINDOW</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                                                      <label
                                                        style={{
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          gap: '8px',
                                                          fontSize: '12px',
                                                          color: '#334155',
                                                          gridColumn: '1 / -1',
                                                        }}
                                                      >
                                                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: '40px' }}>Mode</span>
                                                        <select
                                                          value={getCompanyOperationalSettings(company.id).syncMode}
                                                          onChange={(e) =>
                                                            setCompanyOperationalSettings(company.id, {
                                                              syncMode:
                                                                e.target.value === 'business_day_backfill'
                                                                  ? 'business_day_backfill'
                                                                  : e.target.value === 'backfill'
                                                                    ? 'backfill'
                                                                    : 'daily_overlap',
                                                            })
                                                          }
                                                          style={{ flex: 1, width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        >
                                                          <option value="daily_overlap">Daily Auto Sync (Recommended)</option>
                                                          <option value="business_day_backfill">Historical Daily Backfill (Business Days)</option>
                                                          <option value="backfill">Window Refresh (Advanced)</option>
                                                        </select>
                                                      </label>
                                                      <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                        {getCompanyOperationalSettings(company.id).syncMode === 'daily_overlap'
                                                          ? 'Use for normal daily updates. Applies a rolling overlap window to catch late updates.'
                                                          : getCompanyOperationalSettings(company.id).syncMode === 'business_day_backfill'
                                                            ? 'Use to rebuild historical daily snapshots day-by-day (most reliable for history fixes).'
                                                            : 'Advanced: refreshes a broad transaction window, but may not replay each day discretely.'}
                                                      </div>
                                                      <label
                                                        style={{
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          gap: '8px',
                                                          fontSize: '12px',
                                                          color: '#334155',
                                                          gridColumn: '1 / -1',
                                                        }}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={Boolean(getCompanyOperationalSettings(company.id).useCustomMonthRange)}
                                                          onChange={(e) =>
                                                            setCompanyOperationalSettings(company.id, {
                                                              useCustomMonthRange: e.target.checked,
                                                            })
                                                          }
                                                        />
                                                        <span style={{ fontWeight: 600 }}>
                                                          Use Custom Month Range (chunk large history loads)
                                                        </span>
                                                      </label>
                                                      <label
                                                        style={{
                                                          display: 'flex',
                                                          alignItems: 'center',
                                                          gap: '8px',
                                                          fontSize: '12px',
                                                          color: '#334155',
                                                          gridColumn: '1 / -1',
                                                        }}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={Boolean(getCompanyOperationalSettings(company.id).useCustomDateRange)}
                                                          onChange={(e) =>
                                                            setCompanyOperationalSettings(company.id, {
                                                              useCustomDateRange: e.target.checked,
                                                            })
                                                          }
                                                        />
                                                        <span style={{ fontWeight: 600 }}>
                                                          Use Explicit Date Range (day-level, recommended for historical backfill)
                                                        </span>
                                                      </label>
                                                      {getCompanyOperationalSettings(company.id).useCustomDateRange && (
                                                        <>
                                                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                            <span style={{ fontWeight: 600 }}>Start Date</span>
                                                            <input
                                                              type="date"
                                                              value={getCompanyOperationalSettings(company.id).customStartDate}
                                                              onChange={(e) =>
                                                                setCompanyOperationalSettings(company.id, {
                                                                  customStartDate: e.target.value,
                                                                })
                                                              }
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </label>
                                                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                            <span style={{ fontWeight: 600 }}>End Date</span>
                                                            <input
                                                              type="date"
                                                              value={getCompanyOperationalSettings(company.id).customEndDate}
                                                              onChange={(e) =>
                                                                setCompanyOperationalSettings(company.id, {
                                                                  customEndDate: e.target.value,
                                                                })
                                                              }
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </label>
                                                          <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                            Historical Daily Backfill now requires explicit day-level Start/End dates.
                                                          </div>
                                                        </>
                                                      )}
                                                      {getCompanyOperationalSettings(company.id).useCustomMonthRange && (
                                                        <>
                                                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                            <span style={{ fontWeight: 600 }}>Start Month</span>
                                                            <input
                                                              type="month"
                                                              value={getCompanyOperationalSettings(company.id).customStartMonth}
                                                              onChange={(e) =>
                                                                setCompanyOperationalSettings(company.id, {
                                                                  customStartMonth: e.target.value,
                                                                })
                                                              }
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </label>
                                                          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                            <span style={{ fontWeight: 600 }}>End Month</span>
                                                            <input
                                                              type="month"
                                                              value={getCompanyOperationalSettings(company.id).customEndMonth}
                                                              onChange={(e) =>
                                                                setCompanyOperationalSettings(company.id, {
                                                                  customEndMonth: e.target.value,
                                                                })
                                                              }
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </label>
                                                          <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                            Runs only the selected month band. Use this to split large 36-month initial loads into smaller chunks.
                                                          </div>
                                                        </>
                                                      )}
                                                      {(getCompanyOperationalSettings(company.id).syncMode === 'business_day_backfill' ||
                                                        getCompanyOperationalSettings(company.id).syncMode === 'backfill') &&
                                                        !getCompanyOperationalSettings(company.id).useCustomMonthRange &&
                                                        !getCompanyOperationalSettings(company.id).useCustomDateRange && (
                                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                          <span style={{ fontWeight: 600 }}>Backfill Months</span>
                                                          <input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            value={getCompanyOperationalSettings(company.id).backfillMonths}
                                                            onChange={(e) =>
                                                              setCompanyOperationalSettings(company.id, {
                                                                backfillMonths: Number(e.target.value || 36),
                                                              })
                                                            }
                                                            style={{ width: '50%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                          />
                                                        </label>
                                                      )}
                                                      {getCompanyOperationalSettings(company.id).syncMode === 'daily_overlap' &&
                                                        !getCompanyOperationalSettings(company.id).useCustomMonthRange && (
                                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                          <span style={{ fontWeight: 600 }}>Overlap Days</span>
                                                          <input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            value={getCompanyOperationalSettings(company.id).lookbackDays}
                                                            onChange={(e) =>
                                                              setCompanyOperationalSettings(company.id, {
                                                                lookbackDays: Number(e.target.value || 30),
                                                              })
                                                            }
                                                            style={{ width: '50%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                          />
                                                        </label>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )}

                                          {isPluginAccountingSystem(company.accountingSystem) && (
                                            <div style={{ marginBottom: '12px' }}>
                                              <AccountingSystemPanel
                                                companyId={company.id}
                                                system={String(company.accountingSystem || '')}
                                              />
                                            </div>
                                          )}

                                          <div style={{ display: isPluginAccountingSystem(company.accountingSystem) ? 'none' : 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                            <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                                <div>
                                                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                                                    {['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase()) ? 'Connection Credentials' : 'Accounting Integration'}
                                                  </h4>
                                                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {getAccountingSystemLabel(company.accountingSystem)}
                                                  </div>
                                                </div>
                                                {['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase()) && null}
                                                {company.accountingSystem === 'QUICKBOOKS_DESKTOP' && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <input
                                                      id={`consultant-qbdesktop-json-file-${company.id}`}
                                                      type="file"
                                                      accept=".json"
                                                      style={{ display: 'none' }}
                                                      onChange={(event) =>
                                                        handleQbDesktopFinancialPayloadFileImport(event, company.id, company.name)
                                                      }
                                                    />
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
                                                      <input
                                                        type="month"
                                                        value={getCompanyFinancialImportSettings(company.id).targetMonth}
                                                        onChange={(e) =>
                                                          setCompanyFinancialImportSettings(company.id, { targetMonth: e.target.value })
                                                        }
                                                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      />
                                                      <button
                                                        onClick={() => {
                                                          const fileInput = document.getElementById(`consultant-qbdesktop-json-file-${company.id}`) as HTMLInputElement | null;
                                                          fileInput?.click();
                                                        }}
                                                        style={{ padding: '8px 12px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                      >
                                                        Import JSON
                                                      </button>
                                                    </div>
                                                    <button
                                                      onClick={() => saveQbDesktopSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Connection
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                                {company.accountingSystem === 'QUICKBOOKS' && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      onClick={() => saveQboSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Connection
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                                {(company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365') && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      onClick={() => saveDynamicsSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Token
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                                {company.accountingSystem === 'ACUMATICA' && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      onClick={() => saveAcumaticaSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Token
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                                {(company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE') && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      onClick={() => saveSageIntacctSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Token
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                                {company.accountingSystem === 'ODOO' && (
                                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                      onClick={() => saveOdooSettings(company.id)}
                                                      style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      disabled
                                                      style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                                    >
                                                      Validate Token
                                                    </button>
                                                    <button
                                                      onClick={() => runPlatformOperationalSync?.(company.id, getCompanyOperationalSettings(company.id).frequency)}
                                                      style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Run Ops Sync Now
                                                    </button>
                                                  </div>
                                                )}
                                              </div>

                                              {!['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase()) && (
                                                <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', marginBottom: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                                                    Operational Data Mode
                                                  </div>
                                                  <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', flex: 1 }}>
                                                    {company.forceOperationalMockData
                                                      ? 'Demo mode is ON. Mock data is being served.'
                                                      : company.hasRealOperationalData
                                                        ? `Real data mode is ON${company.realDataActivatedAt ? ` (activated ${new Date(company.realDataActivatedAt).toLocaleString()})` : ''}.`
                                                        : 'Demo mode is active until real operational data is detected.'}
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                                                    <button
                                                      onClick={() => saveOperationalDataMode(company.id, true)}
                                                      disabled={savingOperationalDataModeCompanyId === company.id || company.forceOperationalMockData}
                                                      style={{
                                                        padding: '6px 10px',
                                                        background: company.forceOperationalMockData ? '#0f766e' : 'white',
                                                        color: company.forceOperationalMockData ? 'white' : '#0f766e',
                                                        border: '1px solid #0f766e',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        cursor: savingOperationalDataModeCompanyId === company.id || company.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                      }}
                                                    >
                                                      Force Demo Mode
                                                    </button>
                                                    <button
                                                      onClick={() => saveOperationalDataMode(company.id, false)}
                                                      disabled={savingOperationalDataModeCompanyId === company.id || !company.forceOperationalMockData}
                                                      style={{
                                                        padding: '6px 10px',
                                                        background: !company.forceOperationalMockData ? '#1d4ed8' : 'white',
                                                        color: !company.forceOperationalMockData ? 'white' : '#1d4ed8',
                                                        border: '1px solid #1d4ed8',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        cursor: savingOperationalDataModeCompanyId === company.id || !company.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                      }}
                                                    >
                                                      Use Real Data
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                              )}
                                              {['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase()) ? (
                                                <>
                                                  <div
                                                    style={{
                                                      marginBottom: '8px',
                                                      padding: '8px',
                                                      background: inforConnected && inforStatus === 'ACTIVE' ? '#d1fae5' : inforStatus === 'ERROR' ? '#fee2e2' : inforStatus === 'EXPIRED' ? '#fed7aa' : '#fef3c7',
                                                      border: `1px solid ${inforConnected && inforStatus === 'ACTIVE' ? '#10b981' : inforStatus === 'ERROR' ? '#ef4444' : inforStatus === 'EXPIRED' ? '#f97316' : '#fbbf24'}`,
                                                      borderRadius: '6px',
                                                    }}
                                                  >
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                                      {inforConnected && inforStatus === 'ACTIVE' ? 'Connected' : inforStatus === 'ERROR' ? 'Error' : inforStatus === 'EXPIRED' ? 'Token Expired' : 'Not Connected'}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#475569' }}>
                                                      {inforError || (inforLastSync ? `Last synced: ${new Date(inforLastSync).toLocaleString()}` : 'Enter credentials and connect')}
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridAutoFlow: 'row dense', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'clientName', label: 'Client Name', type: 'text' },
                                                      { key: 'tenantId', label: 'Tenant ID *', type: 'text' },
                                                      { key: 'clientId', label: 'Client ID *', type: 'text' },
                                                      { key: 'ionApiBaseUrl', label: 'ION API Base URL *', type: 'text' },
                                                      { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                                      { key: 'ssoBaseUrl', label: 'SSO Base URL *', type: 'text' },
                                                      { key: 'serviceAccountSecretKey', label: 'Service Account Secret Key *', type: 'password' },
                                                      { key: 'serviceAccountAccessKey', label: 'Service Account Access Key *', type: 'text' },
                                                    ].map((field) => (
                                                      <label
                                                        key={`${company.id}-${field.key}`}
                                                        style={{
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: '4px',
                                                          fontSize: '12px',
                                                          color: '#334155',
                                                          gridColumn:
                                                            field.key === 'tenantId' ||
                                                            field.key === 'ionApiBaseUrl' ||
                                                            field.key === 'ssoBaseUrl'
                                                              ? '2'
                                                              : field.key === 'serviceAccountAccessKey'
                                                              ? '1'
                                                              : field.key === 'serviceAccountSecretKey'
                                                                ? '1'
                                                                : undefined,
                                                        }}
                                                      >
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        <input
                                                          type={field.type}
                                                          value={inforCredentials?.[field.key] || ''}
                                                          onChange={(e) => setInforCredentials?.((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                                                          placeholder={field.label.replace(' *', '')}
                                                          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        />
                                                      </label>
                                                    ))}
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                                      <span style={{ fontWeight: 600 }}>Operational Pull Frequency</span>
                                                      <select
                                                        value={getCompanyOperationalSettings(company.id).frequency}
                                                        onChange={(e) =>
                                                          setCompanyOperationalSettings(company.id, {
                                                            frequency: e.target.value as 'daily' | 'weekly' | 'monthly',
                                                          })
                                                        }
                                                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                                      <span style={{ fontWeight: 600 }}>Auto Pull Time (America/New_York)</span>
                                                      <select
                                                        value={getCompanyOperationalSettings(company.id).pullTime}
                                                        onChange={(e) =>
                                                          setCompanyOperationalSettings(company.id, {
                                                            pullTime: e.target.value,
                                                          })
                                                        }
                                                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                                      <span style={{ fontWeight: 600 }}>Auto Sync Window Days</span>
                                                      <input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        value={getCompanyOperationalSettings(company.id).autoSyncWindowDays}
                                                        onChange={(e) =>
                                                          setCompanyOperationalSettings(company.id, {
                                                            autoSyncWindowDays: Number(e.target.value || 3),
                                                          })
                                                        }
                                                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      />
                                                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                        Nightly auto-sync window length (inclusive, ending on prior UTC day).
                                                      </span>
                                                    </label>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', alignItems: 'end' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Read-Only Probe Path</span>
                                                      <input
                                                        type="text"
                                                        value={inforProbePath || ''}
                                                        onChange={(e) => setInforProbePath?.(e.target.value)}
                                                        placeholder="/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=1"
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      />
                                                    </label>
                                                    <button
                                                      onClick={() => {
                                                        const site = requireCompanyCsiSite(company.id);
                                                        if (!site) return;
                                                        probeInforM3?.(company.id, site);
                                                      }}
                                                      disabled={inforBusy || !inforConnected}
                                                      style={{ padding: '8px 12px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      Probe
                                                    </button>
                                                  </div>

                                                  {inforProbeSummary && (
                                                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px' }}>
                                                      {inforProbeSummary}
                                                    </div>
                                                  )}
                                                </>
                                              ) : company.accountingSystem === 'QUICKBOOKS' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#166534' }}>
                                                      QuickBooks Online operational sync configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#166534' }}>
                                                      Operational data loads when the user runs QuickBooks sync: default 90-day refresh, or optional 3-year backfill (async monthly chunks after first sync).
                                                    </div>
                                                  </div>
                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Operational load *</span>
                                                      <select
                                                        value={getQboSettings(company.id).operationalLoadMode}
                                                        onChange={(e) =>
                                                          setQboSetting(company.id, 'operationalLoadMode', e.target.value as 'rolling_90' | 'backfill_3y')
                                                        }
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="rolling_90">90-day rolling (default)</option>
                                                        <option value="backfill_3y">3-year backfill (starts on next client sync)</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getQboSettings(company.id).syncTime}
                                                        onChange={(e) => setQboSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Initial Sync Start Date (YYYY-MM-DD)</span>
                                                      <input
                                                        type="text"
                                                        value={getQboSettings(company.id).initialSyncStartDate}
                                                        onChange={(e) => setQboSetting(company.id, 'initialSyncStartDate', e.target.value)}
                                                        placeholder="2024-01-01"
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      />
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                                      <select
                                                        value={getQboSettings(company.id).incrementalSync}
                                                        onChange={(e) => setQboSetting(company.id, 'incrementalSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Webhook Enabled *</span>
                                                      <select
                                                        value={getQboSettings(company.id).webhookEnabled}
                                                        onChange={(e) => setQboSetting(company.id, 'webhookEnabled', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>CDC Enabled *</span>
                                                      <select
                                                        value={getQboSettings(company.id).cdcEnabled}
                                                        onChange={(e) => setQboSetting(company.id, 'cdcEnabled', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Nightly Reconciliation *</span>
                                                      <select
                                                        value={getQboSettings(company.id).reconciliationEnabled}
                                                        onChange={(e) => setQboSetting(company.id, 'reconciliationEnabled', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : company.accountingSystem === 'QUICKBOOKS_DESKTOP' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                                                      QuickBooks Desktop configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#78350f' }}>
                                                      This company is configured for Web Connector/SDK setup. Save the required technical values below.
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'integrationType', label: 'Integration Type *' },
                                                      { key: 'applicationName', label: 'Application Name *' },
                                                      { key: 'soapEndpointUrl', label: 'SOAP/App Endpoint URL *' },
                                                      { key: 'supportUrl', label: 'Support URL' },
                                                      { key: 'ownerId', label: 'Owner ID (GUID) *' },
                                                      { key: 'fileId', label: 'File ID (GUID) *' },
                                                      { key: 'webConnectorUsername', label: 'Web Connector Username *' },
                                                      { key: 'pollingIntervalMinutes', label: 'Polling Interval (minutes) *' },
                                                      { key: 'desktopEditionYear', label: 'QB Desktop Edition + Year *' },
                                                      { key: 'countryVersion', label: 'Country Version *' },
                                                      { key: 'companyFilePath', label: 'Target Company File Path (.QBW) *' },
                                                      { key: 'hostMachineName', label: 'Host Machine Name *' },
                                                    ].map((field) => (
                                                      <label key={`${company.id}-qbdesktop-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        {field.key === 'integrationType' ? (
                                                          <select
                                                            value={getQbDesktopSettings(company.id).integrationType}
                                                            onChange={(e) => setQbDesktopSetting(company.id, 'integrationType', e.target.value)}
                                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                          >
                                                            <option value="">Select</option>
                                                            <option value="WEB_CONNECTOR">QuickBooks Web Connector</option>
                                                            <option value="SDK">SDK</option>
                                                          </select>
                                                        ) : (
                                                          <input
                                                            type="text"
                                                            value={(getQbDesktopSettings(company.id) as any)[field.key] || ''}
                                                            onChange={(e) => setQbDesktopSetting(company.id, field.key as keyof typeof defaultQbDesktopSettings, e.target.value)}
                                                            placeholder={field.label.replace(' *', '')}
                                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                          />
                                                        )}
                                                      </label>
                                                    ))}
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Permission Scope *</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).permissionScope}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'permissionScope', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="READ_ONLY">Read-only</option>
                                                        <option value="READ_WRITE">Read-write</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Unattended Access Required *</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).unattendedAccessRequired}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'unattendedAccessRequired', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Host Online During Sync *</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).hostOnlineForSync}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'hostOnlineForSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Direction *</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).syncDirection}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'syncDirection', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="QB_TO_PLATFORM">QB to Platform</option>
                                                        <option value="TWO_WAY">Two-way</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).syncFrequency}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'syncFrequency', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getQbDesktopSettings(company.id).syncTime}
                                                        onChange={(e) => setQbDesktopSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                                                      Dynamics 365 configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#78350f' }}>
                                                      Enter tenant/app values for this company and save. Validation/probe actions are enabled when backend endpoints are wired.
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'tenantId', label: 'Tenant ID *' },
                                                      { key: 'environmentUrl', label: 'Environment URL *' },
                                                      { key: 'legalEntity', label: 'Legal Entity' },
                                                      { key: 'region', label: 'Region' },
                                                      { key: 'clientId', label: 'Client ID *' },
                                                      { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                                      { key: 'authorityUrl', label: 'Authority URL' },
                                                      { key: 'scope', label: 'Scope / Resource *' },
                                                      { key: 'redirectUri', label: 'Redirect URI' },
                                                      { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                                    ].map((field) => (
                                                      <label key={`${company.id}-dynamics-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        <input
                                                          type={field.type || 'text'}
                                                          value={(getDynamicsSettings(company.id) as any)[field.key] || ''}
                                                          onChange={(e) => setDynamicsSetting(company.id, field.key as keyof typeof defaultDynamicsSettings, e.target.value)}
                                                          placeholder={field.label.replace(' *', '')}
                                                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        />
                                                      </label>
                                                    ))}
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                                      <select
                                                        value={getDynamicsSettings(company.id).syncFrequency}
                                                        onChange={(e) => setDynamicsSetting(company.id, 'syncFrequency', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getDynamicsSettings(company.id).syncTime}
                                                        onChange={(e) => setDynamicsSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                                      <select
                                                        value={getDynamicsSettings(company.id).incrementalSync}
                                                        onChange={(e) => setDynamicsSetting(company.id, 'incrementalSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : company.accountingSystem === 'ACUMATICA' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                                                      Acumatica Cloud ERP configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#78350f' }}>
                                                      Enter tenant/app endpoint values for this company and save.
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'tenantId', label: 'Tenant ID *' },
                                                      { key: 'instanceUrl', label: 'Instance URL *' },
                                                      { key: 'companyCode', label: 'Company Code *' },
                                                      { key: 'branch', label: 'Branch' },
                                                      { key: 'clientId', label: 'Client ID *' },
                                                      { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                                      { key: 'username', label: 'Username *' },
                                                      { key: 'password', label: 'Password *', type: 'password' },
                                                      { key: 'endpointName', label: 'Endpoint Name *' },
                                                      { key: 'endpointVersion', label: 'Endpoint Version *' },
                                                      { key: 'contractBasedApiPath', label: 'Contract-based API Path' },
                                                      { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                                    ].map((field) => (
                                                      <label key={`${company.id}-acumatica-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        <input
                                                          type={field.type || 'text'}
                                                          value={(getAcumaticaSettings(company.id) as any)[field.key] || ''}
                                                          onChange={(e) => setAcumaticaSetting(company.id, field.key as keyof typeof defaultAcumaticaSettings, e.target.value)}
                                                          placeholder={field.label.replace(' *', '')}
                                                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        />
                                                      </label>
                                                    ))}
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                                      <select
                                                        value={getAcumaticaSettings(company.id).syncFrequency}
                                                        onChange={(e) => setAcumaticaSetting(company.id, 'syncFrequency', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getAcumaticaSettings(company.id).syncTime}
                                                        onChange={(e) => setAcumaticaSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                                      <select
                                                        value={getAcumaticaSettings(company.id).incrementalSync}
                                                        onChange={(e) => setAcumaticaSetting(company.id, 'incrementalSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                                                      Sage Intacct configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#78350f' }}>
                                                      Enter sender credentials and company user credentials for this company, then save.
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'senderId', label: 'Sender ID *' },
                                                      { key: 'senderPassword', label: 'Sender Password *', type: 'password' },
                                                      { key: 'companyId', label: 'Company ID *' },
                                                      { key: 'userId', label: 'User ID *' },
                                                      { key: 'userPassword', label: 'User Password *', type: 'password' },
                                                      { key: 'entityId', label: 'Entity ID' },
                                                      { key: 'endpointUrl', label: 'Endpoint URL *' },
                                                      { key: 'dtdVersion', label: 'DTD Version' },
                                                      { key: 'locationId', label: 'Location ID' },
                                                      { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                                    ].map((field) => (
                                                      <label key={`${company.id}-sage-intacct-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        <input
                                                          type={field.type || 'text'}
                                                          value={(getSageIntacctSettings(company.id) as any)[field.key] || ''}
                                                          onChange={(e) => setSageIntacctSetting(company.id, field.key as keyof typeof defaultSageIntacctSettings, e.target.value)}
                                                          placeholder={field.label.replace(' *', '')}
                                                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        />
                                                      </label>
                                                    ))}
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                                      <select
                                                        value={getSageIntacctSettings(company.id).syncFrequency}
                                                        onChange={(e) => setSageIntacctSetting(company.id, 'syncFrequency', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getSageIntacctSettings(company.id).syncTime}
                                                        onChange={(e) => setSageIntacctSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                                      <select
                                                        value={getSageIntacctSettings(company.id).incrementalSync}
                                                        onChange={(e) => setSageIntacctSetting(company.id, 'incrementalSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : company.accountingSystem === 'ODOO' ? (
                                                <>
                                                  <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>
                                                      Odoo Accounting ERP configuration
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#78350f' }}>
                                                      Enter Odoo URL/database credentials and sync settings for this company.
                                                    </div>
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                                    {[
                                                      { key: 'baseUrl', label: 'Base URL *' },
                                                      { key: 'database', label: 'Database *' },
                                                      { key: 'username', label: 'Username *' },
                                                      { key: 'password', label: 'Password *', type: 'password' },
                                                      { key: 'apiKey', label: 'API Key', type: 'password' },
                                                      { key: 'companyId', label: 'Company ID' },
                                                      { key: 'odooVersion', label: 'Odoo Version' },
                                                      { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                                    ].map((field) => (
                                                      <label key={`${company.id}-odoo-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                                                        <input
                                                          type={field.type || 'text'}
                                                          value={(getOdooSettings(company.id) as any)[field.key] || ''}
                                                          onChange={(e) => setOdooSetting(company.id, field.key as keyof typeof defaultOdooSettings, e.target.value)}
                                                          placeholder={field.label.replace(' *', '')}
                                                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                        />
                                                      </label>
                                                    ))}
                                                  </div>

                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Auth Method *</span>
                                                      <select
                                                        value={getOdooSettings(company.id).authMethod}
                                                        onChange={(e) => setOdooSetting(company.id, 'authMethod', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="PASSWORD">Username/Password</option>
                                                        <option value="API_KEY">API Key</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                                      <select
                                                        value={getOdooSettings(company.id).syncFrequency}
                                                        onChange={(e) => setOdooSetting(company.id, 'syncFrequency', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="daily">Daily</option>
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                                      <select
                                                        value={getOdooSettings(company.id).syncTime}
                                                        onChange={(e) => setOdooSetting(company.id, 'syncTime', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        {Array.from({ length: 24 }).map((_, hour) => {
                                                          const hh = String(hour).padStart(2, '0');
                                                          const value = `${hh}:00`;
                                                          return (
                                                            <option key={value} value={value}>
                                                              {value}
                                                            </option>
                                                          );
                                                        })}
                                                      </select>
                                                    </label>
                                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                      <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                                      <select
                                                        value={getOdooSettings(company.id).incrementalSync}
                                                        onChange={(e) => setOdooSetting(company.id, 'incrementalSync', e.target.value)}
                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                      >
                                                        <option value="">Select</option>
                                                        <option value="YES">Yes</option>
                                                        <option value="NO">No</option>
                                                      </select>
                                                    </label>
                                                  </div>
                                                </>
                                              ) : (
                                                <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '10px' }}>
                                                  {company.accountingSystem
                                                    ? `${company.accountingSystem} integration configuration will render here for this company.`
                                                    : 'No accounting system selected for this company.'}
                                                </div>
                                              )}
                                            </div>

                                            <div style={{ padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1', order: 2 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                  <button
                                                    onClick={() =>
                                                      company.accountingSystem === 'QUICKBOOKS_DESKTOP'
                                                        ? addQbDesktopProgram(company.id)
                                                        : company.accountingSystem === 'QUICKBOOKS'
                                                          ? addQboProgram(company.id)
                                                        : company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365'
                                                          ? addDynamicsProgram(company.id)
                                                          : company.accountingSystem === 'ACUMATICA'
                                                            ? addAcumaticaProgram(company.id)
                                                            : company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE'
                                                              ? addSageIntacctProgram(company.id)
                                                              : company.accountingSystem === 'ODOO'
                                                                ? addOdooProgram(company.id)
                                                        : addCompanyProgram(company.id)
                                                    }
                                                    disabled={isCompanyProgramsLoading(company.id) || isCompanyProgramsSaving(company.id)}
                                                    style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    + Add
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      company.accountingSystem === 'QUICKBOOKS_DESKTOP'
                                                        ? saveQbDesktopSettings(company.id)
                                                        : company.accountingSystem === 'QUICKBOOKS'
                                                          ? saveQboSettings(company.id)
                                                        : company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365'
                                                          ? saveDynamicsSettings(company.id)
                                                          : company.accountingSystem === 'ACUMATICA'
                                                            ? saveAcumaticaSettings(company.id)
                                                            : company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE'
                                                              ? saveSageIntacctSettings(company.id)
                                                              : company.accountingSystem === 'ODOO'
                                                                ? saveOdooSettings(company.id)
                                                        : saveCompanyPrograms(company.id)
                                                    }
                                                    disabled={isCompanyProgramsSaving(company.id)}
                                                    style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Save
                                                  </button>
                                                </div>
                                              </div>
                                              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                                Programs called by the CSI integration
                                              </div>
                                              <div style={{ overflowX: 'auto' }}>
                                                {company.accountingSystem === 'QUICKBOOKS' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Data Domain</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>QBO Entity</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '80px' }}>Enabled</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getQboPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-qbo-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.dataDomain}
                                                              onChange={(e) => updateQboProgram(company.id, index, 'dataDomain', e.target.value)}
                                                              placeholder="Data Domain"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.qboEntity}
                                                              onChange={(e) => updateQboProgram(company.id, index, 'qboEntity', e.target.value)}
                                                              placeholder="QBO Entity"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="checkbox"
                                                              checked={Boolean(row.enabled)}
                                                              onChange={(e) => updateQboProgram(company.id, index, 'enabled', e.target.checked)}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteQboProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : company.accountingSystem === 'QUICKBOOKS_DESKTOP' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Data Domain</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>QB Entity</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getQbDesktopPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-qbdesktop-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.dataDomain}
                                                              onChange={(e) => updateQbDesktopProgram(company.id, index, 'dataDomain', e.target.value)}
                                                              placeholder="Data Domain"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.qbEntity}
                                                              onChange={(e) => updateQbDesktopProgram(company.id, index, 'qbEntity', e.target.value)}
                                                              placeholder="QB Entity"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteQbDesktopProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : company.accountingSystem === 'DYNAMICS' || company.accountingSystem === 'DYNAMICS365' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Entity / Endpoint</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getDynamicsPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-dynamics-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.module}
                                                              onChange={(e) => updateDynamicsProgram(company.id, index, 'module', e.target.value)}
                                                              placeholder="Module"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.entityOrEndpoint}
                                                              onChange={(e) => updateDynamicsProgram(company.id, index, 'entityOrEndpoint', e.target.value)}
                                                              placeholder="Entity or Endpoint"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteDynamicsProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : company.accountingSystem === 'ACUMATICA' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Endpoint / Entity</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getAcumaticaPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-acumatica-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.module}
                                                              onChange={(e) => updateAcumaticaProgram(company.id, index, 'module', e.target.value)}
                                                              placeholder="Module"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.endpointOrEntity}
                                                              onChange={(e) => updateAcumaticaProgram(company.id, index, 'endpointOrEntity', e.target.value)}
                                                              placeholder="Endpoint or Entity"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteAcumaticaProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : company.accountingSystem === 'SAGE_INTACCT' || company.accountingSystem === 'SAGE' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Object</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getSageIntacctPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-sage-intacct-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.module}
                                                              onChange={(e) => updateSageIntacctProgram(company.id, index, 'module', e.target.value)}
                                                              placeholder="Module"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.objectName}
                                                              onChange={(e) => updateSageIntacctProgram(company.id, index, 'objectName', e.target.value)}
                                                              placeholder="Object Name"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteSageIntacctProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : company.accountingSystem === 'ODOO' ? (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Model / Endpoint</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getOdooPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-odoo-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.module}
                                                              onChange={(e) => updateOdooProgram(company.id, index, 'module', e.target.value)}
                                                              placeholder="Module"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.modelOrEndpoint}
                                                              onChange={(e) => updateOdooProgram(company.id, index, 'modelOrEndpoint', e.target.value)}
                                                              placeholder="Model or Endpoint"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteOdooProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                ) : (
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>CSI IDO</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>CSI Endpoint Path</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Mongoose Config</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Site</th>
                                                        <th style={{ textAlign: 'center', padding: '6px', color: '#475569', width: '80px' }}>Enabled</th>
                                                        <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {isCompanyProgramsLoading(company.id) ? (
                                                        <tr>
                                                          <td colSpan={7} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                                                            Loading accounting programs...
                                                          </td>
                                                        </tr>
                                                      ) : getCompanyPrograms(company.id).length === 0 ? (
                                                        <tr>
                                                          <td colSpan={7} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                                                            No saved programs yet. Click + Add to create one.
                                                          </td>
                                                        </tr>
                                                      ) : getCompanyPrograms(company.id).map((row, index) => (
                                                        <tr key={`${company.id}-consultant-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.module}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'module', e.target.value)}
                                                              placeholder="Module"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.miProgram}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'miProgram', e.target.value)}
                                                              placeholder="CSI IDO (e.g. SLCustomers)"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.endpointPath || ''}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'endpointPath', e.target.value)}
                                                              placeholder="/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?recordCap=500"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.mongooseConfig || ''}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'mongooseConfig', e.target.value)}
                                                              placeholder="TMSManager"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <input
                                                              type="text"
                                                              value={row.site || ''}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'site', e.target.value)}
                                                              placeholder="Optional site (e.g. MAIN)"
                                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px', textAlign: 'center' }}>
                                                            <input
                                                              type="checkbox"
                                                              checked={row.enabled}
                                                              onChange={(e) => updateCompanyProgram(company.id, index, 'enabled', e.target.checked)}
                                                            />
                                                          </td>
                                                          <td style={{ padding: '6px' }}>
                                                            <button
                                                              onClick={() => deleteCompanyProgram(company.id, index)}
                                                              style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                            >
                                                              Delete
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            </div>
                                            <div style={{ gridColumn: '1 / -1', order: 3 }}>
                                              {renderOperationalHubCustomizationCard(company)}
                                            </div>
                                          </div>
                                          
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: '10px', marginBottom: companyUsers.length > 0 ? '8px' : '0' }}>
                                            {/* Subscription Pricing */}
                                            <div style={{ padding: '4px 10px 10px 10px', background: 'white', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                              <h6 style={{ fontSize: '14px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Subscription Pricing</h6>
                                              {editing ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                                  <div>
                                                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                                    <input
                                                      type="number"
                                                      value={editing.monthly}
                                                      onChange={(e) => setEditingPricing({
                                                        ...editingPricing,
                                                        [company.id]: { ...editing, monthly: parseFloat(e.target.value) || 0 }
                                                      })}
                                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                    />
                                                  </div>
                                                  <div>
                                                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                                    <input
                                                      type="number"
                                                      value={editing.quarterly}
                                                      onChange={(e) => setEditingPricing({
                                                        ...editingPricing,
                                                        [company.id]: { ...editing, quarterly: parseFloat(e.target.value) || 0 }
                                                      })}
                                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                    />
                                                  </div>
                                                  <div>
                                                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                                    <input
                                                      type="number"
                                                      value={editing.annual}
                                                      onChange={(e) => setEditingPricing({
                                                        ...editingPricing,
                                                        [company.id]: { ...editing, annual: parseFloat(e.target.value) || 0 }
                                                      })}
                                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                    />
                                                  </div>
                                                  <div>
                                                    <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Setup Fee ($)</label>
                                                    <input
                                                      type="number"
                                                      value={editing.setupFee ?? 0}
                                                      onChange={(e) => setEditingPricing({
                                                        ...editingPricing,
                                                        [company.id]: { ...editing, setupFee: parseFloat(e.target.value) || 0 }
                                                      })}
                                                      style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                    />
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '6px', gridColumn: 'span 4' }}>
                                                    <button
                                                      onClick={() => {
                                                        if (!updateCompanyPricing) {
                                                          alert('Update pricing function is not configured.');
                                                          return;
                                                        }
                                                        updateCompanyPricing(company.id, editing);
                                                      }}
                                                      style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setEditingPricing((prev) => {
                                                          const newState = { ...prev };
                                                          delete newState[company.id];
                                                          return newState;
                                                        });
                                                      }}
                                                      style={{ padding: '4px 10px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div>
                                                  <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.7', marginBottom: '8px' }}>
                                                    <div><strong>Monthly:</strong> ${company.subscriptionMonthlyPrice?.toFixed(2) ?? '0.00'}</div>
                                                    <div><strong>Quarterly:</strong> ${company.subscriptionQuarterlyPrice?.toFixed(2) ?? '0.00'}</div>
                                                    <div><strong>Annual:</strong> ${company.subscriptionAnnualPrice?.toFixed(2) ?? '0.00'}</div>
                                                    <div><strong>Setup Fee:</strong> ${company.subscriptionSetupFee?.toFixed(2) ?? '0.00'}</div>
                                                  </div>
                                                  <button
                                                    onClick={() => {
                                                      setEditingPricing({
                                                        ...editingPricing,
                                                        [company.id]: {
                                                          monthly: company.subscriptionMonthlyPrice ?? 0,
                                                          quarterly: company.subscriptionQuarterlyPrice ?? 0,
                                                          annual: company.subscriptionAnnualPrice ?? 0,
                                                          setupFee: company.subscriptionSetupFee ?? 0,
                                                        }
                                                      });
                                                    }}
                                                    style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                                  >
                                                    Edit Pricing
                                                  </button>
                                                </div>
                                              )}
                                            </div>

                                            <div style={{ padding: '4px 10px 10px 10px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                              <h6 style={{ fontSize: '14px', fontWeight: '700', color: '#1e3a8a', marginBottom: '8px' }}>DataRoom Pricing</h6>
                                              {editingDataRoomPricingByCompany[company.id] ? (
                                                <div>
                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingDataRoomPricingByCompany[company.id].monthly}
                                                        onChange={(e) =>
                                                          setEditingDataRoomPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              monthly: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingDataRoomPricingByCompany[company.id].quarterly}
                                                        onChange={(e) =>
                                                          setEditingDataRoomPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              quarterly: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingDataRoomPricingByCompany[company.id].annual}
                                                        onChange={(e) =>
                                                          setEditingDataRoomPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              annual: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                      onClick={() => saveDataRoomPricing(company.id, editingDataRoomPricingByCompany[company.id])}
                                                      disabled={savingDataRoomPricingCompanyId === company.id}
                                                      style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: savingDataRoomPricingCompanyId === company.id ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setEditingDataRoomPricingByCompany((prev) => {
                                                          const next = { ...prev };
                                                          delete next[company.id];
                                                          return next;
                                                        });
                                                      }}
                                                      style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <>
                                                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.7', marginBottom: '8px' }}>
                                                    <div><strong>Monthly:</strong> ${getDataRoomPricing(company).monthly.toFixed(2)}</div>
                                                    <div><strong>Quarterly:</strong> ${getDataRoomPricing(company).quarterly.toFixed(2)}</div>
                                                    <div><strong>Annual:</strong> ${getDataRoomPricing(company).annual.toFixed(2)}</div>
                                                  </div>
                                                  <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>
                                                    Status: {getDataRoomEnabledByAdmin(company) ? 'Enabled' : 'Disabled'} | Subscription: {getDataRoomSubscriptionStatus(company)}
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                      onClick={() => saveDataRoomEnabledByAdmin(company.id, !getDataRoomEnabledByAdmin(company))}
                                                      disabled={savingDataRoomCompanyId === company.id}
                                                      style={{
                                                        padding: '6px 12px',
                                                        background: getDataRoomEnabledByAdmin(company) ? '#dc2626' : '#2563eb',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        cursor: savingDataRoomCompanyId === company.id ? 'not-allowed' : 'pointer',
                                                      }}
                                                    >
                                                      {getDataRoomEnabledByAdmin(company) ? 'Disable DataRoom' : 'Enable DataRoom'}
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        const pricing = getDataRoomPricing(company);
                                                        setEditingDataRoomPricingByCompany((prev) => ({
                                                          ...prev,
                                                          [company.id]: pricing,
                                                        }));
                                                      }}
                                                      style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                      Edit Pricing
                                                    </button>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                            <div style={{ padding: '4px 10px 10px 10px', background: '#f5f3ff', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
                                              <h6 style={{ fontSize: '14px', fontWeight: '700', color: '#5b21b6', marginBottom: '8px' }}>Valuation Pricing</h6>
                                              {editingValuationPricingByCompany[company.id] ? (
                                                <div>
                                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingValuationPricingByCompany[company.id].monthly}
                                                        onChange={(e) =>
                                                          setEditingValuationPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              monthly: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingValuationPricingByCompany[company.id].quarterly}
                                                        onChange={(e) =>
                                                          setEditingValuationPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              quarterly: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                    <div>
                                                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                                      <input
                                                        type="number"
                                                        value={editingValuationPricingByCompany[company.id].annual}
                                                        onChange={(e) =>
                                                          setEditingValuationPricingByCompany((prev) => ({
                                                            ...prev,
                                                            [company.id]: {
                                                              ...prev[company.id],
                                                              annual: parseFloat(e.target.value) || 0,
                                                            },
                                                          }))
                                                        }
                                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                      />
                                                    </div>
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                      onClick={() => saveValuationPricing(company.id, editingValuationPricingByCompany[company.id])}
                                                      disabled={savingValuationPricingCompanyId === company.id}
                                                      style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: savingValuationPricingCompanyId === company.id ? 'not-allowed' : 'pointer' }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setEditingValuationPricingByCompany((prev) => {
                                                          const next = { ...prev };
                                                          delete next[company.id];
                                                          return next;
                                                        });
                                                      }}
                                                      style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <>
                                                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.7', marginBottom: '8px' }}>
                                                    <div><strong>Monthly:</strong> ${getValuationPricing(company).monthly.toFixed(2)}</div>
                                                    <div><strong>Quarterly:</strong> ${getValuationPricing(company).quarterly.toFixed(2)}</div>
                                                    <div><strong>Annual:</strong> ${getValuationPricing(company).annual.toFixed(2)}</div>
                                                  </div>
                                                  <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>
                                                    Status: {getValuationEnabledByAdmin(company) ? 'Enabled' : 'Disabled'} | Subscription: {getValuationSubscriptionStatus(company)}
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                      onClick={() => saveValuationEnabledByAdmin(company.id, !getValuationEnabledByAdmin(company))}
                                                      disabled={savingValuationCompanyId === company.id}
                                                      style={{
                                                        padding: '6px 12px',
                                                        background: getValuationEnabledByAdmin(company) ? '#dc2626' : '#2563eb',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        cursor: savingValuationCompanyId === company.id ? 'not-allowed' : 'pointer',
                                                      }}
                                                    >
                                                      {getValuationEnabledByAdmin(company) ? 'Disable Valuation' : 'Enable Valuation'}
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        const pricing = getValuationPricing(company);
                                                        setEditingValuationPricingByCompany((prev) => ({
                                                          ...prev,
                                                          [company.id]: pricing,
                                                        }));
                                                      }}
                                                      style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                      Edit Pricing
                                                    </button>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          </div>

                                          {/* Users */}
                                          {companyUsers.length > 0 && (
                                            <div>
                                              <h6 style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Users:</h6>
                                              <div style={{ display: 'grid', gap: '4px' }}>
                                                {companyUsers.map((user) => (
                                                  <div key={user.id} style={{ background: 'white', borderRadius: '4px', padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#1e293b' }}>{user.name}</div>
                                                      <div style={{ fontSize: '10px', color: '#64748b' }}>{user.email}</div>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Businesses Tab */}
              {siteAdminTab === 'businesses' && (
                <div>
                  {/* Businesses List */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
                      Total Businesses: {Array.isArray(companies) ? companies.filter(comp => comp.consultantId === null).length : 0}
                    </div>
                    <button
                      onClick={async () => {
                        // Identify orphaned business records (businesses without matching companies)
                        const orphanedBusinesses = consultants.filter(consultant => {
                          if (consultant.type !== 'business') return false; // Only check business-type consultants
                          return !companies.some(comp => comp.consultantId === consultant.id); // Orphaned if no company
                        });

                        if (orphanedBusinesses.length === 0) {
                          alert('No orphaned business records found!');
                          return;
                        }

                        // Confirm deletion
                        if (!confirm(`Found ${orphanedBusinesses.length} orphaned business record(s).\n\nThese are business registrations without company data.\n\nDelete them permanently from the database?`)) {
                          return;
                        }

                        setIsLoading(true);
                        let deletedCount = 0;
                        const errors: string[] = [];

                        try {
                          // Delete each orphaned business from the database
                          for (const orphaned of orphanedBusinesses) {
                            try {
                              await consultantsApi.delete(orphaned.id);
                              deletedCount++;
                            } catch (error) {
                              errors.push(`${orphaned.fullName}: ${error instanceof ApiError ? error.message : 'Failed to delete'}`);
                            }
                          }

                          // Update local state to remove deleted consultants
                          setConsultants(consultants.filter(c => !orphanedBusinesses.find(o => o.id === c.id)));

                          // Show results
                          if (errors.length === 0) {
                            alert(`Successfully deleted ${deletedCount} orphaned business record(s) from the database.`);
                          } else {
                            alert(`⚠️ Deleted ${deletedCount} of ${orphanedBusinesses.length} records.\n\nErrors:\n${errors.join('\n')}`);
                          }
                        } catch (error) {
                          alert(`❌ Error during cleanup: ${error instanceof ApiError ? error.message : 'Unknown error'}`);
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '6px 12px',
                        background: isLoading ? '#94a3b8' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? '⏳ Cleaning...' : '🧹 Clean Up Orphaned Records'}
                    </button>
                  </div>

                  {businessesLoading ? (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Loading businesses...</div>
                      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Please wait while company data is retrieved.</p>
                    </div>
                  ) : Array.isArray(companies) && companies.filter(comp => comp.consultantId === null).length === 0 ? (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>No businesses registered yet</h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Businesses will appear here once they register</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {Array.isArray(companies) && companies
                        .filter(comp => comp.consultantId === null)
                        .sort((a: any, b: any) =>
                          (a.name || '').localeCompare(
                            b.name || '',
                            undefined,
                            { numeric: true, sensitivity: 'base' }
                          )
                        )
                        .map((businessCompany) => {
                        // Find the user associated with this company
                        const businessUser = users.find(u => u.companyId === businessCompany.id);
                        const isExpanded = expandedBusinessIds.has(businessCompany.id);
                        const editing = editingPricing?.[businessCompany.id];
                        const operationalSettings = getCompanyOperationalSettings(businessCompany.id);
                        const accountingPrograms = getCompanyPrograms(businessCompany.id);
                        const qbDesktopSettings = getQbDesktopSettings(businessCompany.id);
                        const qbDesktopPrograms = getQbDesktopPrograms(businessCompany.id);
                        const dynamicsSettings = getDynamicsSettings(businessCompany.id);
                        const dynamicsPrograms = getDynamicsPrograms(businessCompany.id);
                        const acumaticaSettings = getAcumaticaSettings(businessCompany.id);
                        const acumaticaPrograms = getAcumaticaPrograms(businessCompany.id);
                        const sageIntacctSettings = getSageIntacctSettings(businessCompany.id);
                        const sageIntacctPrograms = getSageIntacctPrograms(businessCompany.id);
                        const odooSettings = getOdooSettings(businessCompany.id);
                        const odooPrograms = getOdooPrograms(businessCompany.id);
                        const effectiveTier1Routing = getEffectiveTier1Routing(businessCompany);
                        const tier1RoutingDraft = editingTier1RoutingByCompany[businessCompany.id] || effectiveTier1Routing;
                        const supportConsultants = consultants.filter((consultant: any) => consultant?.type !== 'business');
                        const currentSupportConsultant = supportConsultants.find(
                          (consultant: any) => consultant.id === effectiveTier1Routing.consultantId
                        );
                        
                        return (
                          <div key={businessCompany.id} style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                            {/* Business Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <h3 
                                    onClick={async () => {
                                      let resolvedBusinessUser = businessUser;
                                      if (!resolvedBusinessUser) {
                                        try {
                                          const userRes = await fetch(`/api/users?companyId=${businessCompany.id}`);
                                          const userData = await userRes.json();
                                          if (userRes.ok && Array.isArray(userData?.users) && userData.users.length > 0) {
                                            resolvedBusinessUser = userData.users.find((u: any) => String(u?.role || '').toUpperCase() === 'USER') || userData.users[0];
                                          }
                                        } catch (err) {
                                          console.error('Error resolving business user from API:', err);
                                        }
                                      }
                                      if (!resolvedBusinessUser) {
                                        console.error('User not found for company:', businessCompany.id, 'Available users:', users);
                                        alert('User not found for this company. Please ensure the business has a registered user.');
                                        return;
                                      }
                                      // Save original site-admin identity once per preview session.
                                      // Do not overwrite with consultant/user identities while drilling deeper.
                                      setSiteAdminViewingAs((prev: any) => prev || currentUser);
                                      // Load the specific company data with all fields from API
                                      fetch(`/api/companies?companyId=${businessCompany.id}`)
                                        .then(res => res.json())
                                        .then(data => {
                                          if (data.companies && data.companies.length > 0) {
                                            const fullCompany = data.companies[0];
                                            setCompanies([fullCompany]);
                                            setLoadedConsultantId(null);
                                            // Switch to viewing this business's dashboard
                                            // Normalize userType to lowercase 'company' to match sidebar checks
                                            const normalizedUserType = resolvedBusinessUser.userType?.toLowerCase() === 'company' ? 'company' : 'company';
                                            setCurrentUser({
                                              ...resolvedBusinessUser,
                                              role: 'user',
                                              userType: normalizedUserType,
                                              companyId: businessCompany.id
                                            });
                                            setSelectedCompanyId(businessCompany.id);
                                            setCurrentView('admin');
                                          } else {
                                            // Fallback to using the company from the list
                                            setCompanies([businessCompany]);
                                            setLoadedConsultantId(null);
                                            const normalizedUserType = resolvedBusinessUser.userType?.toLowerCase() === 'company' ? 'company' : 'company';
                                            setCurrentUser({
                                              ...resolvedBusinessUser,
                                              role: 'user',
                                              userType: normalizedUserType,
                                              companyId: businessCompany.id
                                            });
                                            setSelectedCompanyId(businessCompany.id);
                                            setCurrentView('admin');
                                          }
                                        })
                                        .catch(err => {
                                          console.error('Error loading company:', err);
                                          // Fallback to using the company from the list
                                          setCompanies([businessCompany]);
                                          setLoadedConsultantId(null);
                                          const normalizedUserType = resolvedBusinessUser.userType?.toLowerCase() === 'company' ? 'company' : 'company';
                                          setCurrentUser({
                                            ...resolvedBusinessUser,
                                            role: 'user',
                                            userType: normalizedUserType,
                                            companyId: businessCompany.id
                                          });
                                          setSelectedCompanyId(businessCompany.id);
                                          setCurrentView('admin');
                                        });
                                    }}
                                    style={{ 
                                      fontSize: '16px', 
                                      fontWeight: '600', 
                                      color: '#667eea', 
                                      margin: 0,
                                      cursor: 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#5568d3'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#667eea'}
                                  >
                                    {businessCompany.name}
                                  </h3>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    setExpandedBusinessIds(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(businessCompany.id)) {
                                        newSet.delete(businessCompany.id);
                                      } else {
                                        newSet.add(businessCompany.id);
                                        setSelectedCompanyId(businessCompany.id);
                                        if (['INFOR_M3', 'INFOR_CSI'].includes(String(businessCompany.accountingSystem || '').toUpperCase())) {
                                          loadInforM3Credentials?.(businessCompany.id);
                                          loadCompanyPrograms(businessCompany.id);
                                          checkInforM3Status?.(businessCompany.id).then((statusData: any) => {
                                            if (!statusData) return;
                                            const frequency = String(statusData.syncFrequency || 'daily').toLowerCase();
                                            const pullTime =
                                              typeof statusData.autoSyncTime === 'string' ? statusData.autoSyncTime : '08:00';
                                            const autoSyncWindowDays = Math.max(
                                              1,
                                              Number.parseInt(String(statusData.autoSyncWindowDays || ''), 10) || 3
                                            );
                                            if (frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') {
                                              setCompanyOperationalSettings(businessCompany.id, {
                                                frequency,
                                                pullTime,
                                                autoSyncWindowDays,
                                              });
                                            }
                                          });
                                        } else if (businessCompany.accountingSystem === 'QUICKBOOKS_DESKTOP') {
                                          loadQbDesktopSettings(businessCompany.id);
                                        } else if (businessCompany.accountingSystem === 'QUICKBOOKS') {
                                          loadQboSettings(businessCompany.id);
                                        } else if (businessCompany.accountingSystem === 'DYNAMICS' || businessCompany.accountingSystem === 'DYNAMICS365') {
                                          loadDynamicsSettings(businessCompany.id);
                                        } else if (businessCompany.accountingSystem === 'ACUMATICA') {
                                          loadAcumaticaSettings(businessCompany.id);
                                        } else if (businessCompany.accountingSystem === 'SAGE_INTACCT' || businessCompany.accountingSystem === 'SAGE') {
                                          loadSageIntacctSettings(businessCompany.id);
                                        } else if (businessCompany.accountingSystem === 'ODOO') {
                                          loadOdooSettings(businessCompany.id);
                                        }
                                      }
                                      return newSet;
                                    });
                                  }}
                                  style={{ padding: '6px 10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Delete button clicked', { businessCompany });
                                    if (businessCompany) {
                                      console.log('Setting company to delete:', businessCompany.name);
                                      setCompanyToDelete({
                                        companyId: businessCompany.id,
                                        businessId: null,
                                        companyName: businessCompany.name
                                      });
                                      setShowDeleteConfirmation(true);
                                    } else {
                                      console.log('No company found - showing alert');
                                      alert('No company found for this business');
                                    }
                                  }}
                                  style={{ 
                                    padding: '6px 10px', 
                                    background: '#ef4444', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '6px', 
                                    fontSize: '12px', 
                                    fontWeight: '600', 
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px' }}>
                                {/* Business Information */}
                                {(() => {
                                  const biDraft = getBusinessInfoDraft(businessCompany, businessUser);
                                  const biEditing = !!editingBusinessInfoByCompany[businessCompany.id];
                                  const biSaving = savingBusinessInfoCompanyId === businessCompany.id;
                                  const sectorById = INDUSTRY_SECTORS.find(
                                    (sector) => String(sector?.id || '').trim() === String(businessCompany?.industrySector || '').trim()
                                  );
                                  const sectorName = sectorById?.name || getSectorNameForCompany(businessCompany) || 'Not set';
                                  const setBiField = (field: string, value: string) =>
                                    setEditingBusinessInfoByCompany((prev) => ({
                                      ...prev,
                                      [businessCompany.id]: { ...biDraft, [field]: value },
                                    }));
                                  const inputStyle = { width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' };
                                  const labelStyle = { fontSize: '11px', fontWeight: '600' as const, color: '#475569', display: 'block', marginBottom: '4px' };
                                  return (
                                    <div style={{ marginBottom: '10px', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Business Information</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => saveBusinessInfo(businessCompany.id, businessUser?.id, biDraft)}
                                            disabled={biSaving || !biEditing}
                                            style={{ padding: '6px 12px', background: biEditing ? '#334155' : '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: biEditing && !biSaving ? 'pointer' : 'not-allowed' }}
                                          >
                                            {biSaving ? 'Saving...' : 'Save'}
                                          </button>
                                          {biEditing && (
                                            <button
                                              onClick={() => setEditingBusinessInfoByCompany((prev) => { const next = { ...prev }; delete next[businessCompany.id]; return next; })}
                                              style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                            >
                                              Reset
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {/* Row 1: Company Name, Company ID, Company Sector, Type */}
                                      <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <label style={labelStyle}>Company Name:</label>
                                          <span style={{ fontSize: '13px', color: '#1e293b' }}>{businessCompany?.name || 'Not found'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <label style={labelStyle}>Company ID:</label>
                                          <span style={{ fontSize: '13px', color: '#1e293b', fontFamily: 'monospace' }}>{businessCompany?.id || 'Not found'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <label style={labelStyle}>Company Sector:</label>
                                          <span style={{ fontSize: '13px', color: '#1e293b' }}>{sectorName}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <label style={labelStyle}>Type:</label>
                                          <span style={{ fontSize: '13px', color: '#1e293b' }}>Standalone Business</span>
                                        </div>
                                      </div>
                                      {/* Row 2: Email, Name, Phone */}
                                      <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Email:</label>
                                          <input type="email" value={biDraft.email} onChange={(e) => setBiField('email', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Name:</label>
                                          <input type="text" value={biDraft.name} onChange={(e) => setBiField('name', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Phone:</label>
                                          <input type="text" value={biDraft.phone} onChange={(e) => setBiField('phone', e.target.value)} style={inputStyle} />
                                        </div>
                                      </div>
                                      {/* Row 3: Address */}
                                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 2 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Street:</label>
                                          <input type="text" value={biDraft.addressStreet} onChange={(e) => setBiField('addressStreet', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>City:</label>
                                          <input type="text" value={biDraft.addressCity} onChange={(e) => setBiField('addressCity', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>State:</label>
                                          <input type="text" value={biDraft.addressState} onChange={(e) => setBiField('addressState', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>ZIP:</label>
                                          <input type="text" value={biDraft.addressZip} onChange={(e) => setBiField('addressZip', e.target.value)} style={inputStyle} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Country:</label>
                                          <input type="text" value={biDraft.addressCountry} onChange={(e) => setBiField('addressCountry', e.target.value)} style={inputStyle} />
                                        </div>
                                      </div>
                                      {/* Row 4: Tier 1 Support Routing */}
                                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Tier 1 Owner:</label>
                                          <select
                                            value={tier1RoutingDraft.owner}
                                            onChange={(e) =>
                                              setEditingTier1RoutingByCompany((prev) => ({
                                                ...prev,
                                                [businessCompany.id]: {
                                                  owner: e.target.value === 'CONSULTANT' ? 'CONSULTANT' : 'CORELYTICS',
                                                  consultantId:
                                                    e.target.value === 'CONSULTANT'
                                                      ? (tier1RoutingDraft.consultantId || businessCompany.consultantId || '')
                                                      : '',
                                                  supportEmail:
                                                    e.target.value === 'CONSULTANT' ? tier1RoutingDraft.supportEmail : 'support@corelytics.com',
                                                },
                                              }))
                                            }
                                            style={inputStyle}
                                          >
                                            <option value="CORELYTICS">Corelytics</option>
                                            <option value="CONSULTANT">Consultant</option>
                                          </select>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Consultant:</label>
                                          <select
                                            value={tier1RoutingDraft.consultantId}
                                            disabled={tier1RoutingDraft.owner !== 'CONSULTANT'}
                                            onChange={(e) =>
                                              setEditingTier1RoutingByCompany((prev) => ({
                                                ...prev,
                                                [businessCompany.id]: {
                                                  owner: tier1RoutingDraft.owner,
                                                  consultantId: e.target.value,
                                                  supportEmail:
                                                    tier1RoutingDraft.supportEmail ||
                                                    (supportConsultants.find((c: any) => c.id === e.target.value)?.email || ''),
                                                },
                                              }))
                                            }
                                            style={{ ...inputStyle, background: tier1RoutingDraft.owner !== 'CONSULTANT' ? '#f1f5f9' : 'white' }}
                                          >
                                            <option value="">Select consultant</option>
                                            {supportConsultants.map((consultant: any) => (
                                              <option key={consultant.id} value={consultant.id}>
                                                {consultant.companyName || consultant.fullName}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                          <label style={{ ...labelStyle, whiteSpace: 'nowrap', marginBottom: 0 }}>Contact Email:</label>
                                          <input
                                            type="email"
                                            value={tier1RoutingDraft.supportEmail}
                                            disabled={tier1RoutingDraft.owner !== 'CONSULTANT'}
                                            onChange={(e) =>
                                              setEditingTier1RoutingByCompany((prev) => ({
                                                ...prev,
                                                [businessCompany.id]: {
                                                  owner: tier1RoutingDraft.owner,
                                                  consultantId: tier1RoutingDraft.consultantId,
                                                  supportEmail: e.target.value,
                                                },
                                              }))
                                            }
                                            placeholder="tier1@consultant.com"
                                            style={{ ...inputStyle, background: tier1RoutingDraft.owner !== 'CONSULTANT' ? '#f1f5f9' : 'white' }}
                                          />
                                        </div>
                                        <button
                                          onClick={() =>
                                            saveTier1Routing(
                                              businessCompany.id,
                                              tier1RoutingDraft.owner,
                                              tier1RoutingDraft.consultantId,
                                              tier1RoutingDraft.supportEmail
                                            )
                                          }
                                          disabled={savingTier1RoutingCompanyId === businessCompany.id}
                                          style={{ padding: '6px 12px', background: savingTier1RoutingCompanyId === businessCompany.id ? '#94a3b8' : '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: savingTier1RoutingCompanyId === businessCompany.id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                          {savingTier1RoutingCompanyId === businessCompany.id ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                          onClick={() =>
                                            setEditingTier1RoutingByCompany((prev) => {
                                              const next = { ...prev };
                                              delete next[businessCompany.id];
                                              return next;
                                            })
                                          }
                                          style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                          Reset
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {isPluginAccountingSystem(businessCompany?.accountingSystem) ? (
                                  <div style={{ marginBottom: '12px' }}>
                                    <AccountingSystemPanel
                                      companyId={businessCompany.id}
                                      system={String(businessCompany.accountingSystem || '')}
                                    />
                                  </div>
                                ) : ['INFOR_M3', 'INFOR_CSI'].includes(String(businessCompany?.accountingSystem || '').toUpperCase()) ? (
                                  <>
                                  <div style={{ marginBottom: '8px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                      <div>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                          {getAccountingSystemLabel(businessCompany.accountingSystem)}
                                        </div>
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                          <button
                                            onClick={() => connectInforM3?.(businessCompany.id)}
                                            disabled={inforBusy}
                                            style={{ padding: '8px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                          >
                                            {inforBusy && inforBusyAction === 'connect' ? 'Working...' : (inforConnected ? 'Connected' : 'Reconnect')}
                                          </button>
                                          <button
                                            onClick={() => disconnectInforM3?.(businessCompany.id)}
                                            disabled={inforBusy || !inforConnected}
                                            style={{ padding: '8px 12px', background: 'white', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                          >
                                            Disconnect
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ width: '100%' }}>
                                        <input
                                          id={`business-infor-json-file-${businessCompany.id}`}
                                          type="file"
                                          accept=".json,.txt,.ionapi"
                                          style={{ display: 'none' }}
                                          onChange={(event) =>
                                            handleInforCredentialsFileImport(event, businessCompany.id, businessCompany.name)
                                          }
                                        />
                                        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(0, 1fr) minmax(0, 1.12fr) minmax(0, 0.7fr)', gap: '8px' }}>
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: 'white' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>CONNECTION</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', alignItems: 'center', justifyContent: 'start' }}>
                                              <button
                                                onClick={() => {
                                                  const fileInput = document.getElementById(`business-infor-json-file-${businessCompany.id}`) as HTMLInputElement | null;
                                                  fileInput?.click();
                                                }}
                                                disabled={inforBusy}
                                                style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                Import JSON
                                              </button>
                                              <button
                                                onClick={() => testInforM3Token?.(businessCompany.id)}
                                                disabled={inforBusy || !inforConnected}
                                                style={{ padding: '8px 12px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                              >
                                                Test Token
                                              </button>
                                              <button
                                                onClick={async () => {
                                                  await saveInforM3Credentials?.(businessCompany.id, {
                                                    frequency: operationalSettings.frequency,
                                                    pullTime: operationalSettings.pullTime,
                                                    autoSyncWindowDays: operationalSettings.autoSyncWindowDays,
                                                  });
                                                  await saveCompanyPrograms(businessCompany.id);
                                                }}
                                                disabled={inforBusy}
                                                style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                Save
                                              </button>
                                              <input
                                                type="month"
                                                value={getCompanyFinancialImportSettings(businessCompany.id).targetMonth}
                                                onChange={(e) =>
                                                  setCompanyFinancialImportSettings(businessCompany.id, { targetMonth: e.target.value })
                                                }
                                                style={{ width: '100%', minWidth: 0, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                              />
                                              <button
                                                onClick={() => runInforM3FinancialPayloadPush(businessCompany.id, businessCompany.name)}
                                                disabled={inforBusy || !inforConnected}
                                                style={{ width: '100%', minWidth: 0, padding: '8px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                              >
                                                Push Financial Payload
                                              </button>
                                              <button
                                                onClick={() => runInforM3FinancialImport(businessCompany.id, businessCompany.name)}
                                                disabled={inforBusy || !inforConnected || !!runningFinancialImportByCompany[businessCompany.id]}
                                                style={{ width: '100%', minWidth: 0, padding: '8px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected || !!runningFinancialImportByCompany[businessCompany.id] ? 'not-allowed' : 'pointer' }}
                                              >
                                                {runningFinancialImportByCompany[businessCompany.id] ? 'Running Financial Import...' : 'Run Financial Import'}
                                              </button>
                                            </div>
                                          </div>
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: 'white' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>SYNC ACTIONS</div>
                                            {renderInforSyncStatusPanel(businessCompany.id)}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', alignItems: 'center' }}>
                                              <button
                                                onClick={() => {
                                                  if (!runInforM3OperationalSync) {
                                                    alert('Operational sync handler is unavailable. Refresh and try again.');
                                                    return;
                                                  }
                                                  const site = requireCompanyCsiSite(businessCompany.id);
                                                  if (!site) return;
                                                  const useCustomDayRange = Boolean(operationalSettings.useCustomDateRange);
                                                  const useCustomMonthRange = Boolean(operationalSettings.useCustomMonthRange);
                                                  const startDate = useCustomDayRange
                                                    ? dayToRangeStartIso(operationalSettings.customStartDate)
                                                    : useCustomMonthRange
                                                      ? monthToRangeStartIso(operationalSettings.customStartMonth)
                                                      : undefined;
                                                  const endDate = useCustomDayRange
                                                    ? dayToRangeEndIso(operationalSettings.customEndDate)
                                                    : useCustomMonthRange
                                                      ? monthToRangeEndIso(operationalSettings.customEndMonth)
                                                      : undefined;
                                                  // Month-range inputs are normalized to concrete day-level
                                                  // start/end dates before dispatch; allow either mode.
                                                  if (operationalSettings.syncMode === 'business_day_backfill' && !useCustomDayRange && !useCustomMonthRange) {
                                                    alert('Historical Daily Backfill requires a custom Start/End range (day-level or month-level).');
                                                    return;
                                                  }
                                                  if (useCustomDayRange || useCustomMonthRange) {
                                                    if (!startDate || !endDate) {
                                                      alert(
                                                        useCustomDayRange
                                                          ? 'Set both Start Date and End Date for custom range sync.'
                                                          : 'Set both Start Month and End Month for custom range sync.'
                                                      );
                                                      return;
                                                    }
                                                    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
                                                      alert(
                                                        useCustomDayRange
                                                          ? 'Custom range is invalid: Start Date must be before End Date.'
                                                          : 'Custom range is invalid: Start Month must be before End Month.'
                                                      );
                                                      return;
                                                    }
                                                  }
                                                  runInforM3OperationalSync(businessCompany.id, operationalSettings.frequency, site, {
                                                    mode:
                                                      useCustomDayRange || useCustomMonthRange
                                                        ? (operationalSettings.syncMode === 'business_day_backfill'
                                                          ? 'business_day_backfill'
                                                          : 'manual')
                                                        : operationalSettings.syncMode,
                                                    backfillMonths:
                                                      useCustomDayRange || useCustomMonthRange ? undefined : operationalSettings.backfillMonths,
                                                    lookbackDays:
                                                      useCustomDayRange || useCustomMonthRange ? undefined : operationalSettings.lookbackDays,
                                                    startDate,
                                                    endDate,
                                                  });
                                                }}
                                                disabled={inforBusy}
                                                style={{ justifySelf: 'start', padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                {inforBusy && inforBusyAction === 'operational_sync' ? 'Working...' : 'Run Ops Sync Now'}
                                              </button>
                                              <button
                                                onClick={() => resetInforM3OperationalSyncState?.(businessCompany.id)}
                                                disabled={inforBusy}
                                                style={{ justifySelf: 'start', padding: '8px 12px', background: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                {inforBusy && inforBusyAction === 'operational_sync_reset' ? 'Resetting...' : 'Reset Sync State'}
                                              </button>
                                            </div>
                                          </div>
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: 'white', gridColumn: '4', gridRow: '1' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>OPERATIONAL DATA MODE</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                              {businessCompany.forceOperationalMockData
                                                ? 'Demo mode is ON. Mock data is being served.'
                                                : businessCompany.hasRealOperationalData
                                                  ? `Real data mode is ON${businessCompany.realDataActivatedAt ? ` (activated ${new Date(businessCompany.realDataActivatedAt).toLocaleString()})` : ''}.`
                                                  : 'Demo mode is active until real operational data is detected.'}
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                              <button
                                                onClick={() => saveOperationalDataMode(businessCompany.id, true)}
                                                disabled={savingOperationalDataModeCompanyId === businessCompany.id || businessCompany.forceOperationalMockData}
                                                style={{
                                                  padding: '6px 10px',
                                                  background: businessCompany.forceOperationalMockData ? '#0f766e' : 'white',
                                                  color: businessCompany.forceOperationalMockData ? 'white' : '#0f766e',
                                                  border: '1px solid #0f766e',
                                                  borderRadius: '6px',
                                                  fontSize: '12px',
                                                  fontWeight: '600',
                                                  cursor: savingOperationalDataModeCompanyId === businessCompany.id || businessCompany.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                }}
                                              >
                                                Force Demo Mode
                                              </button>
                                              <button
                                                onClick={() => saveOperationalDataMode(businessCompany.id, false)}
                                                disabled={savingOperationalDataModeCompanyId === businessCompany.id || !businessCompany.forceOperationalMockData}
                                                style={{
                                                  padding: '6px 10px',
                                                  background: !businessCompany.forceOperationalMockData ? '#1d4ed8' : 'white',
                                                  color: !businessCompany.forceOperationalMockData ? 'white' : '#1d4ed8',
                                                  border: '1px solid #1d4ed8',
                                                  borderRadius: '6px',
                                                  fontSize: '12px',
                                                  fontWeight: '600',
                                                  cursor: savingOperationalDataModeCompanyId === businessCompany.id || !businessCompany.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                                }}
                                              >
                                                Use Real Data
                                              </button>
                                            </div>
                                          </div>
                                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', background: 'white', gridColumn: '3', gridRow: '1' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '8px', whiteSpace: 'nowrap' }}>SYNC WINDOW</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                                              <label
                                                style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px',
                                                  fontSize: '12px',
                                                  color: '#334155',
                                                  gridColumn: '1 / -1',
                                                }}
                                              >
                                                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', minWidth: '40px' }}>Mode</span>
                                                <select
                                                  value={operationalSettings.syncMode}
                                                  onChange={(e) =>
                                                    setCompanyOperationalSettings(businessCompany.id, {
                                                      syncMode:
                                                        e.target.value === 'business_day_backfill'
                                                          ? 'business_day_backfill'
                                                          : e.target.value === 'backfill'
                                                            ? 'backfill'
                                                            : 'daily_overlap',
                                                    })
                                                  }
                                                  style={{ flex: 1, width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                >
                                                  <option value="daily_overlap">Daily Auto Sync (Recommended)</option>
                                                  <option value="business_day_backfill">Historical Daily Backfill (Business Days)</option>
                                                  <option value="backfill">Window Refresh (Advanced)</option>
                                                </select>
                                              </label>
                                              <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                {operationalSettings.syncMode === 'daily_overlap'
                                                  ? 'Use for normal daily updates. Applies a rolling overlap window to catch late updates.'
                                                  : operationalSettings.syncMode === 'business_day_backfill'
                                                    ? 'Use to rebuild historical daily snapshots day-by-day (most reliable for history fixes).'
                                                    : 'Advanced: refreshes a broad transaction window, but may not replay each day discretely.'}
                                              </div>
                                              <label
                                                style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px',
                                                  fontSize: '12px',
                                                  color: '#334155',
                                                  gridColumn: '1 / -1',
                                                }}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={Boolean(operationalSettings.useCustomMonthRange)}
                                                  onChange={(e) =>
                                                    setCompanyOperationalSettings(businessCompany.id, {
                                                      useCustomMonthRange: e.target.checked,
                                                    })
                                                  }
                                                />
                                                <span style={{ fontWeight: 600 }}>
                                                  Use Custom Month Range (chunk large history loads)
                                                </span>
                                              </label>
                                              <label
                                                style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px',
                                                  fontSize: '12px',
                                                  color: '#334155',
                                                  gridColumn: '1 / -1',
                                                }}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={Boolean(operationalSettings.useCustomDateRange)}
                                                  onChange={(e) =>
                                                    setCompanyOperationalSettings(businessCompany.id, {
                                                      useCustomDateRange: e.target.checked,
                                                    })
                                                  }
                                                />
                                                <span style={{ fontWeight: 600 }}>
                                                  Use Explicit Date Range (day-level, recommended for historical backfill)
                                                </span>
                                              </label>
                                              {operationalSettings.useCustomDateRange && (
                                                <>
                                                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                    <span style={{ fontWeight: 600 }}>Start Date</span>
                                                    <input
                                                      type="date"
                                                      value={operationalSettings.customStartDate}
                                                      onChange={(e) =>
                                                        setCompanyOperationalSettings(businessCompany.id, {
                                                          customStartDate: e.target.value,
                                                        })
                                                      }
                                                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                    />
                                                  </label>
                                                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                    <span style={{ fontWeight: 600 }}>End Date</span>
                                                    <input
                                                      type="date"
                                                      value={operationalSettings.customEndDate}
                                                      onChange={(e) =>
                                                        setCompanyOperationalSettings(businessCompany.id, {
                                                          customEndDate: e.target.value,
                                                        })
                                                      }
                                                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                    />
                                                  </label>
                                                  <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                    Historical Daily Backfill now requires explicit day-level Start/End dates.
                                                  </div>
                                                </>
                                              )}
                                              {operationalSettings.useCustomMonthRange && (
                                                <>
                                                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                    <span style={{ fontWeight: 600 }}>Start Month</span>
                                                    <input
                                                      type="month"
                                                      value={operationalSettings.customStartMonth}
                                                      onChange={(e) =>
                                                        setCompanyOperationalSettings(businessCompany.id, {
                                                          customStartMonth: e.target.value,
                                                        })
                                                      }
                                                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                    />
                                                  </label>
                                                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                    <span style={{ fontWeight: 600 }}>End Month</span>
                                                    <input
                                                      type="month"
                                                      value={operationalSettings.customEndMonth}
                                                      onChange={(e) =>
                                                        setCompanyOperationalSettings(businessCompany.id, {
                                                          customEndMonth: e.target.value,
                                                        })
                                                      }
                                                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                    />
                                                  </label>
                                                  <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b', lineHeight: 1.35 }}>
                                                    Runs only the selected month band. Use this to split large 36-month initial loads into smaller chunks.
                                                  </div>
                                                </>
                                              )}
                                              {(operationalSettings.syncMode === 'business_day_backfill' || operationalSettings.syncMode === 'backfill') &&
                                                !operationalSettings.useCustomMonthRange &&
                                                !operationalSettings.useCustomDateRange && (
                                                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                  <span style={{ fontWeight: 600 }}>Backfill Months</span>
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    value={operationalSettings.backfillMonths}
                                                    onChange={(e) =>
                                                      setCompanyOperationalSettings(businessCompany.id, {
                                                        backfillMonths: Number(e.target.value || 36),
                                                      })
                                                    }
                                                    style={{ width: '50%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </label>
                                              )}
                                              {operationalSettings.syncMode === 'daily_overlap' && !operationalSettings.useCustomMonthRange && (
                                                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                                  <span style={{ fontWeight: 600 }}>Overlap Days</span>
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    value={operationalSettings.lookbackDays}
                                                    onChange={(e) =>
                                                      setCompanyOperationalSettings(businessCompany.id, {
                                                        lookbackDays: Number(e.target.value || 30),
                                                      })
                                                    }
                                                    style={{ width: '50%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </label>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                      <div>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Connection Credentials</h4>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                          {getAccountingSystemLabel(businessCompany.accountingSystem)}
                                        </div>
                                      </div>
                                      <div style={{ display: 'none', gap: '8px', marginLeft: 'auto', width: 'fit-content' }}>
                                        <input
                                          id={`infor-json-file-${businessCompany.id}`}
                                          type="file"
                                          accept=".json,.txt,.ionapi"
                                          style={{ display: 'none' }}
                                          onChange={(event) =>
                                            handleInforCredentialsFileImport(event, businessCompany.id, businessCompany.name)
                                          }
                                        />
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(232px, 264px))', justifyContent: 'end', gap: '8px' }}>
                                          <div style={{ width: '248px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', whiteSpace: 'nowrap' }}>CONNECTION</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', alignItems: 'center' }}>
                                              <button
                                                onClick={() => {
                                                  const fileInput = document.getElementById(`infor-json-file-${businessCompany.id}`) as HTMLInputElement | null;
                                                  fileInput?.click();
                                                }}
                                                disabled={inforBusy}
                                                style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                Import JSON
                                              </button>
                                              <button
                                                onClick={() => testInforM3Token?.(businessCompany.id)}
                                                disabled={inforBusy || !inforConnected}
                                                style={{ padding: '8px 12px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                              >
                                                Test Token
                                              </button>
                                              <button
                                                onClick={async () => {
                                                  await saveInforM3Credentials?.(businessCompany.id, {
                                                    frequency: operationalSettings.frequency,
                                                    pullTime: operationalSettings.pullTime,
                                                    autoSyncWindowDays: operationalSettings.autoSyncWindowDays,
                                                  });
                                                  await saveCompanyPrograms(businessCompany.id);
                                                }}
                                                disabled={inforBusy}
                                                style={{ width: '100%', minWidth: 0, padding: '6px 8px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                Save
                                              </button>
                                              <button
                                                onClick={() => connectInforM3?.(businessCompany.id)}
                                                disabled={inforBusy}
                                                style={{ padding: '8px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                {inforBusy && inforBusyAction === 'connect' ? 'Working...' : (inforConnected ? 'Connected' : 'Reconnect')}
                                              </button>
                                              <button
                                                onClick={() => disconnectInforM3?.(businessCompany.id)}
                                                disabled={inforBusy || !inforConnected}
                                                style={{ gridColumn: '1 / -1', justifySelf: 'start', padding: '8px 12px', background: 'white', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                              >
                                                Disconnect
                                              </button>
                                            </div>
                                          </div>
                                          <div style={{ width: '248px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', whiteSpace: 'nowrap' }}>SYNC ACTIONS</div>
                                            {renderInforSyncStatusPanel(businessCompany.id)}
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                              <button
                                                onClick={() => {
                                                  if (!runInforM3OperationalSync) {
                                                    alert('Operational sync handler is unavailable. Refresh and try again.');
                                                    return;
                                                  }
                                                  const site = requireCompanyCsiSite(businessCompany.id);
                                                  if (!site) return;
                                                  runInforM3OperationalSync(businessCompany.id, operationalSettings.frequency, site, {
                                                    mode: operationalSettings.syncMode,
                                                    backfillMonths: operationalSettings.backfillMonths,
                                                    lookbackDays: operationalSettings.lookbackDays,
                                                  });
                                                }}
                                                disabled={inforBusy}
                                                style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                {inforBusy && inforBusyAction === 'operational_sync' ? 'Working...' : 'Run Ops Sync Now'}
                                              </button>
                                              <button
                                                onClick={() => resetInforM3OperationalSyncState?.(businessCompany.id)}
                                                disabled={inforBusy}
                                                style={{ padding: '8px 12px', background: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy ? 'not-allowed' : 'pointer' }}
                                              >
                                                {inforBusy && inforBusyAction === 'operational_sync_reset' ? 'Resetting...' : 'Reset Sync State'}
                                              </button>
                                              <input
                                                type="month"
                                                value={getCompanyFinancialImportSettings(businessCompany.id).targetMonth}
                                                onChange={(e) =>
                                                  setCompanyFinancialImportSettings(businessCompany.id, { targetMonth: e.target.value })
                                                }
                                                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                              />
                                              <button
                                                onClick={() => runInforM3FinancialPayloadPush(businessCompany.id, businessCompany.name)}
                                                disabled={inforBusy || !inforConnected}
                                                style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                              >
                                                Push Financial Payload
                                              </button>
                                              <button
                                                onClick={() => runInforM3FinancialImport(businessCompany.id, businessCompany.name)}
                                                disabled={inforBusy || !inforConnected || !!runningFinancialImportByCompany[businessCompany.id]}
                                                style={{ padding: '8px 12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected || !!runningFinancialImportByCompany[businessCompany.id] ? 'not-allowed' : 'pointer' }}
                                              >
                                                {runningFinancialImportByCompany[businessCompany.id] ? 'Running Financial Import...' : 'Run Financial Import'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div style={{ display: 'none', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', marginBottom: '10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                                          Operational Data Mode
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', flex: 1 }}>
                                          {businessCompany.forceOperationalMockData
                                            ? 'Demo mode is ON. Mock data is being served.'
                                            : businessCompany.hasRealOperationalData
                                              ? `Real data mode is ON${businessCompany.realDataActivatedAt ? ` (activated ${new Date(businessCompany.realDataActivatedAt).toLocaleString()})` : ''}.`
                                              : 'Demo mode is active until real operational data is detected.'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                                          <button
                                            onClick={() => saveOperationalDataMode(businessCompany.id, true)}
                                            disabled={savingOperationalDataModeCompanyId === businessCompany.id || businessCompany.forceOperationalMockData}
                                            style={{
                                              padding: '6px 10px',
                                              background: businessCompany.forceOperationalMockData ? '#0f766e' : 'white',
                                              color: businessCompany.forceOperationalMockData ? 'white' : '#0f766e',
                                              border: '1px solid #0f766e',
                                              borderRadius: '6px',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: savingOperationalDataModeCompanyId === businessCompany.id || businessCompany.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                            }}
                                          >
                                            Force Demo Mode
                                          </button>
                                          <button
                                            onClick={() => saveOperationalDataMode(businessCompany.id, false)}
                                            disabled={savingOperationalDataModeCompanyId === businessCompany.id || !businessCompany.forceOperationalMockData}
                                            style={{
                                              padding: '6px 10px',
                                              background: !businessCompany.forceOperationalMockData ? '#1d4ed8' : 'white',
                                              color: !businessCompany.forceOperationalMockData ? 'white' : '#1d4ed8',
                                              border: '1px solid #1d4ed8',
                                              borderRadius: '6px',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: savingOperationalDataModeCompanyId === businessCompany.id || !businessCompany.forceOperationalMockData ? 'not-allowed' : 'pointer',
                                            }}
                                          >
                                            Use Real Data
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        marginBottom: '8px',
                                        padding: '8px',
                                        background: inforConnected && inforStatus === 'ACTIVE' ? '#d1fae5' : inforStatus === 'ERROR' ? '#fee2e2' : inforStatus === 'EXPIRED' ? '#fed7aa' : '#fef3c7',
                                        border: `1px solid ${inforConnected && inforStatus === 'ACTIVE' ? '#10b981' : inforStatus === 'ERROR' ? '#ef4444' : inforStatus === 'EXPIRED' ? '#f97316' : '#fbbf24'}`,
                                        borderRadius: '6px',
                                      }}
                                    >
                                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>
                                        {inforConnected && inforStatus === 'ACTIVE' ? 'Connected' : inforStatus === 'ERROR' ? 'Error' : inforStatus === 'EXPIRED' ? 'Token Expired' : 'Not Connected'}
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#475569' }}>
                                        {inforError || (inforLastSync ? `Last synced: ${new Date(inforLastSync).toLocaleString()}` : 'Enter credentials and connect')}
                                      </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridAutoFlow: 'row dense', gap: '6px', marginBottom: '8px' }}>
                                      {[
                                        { key: 'clientName', label: 'Client Name', type: 'text' },
                                        { key: 'tenantId', label: 'Tenant ID *', type: 'text' },
                                        { key: 'clientId', label: 'Client ID *', type: 'text' },
                                        { key: 'ionApiBaseUrl', label: 'ION API Base URL *', type: 'text' },
                                        { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                        { key: 'ssoBaseUrl', label: 'SSO Base URL *', type: 'text' },
                                        { key: 'serviceAccountSecretKey', label: 'Service Account Secret Key *', type: 'password' },
                                        { key: 'serviceAccountAccessKey', label: 'Service Account Access Key *', type: 'text' },
                                      ].map((field) => (
                                        <label
                                          key={field.key}
                                          style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px',
                                            fontSize: '12px',
                                            color: '#334155',
                                            gridColumn:
                                              field.key === 'tenantId' ||
                                              field.key === 'ionApiBaseUrl' ||
                                              field.key === 'ssoBaseUrl'
                                                ? '2'
                                                : field.key === 'serviceAccountAccessKey'
                                                ? '1'
                                                : field.key === 'serviceAccountSecretKey'
                                                  ? '1'
                                                  : undefined,
                                          }}
                                        >
                                          <span style={{ fontWeight: 600 }}>{field.label}</span>
                                          <input
                                            type={field.type}
                                            value={inforCredentials?.[field.key] || ''}
                                            onChange={(e) => setInforCredentials?.((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                                            placeholder={field.label.replace(' *', '')}
                                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          />
                                        </label>
                                      ))}
                                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                        <span style={{ fontWeight: 600 }}>Operational Pull Frequency</span>
                                        <select
                                          value={operationalSettings.frequency}
                                          onChange={(e) =>
                                            setCompanyOperationalSettings(businessCompany.id, {
                                              frequency: e.target.value as 'daily' | 'weekly' | 'monthly',
                                            })
                                          }
                                          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                        >
                                          <option value="daily">Daily</option>
                                          <option value="weekly">Weekly</option>
                                          <option value="monthly">Monthly</option>
                                        </select>
                                      </label>
                                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                        <span style={{ fontWeight: 600 }}>Auto Pull Time (America/New_York)</span>
                                        <select
                                          value={operationalSettings.pullTime}
                                          onChange={(e) =>
                                            setCompanyOperationalSettings(businessCompany.id, {
                                              pullTime: e.target.value,
                                            })
                                          }
                                          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                        >
                                          {Array.from({ length: 24 }).map((_, hour) => {
                                            const hh = String(hour).padStart(2, '0');
                                            const value = `${hh}:00`;
                                            return (
                                              <option key={value} value={value}>
                                                {value}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </label>
                                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155', gridColumn: '2' }}>
                                        <span style={{ fontWeight: 600 }}>Auto Sync Window Days</span>
                                        <input
                                          type="number"
                                          min={1}
                                          step={1}
                                          value={operationalSettings.autoSyncWindowDays}
                                          onChange={(e) =>
                                            setCompanyOperationalSettings(businessCompany.id, {
                                              autoSyncWindowDays: Number(e.target.value || 3),
                                            })
                                          }
                                          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                        />
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                          Nightly auto-sync window length (inclusive, ending on prior UTC day).
                                        </span>
                                      </label>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', alignItems: 'end' }}>
                                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                        <span style={{ fontWeight: 600 }}>Read-Only Probe Path</span>
                                        <input
                                          type="text"
                                          value={inforProbePath || ''}
                                          onChange={(e) => setInforProbePath?.(e.target.value)}
                                          placeholder="/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=1"
                                          style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                        />
                                      </label>
                                      <button
                                        onClick={() => {
                                          const site = requireCompanyCsiSite(businessCompany.id);
                                          if (!site) return;
                                          probeInforM3?.(businessCompany.id, site);
                                        }}
                                        disabled={inforBusy || !inforConnected}
                                        style={{ padding: '8px 12px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: inforBusy || !inforConnected ? 'not-allowed' : 'pointer' }}
                                      >
                                        Probe
                                      </button>
                                    </div>

                                    {inforProbeSummary && (
                                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '8px' }}>
                                        {inforProbeSummary}
                                      </div>
                                    )}
                                  </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', order: 2 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addCompanyProgram(businessCompany.id)}
                                            disabled={isCompanyProgramsLoading(businessCompany.id) || isCompanyProgramsSaving(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveCompanyPrograms(businessCompany.id)}
                                            disabled={isCompanyProgramsSaving(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the CSI integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '11%' }}>Module</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '21%' }}>CSI IDO</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '33%' }}>CSI Endpoint Path</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '14%' }}>Mongoose Config</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '8%' }}>Site</th>
                                              <th style={{ textAlign: 'center', padding: '6px', color: '#475569', width: '7%' }}>Enabled</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '6%' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {isCompanyProgramsLoading(businessCompany.id) ? (
                                              <tr>
                                                <td colSpan={7} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                                                  Loading accounting programs...
                                                </td>
                                              </tr>
                                            ) : accountingPrograms.length === 0 ? (
                                              <tr>
                                                <td colSpan={7} style={{ padding: '10px', color: '#64748b', fontSize: '12px' }}>
                                                  No saved programs yet. Click + Add to create one.
                                                </td>
                                              </tr>
                                            ) : accountingPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.module}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'module', e.target.value)}
                                                    placeholder="Module"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.miProgram}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'miProgram', e.target.value)}
                                                    placeholder="CSI IDO (e.g. SLCustomers)"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.endpointPath || ''}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'endpointPath', e.target.value)}
                                                    placeholder="/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?recordCap=500"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.mongooseConfig || ''}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'mongooseConfig', e.target.value)}
                                                    placeholder="TMSManager"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.site || ''}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'site', e.target.value)}
                                                    placeholder="Optional site (e.g. MAIN)"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={row.enabled}
                                                    onChange={(e) => updateCompanyProgram(businessCompany.id, index, 'enabled', e.target.checked)}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteCompanyProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1', order: 3 }}>
                                      {renderOperationalHubCustomizationCard(businessCompany)}
                                    </div>
                                  </div>
                                  </>
                                ) : businessCompany?.accountingSystem === 'QUICKBOOKS' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            QuickBooks Online setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => saveQboSettings(businessCompany.id)}
                                            style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            disabled
                                            style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                          >
                                            Validate Connection
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#166534' }}>QuickBooks Online operational sync configuration</div>
                                        <div style={{ fontSize: '12px', color: '#166534' }}>
                                          Operational data loads when the user runs QuickBooks sync (90-day default or 3-year backfill).
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Operational load *</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).operationalLoadMode}
                                            onChange={(e) =>
                                              setQboSetting(businessCompany.id, 'operationalLoadMode', e.target.value as 'rolling_90' | 'backfill_3y')
                                            }
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="rolling_90">90-day rolling (default)</option>
                                            <option value="backfill_3y">3-year backfill (starts on next client sync)</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).syncTime}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Initial Sync Start Date (YYYY-MM-DD)</span>
                                          <input
                                            type="text"
                                            value={getQboSettings(businessCompany.id).initialSyncStartDate}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'initialSyncStartDate', e.target.value)}
                                            placeholder="2024-01-01"
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          />
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).incrementalSync}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'incrementalSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Webhook Enabled *</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).webhookEnabled}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'webhookEnabled', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>CDC Enabled *</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).cdcEnabled}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'cdcEnabled', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Nightly Reconciliation *</span>
                                          <select
                                            value={getQboSettings(businessCompany.id).reconciliationEnabled}
                                            onChange={(e) => setQboSetting(businessCompany.id, 'reconciliationEnabled', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addQboProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveQboSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Data Domain</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>QBO Entity</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '80px' }}>Enabled</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {getQboPrograms(businessCompany.id).map((row, index) => (
                                              <tr key={`${businessCompany.id}-qbo-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.dataDomain}
                                                    onChange={(e) => updateQboProgram(businessCompany.id, index, 'dataDomain', e.target.value)}
                                                    placeholder="Data Domain"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.qboEntity}
                                                    onChange={(e) => updateQboProgram(businessCompany.id, index, 'qboEntity', e.target.value)}
                                                    placeholder="QBO Entity"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={Boolean(row.enabled)}
                                                    onChange={(e) => updateQboProgram(businessCompany.id, index, 'enabled', e.target.checked)}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteQboProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : businessCompany?.accountingSystem === 'QUICKBOOKS_DESKTOP' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            QuickBooks Desktop setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <input
                                            id={`qbdesktop-json-file-${businessCompany.id}`}
                                            type="file"
                                            accept=".json"
                                            style={{ display: 'none' }}
                                            onChange={(event) =>
                                              handleQbDesktopFinancialPayloadFileImport(event, businessCompany.id, businessCompany.name)
                                            }
                                          />
                                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
                                            <input
                                              type="month"
                                              value={getCompanyFinancialImportSettings(businessCompany.id).targetMonth}
                                              onChange={(e) =>
                                                setCompanyFinancialImportSettings(businessCompany.id, { targetMonth: e.target.value })
                                              }
                                              style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                            />
                                            <button
                                              onClick={() => {
                                                const fileInput = document.getElementById(`qbdesktop-json-file-${businessCompany.id}`) as HTMLInputElement | null;
                                                fileInput?.click();
                                              }}
                                            style={{ padding: '6px 8px', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                            >
                                              Import JSON
                                            </button>
                                          </div>
                                          <button
                                            onClick={() => saveQbDesktopSettings(businessCompany.id)}
                                            style={{ padding: '6px 8px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            disabled
                                            style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                          >
                                            Validate Connection
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>QuickBooks Desktop configuration</div>
                                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                                          Enter required Web Connector/SDK setup values, then click Save.
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                        {[
                                          { key: 'integrationType', label: 'Integration Type *' },
                                          { key: 'applicationName', label: 'Application Name *' },
                                          { key: 'soapEndpointUrl', label: 'SOAP/App Endpoint URL *' },
                                          { key: 'supportUrl', label: 'Support URL' },
                                          { key: 'ownerId', label: 'Owner ID (GUID) *' },
                                          { key: 'fileId', label: 'File ID (GUID) *' },
                                          { key: 'webConnectorUsername', label: 'Web Connector Username *' },
                                          { key: 'pollingIntervalMinutes', label: 'Polling Interval (minutes) *' },
                                          { key: 'desktopEditionYear', label: 'QB Desktop Edition + Year *' },
                                          { key: 'countryVersion', label: 'Country Version *' },
                                          { key: 'companyFilePath', label: 'Target Company File Path (.QBW) *' },
                                          { key: 'hostMachineName', label: 'Host Machine Name *' },
                                        ].map((field) => (
                                          <label key={`${businessCompany.id}-qbdesktop-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                            <span style={{ fontWeight: 600 }}>{field.label}</span>
                                            {field.key === 'integrationType' ? (
                                              <select
                                                value={qbDesktopSettings.integrationType}
                                                onChange={(e) => setQbDesktopSetting(businessCompany.id, 'integrationType', e.target.value)}
                                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                              >
                                                <option value="">Select</option>
                                                <option value="WEB_CONNECTOR">QuickBooks Web Connector</option>
                                                <option value="SDK">SDK</option>
                                              </select>
                                            ) : (
                                              <input
                                                type="text"
                                                value={(qbDesktopSettings as any)[field.key] || ''}
                                                onChange={(e) => setQbDesktopSetting(businessCompany.id, field.key as keyof typeof defaultQbDesktopSettings, e.target.value)}
                                                placeholder={field.label.replace(' *', '')}
                                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                              />
                                            )}
                                          </label>
                                        ))}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Permission Scope *</span>
                                          <select
                                            value={qbDesktopSettings.permissionScope}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'permissionScope', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="READ_ONLY">Read-only</option>
                                            <option value="READ_WRITE">Read-write</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Unattended Access Required *</span>
                                          <select
                                            value={qbDesktopSettings.unattendedAccessRequired}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'unattendedAccessRequired', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Host Online During Sync *</span>
                                          <select
                                            value={qbDesktopSettings.hostOnlineForSync}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'hostOnlineForSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Direction *</span>
                                          <select
                                            value={qbDesktopSettings.syncDirection}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'syncDirection', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="QB_TO_PLATFORM">QB to Platform</option>
                                            <option value="TWO_WAY">Two-way</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                          <select
                                            value={qbDesktopSettings.syncFrequency}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'syncFrequency', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={qbDesktopSettings.syncTime}
                                            onChange={(e) => setQbDesktopSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addQbDesktopProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveQbDesktopSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Data Domain</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>QB Entity</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {qbDesktopPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-qbdesktop-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.dataDomain}
                                                    onChange={(e) => updateQbDesktopProgram(businessCompany.id, index, 'dataDomain', e.target.value)}
                                                    placeholder="Data Domain"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.qbEntity}
                                                    onChange={(e) => updateQbDesktopProgram(businessCompany.id, index, 'qbEntity', e.target.value)}
                                                    placeholder="QB Entity"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteQbDesktopProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : businessCompany?.accountingSystem === 'DYNAMICS' || businessCompany?.accountingSystem === 'DYNAMICS365' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            Dynamics 365 setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => saveDynamicsSettings(businessCompany.id)}
                                            style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            disabled
                                            style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                          >
                                            Validate Token
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>Dynamics 365 configuration</div>
                                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                                          Enter tenant/app values for this company and save.
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                        {[
                                          { key: 'tenantId', label: 'Tenant ID *' },
                                          { key: 'environmentUrl', label: 'Environment URL *' },
                                          { key: 'legalEntity', label: 'Legal Entity' },
                                          { key: 'region', label: 'Region' },
                                          { key: 'clientId', label: 'Client ID *' },
                                          { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                          { key: 'authorityUrl', label: 'Authority URL' },
                                          { key: 'scope', label: 'Scope / Resource *' },
                                          { key: 'redirectUri', label: 'Redirect URI' },
                                          { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                        ].map((field) => (
                                          <label key={`${businessCompany.id}-dynamics-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                            <span style={{ fontWeight: 600 }}>{field.label}</span>
                                            <input
                                              type={field.type || 'text'}
                                              value={(dynamicsSettings as any)[field.key] || ''}
                                              onChange={(e) => setDynamicsSetting(businessCompany.id, field.key as keyof typeof defaultDynamicsSettings, e.target.value)}
                                              placeholder={field.label.replace(' *', '')}
                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                            />
                                          </label>
                                        ))}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                          <select
                                            value={dynamicsSettings.syncFrequency}
                                            onChange={(e) => setDynamicsSetting(businessCompany.id, 'syncFrequency', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={dynamicsSettings.syncTime}
                                            onChange={(e) => setDynamicsSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                          <select
                                            value={dynamicsSettings.incrementalSync}
                                            onChange={(e) => setDynamicsSetting(businessCompany.id, 'incrementalSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addDynamicsProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveDynamicsSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Entity / Endpoint</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {dynamicsPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-dynamics-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.module}
                                                    onChange={(e) => updateDynamicsProgram(businessCompany.id, index, 'module', e.target.value)}
                                                    placeholder="Module"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.entityOrEndpoint}
                                                    onChange={(e) => updateDynamicsProgram(businessCompany.id, index, 'entityOrEndpoint', e.target.value)}
                                                    placeholder="Entity or Endpoint"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteDynamicsProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : businessCompany?.accountingSystem === 'ACUMATICA' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            Acumatica setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => saveAcumaticaSettings(businessCompany.id)}
                                            style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            disabled
                                            style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                          >
                                            Validate Token
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>Acumatica Cloud ERP configuration</div>
                                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                                          Enter tenant/app endpoint values for this company and save.
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                        {[
                                          { key: 'tenantId', label: 'Tenant ID *' },
                                          { key: 'instanceUrl', label: 'Instance URL *' },
                                          { key: 'companyCode', label: 'Company Code *' },
                                          { key: 'branch', label: 'Branch' },
                                          { key: 'clientId', label: 'Client ID *' },
                                          { key: 'clientSecret', label: 'Client Secret *', type: 'password' },
                                          { key: 'username', label: 'Username *' },
                                          { key: 'password', label: 'Password *', type: 'password' },
                                          { key: 'endpointName', label: 'Endpoint Name *' },
                                          { key: 'endpointVersion', label: 'Endpoint Version *' },
                                          { key: 'contractBasedApiPath', label: 'Contract-based API Path' },
                                          { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                        ].map((field) => (
                                          <label key={`${businessCompany.id}-acumatica-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                            <span style={{ fontWeight: 600 }}>{field.label}</span>
                                            <input
                                              type={field.type || 'text'}
                                              value={(acumaticaSettings as any)[field.key] || ''}
                                              onChange={(e) => setAcumaticaSetting(businessCompany.id, field.key as keyof typeof defaultAcumaticaSettings, e.target.value)}
                                              placeholder={field.label.replace(' *', '')}
                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                            />
                                          </label>
                                        ))}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                          <select
                                            value={acumaticaSettings.syncFrequency}
                                            onChange={(e) => setAcumaticaSetting(businessCompany.id, 'syncFrequency', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={acumaticaSettings.syncTime}
                                            onChange={(e) => setAcumaticaSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                          <select
                                            value={acumaticaSettings.incrementalSync}
                                            onChange={(e) => setAcumaticaSetting(businessCompany.id, 'incrementalSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addAcumaticaProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveAcumaticaSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Endpoint / Entity</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {acumaticaPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-acumatica-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.module}
                                                    onChange={(e) => updateAcumaticaProgram(businessCompany.id, index, 'module', e.target.value)}
                                                    placeholder="Module"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.endpointOrEntity}
                                                    onChange={(e) => updateAcumaticaProgram(businessCompany.id, index, 'endpointOrEntity', e.target.value)}
                                                    placeholder="Endpoint or Entity"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteAcumaticaProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : businessCompany?.accountingSystem === 'SAGE_INTACCT' || businessCompany?.accountingSystem === 'SAGE' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            Sage Intacct setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => saveSageIntacctSettings(businessCompany.id)}
                                            style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            disabled
                                            style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}
                                          >
                                            Validate Token
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>Sage Intacct configuration</div>
                                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                                          Enter sender and company credentials for this company and save.
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                        {[
                                          { key: 'senderId', label: 'Sender ID *' },
                                          { key: 'senderPassword', label: 'Sender Password *', type: 'password' },
                                          { key: 'companyId', label: 'Company ID *' },
                                          { key: 'userId', label: 'User ID *' },
                                          { key: 'userPassword', label: 'User Password *', type: 'password' },
                                          { key: 'entityId', label: 'Entity ID' },
                                          { key: 'endpointUrl', label: 'Endpoint URL *' },
                                          { key: 'dtdVersion', label: 'DTD Version' },
                                          { key: 'locationId', label: 'Location ID' },
                                          { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                        ].map((field) => (
                                          <label key={`${businessCompany.id}-sage-intacct-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                            <span style={{ fontWeight: 600 }}>{field.label}</span>
                                            <input
                                              type={field.type || 'text'}
                                              value={(sageIntacctSettings as any)[field.key] || ''}
                                              onChange={(e) => setSageIntacctSetting(businessCompany.id, field.key as keyof typeof defaultSageIntacctSettings, e.target.value)}
                                              placeholder={field.label.replace(' *', '')}
                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                            />
                                          </label>
                                        ))}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                          <select
                                            value={sageIntacctSettings.syncFrequency}
                                            onChange={(e) => setSageIntacctSetting(businessCompany.id, 'syncFrequency', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={sageIntacctSettings.syncTime}
                                            onChange={(e) => setSageIntacctSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                          <select
                                            value={sageIntacctSettings.incrementalSync}
                                            onChange={(e) => setSageIntacctSetting(businessCompany.id, 'incrementalSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addSageIntacctProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveSageIntacctSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Object</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sageIntacctPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-sage-intacct-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.module}
                                                    onChange={(e) => updateSageIntacctProgram(businessCompany.id, index, 'module', e.target.value)}
                                                    placeholder="Module"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.objectName}
                                                    onChange={(e) => updateSageIntacctProgram(businessCompany.id, index, 'objectName', e.target.value)}
                                                    placeholder="Object Name"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteSageIntacctProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : businessCompany?.accountingSystem === 'ODOO' ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                        <div>
                                          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Accounting Integration (Site Admin Only)</h4>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            Odoo setup for <strong>{businessCompany.name}</strong>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                                          <button
                                            onClick={() => saveOdooSettings(businessCompany.id)}
                                            style={{ padding: '8px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button disabled style={{ padding: '8px 12px', background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'not-allowed' }}>
                                            Validate Token
                                          </button>
                                          <button
                                            onClick={() => runPlatformOperationalSync?.(businessCompany.id, operationalSettings.frequency)}
                                            style={{ padding: '8px 12px', background: '#0f766e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Run Ops Sync Now
                                          </button>
                                        </div>
                                      </div>

                                      <div style={{ marginBottom: '8px', padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>Odoo Accounting ERP configuration</div>
                                        <div style={{ fontSize: '12px', color: '#78350f' }}>
                                          Enter Odoo URL/database credentials and sync settings for this company.
                                        </div>
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '6px', marginBottom: '8px' }}>
                                        {[
                                          { key: 'baseUrl', label: 'Base URL *' },
                                          { key: 'database', label: 'Database *' },
                                          { key: 'username', label: 'Username *' },
                                          { key: 'password', label: 'Password *', type: 'password' },
                                          { key: 'apiKey', label: 'API Key', type: 'password' },
                                          { key: 'companyId', label: 'Company ID' },
                                          { key: 'odooVersion', label: 'Odoo Version' },
                                          { key: 'initialSyncStartDate', label: 'Initial Sync Start Date (YYYY-MM-DD)' },
                                        ].map((field) => (
                                          <label key={`${businessCompany.id}-odoo-${field.key}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                            <span style={{ fontWeight: 600 }}>{field.label}</span>
                                            <input
                                              type={field.type || 'text'}
                                              value={(odooSettings as any)[field.key] || ''}
                                              onChange={(e) => setOdooSetting(businessCompany.id, field.key as keyof typeof defaultOdooSettings, e.target.value)}
                                              placeholder={field.label.replace(' *', '')}
                                              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                            />
                                          </label>
                                        ))}
                                      </div>

                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: '8px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Auth Method *</span>
                                          <select
                                            value={odooSettings.authMethod}
                                            onChange={(e) => setOdooSetting(businessCompany.id, 'authMethod', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="PASSWORD">Username/Password</option>
                                            <option value="API_KEY">API Key</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Frequency *</span>
                                          <select
                                            value={odooSettings.syncFrequency}
                                            onChange={(e) => setOdooSetting(businessCompany.id, 'syncFrequency', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Sync Time (Local)</span>
                                          <select
                                            value={odooSettings.syncTime}
                                            onChange={(e) => setOdooSetting(businessCompany.id, 'syncTime', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            {Array.from({ length: 24 }).map((_, hour) => {
                                              const hh = String(hour).padStart(2, '0');
                                              const value = `${hh}:00`;
                                              return (
                                                <option key={value} value={value}>
                                                  {value}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                                          <span style={{ fontWeight: 600 }}>Incremental Sync *</span>
                                          <select
                                            value={odooSettings.incrementalSync}
                                            onChange={(e) => setOdooSetting(businessCompany.id, 'incrementalSync', e.target.value)}
                                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white' }}
                                          >
                                            <option value="">Select</option>
                                            <option value="YES">Yes</option>
                                            <option value="NO">No</option>
                                          </select>
                                        </label>
                                      </div>
                                    </div>

                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Accounting Programs</h4>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => addOdooProgram(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            + Add
                                          </button>
                                          <button
                                            onClick={() => saveOdooSettings(businessCompany.id)}
                                            style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                                        Programs called by the integration
                                      </div>
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Module</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569' }}>Model / Endpoint</th>
                                              <th style={{ textAlign: 'left', padding: '6px', color: '#475569', width: '70px' }}>Action</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {odooPrograms.map((row, index) => (
                                              <tr key={`${businessCompany.id}-odoo-program-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.module}
                                                    onChange={(e) => updateOdooProgram(businessCompany.id, index, 'module', e.target.value)}
                                                    placeholder="Module"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <input
                                                    type="text"
                                                    value={row.modelOrEndpoint}
                                                    onChange={(e) => updateOdooProgram(businessCompany.id, index, 'modelOrEndpoint', e.target.value)}
                                                    placeholder="Model or Endpoint"
                                                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px', fontSize: '12px', background: 'white' }}
                                                  />
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                  <button
                                                    onClick={() => deleteOdooProgram(businessCompany.id, index)}
                                                    style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                                  >
                                                    Delete
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))', gap: '10px' }}>
                                  {/* Subscription Pricing */}
                                  <div style={{ padding: '4px 12px 12px 12px', background: '#fef3c7', borderRadius: '6px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Subscription Pricing</h4>
                                    {editing ? (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                        <div>
                                          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Monthly ($)</label>
                                          <input
                                            type="number"
                                            value={editing.monthly}
                                            onChange={(e) => setEditingPricing({
                                              ...editingPricing,
                                              [businessCompany.id]: { ...editing, monthly: parseFloat(e.target.value) || 0 }
                                            })}
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                          />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Quarterly ($)</label>
                                          <input
                                            type="number"
                                            value={editing.quarterly}
                                            onChange={(e) => setEditingPricing({
                                              ...editingPricing,
                                              [businessCompany.id]: { ...editing, quarterly: parseFloat(e.target.value) || 0 }
                                            })}
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                          />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Annual ($)</label>
                                          <input
                                            type="number"
                                            value={editing.annual}
                                            onChange={(e) => setEditingPricing({
                                              ...editingPricing,
                                              [businessCompany.id]: { ...editing, annual: parseFloat(e.target.value) || 0 }
                                            })}
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                          />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Setup Fee ($)</label>
                                          <input
                                            type="number"
                                            value={editing.setupFee ?? 0}
                                            onChange={(e) => setEditingPricing({
                                              ...editingPricing,
                                              [businessCompany.id]: { ...editing, setupFee: parseFloat(e.target.value) || 0 }
                                            })}
                                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                          />
                                        </div>
                                        <button
                                          onClick={() => {
                                            if (businessCompany) {
                                              if (!updateCompanyPricing) {
                                                alert('Update pricing function is not configured.');
                                                return;
                                              }
                                              updateCompanyPricing(businessCompany.id, editing);
                                            }
                                          }}
                                          style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingPricing((prev) => {
                                              const newState = { ...prev };
                                              delete newState[businessCompany.id];
                                              return newState;
                                            });
                                          }}
                                          style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div>
                                        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.6', marginBottom: '8px' }}>
                                          <div><strong>Monthly:</strong> ${businessCompany?.subscriptionMonthlyPrice?.toFixed(2) ?? '0.00'}</div>
                                          <div><strong>Quarterly:</strong> ${businessCompany?.subscriptionQuarterlyPrice?.toFixed(2) ?? '0.00'}</div>
                                          <div><strong>Annual:</strong> ${businessCompany?.subscriptionAnnualPrice?.toFixed(2) ?? '0.00'}</div>
                                          <div><strong>Setup Fee:</strong> ${businessCompany?.subscriptionSetupFee?.toFixed(2) ?? '0.00'}</div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setEditingPricing({
                                              ...editingPricing,
                                              [businessCompany.id]: {
                                                monthly: businessCompany?.subscriptionMonthlyPrice ?? 0,
                                                quarterly: businessCompany?.subscriptionQuarterlyPrice ?? 0,
                                                annual: businessCompany?.subscriptionAnnualPrice ?? 0,
                                                setupFee: businessCompany?.subscriptionSetupFee ?? 0,
                                              }
                                            });
                                          }}
                                          style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                          Edit Pricing
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ padding: '4px 12px 12px 12px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a8a', marginBottom: '8px' }}>DataRoom Pricing</h4>
                                    {editingDataRoomPricingByCompany[businessCompany.id] ? (
                                      <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                            <input
                                              type="number"
                                              value={editingDataRoomPricingByCompany[businessCompany.id].monthly}
                                              onChange={(e) =>
                                                setEditingDataRoomPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    monthly: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                            <input
                                              type="number"
                                              value={editingDataRoomPricingByCompany[businessCompany.id].quarterly}
                                              onChange={(e) =>
                                                setEditingDataRoomPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    quarterly: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                            <input
                                              type="number"
                                              value={editingDataRoomPricingByCompany[businessCompany.id].annual}
                                              onChange={(e) =>
                                                setEditingDataRoomPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    annual: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                          <button
                                            onClick={() => saveDataRoomPricing(businessCompany.id, editingDataRoomPricingByCompany[businessCompany.id])}
                                            disabled={savingDataRoomPricingCompanyId === businessCompany.id}
                                            style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: savingDataRoomPricingCompanyId === businessCompany.id ? 'not-allowed' : 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingDataRoomPricingByCompany((prev) => {
                                                const next = { ...prev };
                                                delete next[businessCompany.id];
                                                return next;
                                              });
                                            }}
                                            style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6', marginBottom: '8px' }}>
                                          <div><strong>Monthly:</strong> ${getDataRoomPricing(businessCompany).monthly.toFixed(2)}</div>
                                          <div><strong>Quarterly:</strong> ${getDataRoomPricing(businessCompany).quarterly.toFixed(2)}</div>
                                          <div><strong>Annual:</strong> ${getDataRoomPricing(businessCompany).annual.toFixed(2)}</div>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>
                                          Status: {getDataRoomEnabledByAdmin(businessCompany) ? 'Enabled' : 'Disabled'} | Subscription: {getDataRoomSubscriptionStatus(businessCompany)}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                          <button
                                            onClick={() => saveDataRoomEnabledByAdmin(businessCompany.id, !getDataRoomEnabledByAdmin(businessCompany))}
                                            disabled={savingDataRoomCompanyId === businessCompany.id}
                                            style={{
                                              padding: '6px 12px',
                                              background: getDataRoomEnabledByAdmin(businessCompany) ? '#dc2626' : '#2563eb',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: savingDataRoomCompanyId === businessCompany.id ? 'not-allowed' : 'pointer',
                                            }}
                                          >
                                            {getDataRoomEnabledByAdmin(businessCompany) ? 'Disable DataRoom' : 'Enable DataRoom'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              const pricing = getDataRoomPricing(businessCompany);
                                              setEditingDataRoomPricingByCompany((prev) => ({
                                                ...prev,
                                                [businessCompany.id]: pricing,
                                              }));
                                            }}
                                            style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Edit Pricing
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div style={{ padding: '4px 12px 12px 12px', background: '#f5f3ff', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>Valuation Pricing</h4>
                                    {editingValuationPricingByCompany[businessCompany.id] ? (
                                      <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Monthly ($)</label>
                                            <input
                                              type="number"
                                              value={editingValuationPricingByCompany[businessCompany.id].monthly}
                                              onChange={(e) =>
                                                setEditingValuationPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    monthly: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Quarterly ($)</label>
                                            <input
                                              type="number"
                                              value={editingValuationPricingByCompany[businessCompany.id].quarterly}
                                              onChange={(e) =>
                                                setEditingValuationPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    quarterly: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                          <div>
                                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Annual ($)</label>
                                            <input
                                              type="number"
                                              value={editingValuationPricingByCompany[businessCompany.id].annual}
                                              onChange={(e) =>
                                                setEditingValuationPricingByCompany((prev) => ({
                                                  ...prev,
                                                  [businessCompany.id]: {
                                                    ...prev[businessCompany.id],
                                                    annual: parseFloat(e.target.value) || 0,
                                                  },
                                                }))
                                              }
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                          <button
                                            onClick={() => saveValuationPricing(businessCompany.id, editingValuationPricingByCompany[businessCompany.id])}
                                            disabled={savingValuationPricingCompanyId === businessCompany.id}
                                            style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: savingValuationPricingCompanyId === businessCompany.id ? 'not-allowed' : 'pointer' }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingValuationPricingByCompany((prev) => {
                                                const next = { ...prev };
                                                delete next[businessCompany.id];
                                                return next;
                                              });
                                            }}
                                            style={{ padding: '6px 12px', background: '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6', marginBottom: '8px' }}>
                                          <div><strong>Monthly:</strong> ${getValuationPricing(businessCompany).monthly.toFixed(2)}</div>
                                          <div><strong>Quarterly:</strong> ${getValuationPricing(businessCompany).quarterly.toFixed(2)}</div>
                                          <div><strong>Annual:</strong> ${getValuationPricing(businessCompany).annual.toFixed(2)}</div>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#475569', marginBottom: '8px' }}>
                                          Status: {getValuationEnabledByAdmin(businessCompany) ? 'Enabled' : 'Disabled'} | Subscription: {getValuationSubscriptionStatus(businessCompany)}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                          <button
                                            onClick={() => saveValuationEnabledByAdmin(businessCompany.id, !getValuationEnabledByAdmin(businessCompany))}
                                            disabled={savingValuationCompanyId === businessCompany.id}
                                            style={{
                                              padding: '6px 12px',
                                              background: getValuationEnabledByAdmin(businessCompany) ? '#dc2626' : '#2563eb',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              fontSize: '12px',
                                              fontWeight: '600',
                                              cursor: savingValuationCompanyId === businessCompany.id ? 'not-allowed' : 'pointer',
                                            }}
                                          >
                                            {getValuationEnabledByAdmin(businessCompany) ? 'Disable Valuation' : 'Enable Valuation'}
                                          </button>
                                          <button
                                            onClick={() => {
                                              const pricing = getValuationPricing(businessCompany);
                                              setEditingValuationPricingByCompany((prev) => ({
                                                ...prev,
                                                [businessCompany.id]: pricing,
                                              }));
                                            }}
                                            style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                                          >
                                            Edit Pricing
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Affiliates Tab */}
              {siteAdminTab === 'affiliates' && (
                <div>
                  {/* Add Affiliate Button */}
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Affiliate Partners ({affiliates.length})
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {affiliates.length > 0 && (
                        <button
                          onClick={() => {
                            if (expandedAffiliateId) {
                              setExpandedAffiliateId(null);
                            } else {
                              // Expand the first one as a sample
                              setExpandedAffiliateId(affiliates[0]?.id || null);
                            }
                          }}
                          style={{
                            padding: '10px 16px',
                            background: '#94a3b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {expandedAffiliateId ? 'Collapse All' : 'Expand All'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (showAddAffiliateForm) {
                            setShowAddAffiliateForm(false);
                            setEditingAffiliate(null);
                          } else {
                            setShowAddAffiliateForm(true);
                            setEditingAffiliate({
                              name: '',
                              contactName: '',
                              contactEmail: '',
                              contactPhone: '',
                              address: '',
                              city: '',
                              state: '',
                              zip: '',
                              website: '',
                              isActive: true
                            });
                          }
                        }}
                        style={{
                          padding: '10px 16px',
                          background: showAddAffiliateForm ? '#94a3b8' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {showAddAffiliateForm ? 'Cancel' : '+ Add Affiliate'}
                      </button>
                    </div>
                  </div>

                  {/* Add/Edit Affiliate Form */}
                  {(showAddAffiliateForm || editingAffiliate) && (
                    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '2px solid #667eea' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                        {editingAffiliate?.id ? 'Edit Affiliate' : 'Add New Affiliate'}
                      </h3>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        {/* Left Column */}
                        <div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Affiliate Name *
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.name || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, name: e.target.value})}
                              placeholder="e.g., ABC Partnership"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Contact Name
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.contactName || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, contactName: e.target.value})}
                              placeholder="Contact person"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                Email
                              </label>
                              <input
                                type="email"
                                value={editingAffiliate?.contactEmail || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, contactEmail: e.target.value})}
                                placeholder="email@example.com"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                Phone
                              </label>
                              <input
                                type="tel"
                                value={editingAffiliate?.contactPhone || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, contactPhone: formatPhoneNumber(e.target.value)})}
                                placeholder="(555) 777-1212"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column */}
                        <div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Street Address
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.address || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, address: e.target.value})}
                              placeholder="123 Main St"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                City
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.city || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, city: e.target.value})}
                                placeholder="City"
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                State
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.state || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, state: e.target.value})}
                                placeholder="ST"
                                maxLength={2}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textTransform: 'uppercase' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                ZIP
                              </label>
                              <input
                                type="text"
                                value={editingAffiliate?.zip || ''}
                                onChange={(e) => setEditingAffiliate({...editingAffiliate, zip: e.target.value})}
                                placeholder="12345"
                                maxLength={10}
                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                              />
                            </div>
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                              Website
                            </label>
                            <input
                              type="text"
                              value={editingAffiliate?.website || ''}
                              onChange={(e) => setEditingAffiliate({...editingAffiliate, website: e.target.value})}
                              placeholder="www.example.com"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editingAffiliate?.isActive !== false}
                            onChange={(e) => setEditingAffiliate({...editingAffiliate, isActive: e.target.checked})}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#475569' }}>
                            Active (can be selected during registration)
                          </span>
                        </label>
                      </div>

                      {/* Affiliate Codes Display */}
                      {editingAffiliate?.id && editingAffiliate?.codes && editingAffiliate.codes.length > 0 && (
                        <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                            Affiliate Codes ({editingAffiliate.codes.length})
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {editingAffiliate.codes.map((code: any) => (
                              <div 
                                key={code.id} 
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  padding: '8px 12px', 
                                  background: code.isActive ? '#f0fdf4' : '#fef2f2', 
                                  border: `1px solid ${code.isActive ? '#86efac' : '#fecaca'}`,
                                  borderRadius: '6px',
                                  fontSize: '12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                  <span style={{ fontWeight: '600', color: '#1e293b', fontFamily: 'monospace' }}>
                                    {code.code}
                                  </span>
                                  {code.description && (
                                    <span style={{ color: '#64748b' }}>
                                      {code.description}
                                    </span>
                                  )}
                                  <span style={{ 
                                    padding: '2px 6px', 
                                    background: code.isActive ? '#dcfce7' : '#fee2e2',
                                    color: code.isActive ? '#15803d' : '#991b1b',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: '600'
                                  }}>
                                    {code.isActive ? 'ACTIVE' : 'INACTIVE'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', color: '#475569', fontSize: '11px' }}>
                                  <span>${code.monthlyPrice}/mo</span>
                                  <span>|</span>
                                  <span>${code.quarterlyPrice}/qtr</span>
                                  <span>|</span>
                                  <span>${code.annualPrice}/yr</span>
                                  <span>|</span>
                                  <span>${code.setupFee ?? 0}/setup</span>
                                  {code.maxUses && (
                                    <>
                                      <span>|</span>
                                      <span>{code.currentUses || 0}/{code.maxUses} uses</span>
                                    </>
                                  )}
                                  {code.expiresAt && (
                                    <>
                                      <span>|</span>
                                      <span>Expires: {new Date(code.expiresAt).toLocaleDateString()}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', marginBottom: 0 }}>
                            ℹ️ To add or edit codes, use the "See Codes & Pricing" section below after saving this affiliate.
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                        <button
                          onClick={() => {
                            setEditingAffiliate(null);
                            setShowAddAffiliateForm(false);
                          }}
                          style={{ padding: '6px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!editingAffiliate?.name) {
                              alert('Please enter an affiliate name');
                              return;
                            }

                            try {
                              const method = editingAffiliate.id ? 'PUT' : 'POST';
                              const response = await fetch('/api/affiliates', {
                                method,
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(editingAffiliate)
                              });

                              const data = await response.json();
                              if (!response.ok) {
                                alert(data.error || 'Failed to save affiliate');
                                return;
                              }

                              // Reload affiliates
                              const affiliatesResponse = await fetch('/api/affiliates');
                              const affiliatesData = await affiliatesResponse.json();
                              if (affiliatesData.affiliates) {
                                setAffiliates(affiliatesData.affiliates);
                              }

                              setEditingAffiliate(null);
                              setShowAddAffiliateForm(false);
                              alert(editingAffiliate.id ? 'Affiliate updated successfully!' : 'Affiliate created successfully!');
                            } catch (error) {
                              console.error('Error saving affiliate:', error);
                              alert('Failed to save affiliate');
                            }
                          }}
                          style={{ padding: '6px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          {editingAffiliate?.id ? 'Update Affiliate' : 'Create Affiliate'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Affiliates List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {affiliates.length === 0 ? (
                      <div style={{ background: 'white', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
                        <p style={{ fontSize: '16px', marginBottom: '8px' }}>No affiliates yet</p>
                        <p style={{ fontSize: '14px' }}>Click "Add Affiliate" to create your first affiliate partner</p>
                      </div>
                    ) : (
                      affiliates.map((affiliate: any) => (
                        <div key={affiliate.id} style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                  {affiliate.name}
                                </h3>
                                {!affiliate.isActive && (
                                  <span style={{ padding: '4px 8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                    INACTIVE
                                  </span>
                                )}
                                <span style={{ padding: '4px 8px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                  {affiliate._count.companies} Business{affiliate._count.companies !== 1 ? 'es' : ''}
                                </span>
                                <span style={{ padding: '4px 8px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                                  {affiliate.codes?.length || 0} Code{affiliate.codes?.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              
                              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                {affiliate.contactName && <div>Contact: {affiliate.contactName}</div>}
                                {affiliate.contactEmail && <div>Email: {affiliate.contactEmail}</div>}
                                {affiliate.contactPhone && <div>Phone: {affiliate.contactPhone}</div>}
                              </div>

                              <button
                                onClick={() => setExpandedAffiliateId(expandedAffiliateId === affiliate.id ? null : affiliate.id)}
                                style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                {expandedAffiliateId === affiliate.id ? 'Hide Details' : 'See Codes & Pricing'}
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                  setEditingAffiliate(affiliate);
                                  setShowAddAffiliateForm(false);
                                  setExpandedAffiliateId(null); // Close any expanded details
                                  // Scroll to top to show the edit form
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{ padding: '8px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete affiliate "${affiliate.name}"? This cannot be undone.`)) return;
                                  
                                  try {
                                    const response = await fetch(`/api/affiliates?id=${affiliate.id}`, {
                                      method: 'DELETE'
                                    });
                                    
                                    const data = await response.json();
                                    if (!response.ok) {
                                      alert(data.error || 'Failed to delete affiliate');
                                      return;
                                    }

                                    // Reload affiliates
                                    const affiliatesResponse = await fetch('/api/affiliates');
                                    const affiliatesData = await affiliatesResponse.json();
                                    if (affiliatesData.affiliates) {
                                      setAffiliates(affiliatesData.affiliates);
                                    }
                                    alert('Affiliate deleted successfully!');
                                  } catch (error) {
                                    console.error('Error deleting affiliate:', error);
                                    alert('Failed to delete affiliate');
                                  }
                                }}
                                style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {expandedAffiliateId === affiliate.id && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
                              {/* Affiliate Codes Management */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Affiliate Codes</h4>
                                </div>

                                {/* Add New Code Form */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                  {/* Row 1: Code Info */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 80px 120px', gap: '8px', marginBottom: '8px' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Code *
                                      </label>
                                      <input
                                        type="text"
                                        value={newAffiliateCode.code}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, code: e.target.value.toUpperCase()})}
                                        placeholder="PROMO2025"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Description
                                      </label>
                                      <input
                                        type="text"
                                        value={newAffiliateCode.description}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, description: e.target.value})}
                                        placeholder="Optional"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Max Uses
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.maxUses}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, maxUses: e.target.value})}
                                        placeholder="8"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Expires
                                      </label>
                                      <input
                                        type="date"
                                        value={newAffiliateCode.expiresAt}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, expiresAt: e.target.value})}
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Row 2: Pricing & Button */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Monthly ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.monthlyPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, monthlyPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Quarterly ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.quarterlyPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, quarterlyPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Annual ($) *
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.annualPrice || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, annualPrice: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                        Setup Fee ($)
                                      </label>
                                      <input
                                        type="number"
                                        value={newAffiliateCode.setupFee || ''}
                                        onChange={(e) => setNewAffiliateCode({...newAffiliateCode, setupFee: e.target.value})}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                      />
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (!newAffiliateCode.code) {
                                          alert('Please enter a code');
                                          return;
                                        }
                                        // Allow 0 as valid pricing
                                        if (newAffiliateCode.monthlyPrice === null || newAffiliateCode.monthlyPrice === undefined || newAffiliateCode.monthlyPrice === '' ||
                                            newAffiliateCode.quarterlyPrice === null || newAffiliateCode.quarterlyPrice === undefined || newAffiliateCode.quarterlyPrice === '' ||
                                            newAffiliateCode.annualPrice === null || newAffiliateCode.annualPrice === undefined || newAffiliateCode.annualPrice === '') {
                                          console.log('Validation failed - missing pricing:', {
                                            monthly: newAffiliateCode.monthlyPrice,
                                            quarterly: newAffiliateCode.quarterlyPrice,
                                            annual: newAffiliateCode.annualPrice
                                          });
                                          alert('Please enter all pricing fields');
                                          return;
                                        }

                                        try {
                                          const response = await fetch('/api/affiliates/codes', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              affiliateId: affiliate.id,
                                              code: newAffiliateCode.code,
                                              description: newAffiliateCode.description || null,
                                              monthlyPrice: parseFloat(newAffiliateCode.monthlyPrice),
                                              quarterlyPrice: parseFloat(newAffiliateCode.quarterlyPrice),
                                              annualPrice: parseFloat(newAffiliateCode.annualPrice),
                                              setupFee: newAffiliateCode.setupFee === '' ? 0 : parseFloat(newAffiliateCode.setupFee),
                                              maxUses: newAffiliateCode.maxUses ? parseInt(newAffiliateCode.maxUses) : null,
                                              expiresAt: newAffiliateCode.expiresAt || null
                                            })
                                          });

                                          const data = await response.json();
                                          if (!response.ok) {
                                            alert(data.error || 'Failed to create code');
                                            return;
                                          }

                                          // Reload affiliates
                                          const affiliatesResponse = await fetch('/api/affiliates');
                                          const affiliatesData = await affiliatesResponse.json();
                                          if (affiliatesData.affiliates) {
                                            setAffiliates(affiliatesData.affiliates);
                                          }

                                          setNewAffiliateCode({code: '', description: '', maxUses: '', expiresAt: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', setupFee: ''});
                                          alert('Code created successfully!');
                                        } catch (error) {
                                          console.error('Error creating code:', error);
                                          alert('Failed to create code');
                                        }
                                      }}
                                      style={{ padding: '6px 12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >
                                      + Add Code
                                    </button>
                                  </div>
                                </div>

                                {/* Codes List */}
                                {affiliate.codes && affiliate.codes.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {affiliate.codes.map((code: any) => (
                                      <div key={code.id}>
                                        {editingAffiliateCode?.id === code.id ? (
                                          // Edit Mode
                                          <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '6px', padding: '12px' }}>
                                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>
                                              Editing Code: {code.code}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Description
                                                </label>
                                                <input
                                                  type="text"
                                                  value={editingAffiliateCode.description || ''}
                                                  onChange={(e) => setEditingAffiliateCode({...editingAffiliateCode, description: e.target.value})}
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Max Uses
                                                </label>
                                                <input
                                                  type="number"
                                                  value={editingAffiliateCode.maxUses || ''}
                                                  onChange={(e) => setEditingAffiliateCode({...editingAffiliateCode, maxUses: e.target.value ? parseInt(e.target.value) : null})}
                                                  placeholder="8"
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Expires
                                                </label>
                                                <input
                                                  type="date"
                                                  value={editingAffiliateCode.expiresAt ? new Date(editingAffiliateCode.expiresAt).toISOString().split('T')[0] : ''}
                                                  onChange={(e) => setEditingAffiliateCode({...editingAffiliateCode, expiresAt: e.target.value || null})}
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px', marginTop: '20px' }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={editingAffiliateCode.isActive}
                                                    onChange={(e) => setEditingAffiliateCode({...editingAffiliateCode, isActive: e.target.checked})}
                                                    style={{ width: '14px', height: '14px' }}
                                                  />
                                                  Active
                                                </label>
                                              </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Monthly ($)
                                                </label>
                                                <input
                                                  type="number"
                                                  value={(() => {
                                                    const displayValue = editingAffiliateCode.monthlyPrice === 0 ? '0' : (editingAffiliateCode.monthlyPrice || '');
                                                    console.log('Monthly display value:', { raw: editingAffiliateCode.monthlyPrice, display: displayValue });
                                                    return displayValue;
                                                  })()}
                                                  onChange={(e) => {
                                                    const value = e.target.value;
                                                    const numValue = value === '' ? '' : parseFloat(value);
                                                    console.log('Monthly price input changed:', { value, numValue, isNaN: isNaN(numValue) });
                                                    setEditingAffiliateCode({...editingAffiliateCode, monthlyPrice: numValue});
                                                  }}
                                                  min="0"
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Quarterly ($)
                                                </label>
                                                <input
                                                  type="number"
                                                  value={editingAffiliateCode.quarterlyPrice === 0 ? '0' : (editingAffiliateCode.quarterlyPrice || '')}
                                                  onChange={(e) => {
                                                    const value = e.target.value;
                                                    const numValue = value === '' ? '' : parseFloat(value);
                                                    setEditingAffiliateCode({...editingAffiliateCode, quarterlyPrice: numValue});
                                                  }}
                                                  min="0"
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Annual ($)
                                                </label>
                                                <input
                                                  type="number"
                                                  value={editingAffiliateCode.annualPrice === 0 ? '0' : (editingAffiliateCode.annualPrice || '')}
                                                  onChange={(e) => {
                                                    const value = e.target.value;
                                                    const numValue = value === '' ? '' : parseFloat(value);
                                                    setEditingAffiliateCode({...editingAffiliateCode, annualPrice: numValue});
                                                  }}
                                                  min="0"
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                              <div>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                                                  Setup Fee ($)
                                                </label>
                                                <input
                                                  type="number"
                                                  value={editingAffiliateCode.setupFee === 0 ? '0' : (editingAffiliateCode.setupFee || '')}
                                                  onChange={(e) => {
                                                    const value = e.target.value;
                                                    const numValue = value === '' ? '' : parseFloat(value);
                                                    setEditingAffiliateCode({...editingAffiliateCode, setupFee: numValue});
                                                  }}
                                                  min="0"
                                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                                />
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                              <button
                                                onClick={() => setEditingAffiliateCode(null)}
                                                style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                onClick={async () => {
                                                  console.log('Submitting affiliate code update:', editingAffiliateCode);
                                                  try {
                                                    const response = await fetch('/api/affiliates/codes', {
                                                      method: 'PUT',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify(editingAffiliateCode)
                                                    });

                                                    const data = await response.json();
                                                    console.log('API response:', data);
                                                    if (!response.ok) {
                                                      alert(data.error || 'Failed to update code');
                                                      return;
                                                    }

                                                    // Reload affiliates
                                                    const affiliatesResponse = await fetch('/api/affiliates');
                                                    const affiliatesData = await affiliatesResponse.json();
                                                    if (affiliatesData.affiliates) {
                                                      setAffiliates(affiliatesData.affiliates);
                                                    }

                                                    setEditingAffiliateCode(null);
                                                    alert('Code updated successfully!');
                                                  } catch (error) {
                                                    console.error('Error updating code:', error);
                                                    alert('Failed to update code');
                                                  }
                                                }}
                                                style={{ padding: '6px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                              >
                                                Save Changes
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          // View Mode
                                          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                                                  {code.code}
                                                </span>
                                                {!code.isActive && (
                                                  <span style={{ padding: '2px 6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                                                    INACTIVE
                                                  </span>
                                                )}
                                                {code.expiresAt && new Date(code.expiresAt) < new Date() && (
                                                  <span style={{ padding: '2px 6px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                                                    EXPIRED
                                                  </span>
                                                )}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {code.description && <span>{code.description} - </span>}
                                                <span>Uses: {code.currentUses}{code.maxUses ? `/${code.maxUses}` : ''}</span>
                                                {code.expiresAt && <span> - Expires: {new Date(code.expiresAt).toLocaleDateString()}</span>}
                                              </div>
                                              <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '4px', fontWeight: '600' }}>
                                                Pricing: ${code.monthlyPrice}/mo | ${code.quarterlyPrice}/qtr | ${code.annualPrice}/yr | ${code.setupFee ?? 0} setup
                                              </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                              <button
                                                onClick={() => setEditingAffiliateCode(code)}
                                                style={{ padding: '4px 8px', background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                              >
                                                Edit
                                              </button>
                                              <button
                                                onClick={async () => {
                                                  if (!confirm(`Delete code "${code.code}"?`)) return;
                                                  
                                                  try {
                                                    const response = await fetch(`/api/affiliates/codes?id=${code.id}`, {
                                                      method: 'DELETE'
                                                    });
                                                    
                                                    if (!response.ok) {
                                                      const data = await response.json();
                                                      alert(data.error || 'Failed to delete code');
                                                      return;
                                                    }

                                                    // Reload affiliates
                                                    const affiliatesResponse = await fetch('/api/affiliates');
                                                    const affiliatesData = await affiliatesResponse.json();
                                                    if (affiliatesData.affiliates) {
                                                      setAffiliates(affiliatesData.affiliates);
                                                    }
                                                  } catch (error) {
                                                    console.error('Error deleting code:', error);
                                                    alert('Failed to delete code');
                                                  }
                                                }}
                                                style={{ padding: '4px 8px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}
                                              >
                                                Delete
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>
                                    No codes yet. Add a code above.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Default Pricing Tab */}
              {siteAdminTab === 'default-pricing' && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Default Pricing</h2>
                  <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
                    Set default subscription and DataRoom pricing for new businesses and consultants. You can still customize pricing for individual companies.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {/* Business Default Pricing */}
                    <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px', marginBottom: '0' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏢 Default Business Pricing
                      </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Monthly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessMonthlyPrice}
                          onChange={(e) => setDefaultBusinessMonthlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="195.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed monthly</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Quarterly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessQuarterlyPrice}
                          onChange={(e) => setDefaultBusinessQuarterlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="500.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed every 3 months</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Annual Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessAnnualPrice}
                          onChange={(e) => setDefaultBusinessAnnualPrice(parseFloat(e.target.value) || 0)}
                          placeholder="1750.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: '500' }}>Save 15% annually</div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Setup Fee ($)
                        </label>
                        <input
                          type="number"
                          value={defaultBusinessSetupFee}
                          onChange={(e) => setDefaultBusinessSetupFee(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>One-time fee due at onboarding</div>
                      </div>
                    </div>

                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                businessMonthlyPrice: defaultBusinessMonthlyPrice,
                                businessQuarterlyPrice: defaultBusinessQuarterlyPrice,
                                businessAnnualPrice: defaultBusinessAnnualPrice,
                                businessSetupFee: defaultBusinessSetupFee,
                                consultantMonthlyPrice: defaultConsultantMonthlyPrice,
                                consultantQuarterlyPrice: defaultConsultantQuarterlyPrice,
                                consultantAnnualPrice: defaultConsultantAnnualPrice,
                                consultantSetupFee: defaultConsultantSetupFee,
                                dataRoomBusinessMonthlyPrice: defaultDataRoomBusinessMonthlyPrice,
                                dataRoomBusinessQuarterlyPrice: defaultDataRoomBusinessQuarterlyPrice,
                                dataRoomBusinessAnnualPrice: defaultDataRoomBusinessAnnualPrice,
                                dataRoomConsultantMonthlyPrice: defaultDataRoomConsultantMonthlyPrice,
                                dataRoomConsultantQuarterlyPrice: defaultDataRoomConsultantQuarterlyPrice,
                                dataRoomConsultantAnnualPrice: defaultDataRoomConsultantAnnualPrice,
                              })
                            });
                            
                            if (response.ok) {
                              alert(`Business default pricing saved:\nMonthly: $${defaultBusinessMonthlyPrice.toFixed(2)}\nQuarterly: $${defaultBusinessQuarterlyPrice.toFixed(2)}\nAnnual: $${defaultBusinessAnnualPrice.toFixed(2)}\n\nThese defaults will be used for all new businesses.`);
                            } else {
                              const data = await response.json().catch(() => null);
                              alert(`❌ Failed to save pricing.\n\n${data?.error || 'Unknown error'}${data?.details ? `\n${data.details}` : ''}`);
                            }
                          } catch (error) {
                            console.error('Error saving pricing:', error);
                            alert('❌ Error saving pricing. Please try again.');
                          }
                        }}
                        style={{
                          padding: '12px 24px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
                        }}
                      >
                        💾 Save Business Defaults
                      </button>
                    </div>

                    {/* Consultant Default Pricing */}
                    <div style={{ background: '#f0fdf4', border: '2px solid #10b981', borderRadius: '12px', padding: '24px', marginBottom: '0' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#065f46', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        👤 Default Consultant Pricing
                      </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Monthly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantMonthlyPrice}
                          onChange={(e) => setDefaultConsultantMonthlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="195.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed monthly</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Quarterly Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantQuarterlyPrice}
                          onChange={(e) => setDefaultConsultantQuarterlyPrice(parseFloat(e.target.value) || 0)}
                          placeholder="500.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Billed every 3 months</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Annual Price ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantAnnualPrice}
                          onChange={(e) => setDefaultConsultantAnnualPrice(parseFloat(e.target.value) || 0)}
                          placeholder="1750.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: '500' }}>Save 15% annually</div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Setup Fee ($)
                        </label>
                        <input
                          type="number"
                          value={defaultConsultantSetupFee}
                          onChange={(e) => setDefaultConsultantSetupFee(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          step="0.01"
                          style={{ width: '92%', padding: '9.5px 11.5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                        />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>One-time fee due at onboarding</div>
                      </div>
                    </div>

                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                businessMonthlyPrice: defaultBusinessMonthlyPrice,
                                businessQuarterlyPrice: defaultBusinessQuarterlyPrice,
                                businessAnnualPrice: defaultBusinessAnnualPrice,
                                businessSetupFee: defaultBusinessSetupFee,
                                consultantMonthlyPrice: defaultConsultantMonthlyPrice,
                                consultantQuarterlyPrice: defaultConsultantQuarterlyPrice,
                                consultantAnnualPrice: defaultConsultantAnnualPrice,
                                consultantSetupFee: defaultConsultantSetupFee,
                                dataRoomBusinessMonthlyPrice: defaultDataRoomBusinessMonthlyPrice,
                                dataRoomBusinessQuarterlyPrice: defaultDataRoomBusinessQuarterlyPrice,
                                dataRoomBusinessAnnualPrice: defaultDataRoomBusinessAnnualPrice,
                                dataRoomConsultantMonthlyPrice: defaultDataRoomConsultantMonthlyPrice,
                                dataRoomConsultantQuarterlyPrice: defaultDataRoomConsultantQuarterlyPrice,
                                dataRoomConsultantAnnualPrice: defaultDataRoomConsultantAnnualPrice,
                              })
                            });
                            
                            if (response.ok) {
                              alert(`Consultant default pricing saved:\nMonthly: $${defaultConsultantMonthlyPrice.toFixed(2)}\nQuarterly: $${defaultConsultantQuarterlyPrice.toFixed(2)}\nAnnual: $${defaultConsultantAnnualPrice.toFixed(2)}\n\nThese defaults will be used for all new consultants.`);
                            } else {
                              const data = await response.json().catch(() => null);
                              alert(`❌ Failed to save pricing.\n\n${data?.error || 'Unknown error'}${data?.details ? `\n${data.details}` : ''}`);
                            }
                          } catch (error) {
                            console.error('Error saving pricing:', error);
                            alert('❌ Error saving pricing. Please try again.');
                          }
                        }}
                        style={{
                          padding: '12px 24px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        💾 Save Consultant Defaults
                      </button>
                    </div>
                  </div>

                  <div style={{ background: '#eef2ff', border: '2px solid #6366f1', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#3730a3', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🗂️ Default DataRoom Pricing
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))', gap: '16px' }}>
                      <div style={{ background: 'white', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '10px' }}>Business DataRoom Defaults</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Monthly ($)</label>
                            <input type="number" value={defaultDataRoomBusinessMonthlyPrice} onChange={(e) => setDefaultDataRoomBusinessMonthlyPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Quarterly ($)</label>
                            <input type="number" value={defaultDataRoomBusinessQuarterlyPrice} onChange={(e) => setDefaultDataRoomBusinessQuarterlyPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Annual ($)</label>
                            <input type="number" value={defaultDataRoomBusinessAnnualPrice} onChange={(e) => setDefaultDataRoomBusinessAnnualPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'white', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '10px' }}>Consultant DataRoom Defaults</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Monthly ($)</label>
                            <input type="number" value={defaultDataRoomConsultantMonthlyPrice} onChange={(e) => setDefaultDataRoomConsultantMonthlyPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Quarterly ($)</label>
                            <input type="number" value={defaultDataRoomConsultantQuarterlyPrice} onChange={(e) => setDefaultDataRoomConsultantQuarterlyPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Annual ($)</label>
                            <input type="number" value={defaultDataRoomConsultantAnnualPrice} onChange={(e) => setDefaultDataRoomConsultantAnnualPrice(parseFloat(e.target.value) || 0)} step="0.01" style={{ width: '92%', padding: '7.5px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '14px' }}>
                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/settings', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                businessMonthlyPrice: defaultBusinessMonthlyPrice,
                                businessQuarterlyPrice: defaultBusinessQuarterlyPrice,
                                businessAnnualPrice: defaultBusinessAnnualPrice,
                                businessSetupFee: defaultBusinessSetupFee,
                                consultantMonthlyPrice: defaultConsultantMonthlyPrice,
                                consultantQuarterlyPrice: defaultConsultantQuarterlyPrice,
                                consultantAnnualPrice: defaultConsultantAnnualPrice,
                                consultantSetupFee: defaultConsultantSetupFee,
                                dataRoomBusinessMonthlyPrice: defaultDataRoomBusinessMonthlyPrice,
                                dataRoomBusinessQuarterlyPrice: defaultDataRoomBusinessQuarterlyPrice,
                                dataRoomBusinessAnnualPrice: defaultDataRoomBusinessAnnualPrice,
                                dataRoomConsultantMonthlyPrice: defaultDataRoomConsultantMonthlyPrice,
                                dataRoomConsultantQuarterlyPrice: defaultDataRoomConsultantQuarterlyPrice,
                                dataRoomConsultantAnnualPrice: defaultDataRoomConsultantAnnualPrice,
                              })
                            });
                            if (response.ok) {
                              alert(`DataRoom default pricing saved:\nBusiness - Monthly: $${defaultDataRoomBusinessMonthlyPrice.toFixed(2)}, Quarterly: $${defaultDataRoomBusinessQuarterlyPrice.toFixed(2)}, Annual: $${defaultDataRoomBusinessAnnualPrice.toFixed(2)}\nConsultant - Monthly: $${defaultDataRoomConsultantMonthlyPrice.toFixed(2)}, Quarterly: $${defaultDataRoomConsultantQuarterlyPrice.toFixed(2)}, Annual: $${defaultDataRoomConsultantAnnualPrice.toFixed(2)}`);
                            } else {
                              const data = await response.json().catch(() => null);
                              alert(`Failed to save DataRoom defaults.\n\n${data?.error || 'Unknown error'}${data?.details ? `\n${data.details}` : ''}`);
                            }
                          } catch (error) {
                            console.error('Error saving DataRoom default pricing:', error);
                            alert('Error saving DataRoom default pricing. Please try again.');
                          }
                        }}
                        style={{ padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        💾 Save DataRoom Defaults
                      </button>
                    </div>
                  </div>

                  <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💡 How It Works
                    </h4>
                    <ul style={{ fontSize: '13px', color: '#78350f', marginLeft: '20px', marginBottom: '0' }}>
                      <li style={{ marginBottom: '6px' }}>Business defaults apply when creating companies in the <strong>Businesses</strong> tab</li>
                      <li style={{ marginBottom: '6px' }}>Consultant defaults apply when creating companies in the <strong>Consultants</strong> tab</li>
                      <li style={{ marginBottom: '6px' }}>You can override pricing for any individual company at any time</li>
                      <li>Existing company pricing will not be affected by changes to defaults</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Site Administrators Tab */}
              {siteAdminTab === 'siteadmins' && (
              <>
              {/* Add Site Admin Form */}
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddSiteAdminForm ? '12px' : '0' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Add New Site Administrator</h2>
                  <button
                    onClick={() => setShowAddSiteAdminForm(!showAddSiteAdminForm)}
                    style={{ 
                      padding: '4px 12px', 
                      background: showAddSiteAdminForm ? '#f1f5f9' : '#667eea', 
                      color: showAddSiteAdminForm ? '#475569' : 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      cursor: 'pointer' 
                    }}
                  >
                    {showAddSiteAdminForm ? '▲' : '▼'}
                  </button>
                </div>
                {showAddSiteAdminForm && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="First Name *"
                          value={newSiteAdminFirstName}
                          onChange={(e) => setNewSiteAdminFirstName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="text"
                          placeholder="Last Name *"
                          value={newSiteAdminLastName}
                          onChange={(e) => setNewSiteAdminLastName(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <input
                          type="email"
                          placeholder="Email *"
                          value={newSiteAdminEmail}
                          onChange={(e) => setNewSiteAdminEmail(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                        />
                        <div>
                          <PasswordInput
                            placeholder="Password *"
                            value={newSiteAdminPassword}
                            onChange={setNewSiteAdminPassword}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                          />
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' }}>
                            Must be 8+ characters with uppercase, lowercase, number, and special character (!@#$%^&*)
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!newSiteAdminFirstName || !newSiteAdminLastName || !newSiteAdminEmail || !newSiteAdminPassword) {
                          alert('Please fill in all required fields');
                          return;
                        }
                        
                        setIsLoading(true);
                        try {
                          const response = await fetch('/api/siteadmins', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              firstName: newSiteAdminFirstName,
                              lastName: newSiteAdminLastName,
                              email: newSiteAdminEmail,
                              password: newSiteAdminPassword,
                            }),
                          });

                          if (response.ok) {
                            const newAdmin = await response.json();
                            setSiteAdmins([...siteAdmins, newAdmin]);
                            setNewSiteAdminFirstName('');
                            setNewSiteAdminLastName('');
                            setNewSiteAdminEmail('');
                            setNewSiteAdminPassword('');
                            setShowAddSiteAdminForm(false);
                            alert('Site administrator added successfully!');
                          } else {
                            const error = await response.json();
                            if (error.error && error.error.includes('Password does not meet requirements')) {
                              alert('❌ Password does not meet requirements:\n\n• At least 8 characters\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (!@#$%^&*)\n\nPlease create a stronger password.');
                            } else {
                              alert(`❌ Failed to add site administrator: ${error.error || 'Unknown error'}`);
                            }
                          }
                        } catch (error) {
                          console.error('Error adding site administrator:', error);
                          alert('❌ Error adding site administrator. Please try again.');
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      style={{ 
                        padding: '8px 20px', 
                        background: isLoading ? '#94a3b8' : '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        fontWeight: '600', 
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.6 : 1
                      }}
                    >
                      {isLoading ? 'Adding...' : 'Add Site Administrator'}
                    </button>
                  </>
                )}
              </div>

              {/* Site Admins List */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Site Administrators ({siteAdmins.length})</h2>
                
                {siteAdmins.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                    <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No site administrators yet</p>
                    <p style={{ fontSize: '14px' }}>Add a new site administrator to get started</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {siteAdmins.map((admin: any) => (
                      <div
                        key={admin.id}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                            {admin.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {admin.email}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete site administrator "${admin.name}"?`)) {
                                return;
                              }
                              
                              try {
                                const response = await fetch(`/api/siteadmins?id=${admin.id}`, {
                                  method: 'DELETE',
                                });

                                if (response.ok) {
                                  setSiteAdmins(siteAdmins.filter((a: any) => a.id !== admin.id));
                                  alert('Site administrator deleted successfully!');
                                } else {
                                  alert('❌ Failed to delete site administrator');
                                }
                              } catch (error) {
                                console.error('Error deleting site administrator:', error);
                                alert('❌ Error deleting site administrator');
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}

      {/* Billing & Revenue Tab */}
      {siteAdminTab === 'billing' && (
        <BillingDashboard />
      )}
    </div>
  );
}
