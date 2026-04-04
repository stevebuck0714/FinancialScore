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
}

const COLORS = ['#0f2b4b', '#1f4e79', '#2e6f9e', '#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const AGING_COLORS = ['#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const CUSTOMER_CHART_COLOR = COLORS[2];
const CASH_CHART_COLOR = COLORS[4];
const asList = <T = any,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
type Frequency = 'daily' | 'weekly' | 'monthly';
const asFrequency = (value: unknown): Frequency =>
  value === 'weekly' || value === 'monthly' ? value : 'daily';

export default function OpsDashboard({ selectedCompanyId, companyName, industrySectorCategory, activeModules, moduleTitlesByType }: OpsDashboardProps) {
  // Individual frequency state for each widget
  const [customerFreq, setCustomerFreq] = useState<Frequency>('daily');
  const [arFreq, setArFreq] = useState<Frequency>('daily');
  const [apFreq, setApFreq] = useState<Frequency>('daily');
  const [productFreq, setProductFreq] = useState<Frequency>('daily');
  const [inventoryFreq, setInventoryFreq] = useState<Frequency>('daily');
  const [cashFreq, setCashFreq] = useState<Frequency>('daily');

  // Data state for each widget
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [cashData, setCashData] = useState<any>(null);

  // Operational goals state
  const [operationalGoals, setOperationalGoals] = useState<any>({});
  
  // Loading states
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingAr, setLoadingAr] = useState(false);
  const [loadingAp, setLoadingAp] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingCash, setLoadingCash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);

  // Helper to get date range based on frequency
  const getDateRange = (frequency: Frequency) => {
    const end = new Date();
    const start = new Date();
    
    if (frequency === 'daily') {
      start.setDate(start.getDate() - 90);
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
  const formatDate = (dateString: string, frequency: Frequency) => {
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

  const normalizeWidgetOrder = (currentOrder: string[], availableIds: string[]) => {
    const filtered = currentOrder.filter((id) => availableIds.includes(id));
    const missing = availableIds.filter((id) => !filtered.includes(id));
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
          setWidgetOrder(asList(data?.preferences?.widgetOrder).filter((id: unknown) => typeof id === 'string'));
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

  // Frequency selector component
  const FrequencySelector = ({ value, onChange }: { value: Frequency, onChange: (v: Frequency) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(asFrequency(e.target.value))}
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
    const periodTrend = customerData.records.reduce((acc: any, record: any) => {
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
    return arData.records.map((record: any) => ({
      period: formatDate(record.snapshotDate, arFreq),
      totalAR: record.totalAR,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareApChartData = () => {
    if (!apData?.records) return [];
    return apData.records.map((record: any) => ({
      period: formatDate(record.snapshotDate, apFreq),
      totalAP: record.totalAP,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareProductChartData = () => {
    if (!productData?.records) return [];
    const periodTrend = productData.records.reduce((acc: any, record: any) => {
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
    const periodValue: any = {};
    inventoryData.records.forEach((record: any) => {
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
    const periodTrend = cashData.records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, cashFreq);
      if (!acc[period]) {
        acc[period] = { period, totalCash: 0 };
      }
      acc[period].totalCash += record.cashBalance;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const configuredModules = (activeModules || [])
    .map((module) => String(module || '').trim())
    .filter((module) => module && module.toLowerCase() !== 'ops-default');
  const hasConfiguredModules = configuredModules.length > 0;

  const modulesByType: Record<OpsDataType, string[]> = {
    customers: [],
    'ar-aging': [],
    'ap-aging': [],
    products: [],
    inventory: [],
    cash: [],
    'daily-financials': [],
  };

  configuredModules.forEach((module) => {
    const type = mapModuleToDataType(module);
    if (!type) return;
    const label = getModuleLabel(module);
    if (!modulesByType[type].includes(label)) modulesByType[type].push(label);
  });

  const customerLabels = hasConfiguredModules ? modulesByType.customers : ['Customer Sales'];
  const arLabels = hasConfiguredModules ? modulesByType['ar-aging'] : ['AR Aging'];
  const apLabels = hasConfiguredModules ? modulesByType['ap-aging'] : ['AP Aging'];
  const productLabels = hasConfiguredModules ? modulesByType.products : ['Product Sales'];
  const inventoryLabels = hasConfiguredModules ? modulesByType.inventory : ['Inventory'];
  const cashLabels = hasConfiguredModules ? modulesByType.cash : ['Cash Balance'];

  const showCustomerWidget = customerLabels.length > 0;
  const showArWidget = arLabels.length > 0;
  const showApWidget = apLabels.length > 0;
  const showProductWidget = productLabels.length > 0;
  const showInventoryWidget = inventoryLabels.length > 0;
  const showCashWidget = cashLabels.length > 0;

  const primaryLabelByType: Record<OpsDataType, string> = {
    customers: customerLabels[0] || 'Customer Sales',
    'ar-aging': arLabels[0] || 'AR Aging',
    'ap-aging': apLabels[0] || 'AP Aging',
    products: productLabels[0] || 'Product Sales',
    inventory: inventoryLabels[0] || 'Inventory',
    cash: cashLabels[0] || 'Cash Balance',
    'daily-financials': 'Daily Financials',
  };

  const extraWidgets: Array<{ type: OpsDataType; label: string }> = [
    ...customerLabels.slice(1).map((label) => ({ type: 'customers' as OpsDataType, label })),
    ...arLabels.slice(1).map((label) => ({ type: 'ar-aging' as OpsDataType, label })),
    ...apLabels.slice(1).map((label) => ({ type: 'ap-aging' as OpsDataType, label })),
    ...productLabels.slice(1).map((label) => ({ type: 'products' as OpsDataType, label })),
    ...inventoryLabels.slice(1).map((label) => ({ type: 'inventory' as OpsDataType, label })),
    ...cashLabels.slice(1).map((label) => ({ type: 'cash' as OpsDataType, label })),
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
                background: saving ? '#94a3b8' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.background = '#5568d3')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.background = '#667eea')}
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

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

