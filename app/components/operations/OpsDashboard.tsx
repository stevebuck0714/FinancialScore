'use client';

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { getModuleLabel, mapModuleToDataType, type OpsDataType } from '@/lib/operations/module-registry';
import { formatDateSafeUtc, parseDateSafeUtc, toLocalInputDate } from '@/app/utils/date';

interface OpsDashboardProps {
  selectedCompanyId: string;
  companyName: string;
  industrySectorCategory?: string | null;
  activeModules?: string[];
  moduleTitlesByType?: Partial<Record<OpsDataType, string>>;
  operationalHubSections?: Record<string, any>;
}

const COLORS = ['#0f2b4b', '#1f4e79', '#2e6f9e', '#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const AGING_COLORS = ['#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const CUSTOMER_CHART_COLOR = COLORS[2];
const CASH_CHART_COLOR = COLORS[4];

export default function OpsDashboard({
  selectedCompanyId,
  companyName,
  industrySectorCategory,
  activeModules,
  moduleTitlesByType,
  operationalHubSections,
}: OpsDashboardProps) {
  // Individual frequency state for each widget
  const [customerFreq, setCustomerFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [arFreq, setArFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [apFreq, setApFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [productFreq, setProductFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [inventoryFreq, setInventoryFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [cashFreq, setCashFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [ebitdaFreq, setEbitdaFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [activeRealEstateExecutiveTab, setActiveRealEstateExecutiveTab] = useState<'executive' | 'regional' | 'division' | 'office'>('executive');
  const [selectedResidentialFunnelRegion, setSelectedResidentialFunnelRegion] = useState('__ALL__');
  const [selectedRegionalDivisionReportRegion, setSelectedRegionalDivisionReportRegion] = useState('Northwest');
  const [selectedRegionalFinancialTrendRegion, setSelectedRegionalFinancialTrendRegion] = useState('Northwest');
  const [selectedDivisionByRegionDivision, setSelectedDivisionByRegionDivision] = useState('Residential Real Estate');
  const [firmTableSort, setFirmTableSort] = useState<Record<string, { key: string; dir: 'asc' | 'desc' }>>({});

  // Data state for each widget
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [cashData, setCashData] = useState<any>(null);
  const [ebitdaData, setEbitdaData] = useState<any>(null);

  // Operational goals state
  const [operationalGoals, setOperationalGoals] = useState<any>({});
  
  // Loading states
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingAr, setLoadingAr] = useState(false);
  const [loadingAp, setLoadingAp] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingCash, setLoadingCash] = useState(false);
  const [loadingEbitda, setLoadingEbitda] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);

  // Default window for the daily charts: show the most recent 90
  // *weekday* observations. We over-fetch calendar days so that
  // (a) we tolerate sync lag (data load is often 1-3 days behind today)
  // and (b) we still have ≥90 weekdays after dropping Sat/Sun.
  // 90 weekdays ≈ 126 calendar days; 150 gives ~3 weeks of slack.
  const DAILY_WEEKDAY_WINDOW = 90;
  const DAILY_FETCH_CALENDAR_DAYS = 150;

  // Helper to get date range based on frequency
  const getDateRange = (frequency: string) => {
    const end = new Date();
    const start = new Date();

    if (frequency === 'daily') {
      start.setDate(start.getDate() - DAILY_FETCH_CALENDAR_DAYS);
    } else if (frequency === 'weekly') {
      start.setDate(start.getDate() - (16 * 7));
    } else {
      start.setMonth(start.getMonth() - 12);
    }

    return {
      startDate: toLocalInputDate(start),
      endDate: toLocalInputDate(end)
    };
  };

  // Trim a daily record stream to the last N weekday observations
  // ending at the most recent snapshot in the dataset (NOT today).
  // Weekend rows (Sat/Sun) are dropped before slicing so the chart
  // renders gap-free Mon-Fri only. Non-daily frequencies pass through.
  const trimDailyToWeekdayWindow = <T extends { snapshotDate: string }>(
    records: T[] | undefined | null,
    frequency: string,
    windowDays: number = DAILY_WEEKDAY_WINDOW,
  ): T[] => {
    if (!records || records.length === 0) return [];
    if (frequency !== 'daily') return records;
    const annotated = records
      .map((rec) => ({ rec, parsed: parseDateSafeUtc(rec.snapshotDate) }))
      .filter((entry): entry is { rec: T; parsed: Date } => entry.parsed !== null)
      .filter(({ parsed }) => {
        const dow = parsed.getUTCDay();
        return dow !== 0 && dow !== 6;
      })
      .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());
    return annotated.slice(-windowDays).map(({ rec }) => rec);
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date based on frequency
  const formatDate = (dateString: string, frequency: string) => {
    const date = parseDateSafeUtc(dateString);
    if (!date) return 'N/A';
    if (frequency === 'daily') {
      return formatDateSafeUtc(date, { month: 'short', day: 'numeric' });
    } else if (frequency === 'weekly') {
      return formatDateSafeUtc(date, { month: 'short', day: 'numeric' });
    } else {
      return formatDateSafeUtc(date, { year: 'numeric', month: 'short' });
    }
  };

  const normalizeWidgetOrder = (currentOrder: string[] | undefined | null, availableIds: string[] | undefined | null) => {
    const safeCurrentOrder = Array.isArray(currentOrder) ? currentOrder : [];
    const safeAvailableIds = Array.isArray(availableIds) ? availableIds : [];
    const filtered = safeCurrentOrder.filter((id) => safeAvailableIds.includes(id));
    const missing = safeAvailableIds.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  };

  // Load data functions
  const loadCustomerData = async () => {
    setLoadingCustomer(true);
    try {
      const { startDate, endDate } = getDateRange(customerFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'customers',
        frequency: customerFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setCustomerData(data);
    } catch (error) {
      console.error('Error loading customer data:', error);
    } finally {
      setLoadingCustomer(false);
    }
  };

  const loadArData = async () => {
    setLoadingAr(true);
    try {
      const { startDate, endDate } = getDateRange(arFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'ar-aging',
        frequency: arFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setArData(data);
    } catch (error) {
      console.error('Error loading AR data:', error);
    } finally {
      setLoadingAr(false);
    }
  };

  const loadApData = async () => {
    setLoadingAp(true);
    try {
      const { startDate, endDate } = getDateRange(apFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'ap-aging',
        frequency: apFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setApData(data);
    } catch (error) {
      console.error('Error loading AP data:', error);
    } finally {
      setLoadingAp(false);
    }
  };

  const loadProductData = async () => {
    setLoadingProduct(true);
    try {
      const { startDate, endDate } = getDateRange(productFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'products',
        frequency: productFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setProductData(data);
    } catch (error) {
      console.error('Error loading product data:', error);
    } finally {
      setLoadingProduct(false);
    }
  };

  const loadInventoryData = async () => {
    setLoadingInventory(true);
    try {
      const { startDate, endDate } = getDateRange(inventoryFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'inventory',
        frequency: inventoryFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setInventoryData(data);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadCashData = async () => {
    setLoadingCash(true);
    try {
      const { startDate, endDate } = getDateRange(cashFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'cash',
        frequency: cashFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setCashData(data);
    } catch (error) {
      console.error('Error loading cash data:', error);
    } finally {
      setLoadingCash(false);
    }
  };

  const loadEbitdaData = async () => {
    setLoadingEbitda(true);
    try {
      const { startDate, endDate } = getDateRange(ebitdaFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'daily-financials',
        frequency: ebitdaFreq,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });

      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setEbitdaData(data);
    } catch (error) {
      console.error('Error loading EBITDA data:', error);
    } finally {
      setLoadingEbitda(false);
    }
  };

  // Load operational goals
  const loadOperationalGoals = async () => {
    try {
      const response = await fetch(`/api/operational-goals?companyId=${selectedCompanyId}`);
      if (response.ok) {
        const data = await response.json();
        setOperationalGoals(data.goals || {});
      }
    } catch (error) {
      console.error('Error loading operational goals:', error);
    }
  };

  // Load dashboard preferences
  const loadDashboardPreferences = async () => {
    try {
      const response = await fetch(`/api/ops-dashboard-prefs?companyId=${selectedCompanyId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          // Dashboard widgets should always open in daily mode.
          setCustomerFreq('daily');
          setArFreq('daily');
          setApFreq('daily');
          setProductFreq('daily');
          setInventoryFreq('daily');
          setCashFreq('daily');
          setEbitdaFreq('daily');
          if (Array.isArray(data.preferences.widgetOrder)) {
            setWidgetOrder(data.preferences.widgetOrder.filter((id: unknown) => typeof id === 'string'));
          }
        }
      }
    } catch (error) {
      console.error('Error loading dashboard preferences:', error);
    }
  };

  // Save dashboard preferences
  const handleSavePreferences = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const preferences = {
        customerFreq,
        arFreq,
        apFreq,
        productFreq,
        inventoryFreq,
        cashFreq,
        ebitdaFreq,
        widgetOrder
      };
      
      const response = await fetch('/api/ops-dashboard-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          preferences
        })
      });

      if (response.ok) {
        setSaveMessage('Preferences saved successfully!');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      setSaveMessage('Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadOperationalGoals();
    loadDashboardPreferences();
  }, [selectedCompanyId]);

  // Load data on mount and when frequency changes
  useEffect(() => { loadCustomerData(); }, [selectedCompanyId, industrySectorCategory, customerFreq]);
  useEffect(() => { loadArData(); }, [selectedCompanyId, industrySectorCategory, arFreq]);
  useEffect(() => { loadApData(); }, [selectedCompanyId, industrySectorCategory, apFreq]);
  useEffect(() => { loadProductData(); }, [selectedCompanyId, industrySectorCategory, productFreq]);
  useEffect(() => { loadInventoryData(); }, [selectedCompanyId, industrySectorCategory, inventoryFreq]);
  useEffect(() => { loadCashData(); }, [selectedCompanyId, industrySectorCategory, cashFreq]);
  useEffect(() => { loadEbitdaData(); }, [selectedCompanyId, industrySectorCategory, ebitdaFreq]);

  // Frequency selector component
  const FrequencySelector = ({ value, onChange }: { value: string, onChange: (v: any) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as any)}
      style={{
        padding: '6px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        color: '#475569',
        cursor: 'pointer',
        background: 'white'
      }}
    >
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </select>
  );

  // Prepare chart data
  const prepareCustomerChartData = () => {
    if (!customerData?.records) return [];
    const records = trimDailyToWeekdayWindow(customerData.records, customerFreq);
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, customerFreq);
      if (!acc[period]) {
        acc[period] = { period, revenue: 0 };
      }
      acc[period].revenue += record.revenue;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const prepareArChartData = () => {
    if (!arData?.records) return [];
    const records = trimDailyToWeekdayWindow(arData.records, arFreq);
    return records.map((record: any) => ({
      period: formatDate(record.snapshotDate, arFreq),
      totalAR: record.totalAR,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareApChartData = () => {
    if (!apData?.records) return [];
    const records = trimDailyToWeekdayWindow(apData.records, apFreq);
    return records.map((record: any) => ({
      period: formatDate(record.snapshotDate, apFreq),
      totalAP: record.totalAP,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareProductChartData = () => {
    if (!productData?.records) return [];
    const records = trimDailyToWeekdayWindow(productData.records, productFreq);
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, productFreq);
      if (!acc[period]) {
        acc[period] = { period, revenue: 0 };
      }
      acc[period].revenue += record.revenue;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const prepareInventoryChartData = () => {
    if (!inventoryData?.records) return [];
    const records = trimDailyToWeekdayWindow(inventoryData.records, inventoryFreq);
    const periodValue: any = {};
    records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate, inventoryFreq);
      if (!periodValue[period]) {
        periodValue[period] = { period, value: 0 };
      }
      periodValue[period].value += record.assetValue;
    });
    return Object.values(periodValue);
  };

  const prepareCashChartData = () => {
    if (!cashData?.records) return [];
    const records = trimDailyToWeekdayWindow(cashData.records, cashFreq);
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, cashFreq);
      if (!acc[period]) {
        acc[period] = { period, totalCash: 0 };
      }
      acc[period].totalCash += record.cashBalance;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const prepareEbitdaChartData = () => {
    if (!ebitdaData?.records) return [];
    const records = trimDailyToWeekdayWindow(ebitdaData.records, ebitdaFreq);
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, ebitdaFreq);
      if (!acc[period]) {
        acc[period] = { period, ebitda: 0 };
      }
      const revenue = Number(record.revenue || 0);
      const cogsTotal = Number(record.cogsTotal || record.cogs || 0);
      const operatingExpense = Number(record.expense || 0);
      const depreciationAmortization = Number(record.depreciationAmortization || 0);
      acc[period].ebitda += revenue - cogsTotal - operatingExpense + depreciationAmortization;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const isOverviewReportEnabled = (sectionKey: string): boolean => {
    const value = operationalHubSections?.[sectionKey];
    return value === undefined ? true : value !== false;
  };

  const configuredModules = (activeModules || [])
    .map((module) => String(module || '').trim())
    .filter((module) => module && module.toLowerCase() !== 'ops-default');
  const hasConfiguredModules = configuredModules.length > 0;

  const modulesByType: Record<OpsDataType, string[]> = {
    customers: [],
    'customers-sites': [],
    'ar-aging': [],
    'ap-aging': [],
    products: [],
    'labor-scheduling': [],
    hiring: [],
    inventory: [],
    cash: [],
    'daily-financials': [],
    'revenue-billables': [],
    'unit-economics': [],
    'job-cost-control': [],
    'project-portfolio': [],
    'commitments-forecast': [],
    'billing-cash': [],
    'construction-ar': [],
    'construction-ap': [],
  };

  configuredModules.forEach((module) => {
    const type = mapModuleToDataType(module);
    if (!type) return;
    const label = getModuleLabel(module);
    const moduleBucket = modulesByType[type];
    if (!moduleBucket) return;
    if (!moduleBucket.includes(label)) moduleBucket.push(label);
  });

  const customerLabels = hasConfiguredModules ? modulesByType.customers : ['Customer Sales'];
  const arLabels = hasConfiguredModules ? modulesByType['ar-aging'] : ['AR Aging'];
  const apLabels = hasConfiguredModules ? modulesByType['ap-aging'] : ['AP Aging'];
  const productLabels = hasConfiguredModules ? modulesByType.products : ['Product Sales'];
  const inventoryLabels = hasConfiguredModules ? modulesByType.inventory : ['Inventory'];
  const cashLabels = hasConfiguredModules ? modulesByType.cash : ['Cash Balance'];

  const showCustomerWidget = customerLabels.length > 0 && isOverviewReportEnabled('overviewStdRevenue');
  const showArWidget = arLabels.length > 0 && isOverviewReportEnabled('overviewStdArAging');
  const showApWidget = apLabels.length > 0 && isOverviewReportEnabled('overviewStdApAging');
  const showProductWidget = productLabels.length > 0;
  const showInventoryWidget = inventoryLabels.length > 0 && isOverviewReportEnabled('overviewStdInventory');
  const showCashWidget = cashLabels.length > 0 && isOverviewReportEnabled('overviewStdCashTrend');
  const showEbitdaWidget = isOverviewReportEnabled('overviewStdEbitda');
  const isRealEstateSector = String(industrySectorCategory || '').trim() === '53';

  const firmDivisions = [
    { key: 'residential-real-estate', label: 'Residential Real Estate', revenue: 18400000, ebitda: 3220000, offices: 56, producers: 212, pipeline: 42800000, marginPct: 17.5 },
    { key: 'mortgage', label: 'Mortgage', revenue: 7200000, ebitda: 1180000, offices: 0, producers: 64, pipeline: 18600000, marginPct: 16.4 },
    { key: 'title', label: 'Title Company', revenue: 5100000, ebitda: 940000, offices: 0, producers: 42, pipeline: 8200000, marginPct: 18.4 },
    { key: 'insurance', label: 'Insurance Services', revenue: 3900000, ebitda: 760000, offices: 0, producers: 38, pipeline: 6100000, marginPct: 19.5 },
    { key: 'commercial-real-estate', label: 'Commercial Real Estate', revenue: 8600000, ebitda: 1760000, offices: 0, producers: 31, pipeline: 31200000, marginPct: 20.5 },
  ];
  const firmRegions = ['Northwest', 'Northeast', 'Central', 'Southwest', 'Southeast', 'Mountain'];
  const firmRegionOfficeCount = (regionIndex: number) => (regionIndex < 2 ? 10 : 9);
  const firmRegionRows = firmDivisions.flatMap((division, divisionIndex) =>
    firmRegions.map((region, regionIndex) => {
      const weight = 0.12 + regionIndex * 0.018 + (divisionIndex % 3) * 0.009;
      const normalizedWeight = weight / 1.02;
      const revenue = Math.round(division.revenue * normalizedWeight);
      return {
        division: division.label,
        region,
        revenue,
        ebitda: Math.round(revenue * (division.marginPct / 100) * (0.88 + regionIndex * 0.035)),
        pipeline: Math.round(division.pipeline * normalizedWeight * (0.9 + regionIndex * 0.025)),
        offices: division.key === 'residential-real-estate' ? firmRegionOfficeCount(regionIndex) : 0,
        producers: Math.max(1, Math.round(division.producers * normalizedWeight)),
        closedUnits: Math.round(24 + divisionIndex * 7 + regionIndex * 4),
      };
    })
  );
  const residentialDivision = firmDivisions[0];
  const firmOfficeRows = Array.from({ length: 56 }, (_, index) => {
    const revenue = Math.round(residentialDivision.revenue / residentialDivision.offices * (0.72 + (index % 7) * 0.09));
    return {
      office: `Office ${String(index + 1).padStart(2, '0')}`,
      region: firmRegions[index % firmRegions.length],
      division: residentialDivision.label,
      revenue,
      ebitda: Math.round(revenue * (0.12 + (index % 5) * 0.018)),
      pipeline: Math.round(revenue * (1.8 + (index % 4) * 0.35)),
      producers: 3 + (index % 8),
      closedUnits: 9 + (index % 14),
    };
  });
  const firmAgentRows = Array.from({ length: 18 }, (_, index) => {
    const division = firmDivisions[index % firmDivisions.length];
    return {
      agent: ['Alex Morgan', 'Jamie Lee', 'Taylor Smith', 'Jordan Patel', 'Casey Nguyen', 'Morgan Brooks'][index % 6] + ` ${index + 1}`,
      division: division.label,
      region: firmRegions[index % firmRegions.length],
      office: division.key === 'residential-real-estate' ? `Office ${String((index * 3) % 56 + 1).padStart(2, '0')}` : 'Shared Services',
      revenue: Math.round(420000 + index * 38500),
      pipeline: Math.round(900000 + index * 72000),
      closedUnits: 18 + (index % 9),
    };
  });
  const executiveScorecardRows = [
    { kpi: 'Revenue', mtd: formatCurrency(4850000), ytd: formatCurrency(43200000), budget: formatCurrency(45600000), priorYear: formatCurrency(39100000) },
    { kpi: 'EBITDA', mtd: formatCurrency(840000), ytd: formatCurrency(7860000), budget: formatCurrency(8200000), priorYear: formatCurrency(6940000) },
    { kpi: 'Cash Flow', mtd: formatCurrency(620000), ytd: formatCurrency(5220000), budget: formatCurrency(5700000), priorYear: formatCurrency(4810000) },
    { kpi: 'Transactions', mtd: '1,248', ytd: '10,940', budget: '11,350', priorYear: '9,880' },
    { kpi: 'Customer Count', mtd: '1,036', ytd: '8,720', budget: '8,950', priorYear: '7,940' },
  ];
  const residentialFunnelTrendMonths = Array.from({ length: 36 }, (_, index) => {
    const date = new Date(Date.UTC(2023, 6 + index, 1));
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  });
  const selectedFunnelRegionIndex = firmRegions.indexOf(selectedResidentialFunnelRegion);
  const selectedFunnelRegionMultiplier =
    selectedResidentialFunnelRegion === '__ALL__'
      ? 1
      : Math.max(0.1, 0.12 + Math.max(selectedFunnelRegionIndex, 0) * 0.018);
  const residentialFunnelTrendRows = residentialFunnelTrendMonths.map((period, index) => {
    const seasonalLift = Math.round(Math.sin(index / 3) * 24);
    const homeBuyers = Math.round((860 + index * 10 + seasonalLift) * selectedFunnelRegionMultiplier);
    return {
      period,
      homeBuyers,
      mortgageCustomers: Math.round(homeBuyers * (0.45 + (index % 6) * 0.008)),
      titleCustomers: Math.round(homeBuyers * (0.53 + (index % 5) * 0.009)),
      insuranceCustomers: Math.round(homeBuyers * (0.31 + (index % 4) * 0.007)),
    };
  });
  const officeAttachRows = firmOfficeRows.slice(0, 12).map((row, index) => ({
    office: row.office,
    mortgagePct: `${Math.round(42 + (index % 8) * 2.1)}%`,
    titlePct: `${Math.round(51 + (index % 7) * 2.4)}%`,
    insurancePct: `${Math.round(28 + (index % 6) * 2.2)}%`,
  }));
  const regionAttachRows = firmRegions.map((region, index) => ({
    region,
    mortgagePct: `${Math.round(44 + index * 1.9)}%`,
    titlePct: `${Math.round(53 + index * 1.7)}%`,
    insurancePct: `${Math.round(31 + index * 1.4)}%`,
  }));
  const regionAttachRowsWithTotal = [
    { region: 'Firm Total', mortgagePct: '49.0%', titlePct: '58.0%', insurancePct: '35.1%' },
    ...regionAttachRows,
  ];
  const trendMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const revenueByRegionTrend = trendMonths.map((period, monthIndex) => ({
    period,
    Northwest: 2400000 + monthIndex * 145000,
    Northeast: 2250000 + monthIndex * 132000,
    Central: 2100000 + monthIndex * 118000,
    Southwest: 1980000 + monthIndex * 126000,
    Southeast: 2050000 + monthIndex * 122000,
    Mountain: 1760000 + monthIndex * 108000,
  }));
  const revenueByDivisionTrend = trendMonths.map((period, monthIndex) => ({
    period,
    Residential: 3300000 + monthIndex * 165000,
    Mortgage: 1180000 + monthIndex * 68000,
    Title: 820000 + monthIndex * 44000,
    Insurance: 620000 + monthIndex * 36000,
    Commercial: 1420000 + monthIndex * 82000,
  }));
  const regionalPerformanceRows = firmRegions.map((region, index) => {
    const rows = firmRegionRows.filter((row) => row.region === region);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const ebitda = rows.reduce((sum, row) => sum + row.ebitda, 0);
    return {
      region,
      revenue,
      ebitda,
      marginPct: revenue ? Math.round((ebitda / revenue) * 1000) / 10 : 0,
      growthPct: Math.round((7.5 + index * 1.2) * 10) / 10,
    };
  });
  const marketShareRows = firmOfficeRows.map((row, index) => ({
    office: row.office,
    region: row.region,
    listings: 18 + (index % 16),
    transactions: row.closedUnits,
    volume: row.pipeline,
    marketSharePct: Math.round((6.5 + (index % 12) * 0.42) * 10) / 10,
  }));
  const regionalProductivityRows = firmRegions.map((region, index) => ({
    region,
    revenuePerOffice: Math.round(840000 + index * 46000),
    revenuePerEmployee: Math.round(212000 + index * 9000),
    revenuePerAgent: Math.round(168000 + index * 7200),
    closingsPerAgent: Math.round((7.5 + index * 0.6) * 10) / 10,
    loanVolumePerLoanOfficer: Math.round(4200000 + index * 185000),
  }));
  const selectedRegionalFinancialTrendIndex = Math.max(0, firmRegions.indexOf(selectedRegionalFinancialTrendRegion));
  const regionalFinancialTrendRows = residentialFunnelTrendMonths.map((period, monthIndex) => {
    const regionMultiplier = 0.9 + selectedRegionalFinancialTrendIndex * 0.08;
    const seasonality = Math.round(Math.sin(monthIndex / 3) * 65000);
    const revenue = Math.round((1550000 + monthIndex * 28500 + seasonality) * regionMultiplier);
    const expenses = Math.round(revenue * (0.68 - (selectedRegionalFinancialTrendIndex % 3) * 0.012));
    const ebitda = Math.round(revenue * (0.17 + (selectedRegionalFinancialTrendIndex % 4) * 0.006));
    return {
      period,
      revenue,
      ebitda,
      expenses,
      noi: revenue - expenses,
    };
  });
  const divisionSummaryRows = firmDivisions.map((division, index) => ({
    division: division.label,
    transactions: 980 + index * 185,
    volume: division.pipeline,
    gci: Math.round(division.revenue * 0.42),
    netRevenue: division.revenue,
    agentProductivity: formatCurrency(Math.round(division.revenue / Math.max(division.producers, 1))),
  }));
  const officeScorecardRows = firmOfficeRows.map((row, index) => ({
    office: row.office,
    region: row.region,
    revenueMtd: row.revenue,
    revenueYtd: row.revenue * 7,
    budget: Math.round(row.revenue * 7.4),
    priorYear: Math.round(row.revenue * 6.5),
    transactions: row.closedUnits,
    grossMargin: Math.round(row.revenue * 0.38),
    ebitda: row.ebitda,
    listingsTaken: 12 + (index % 9),
    closings: row.closedUnits,
    volume: row.pipeline,
    gci: Math.round(row.revenue * 0.42),
    agentCount: row.producers,
    gciPerAgent: Math.round((row.revenue * 0.42) / Math.max(row.producers, 1)),
    mortgageApplications: 4 + (index % 8),
    mortgageFundings: 3 + (index % 6),
    loanVolume: Math.round(row.pipeline * 0.42),
    titleOpenEscrows: 5 + (index % 7),
    titleClosedEscrows: 4 + (index % 6),
    insurancePolicies: 6 + (index % 9),
    premiumVolume: Math.round(row.revenue * 0.16),
    commercialDeals: 1 + (index % 4),
  }));

  const renderFirmTable = (
    rows: any[],
    columns: Array<{ key: string; label: string; format?: (value: any) => string }>,
    sortableTableKey = '',
  ) => {
    const isCompactTable = columns.length <= 5;
    const sort = sortableTableKey ? firmTableSort[sortableTableKey] : undefined;
    const displayRows = sort
      ? [...rows].sort((a, b) => {
          const left = a?.[sort.key];
          const right = b?.[sort.key];
          const leftNumber = Number(left);
          const rightNumber = Number(right);
          const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
          const comparison = bothNumeric
            ? leftNumber - rightNumber
            : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
          return sort.dir === 'asc' ? comparison : -comparison;
        })
      : rows;
    const toggleSort = (key: string) => {
      if (!sortableTableKey) return;
      setFirmTableSort((prev) => {
        const current = prev[sortableTableKey];
        return {
          ...prev,
          [sortableTableKey]: {
            key,
            dir: current?.key === key && current.dir === 'asc' ? 'desc' : 'asc',
          },
        };
      });
    };
    return (
    <div style={{ overflowX: isCompactTable ? 'visible' : 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isCompactTable ? '100%' : '780px' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                {sortableTableKey ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    style={{ border: 'none', background: 'transparent', padding: 0, color: '#475569', cursor: 'pointer', fontSize: '12px', fontWeight: 800, textAlign: 'left' }}
                  >
                    {column.label}{sort?.key === column.key ? (sort.dir === 'asc' ? ' ^' : ' v') : ''}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={`${row.division || row.office || row.agent || 'row'}-${row.region || rowIndex}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key} style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                  {column.format ? column.format(row[column.key]) : row[column.key] == null || row[column.key] === '' ? 'N/A' : String(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
  };

  const renderFirmReportCard = (title: string, sectionKey: string, children: React.ReactNode, fullWidth = false, helpText = '') => {
    if (!isOverviewReportEnabled(sectionKey)) return null;
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: fullWidth ? '1 / -1' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h3>
          {helpText ? (
            <details style={{ maxWidth: '520px', textAlign: 'right' }}>
              <summary style={{ cursor: 'pointer', color: '#2751d0', fontSize: '12px', fontWeight: 800, listStyle: 'none' }}>
                What does this mean?
              </summary>
              <div style={{ marginTop: '8px', textAlign: 'left', border: '1px solid #dbeafe', borderRadius: '10px', padding: '10px 12px', background: '#f8fafc', color: '#475569', fontSize: '12px', lineHeight: 1.5 }}>
                {helpText}
              </div>
            </details>
          ) : null}
        </div>
        {children}
      </div>
    );
  };
  const reportHelp = (text: string) => (
    <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px', lineHeight: 1.5 }}>
      {text}
    </p>
  );

  const divisionColumns = [
    { key: 'label', label: 'Division' },
    { key: 'revenue', label: 'Revenue', format: formatCurrency },
    { key: 'ebitda', label: 'EBITDA', format: formatCurrency },
    { key: 'marginPct', label: 'Margin', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
    { key: 'offices', label: 'Offices', format: (value: any) => Number(value || 0).toLocaleString() },
    { key: 'producers', label: 'Producers', format: (value: any) => Number(value || 0).toLocaleString() },
    { key: 'pipeline', label: 'Pipeline', format: formatCurrency },
  ];
  const regionColumns = [
    { key: 'division', label: 'Division' },
    { key: 'region', label: 'Region' },
    { key: 'revenue', label: 'Revenue', format: formatCurrency },
    { key: 'ebitda', label: 'EBITDA', format: formatCurrency },
    { key: 'pipeline', label: 'Pipeline', format: formatCurrency },
    { key: 'offices', label: 'Offices', format: (value: any) => Number(value || 0).toLocaleString() },
    { key: 'producers', label: 'Producers', format: (value: any) => Number(value || 0).toLocaleString() },
    { key: 'closedUnits', label: 'Closed Units', format: (value: any) => Number(value || 0).toLocaleString() },
  ];
  const officeColumns = [
    { key: 'office', label: 'Office' },
    { key: 'region', label: 'Region' },
    { key: 'division', label: 'Division' },
    { key: 'revenue', label: 'Revenue', format: formatCurrency },
    { key: 'ebitda', label: 'EBITDA', format: formatCurrency },
    { key: 'pipeline', label: 'Pipeline', format: formatCurrency },
    { key: 'producers', label: 'Producers', format: (value: any) => Number(value || 0).toLocaleString() },
    { key: 'closedUnits', label: 'Closed Units', format: (value: any) => Number(value || 0).toLocaleString() },
  ];
  const agentColumns = [
    { key: 'agent', label: 'Agent / Producer' },
    { key: 'division', label: 'Division' },
    { key: 'region', label: 'Region' },
    { key: 'office', label: 'Office' },
    { key: 'revenue', label: 'Revenue', format: formatCurrency },
    { key: 'pipeline', label: 'Pipeline', format: formatCurrency },
    { key: 'closedUnits', label: 'Closed Units', format: (value: any) => Number(value || 0).toLocaleString() },
  ];

  const renderRealEstateExecutiveReport = () => {
    if (!isRealEstateSector || !isOverviewReportEnabled('realEstateExecutiveReport')) return null;
    const tabs = [
      { key: 'executive' as const, label: 'Executive Dashboard' },
      { key: 'regional' as const, label: 'Regional Report' },
      { key: 'division' as const, label: 'Division Report' },
      { key: 'office' as const, label: 'Office Report' },
    ];
    const simpleColumns = (pairs: Array<[string, string]>) => pairs.map(([key, label]) => ({ key, label }));
    const moneyColumn = (key: string, label: string) => ({ key, label, format: formatCurrency });
    const numberColumn = (key: string, label: string) => ({ key, label, format: (value: any) => Number(value || 0).toLocaleString() });
    return (
      <div style={{ background: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Executive Report</h2>
          </div>
        </div>
        <div className="ops-print-hide" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderBottom: '2px solid #e2e8f0', marginBottom: '18px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveRealEstateExecutiveTab(tab.key)}
              style={{
                padding: '10px 14px',
                border: 'none',
                borderBottom: activeRealEstateExecutiveTab === tab.key ? '3px solid #2751d0' : '3px solid transparent',
                background: 'transparent',
                color: activeRealEstateExecutiveTab === tab.key ? '#2751d0' : '#64748b',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeRealEstateExecutiveTab === 'executive' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Enterprise Executive Dashboard', 'realEstateExecutiveReport', renderFirmTable(executiveScorecardRows, simpleColumns([
              ['kpi', 'KPI'], ['mtd', 'MTD'], ['ytd', 'YTD'], ['budget', 'Budget'], ['priorYear', 'Prior Year'],
            ])))}
            {renderFirmReportCard('Residential Real Estate Attach Rate', 'realEstateExecutiveReport', (
              renderFirmTable(regionAttachRowsWithTotal, simpleColumns([
                ['region', 'Region'], ['mortgagePct', 'Mortgage %'], ['titlePct', 'Title %'], ['insurancePct', 'Insurance %'],
              ]))
            ), false, 'This rolls attachment rates up by region, with Firm Total showing the overall company rate. It helps leadership see which regions are converting brokerage customers into mortgage, title, and insurance relationships.')}
            {renderFirmReportCard('Residential Transaction Funnel - Monthly Trend', 'realEstateExecutiveReport', (
              <>
                {reportHelp('Monthly trend of residential home-buyer transactions and the customers captured by the mortgage, title, and insurance businesses from those transactions.')}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Region
                    <select
                      value={selectedResidentialFunnelRegion}
                      onChange={(event) => setSelectedResidentialFunnelRegion(event.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      <option value="__ALL__">All Regions</option>
                      {firmRegions.map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={residentialFunnelTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" interval={2} tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(value: any) => Number(value || 0).toLocaleString()} />
                    <Legend />
                    <Line type="monotone" dataKey="homeBuyers" stroke="#2563eb" strokeWidth={2} name="Home Buyers" />
                    <Line type="monotone" dataKey="mortgageCustomers" stroke="#0f766e" strokeWidth={2} name="Mortgage Customers" />
                    <Line type="monotone" dataKey="titleCustomers" stroke="#f97316" strokeWidth={2} name="Title Customers" />
                    <Line type="monotone" dataKey="insuranceCustomers" stroke="#7c3aed" strokeWidth={2} name="Insurance Customers" />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ), true)}
            {renderFirmReportCard('Attach Rate by Office', 'realEstateExecutiveReport', (
              <>
                {reportHelp('Each row shows the share of that office’s residential transactions that also used mortgage, title, or insurance services. Example: Office 01 at Mortgage 42% means 42% of Office 01 residential transactions also used the mortgage business.')}
                {renderFirmTable(officeAttachRows, simpleColumns([
                  ['office', 'Office'], ['mortgagePct', 'Mortgage %'], ['titlePct', 'Title %'], ['insurancePct', 'Insurance %'],
                ]))}
              </>
            ))}
            {renderFirmReportCard('Revenue by Region', 'realEstateExecutiveReport', (
              <>
                {renderFirmTable(regionalPerformanceRows, [
                  { key: 'region', label: 'Region' },
                  moneyColumn('revenue', 'Revenue'),
                  moneyColumn('ebitda', 'EBITDA'),
                  { key: 'marginPct', label: 'Margin %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
                  { key: 'growthPct', label: 'Growth %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
                ])}
                <div style={{ height: 260, marginTop: '16px' }}>
                  <ResponsiveContainer>
                    <LineChart data={revenueByRegionTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                      <Legend />
                      {firmRegions.map((region, index) => (
                        <Line key={region} dataKey={region} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ))}
            {renderFirmReportCard('Revenue by Division', 'realEstateExecutiveReport', (
              <>
                {renderFirmTable(firmDivisions, divisionColumns)}
                <div style={{ height: 260, marginTop: '16px' }}>
                  <ResponsiveContainer>
                    <LineChart data={revenueByDivisionTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                      <Legend />
                      {['Residential', 'Mortgage', 'Title', 'Insurance', 'Commercial'].map((key, index) => (
                        <Line key={key} dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ))}
          </div>
        )}

        {activeRealEstateExecutiveTab === 'regional' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Regional Performance Dashboard', 'realEstateExecutiveReport', renderFirmTable(regionalPerformanceRows, [
              { key: 'region', label: 'Region' },
              moneyColumn('revenue', 'Revenue'),
              moneyColumn('ebitda', 'EBITDA'),
              { key: 'marginPct', label: 'Margin %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
              { key: 'growthPct', label: 'Growth %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
            ]))}
            {renderFirmReportCard('Regional Division Reports', 'realEstateExecutiveReport', (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Region
                    <select
                      value={selectedRegionalDivisionReportRegion}
                      onChange={(event) => setSelectedRegionalDivisionReportRegion(event.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      {firmRegions.map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {renderFirmTable(firmRegionRows.filter((row) => row.region === selectedRegionalDivisionReportRegion), regionColumns)}
              </>
            ))}
            {renderFirmReportCard('Regional Financial Trend - 3 Year Monthly', 'realEstateExecutiveReport', (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Region
                    <select
                      value={selectedRegionalFinancialTrendRegion}
                      onChange={(event) => setSelectedRegionalFinancialTrendRegion(event.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      {firmRegions.map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={regionalFinancialTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" interval={2} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} name="Revenue" dot={false} />
                    <Line type="monotone" dataKey="ebitda" stroke="#0f766e" strokeWidth={2} name="EBITDA" dot={false} />
                    <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} name="Expenses" dot={false} />
                    <Line type="monotone" dataKey="noi" stroke="#7c3aed" strokeWidth={2} name="Net Operating Income" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ), true)}
            {renderFirmReportCard('Office Ranking Report', 'realEstateExecutiveReport', renderFirmTable(firmOfficeRows, officeColumns, 'officeRanking'))}
            {renderFirmReportCard('Regional Market Share Report', 'realEstateExecutiveReport', renderFirmTable(marketShareRows, [
              { key: 'office', label: 'Office' },
              { key: 'region', label: 'Region' },
              numberColumn('listings', 'Listings'),
              numberColumn('transactions', 'Transactions'),
              moneyColumn('volume', 'Volume'),
              { key: 'marketSharePct', label: 'Market Share', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
            ], 'regionalMarketShare'))}
            {renderFirmReportCard('Regional Productivity Report', 'realEstateExecutiveReport', renderFirmTable(regionalProductivityRows, [
              { key: 'region', label: 'Region' },
              moneyColumn('revenuePerOffice', 'Revenue / Office'),
              moneyColumn('revenuePerEmployee', 'Revenue / Employee'),
              moneyColumn('revenuePerAgent', 'Revenue / Agent'),
              { key: 'closingsPerAgent', label: 'Closings / Agent', format: (value: any) => Number(value || 0).toFixed(1) },
              moneyColumn('loanVolumePerLoanOfficer', 'Loan Volume / Loan Officer'),
            ]))}
          </div>
        )}

        {activeRealEstateExecutiveTab === 'division' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Division Summary - Company Total', 'realEstateExecutiveReport', renderFirmTable(divisionSummaryRows, [
              { key: 'division', label: 'Division' },
              numberColumn('transactions', 'Transactions'),
              moneyColumn('volume', 'Volume'),
              moneyColumn('gci', 'GCI'),
              moneyColumn('netRevenue', 'Net Revenue'),
              { key: 'agentProductivity', label: 'Agent Productivity' },
            ]))}
            {renderFirmReportCard('Division by Region', 'realEstateExecutiveReport', (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Division
                    <select
                      value={selectedDivisionByRegionDivision}
                      onChange={(event) => setSelectedDivisionByRegionDivision(event.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      {firmDivisions.map((division) => (
                        <option key={division.key} value={division.label}>{division.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {renderFirmTable(firmRegionRows.filter((row) => row.division === selectedDivisionByRegionDivision), regionColumns)}
              </>
            ))}
          </div>
        )}

        {activeRealEstateExecutiveTab === 'office' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Office Scorecard', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              moneyColumn('revenueMtd', 'Revenue MTD'),
              moneyColumn('revenueYtd', 'Revenue YTD'),
              moneyColumn('budget', 'Budget'),
              moneyColumn('priorYear', 'Prior Year'),
              numberColumn('transactions', 'Transactions'),
              moneyColumn('grossMargin', 'Gross Margin'),
              moneyColumn('ebitda', 'EBITDA'),
            ]))}
            {renderFirmReportCard('Residential Real Estate by Office', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              { key: 'region', label: 'Region' },
              numberColumn('transactions', 'Transactions'),
              moneyColumn('volume', 'Volume'),
              moneyColumn('gci', 'GCI'),
              moneyColumn('revenueYtd', 'Net Revenue'),
              moneyColumn('gciPerAgent', 'GCI / Agent'),
            ]))}
            {renderFirmReportCard('Residential Metrics', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              numberColumn('listingsTaken', 'Listings Taken'),
              numberColumn('closings', 'Closings'),
              moneyColumn('volume', 'Volume'),
              moneyColumn('gci', 'GCI'),
              numberColumn('agentCount', 'Agent Count'),
              moneyColumn('gciPerAgent', 'GCI / Agent'),
            ]))}
            {renderFirmReportCard('Mortgage Metrics', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              numberColumn('mortgageApplications', 'Applications'),
              numberColumn('mortgageFundings', 'Fundings'),
              moneyColumn('loanVolume', 'Loan Volume'),
              moneyColumn('revenueMtd', 'Revenue'),
            ]))}
            {renderFirmReportCard('Title Metrics', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              numberColumn('titleOpenEscrows', 'Open Escrows'),
              numberColumn('titleClosedEscrows', 'Closed Escrows'),
              moneyColumn('revenueMtd', 'Revenue'),
            ]))}
            {renderFirmReportCard('Insurance Metrics', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              numberColumn('insurancePolicies', 'Policies Written'),
              moneyColumn('premiumVolume', 'Premium Volume'),
              moneyColumn('revenueMtd', 'Revenue'),
            ]))}
            {renderFirmReportCard('Commercial Metrics', 'realEstateExecutiveReport', renderFirmTable(officeScorecardRows, [
              { key: 'office', label: 'Office' },
              numberColumn('commercialDeals', 'Deals Closed'),
              moneyColumn('volume', 'Volume'),
              moneyColumn('revenueMtd', 'Revenue'),
            ]))}
          </div>
        )}
      </div>
    );
  };

  const primaryLabelByType: Record<OpsDataType, string> = {
    customers: customerLabels[0] || 'Customer Sales',
    'customers-sites': 'Customers / Sites',
    'ar-aging': arLabels[0] || 'AR Aging',
    'ap-aging': apLabels[0] || 'AP Aging',
    products: productLabels[0] || 'Product Sales',
    'labor-scheduling': 'Labor & Scheduling',
    hiring: 'Hiring',
    inventory: inventoryLabels[0] || 'Inventory',
    cash: cashLabels[0] || 'Cash Balance',
    'daily-financials': 'Daily Financials',
    'revenue-billables': 'Revenue & Billables',
    'unit-economics': 'Unit Economics',
    'job-cost-control': 'Job Cost Control',
    'project-portfolio': 'Project Portfolio',
    'commitments-forecast': 'Commitments & Forecast',
    'billing-cash': 'Billing & Cash',
    'construction-ar': 'AR',
    'construction-ap': 'AP',
  };

  const extraWidgets: Array<{ type: OpsDataType; label: string }> = [
    ...(showCustomerWidget ? customerLabels.slice(1).map((label) => ({ type: 'customers' as OpsDataType, label })) : []),
    ...(showArWidget ? arLabels.slice(1).map((label) => ({ type: 'ar-aging' as OpsDataType, label })) : []),
    ...(showApWidget ? apLabels.slice(1).map((label) => ({ type: 'ap-aging' as OpsDataType, label })) : []),
    ...productLabels.slice(1).map((label) => ({ type: 'products' as OpsDataType, label })),
    ...(showInventoryWidget ? inventoryLabels.slice(1).map((label) => ({ type: 'inventory' as OpsDataType, label })) : []),
    ...(showCashWidget ? cashLabels.slice(1).map((label) => ({ type: 'cash' as OpsDataType, label })) : []),
  ];
  const getExtraWidgetId = (widget: { type: OpsDataType; label: string }) => `extra:${widget.type}:${widget.label}`;

  const renderExtraWidget = (widget: { type: OpsDataType; label: string }) => {
    const cardStyle: React.CSSProperties = { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
    if (widget.type === 'customers') {
      return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>📊 {widget.label}</h3>
            <FrequencySelector value={customerFreq} onChange={setCustomerFreq} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={prepareCustomerChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke={CUSTOMER_CHART_COLOR} strokeWidth={2} dot={{ fill: CUSTOMER_CHART_COLOR, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (widget.type === 'ar-aging') {
      return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>💰 {widget.label}</h3>
            <FrequencySelector value={arFreq} onChange={setArFreq} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={prepareArChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="current" stackId="a" fill={AGING_COLORS[0]} name="Current" />
              <Bar dataKey="over30" stackId="a" fill={AGING_COLORS[1]} name="Over 30 Days" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (widget.type === 'ap-aging') {
      return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>💳 {widget.label}</h3>
            <FrequencySelector value={apFreq} onChange={setApFreq} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={prepareApChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="current" stackId="a" fill={AGING_COLORS[0]} name="Current" />
              <Bar dataKey="over30" stackId="a" fill={AGING_COLORS[1]} name="Over 30 Days" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (widget.type === 'products') {
      return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>📦 {widget.label}</h3>
            <FrequencySelector value={productFreq} onChange={setProductFreq} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={prepareProductChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="#ec4899" strokeWidth={2} dot={{ fill: '#ec4899', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (widget.type === 'inventory') {
      return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>🏭 {widget.label}</h3>
            <FrequencySelector value={inventoryFreq} onChange={setInventoryFreq} />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={prepareInventoryChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => [formatCurrency(value), 'Value']} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>💵 {widget.label}</h3>
          <FrequencySelector value={cashFreq} onChange={setCashFreq} />
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={prepareCashChartData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value: any) => [formatCurrency(value), 'Total Cash']} />
            <Bar dataKey="totalCash" fill={CASH_CHART_COLOR} name="Total Cash" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const availableWidgetIds = [
    ...(showCustomerWidget ? ['customers'] : []),
    ...(showArWidget ? ['ar-aging'] : []),
    ...(showApWidget ? ['ap-aging'] : []),
    ...(showProductWidget ? ['products'] : []),
    ...(showInventoryWidget ? ['inventory'] : []),
    ...(showCashWidget ? ['cash'] : []),
    ...(showEbitdaWidget ? ['ebitda'] : []),
    ...extraWidgets.map((widget) => getExtraWidgetId(widget)),
  ];

  const normalizedWidgetOrder = normalizeWidgetOrder(widgetOrder, availableWidgetIds);

  useEffect(() => {
    setWidgetOrder((current) => {
      const next = normalizeWidgetOrder(current, availableWidgetIds);
      if (current.length === next.length && current.every((id, index) => id === next[index])) {
        return current;
      }
      return next;
    });
  }, [availableWidgetIds.join('|')]);

  const getWidgetPosition = (widgetId: string) => {
    const index = normalizedWidgetOrder.indexOf(widgetId);
    return index >= 0 ? index : normalizedWidgetOrder.length;
  };

  const handleWidgetDrop = (sourceWidgetId: string, targetWidgetId: string) => {
    if (!sourceWidgetId || sourceWidgetId === targetWidgetId) return;
    setWidgetOrder((current) => {
      const base = normalizeWidgetOrder(current, availableWidgetIds);
      const fromIndex = base.indexOf(sourceWidgetId);
      const toIndex = base.indexOf(targetWidgetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return base;
      const next = [...base];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedWidgetId(null);
  };

  const getDraggableCardProps = (widgetId: string): React.HTMLAttributes<HTMLDivElement> => ({
    draggable: true,
    onDragStart: (e) => {
      setDraggedWidgetId(widgetId);
      e.dataTransfer.setData('text/plain', widgetId);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => setDraggedWidgetId(null),
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e) => {
      e.preventDefault();
      const droppedId = e.dataTransfer.getData('text/plain') || draggedWidgetId || '';
      handleWidgetDrop(droppedId, widgetId);
    },
  });

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {!isRealEstateSector && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Drag cards to reorder</span>
            {saveMessage && (
              <span style={{ 
                fontSize: '14px', 
                color: saveMessage.includes('success') ? '#16a34a' : '#ef4444',
                fontWeight: '500'
              }}>
                {saveMessage}
              </span>
            )}
            <button
              onClick={handleSavePreferences}
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: saving ? '#94a3b8' : '#2751d0',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#1f43b8')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.background = '#2751d0')}
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
        )}

        {renderRealEstateExecutiveReport()}

        {/* Dashboard Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
          
          {/* Customer Sales Widget */}
          {showCustomerWidget && (
          <div
            {...getDraggableCardProps('customers')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('customers'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                📊 {primaryLabelByType.customers}
              </h3>
              <FrequencySelector value={customerFreq} onChange={setCustomerFreq} />
            </div>
            {loadingCustomer ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareCustomerChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                  {operationalGoals.customer_revenue && (
                    <ReferenceLine 
                      y={operationalGoals.customer_revenue} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Line type="monotone" dataKey="revenue" stroke={CUSTOMER_CHART_COLOR} strokeWidth={2} dot={{ fill: CUSTOMER_CHART_COLOR, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* AR Aging Widget */}
          {showArWidget && (
          <div
            {...getDraggableCardProps('ar-aging')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('ar-aging'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💰 {primaryLabelByType['ar-aging']}
              </h3>
              <FrequencySelector value={arFreq} onChange={setArFreq} />
            </div>
            {loadingAr ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareArChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  {operationalGoals.total_ar && (
                    <ReferenceLine 
                      y={operationalGoals.total_ar} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal Total AR', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Bar dataKey="current" stackId="a" fill={AGING_COLORS[0]} name="Current" />
                  <Bar dataKey="over30" stackId="a" fill={AGING_COLORS[1]} name="Over 30 Days" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* AP Aging Widget */}
          {showApWidget && (
          <div
            {...getDraggableCardProps('ap-aging')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('ap-aging'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💳 {primaryLabelByType['ap-aging']}
              </h3>
              <FrequencySelector value={apFreq} onChange={setApFreq} />
            </div>
            {loadingAp ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareApChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  {operationalGoals.total_ap && (
                    <ReferenceLine 
                      y={operationalGoals.total_ap} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal Total AP', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Bar dataKey="current" stackId="a" fill={AGING_COLORS[0]} name="Current" />
                  <Bar dataKey="over30" stackId="a" fill={AGING_COLORS[1]} name="Over 30 Days" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* Product Sales Widget */}
          {showProductWidget && (
          <div
            {...getDraggableCardProps('products')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('products'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                📦 {primaryLabelByType.products}
              </h3>
              <FrequencySelector value={productFreq} onChange={setProductFreq} />
            </div>
            {loadingProduct ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareProductChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                  {operationalGoals.product_revenue && (
                    <ReferenceLine 
                      y={operationalGoals.product_revenue} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Line type="monotone" dataKey="revenue" stroke="#ec4899" strokeWidth={2} dot={{ fill: '#ec4899', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* Inventory Widget */}
          {showInventoryWidget && (
          <div
            {...getDraggableCardProps('inventory')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('inventory'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                🏭 {primaryLabelByType.inventory}
              </h3>
              <FrequencySelector value={inventoryFreq} onChange={setInventoryFreq} />
            </div>
            {loadingInventory ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareInventoryChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Value']} />
                  {operationalGoals.inventory_value && (
                    <ReferenceLine 
                      y={operationalGoals.inventory_value} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* Cash Widget */}
          {showCashWidget && (
          <div
            {...getDraggableCardProps('cash')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('cash'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💵 {primaryLabelByType.cash}
              </h3>
              <FrequencySelector value={cashFreq} onChange={setCashFreq} />
            </div>
            {loadingCash ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareCashChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Total Cash']} />
                  {operationalGoals.total_cash && (
                    <ReferenceLine 
                      y={operationalGoals.total_cash} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      label={{ value: 'Goal', position: 'insideTopRight', fill: '#ef4444', fontSize: 12, fontWeight: 600 }}
                    />
                  )}
                  <Bar dataKey="totalCash" fill={CASH_CHART_COLOR} name="Total Cash" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {/* EBITDA Widget */}
          {showEbitdaWidget && (
          <div
            {...getDraggableCardProps('ebitda')}
            style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', order: getWidgetPosition('ebitda'), cursor: 'grab' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                📈 EBITDA
              </h3>
              <FrequencySelector value={ebitdaFreq} onChange={setEbitdaFreq} />
            </div>
            {loadingEbitda ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareEbitdaChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(Number(value || 0)), 'EBITDA']} />
                  <Bar dataKey="ebitda" fill="#7c3aed" name="EBITDA" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          )}

          {extraWidgets.map((widget) => {
            const widgetId = getExtraWidgetId(widget);
            return (
              <div
                key={widgetId}
                {...getDraggableCardProps(widgetId)}
                style={{ order: getWidgetPosition(widgetId), cursor: 'grab' }}
              >
                {renderExtraWidget(widget)}
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}

