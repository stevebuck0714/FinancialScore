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
  const [realEstateReportStartDate, setRealEstateReportStartDate] = useState('2026-06-01');
  const [realEstateReportEndDate, setRealEstateReportEndDate] = useState('2026-06-13');
  const [selectedRegionalDashboardRegion, setSelectedRegionalDashboardRegion] = useState('Northwest');
  const [selectedRegionalAttachOfficeRegion, setSelectedRegionalAttachOfficeRegion] = useState('Northwest');
  const [selectedRegionalMarketShareRegion, setSelectedRegionalMarketShareRegion] = useState('Northwest');
  const [selectedDivisionByRegionDivision, setSelectedDivisionByRegionDivision] = useState('Residential Real Estate');
  const [selectedAttachRevenueMetric, setSelectedAttachRevenueMetric] = useState<'revenue' | 'ebitda' | 'margin'>('revenue');
  const [firmTableSort, setFirmTableSort] = useState<Record<string, { key: string; dir: 'asc' | 'desc' }>>({});

  const setRealEstateReportRange = (start: Date, end: Date) => {
    setRealEstateReportStartDate(toLocalInputDate(start));
    setRealEstateReportEndDate(toLocalInputDate(end));
  };

  const setRealEstateReportToLastMonth = () => {
    const currentEnd = parseDateSafeUtc(realEstateReportEndDate) || new Date();
    const year = currentEnd.getUTCFullYear();
    const month = currentEnd.getUTCMonth();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    setRealEstateReportRange(start, end);
  };

  const setRealEstateReportToLastQuarter = () => {
    const currentEnd = parseDateSafeUtc(realEstateReportEndDate) || new Date();
    const year = currentEnd.getUTCFullYear();
    const currentQuarterStartMonth = Math.floor(currentEnd.getUTCMonth() / 3) * 3;
    const start = new Date(year, currentQuarterStartMonth - 3, 1);
    const end = new Date(year, currentQuarterStartMonth, 0);
    setRealEstateReportRange(start, end);
  };

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
  const executiveAsOfDate = 'June 13, 2026';
  const executiveRevenue = { mtd: 4850000, ytd: 43200000, budget: 45600000, priorYear: 39100000 };
  const executiveEbitda = { mtd: 840000, ytd: 7860000, budget: 8200000, priorYear: 6940000 };
  const executiveCustomers = { mtd: 1036, ytd: 8720, budget: 8950, priorYear: 7940 };
  const formatKpiPercent = (numerator: number, denominator: number) =>
    denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'N/A';
  const executiveScorecardRows = [
    { kpi: 'Revenue', mtd: formatCurrency(executiveRevenue.mtd), ytd: formatCurrency(executiveRevenue.ytd), budget: formatCurrency(executiveRevenue.budget), priorYear: formatCurrency(executiveRevenue.priorYear) },
    { kpi: 'EBITDA', mtd: formatCurrency(executiveEbitda.mtd), ytd: formatCurrency(executiveEbitda.ytd), budget: formatCurrency(executiveEbitda.budget), priorYear: formatCurrency(executiveEbitda.priorYear) },
    { kpi: 'EBITDA %', mtd: formatKpiPercent(executiveEbitda.mtd, executiveRevenue.mtd), ytd: formatKpiPercent(executiveEbitda.ytd, executiveRevenue.ytd), budget: formatKpiPercent(executiveEbitda.budget, executiveRevenue.budget), priorYear: formatKpiPercent(executiveEbitda.priorYear, executiveRevenue.priorYear) },
    { kpi: 'Cash Flow', mtd: formatCurrency(620000), ytd: formatCurrency(5220000), budget: formatCurrency(5700000), priorYear: formatCurrency(4810000) },
    { kpi: 'Transactions', mtd: '1,248', ytd: '10,940', budget: '11,350', priorYear: '9,880' },
    { kpi: 'Customer Count', mtd: executiveCustomers.mtd.toLocaleString(), ytd: executiveCustomers.ytd.toLocaleString(), budget: executiveCustomers.budget.toLocaleString(), priorYear: executiveCustomers.priorYear.toLocaleString() },
    { kpi: 'Revenue / Customer', mtd: formatCurrency(executiveRevenue.mtd / executiveCustomers.mtd), ytd: formatCurrency(executiveRevenue.ytd / executiveCustomers.ytd), budget: formatCurrency(executiveRevenue.budget / executiveCustomers.budget), priorYear: formatCurrency(executiveRevenue.priorYear / executiveCustomers.priorYear) },
  ];
  const enterpriseValueCreationRows = [
    { metric: 'Revenue', apr: formatCurrency(4510000), may: formatCurrency(4680000), jun: formatCurrency(4850000), forecast90: formatCurrency(15800000) },
    { metric: 'EBITDA', apr: formatCurrency(765000), may: formatCurrency(810000), jun: formatCurrency(840000), forecast90: formatCurrency(2920000) },
    { metric: 'Revenue per Customer', apr: formatCurrency(4422), may: formatCurrency(4517), jun: formatCurrency(4681), forecast90: formatCurrency(4920) },
    { metric: 'EBITDA per Customer', apr: formatCurrency(750), may: formatCurrency(782), jun: formatCurrency(811), forecast90: formatCurrency(910) },
    { metric: 'Mortgage Attach %', apr: '47.8%', may: '48.5%', jun: '49.0%', forecast90: '50.4%' },
    { metric: 'Title Attach %', apr: '56.7%', may: '57.4%', jun: '58.0%', forecast90: '59.2%' },
    { metric: 'Insurance Attach %', apr: '33.9%', may: '34.5%', jun: '35.1%', forecast90: '36.4%' },
    { metric: 'Revenue from Attached Services', apr: formatCurrency(1420000), may: formatCurrency(1510000), jun: formatCurrency(1600000), forecast90: formatCurrency(5120000) },
    { metric: 'EBITDA from Attached Services', apr: formatCurrency(268000), may: formatCurrency(292000), jun: formatCurrency(318000), forecast90: formatCurrency(1080000) },
  ];
  const trendMonths = Array.from({ length: 36 }, (_, index) => {
    const date = new Date(Date.UTC(2023, 6 + index, 1));
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  });
  const officeAttachRows = firmOfficeRows.map((row, index) => ({
    office: row.office,
    mortgagePct: Math.round(42 + (index % 8) * 2.1),
    titlePct: Math.round(51 + (index % 7) * 2.4),
    insurancePct: Math.round(28 + (index % 6) * 2.2),
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
  const regionalAttachRateDashboardRows = [
    ...firmRegions.map((region, index) => ({
      region,
      mortgage: Math.round(44 + index * 1.9),
      title: Math.round(53 + index * 1.7),
      insurance: Math.round(31 + index * 1.4),
    })),
    { region: 'Company Total', mortgage: 49, title: 58, insurance: 35.1 },
  ];
  const regionalAttachRateCompanyTotal = regionalAttachRateDashboardRows[regionalAttachRateDashboardRows.length - 1];
  const residentialAttachRevenueByRegionRows = firmRegions.map((region, index) => {
    const mortgage = Math.round(620000 + index * 82000);
    const title = Math.round(540000 + index * 76000);
    const insurance = Math.round(260000 + index * 42000);
    const mortgageEbitda = Math.round(mortgage * (0.18 + index * 0.004));
    const titleEbitda = Math.round(title * (0.21 + index * 0.003));
    const insuranceEbitda = Math.round(insurance * (0.24 + index * 0.004));
    const totalRevenue = mortgage + title + insurance;
    const totalEbitda = mortgageEbitda + titleEbitda + insuranceEbitda;
    return {
      region,
      mortgageRevenue: mortgage,
      titleRevenue: title,
      insuranceRevenue: insurance,
      totalRevenue,
      mortgageEbitda,
      titleEbitda,
      insuranceEbitda,
      totalEbitda,
      mortgageMargin: Math.round((mortgageEbitda / mortgage) * 1000) / 10,
      titleMargin: Math.round((titleEbitda / title) * 1000) / 10,
      insuranceMargin: Math.round((insuranceEbitda / insurance) * 1000) / 10,
      totalMargin: Math.round((totalEbitda / totalRevenue) * 1000) / 10,
    };
  });
  const residentialAttachRevenueChartRows = residentialAttachRevenueByRegionRows.map((row) => ({
    region: row.region,
    mortgage: selectedAttachRevenueMetric === 'margin' ? row.mortgageMargin : selectedAttachRevenueMetric === 'ebitda' ? row.mortgageEbitda : row.mortgageRevenue,
    title: selectedAttachRevenueMetric === 'margin' ? row.titleMargin : selectedAttachRevenueMetric === 'ebitda' ? row.titleEbitda : row.titleRevenue,
    insurance: selectedAttachRevenueMetric === 'margin' ? row.insuranceMargin : selectedAttachRevenueMetric === 'ebitda' ? row.insuranceEbitda : row.insuranceRevenue,
    total: selectedAttachRevenueMetric === 'margin' ? row.totalMargin : selectedAttachRevenueMetric === 'ebitda' ? row.totalEbitda : row.totalRevenue,
  }));
  const officeProfitabilityRows = firmOfficeRows.map((row) => ({
    office: row.office,
    revenue: row.revenue,
    ebitda: row.ebitda,
    ebitdaPct: row.revenue ? Math.round((row.ebitda / row.revenue) * 1000) / 10 : 0,
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
  const attachRevenueByOfficeRows = firmOfficeRows
    .filter((row) => row.region === selectedRegionalAttachOfficeRegion)
    .map((row, index) => {
      const mortgage = Math.round(row.revenue * (0.34 + (index % 4) * 0.018));
      const title = Math.round(row.revenue * (0.29 + (index % 5) * 0.016));
      const insurance = Math.round(row.revenue * (0.14 + (index % 3) * 0.012));
      const mortgageEbitdaPct = Math.round((18 + (index % 5) * 0.9) * 10) / 10;
      const titleEbitdaPct = Math.round((21 + (index % 4) * 0.8) * 10) / 10;
      const insuranceEbitdaPct = Math.round((24 + (index % 4) * 0.7) * 10) / 10;
      const attachRevenue = mortgage + title + insurance;
      const totalEbitda =
        mortgage * (mortgageEbitdaPct / 100) +
        title * (titleEbitdaPct / 100) +
        insurance * (insuranceEbitdaPct / 100);
      return {
        office: row.office,
        totalRevenue: row.revenue,
        totalEbitdaPct: row.revenue ? Math.round((row.ebitda / row.revenue) * 1000) / 10 : 0,
        mortgage,
        mortgageEbitdaPct,
        title,
        titleEbitdaPct,
        insurance,
        insuranceEbitdaPct,
        attachRevenue,
        attachRevenuePctOfTotal: row.revenue ? Math.round((attachRevenue / row.revenue) * 1000) / 10 : 0,
        attachEbitdaPct: attachRevenue ? Math.round((totalEbitda / attachRevenue) * 1000) / 10 : 0,
      };
    });
  const buildDivisionRegionalTrendRows = (divisionLabel: string, metric: 'revenue' | 'ebitda' = 'revenue') => trendMonths.map((period, monthIndex) =>
    firmRegions.reduce<Record<string, number | string>>((row, region, regionIndex) => {
      const sourceRow = firmRegionRows.find((item) => item.division === divisionLabel && item.region === region);
      const monthlyBase = Number(sourceRow?.[metric] || 0) / 12;
      const growth = 1 + monthIndex * 0.007;
      const seasonality = 1 + Math.sin(monthIndex / 3 + regionIndex * 0.35) * 0.045;
      row[region] = Math.round(monthlyBase * growth * seasonality);
      return row;
    }, { period })
  );
  const buildAggregateRegionalTrendRows = (metric: 'revenue' | 'ebitda') => trendMonths.map((period, monthIndex) =>
    firmRegions.reduce<Record<string, number | string>>((row, region, regionIndex) => {
      const annualBase = firmRegionRows
        .filter((item) => item.region === region)
        .reduce((sum, item) => sum + Number(item[metric] || 0), 0);
      const growth = 1 + monthIndex * 0.007;
      const seasonality = 1 + Math.sin(monthIndex / 3 + regionIndex * 0.35) * 0.045;
      row[region] = Math.round((annualBase / 12) * growth * seasonality);
      return row;
    }, { period })
  );
  const regionalResidentialRealEstateTrendRows = buildDivisionRegionalTrendRows('Residential Real Estate');
  const regionalEbitdaTrendRows = buildAggregateRegionalTrendRows('ebitda');
  const regionalMortgageTrendRows = buildDivisionRegionalTrendRows('Mortgage');
  const regionalTitleCompanyTrendRows = buildDivisionRegionalTrendRows('Title Company');
  const regionalInsuranceServicesTrendRows = buildDivisionRegionalTrendRows('Insurance Services');
  const regionalCommercialRealEstateTrendRows = buildDivisionRegionalTrendRows('Commercial Real Estate');
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
    columns: Array<{ key: string; label: string; format?: (value: any) => string; width?: string }>,
    sortableTableKey = '',
  ) => {
    const isCompactTable = columns.length <= 5 || sortableTableKey === 'regionalMarketShare';
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
              <th key={column.key} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', width: column.width }}>
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
                <td key={column.key} style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', width: column.width }}>
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

  const renderFirmReportCard = (title: string, sectionKey: string, children: React.ReactNode, fullWidth = false, helpText = '', headerAction: React.ReactNode = null) => {
    if (!isOverviewReportEnabled(sectionKey)) return null;
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: fullWidth ? '1 / -1' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            {headerAction}
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
        </div>
        {children}
      </div>
    );
  };
  const renderRegionalTrendChart = (
    title: string,
    rows: Array<Record<string, number | string>>,
    valueFormatter: (value: any) => string,
  ) => renderFirmReportCard(title, 'realEstateExecutiveReport', (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" interval={5} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(value) => valueFormatter(value)} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: any, name: any) => [valueFormatter(value), String(name)]} />
          <Legend />
          {firmRegions.map((region, index) => (
            <Line
              key={region}
              type="monotone"
              dataKey={region}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2.5}
              name={region}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  ));
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
        <div
          className="ops-print-hide"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 14px',
            marginBottom: '18px',
            border: '1px solid #dbeafe',
            borderRadius: '12px',
            background: '#f8fafc',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reporting Period</div>
            <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 800 }}>
              {realEstateReportStartDate} to {realEstateReportEndDate}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              onClick={setRealEstateReportToLastMonth}
              style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '7px 10px', background: 'white', color: '#1e293b', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={setRealEstateReportToLastQuarter}
              style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '7px 10px', background: 'white', color: '#1e293b', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
            >
              Last Quarter
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '13px', fontWeight: 700 }}>
              From
              <input
                type="date"
                value={realEstateReportStartDate}
                onChange={(event) => setRealEstateReportStartDate(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '7px 9px', color: '#0f172a', fontSize: '13px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '13px', fontWeight: 700 }}>
              To
              <input
                type="date"
                value={realEstateReportEndDate}
                onChange={(event) => setRealEstateReportEndDate(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '7px 9px', color: '#0f172a', fontSize: '13px' }}
              />
            </label>
          </div>
        </div>

        {activeRealEstateExecutiveTab === 'executive' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Enterprise Executive Dashboard', 'realEstateExecutiveReport', (
              <>
                <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>As of {executiveAsOfDate}</p>
                {renderFirmTable(executiveScorecardRows, simpleColumns([
                  ['kpi', 'KPI'], ['mtd', 'MTD'], ['ytd', 'YTD'], ['budget', 'Budget'], ['priorYear', 'Prior Year'],
                ]))}
              </>
            ))}
            {renderFirmReportCard('Enterprise Value Creation Dashboard', 'realEstateExecutiveReport', renderFirmTable(enterpriseValueCreationRows, simpleColumns([
              ['metric', 'Metric'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'], ['forecast90', '90 Forecast'],
            ])))}
            {renderFirmReportCard('Revenue by Division', 'realEstateExecutiveReport', renderFirmTable(firmDivisions, divisionColumns, 'executiveRevenueByDivision'))}
            {renderFirmReportCard('Revenue by Region', 'realEstateExecutiveReport', renderFirmTable(regionalPerformanceRows, [
              { key: 'region', label: 'Region' },
              moneyColumn('revenue', 'Revenue'),
              moneyColumn('ebitda', 'EBITDA'),
              { key: 'marginPct', label: 'Margin %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
              { key: 'growthPct', label: 'Growth %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
            ], 'executiveRevenueByRegion'))}
            {renderFirmReportCard('Residential Real Estate Attach Rate', 'realEstateExecutiveReport', (
              renderFirmTable(regionAttachRowsWithTotal, simpleColumns([
                ['region', 'Region'], ['mortgagePct', 'Mortgage %'], ['titlePct', 'Title %'], ['insurancePct', 'Insurance %'],
              ]))
            ), false, 'This rolls attachment rates up by region, with Firm Total showing the overall company rate. It helps leadership see which regions are converting brokerage customers into mortgage, title, and insurance relationships.')}
            {renderFirmReportCard('Residential Real Estate Attach Revenue by Region', 'realEstateExecutiveReport', (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Show
                    <select
                      value={selectedAttachRevenueMetric}
                      onChange={(event) => setSelectedAttachRevenueMetric(event.target.value as 'revenue' | 'ebitda' | 'margin')}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      <option value="revenue">Attach Revenue</option>
                      <option value="ebitda">Attach EBITDA</option>
                      <option value="margin">Attach Margin %</option>
                    </select>
                  </label>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={residentialAttachRevenueChartRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => selectedAttachRevenueMetric === 'margin' ? `${Number(value).toFixed(0)}%` : `$${(Number(value) / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value: any) => selectedAttachRevenueMetric === 'margin' ? `${Number(value || 0).toFixed(1)}%` : formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Bar dataKey="mortgage" fill="#2563eb" name="Mortgage" />
                    <Bar dataKey="title" fill="#f97316" name="Title" />
                    <Bar dataKey="insurance" fill="#7c3aed" name="Insurance" />
                    <Bar dataKey="total" fill="#0f766e" name="Total" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ))}
            {renderFirmReportCard('Attach Rate by Office', 'realEstateExecutiveReport', (
              renderFirmTable(officeAttachRows, [
                { key: 'office', label: 'Office' },
                { key: 'mortgagePct', label: 'Mortgage %', format: (value: any) => `${Number(value || 0).toFixed(0)}%` },
                { key: 'titlePct', label: 'Title %', format: (value: any) => `${Number(value || 0).toFixed(0)}%` },
                { key: 'insurancePct', label: 'Insurance %', format: (value: any) => `${Number(value || 0).toFixed(0)}%` },
              ], 'attachRateByOffice')
            ), false, 'Each row shows the share of that office’s residential transactions that also used mortgage, title, or insurance services. Example: Office 01 at Mortgage 42% means 42% of Office 01 residential transactions also used the mortgage business.')}
            {renderFirmReportCard('Office Profitability Table', 'realEstateExecutiveReport', renderFirmTable(officeProfitabilityRows, [
              { key: 'office', label: 'Office' },
              moneyColumn('revenue', 'Revenue'),
              moneyColumn('ebitda', 'EBITDA'),
              { key: 'ebitdaPct', label: 'EBITDA %', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
            ], 'officeProfitability'))}
          </div>
        )}

        {activeRealEstateExecutiveTab === 'regional' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
            {renderFirmReportCard('Region Dashboard', 'realEstateExecutiveReport', renderFirmTable(executiveScorecardRows, simpleColumns([
              ['kpi', 'KPI'], ['mtd', 'MTD'], ['ytd', 'YTD'], ['budget', 'Budget'], ['priorYear', 'Prior Year'],
            ])), false, '', (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                Region
                <select
                  value={selectedRegionalDashboardRegion}
                  onChange={(event) => setSelectedRegionalDashboardRegion(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                >
                  {firmRegions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </label>
            ))}
            {renderFirmReportCard('Region Value Creation Dashboard', 'realEstateExecutiveReport', renderFirmTable(enterpriseValueCreationRows, simpleColumns([
              ['metric', 'Metric'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'], ['forecast90', '90 Forecast'],
            ])), false, '', (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                Region
                <select
                  value={selectedRegionalDashboardRegion}
                  onChange={(event) => setSelectedRegionalDashboardRegion(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                >
                  {firmRegions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </label>
            ))}
            {isOverviewReportEnabled('realEstateExecutiveReport') && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Attach Revenue by Office in Region</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                    Region
                    <select
                      value={selectedRegionalAttachOfficeRegion}
                      onChange={(event) => setSelectedRegionalAttachOfficeRegion(event.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                    >
                      {firmRegions.map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1080px' }}>
                    <thead>
                      <tr>
                        <th colSpan={3} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>Office Total</th>
                        <th colSpan={6} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #bfdbfe', background: '#eff6ff' }}>Attached Services</th>
                        <th colSpan={3} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#dbeafe' }}>Total Attached</th>
                      </tr>
                      <tr>
                        {[
                          'Office',
                          'Total Revenue',
                          'EBITDA %',
                          'Mortgage',
                          'EBITDA %',
                          'Title',
                          'EBITDA %',
                          'Insurance',
                          'EBITDA %',
                          'Revenue',
                          '% of Total',
                          'EBITDA %',
                        ].map((label, index) => (
                          <th key={`${label}-${index}`} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', borderLeft: index === 3 ? '3px solid #bfdbfe' : undefined, background: index >= 9 ? '#dbeafe' : index >= 3 ? '#eff6ff' : '#f8fafc' }}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attachRevenueByOfficeRows.map((row) => (
                        <tr key={row.office}>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>{row.office}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>{formatCurrency(row.totalRevenue)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9' }}>{row.totalEbitdaPct.toFixed(1)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', borderLeft: '3px solid #bfdbfe', background: '#f8fbff' }}>{formatCurrency(row.mortgage)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff' }}>{row.mortgageEbitdaPct.toFixed(1)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff' }}>{formatCurrency(row.title)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff' }}>{row.titleEbitdaPct.toFixed(1)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff' }}>{formatCurrency(row.insurance)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff' }}>{row.insuranceEbitdaPct.toFixed(1)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff', fontWeight: 800 }}>{formatCurrency(row.attachRevenue)}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff', fontWeight: 800 }}>{row.attachRevenuePctOfTotal.toFixed(1)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#334155', borderBottom: '1px solid #f1f5f9', background: '#f8fbff', fontWeight: 800 }}>{row.attachEbitdaPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {renderFirmReportCard('Regional Attach Rate Dashboard', 'realEstateExecutiveReport', (
              <div style={{ overflowX: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {['Region', 'Mortgage', 'Title', 'Insurance'].map((label) => (
                        <th key={label} style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {regionalAttachRateDashboardRows.map((row) => {
                      const isCompanyTotal = row.region === 'Company Total';
                      const cellColor = (key: 'mortgage' | 'title' | 'insurance') =>
                        !isCompanyTotal && row[key] < regionalAttachRateCompanyTotal[key] ? '#dc2626' : '#334155';
                      return (
                        <tr key={row.region}>
                          <td style={{ padding: '8px', fontSize: '13px', color: isCompanyTotal ? '#0f172a' : '#334155', fontWeight: isCompanyTotal ? 800 : 400, borderBottom: '1px solid #f1f5f9' }}>{row.region}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: cellColor('mortgage'), fontWeight: isCompanyTotal ? 800 : 400, borderBottom: '1px solid #f1f5f9' }}>{row.mortgage.toFixed(row.mortgage % 1 ? 1 : 0)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: cellColor('title'), fontWeight: isCompanyTotal ? 800 : 400, borderBottom: '1px solid #f1f5f9' }}>{row.title.toFixed(row.title % 1 ? 1 : 0)}%</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: cellColor('insurance'), fontWeight: isCompanyTotal ? 800 : 400, borderBottom: '1px solid #f1f5f9' }}>{row.insurance.toFixed(row.insurance % 1 ? 1 : 0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {renderFirmReportCard('Regional Productivity Report', 'realEstateExecutiveReport', renderFirmTable(regionalProductivityRows, [
              { key: 'region', label: 'Region' },
              moneyColumn('revenuePerOffice', 'Revenue / Office'),
              moneyColumn('revenuePerEmployee', 'Revenue / Employee'),
              moneyColumn('revenuePerAgent', 'Revenue / Agent'),
              { key: 'closingsPerAgent', label: 'Closings / Agent', format: (value: any) => Number(value || 0).toFixed(1) },
              moneyColumn('loanVolumePerLoanOfficer', 'Loan Volume / Loan Officer'),
            ]))}
            {renderFirmReportCard('Regional Market Share Report', 'realEstateExecutiveReport', renderFirmTable(marketShareRows.filter((row) => row.region === selectedRegionalMarketShareRegion), [
              { key: 'office', label: 'Office' },
              { key: 'region', label: 'Region' },
              { ...numberColumn('listings', 'Listings'), width: '72px' },
              { ...numberColumn('transactions', 'Transactions'), width: '96px' },
              moneyColumn('volume', 'Volume'),
              { key: 'marketSharePct', label: 'Market Share', format: (value: any) => `${Number(value || 0).toFixed(1)}%` },
            ], 'regionalMarketShare'), false, '', (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                Region
                <select
                  value={selectedRegionalMarketShareRegion}
                  onChange={(event) => setSelectedRegionalMarketShareRegion(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: 'white' }}
                >
                  {firmRegions.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </label>
            ))}
            {renderRegionalTrendChart('Residential Real Estate - 3 Year Monthly', regionalResidentialRealEstateTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
            {renderRegionalTrendChart('EBITDA - 3 Year Monthly', regionalEbitdaTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
            {renderRegionalTrendChart('Mortgage - 3 Year Monthly', regionalMortgageTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
            {renderRegionalTrendChart('Title Company - 3 Year Monthly', regionalTitleCompanyTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
            {renderRegionalTrendChart('Insurance Services - 3 Year Monthly', regionalInsuranceServicesTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
            {renderRegionalTrendChart('Commercial Real Estate - 3 Year Monthly', regionalCommercialRealEstateTrendRows, (value) => `$${(Number(value || 0) / 1000).toFixed(0)}K`)}
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
        {!(isRealEstateSector && activeRealEstateExecutiveTab === 'regional') && (
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
        )}
      </div>
    </div>
  );
}

