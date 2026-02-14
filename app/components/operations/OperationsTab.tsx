'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Package, DollarSign, Warehouse, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import OpsDashboard from './OpsDashboard';
import { getSectorArApFallbacks, getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';

interface OperationsTabProps {
  selectedCompanyId: string;
  companyName: string;
  industrySectorCategory?: string | null;
}

type OpTab = 'dashboard' | 'overview' | 'customers' | 'ar' | 'ap' | 'products' | 'inventory' | 'cash';

const COLORS = ['#0f2b4b', '#1f4e79', '#2e6f9e', '#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const AR_TREND_COLORS = ['#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const renderDonutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (!percent || percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: '11px', fontWeight: 700 }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};
const MOCK_AR_CUSTOMERS = [
  { customerName: 'Coastal Shipping', current: 6400, days1to30: 2100, days31to60: 1200, days61to90: 800, days90plus: 300 },
  { customerName: 'City Construction', current: 5200, days1to30: 1900, days31to60: 900, days61to90: 600, days90plus: 200 },
  { customerName: 'TechAdvantage Software', current: 4100, days1to30: 1600, days31to60: 800, days61to90: 400, days90plus: 150 },
  { customerName: 'Urban Apparel', current: 3600, days1to30: 1200, days31to60: 700, days61to90: 300, days90plus: 120 },
  { customerName: 'Global Exports Co.', current: 2800, days1to30: 900, days31to60: 500, days61to90: 300, days90plus: 100 },
  { customerName: 'Green Gardens', current: 2400, days1to30: 800, days31to60: 400, days61to90: 200, days90plus: 80 },
  { customerName: 'Innovative Tech', current: 2200, days1to30: 700, days31to60: 350, days61to90: 180, days90plus: 70 },
  { customerName: 'Solar Solutions', current: 2000, days1to30: 600, days31to60: 300, days61to90: 160, days90plus: 60 },
  { customerName: 'Summit Logistics', current: 1800, days1to30: 520, days31to60: 260, days61to90: 140, days90plus: 50 },
  { customerName: 'Northern Foods', current: 1600, days1to30: 480, days31to60: 220, days61to90: 120, days90plus: 40 },
  { customerName: 'Fieldstone Partners', current: 1500, days1to30: 430, days31to60: 210, days61to90: 110, days90plus: 35 },
  { customerName: 'Blue Ridge Energy', current: 1400, days1to30: 400, days31to60: 200, days61to90: 100, days90plus: 30 }
];
const MOCK_UNPAID_INVOICES = [
  { customerName: 'Global Exports Co.', customerNumber: '1049', invoiceDate: 'Dec 3, 2025', dueDate: 'Jan 2, 2026', amountDue: 3593.75 },
  { customerName: 'Coastal Shipping', customerNumber: '1015', invoiceDate: 'Nov 8, 2025', dueDate: 'Dec 8, 2025', amountDue: 3508.15 },
  { customerName: 'Coastal Shipping', customerNumber: '1031', invoiceDate: 'Nov 12, 2025', dueDate: 'Dec 12, 2025', amountDue: 3095.56 },
  { customerName: 'Urban Apparel', customerNumber: '1083', invoiceDate: 'Nov 15, 2025', dueDate: 'Dec 15, 2025', amountDue: 2821.48 },
  { customerName: 'Green Gardens', customerNumber: '1055', invoiceDate: 'Oct 24, 2025', dueDate: 'Dec 8, 2025', amountDue: 2469.0 },
  { customerName: 'TechAdvantage Software', customerNumber: '1092', invoiceDate: 'Nov 18, 2025', dueDate: 'Dec 18, 2025', amountDue: 2187.32 },
  { customerName: 'City Construction', customerNumber: '1024', invoiceDate: 'Nov 21, 2025', dueDate: 'Dec 21, 2025', amountDue: 1975.4 },
  { customerName: 'Solar Solutions', customerNumber: '1107', invoiceDate: 'Nov 29, 2025', dueDate: 'Dec 29, 2025', amountDue: 1820.0 },
  { customerName: 'Summit Logistics', customerNumber: '1079', invoiceDate: 'Dec 1, 2025', dueDate: 'Jan 1, 2026', amountDue: 1654.9 },
  { customerName: 'Northern Foods', customerNumber: '1066', invoiceDate: 'Dec 4, 2025', dueDate: 'Jan 4, 2026', amountDue: 1525.0 },
  { customerName: 'Fieldstone Partners', customerNumber: '1112', invoiceDate: 'Dec 6, 2025', dueDate: 'Jan 6, 2026', amountDue: 1410.5 },
  { customerName: 'Blue Ridge Energy', customerNumber: '1120', invoiceDate: 'Dec 7, 2025', dueDate: 'Jan 7, 2026', amountDue: 1320.25 }
];
const MOCK_PAID_INVOICES = [
  { customerName: 'Coastal Shipping', currentMonth: 1437, lastMonth: 4917.78, last12Months: 28240.74 },
  { customerName: 'Innovative Tech', currentMonth: 1350, lastMonth: 0, last12Months: 25699.0 },
  { customerName: 'Green Gardens', currentMonth: 7545, lastMonth: 0, last12Months: 21637.0 },
  { customerName: 'TechAdvantage Software', currentMonth: 0, lastMonth: 0, last12Months: 20650.0 },
  { customerName: 'Solar Solutions', currentMonth: 0, lastMonth: 0, last12Months: 19008.0 },
  { customerName: 'Urban Apparel', currentMonth: 0, lastMonth: 2821.48, last12Months: 15517.04 },
  { customerName: 'City Construction', currentMonth: 0, lastMonth: 0, last12Months: 12900.0 },
  { customerName: 'Global Exports Co.', currentMonth: 0, lastMonth: 0, last12Months: 11850.0 },
  { customerName: 'Summit Logistics', currentMonth: 980, lastMonth: 0, last12Months: 10240.0 },
  { customerName: 'Northern Foods', currentMonth: 0, lastMonth: 1420.0, last12Months: 9840.0 }
];
const MOCK_CUSTOMER_INVOICES = [
  { customerName: 'Urban Apparel', invoiceNo: '1030', date: 'Jan 3, 2026', dueDate: 'Feb 2, 2026', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1062', date: 'Dec 18, 2025', dueDate: 'Jan 17, 2026', currency: 'USD', amountCurrency: 5783, amountHome: 4283.7, amountDueHome: 4283.7 },
  { customerName: 'Urban Apparel', invoiceNo: '1083', date: 'Nov 15, 2025', dueDate: 'Dec 15, 2025', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 2821.48 },
  { customerName: 'Urban Apparel', invoiceNo: '1022', date: 'Oct 5, 2025', dueDate: 'Nov 4, 2025', currency: 'USD', amountCurrency: 211, amountHome: 156.3, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1020', date: 'Sep 27, 2025', dueDate: 'Oct 27, 2025', currency: 'USD', amountCurrency: 363, amountHome: 268.89, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1034', date: 'Sep 16, 2025', dueDate: 'Oct 16, 2025', currency: 'USD', amountCurrency: 5783, amountHome: 4283.7, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1050', date: 'Aug 24, 2025', dueDate: 'Sep 23, 2025', currency: 'USD', amountCurrency: 211, amountHome: 156.3, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1058', date: 'Aug 7, 2025', dueDate: 'Sep 6, 2025', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1009', date: 'Jun 1, 2025', dueDate: 'Jul 1, 2025', currency: 'USD', amountCurrency: 449, amountHome: 332.59, amountDueHome: 0 },
  { customerName: 'Urban Apparel', invoiceNo: '1048', date: 'May 16, 2025', dueDate: 'Jun 15, 2025', currency: 'USD', amountCurrency: 363, amountHome: 268.89, amountDueHome: 0 }
];
const TOP_CUSTOMERS_OVERRIDE = [
  { name: 'GlobalTech Industries', totalRevenue: 312509 },
  { name: 'Smith & Associates', totalRevenue: 191948 },
  { name: 'Premier Solutions LLC', totalRevenue: 184322 },
  { name: 'Acme Corporation', totalRevenue: 162950 },
  { name: 'Regional Services Inc', totalRevenue: 132784 },
  { name: 'Harbor Industrial', totalRevenue: 117800 }
];
const OTHER_CUSTOMERS_OVERRIDE = [
  { name: 'Evergreen Supply Co.', totalRevenue: 74200 },
  { name: 'Summit Equipment', totalRevenue: 68950 },
  { name: 'Valley Precision', totalRevenue: 65500 },
  { name: 'Northwind Parts', totalRevenue: 61200 },
  { name: 'Brightline Services', totalRevenue: 58400 }
];
const MOCK_AP_VENDORS = [
  { vendorName: 'Blue Ridge Materials', current: 5200, days1to30: 1800, days31to60: 900, days61to90: 600, days90plus: 300 },
  { vendorName: 'Summit Logistics', current: 4300, days1to30: 1500, days31to60: 800, days61to90: 500, days90plus: 200 },
  { vendorName: 'Northstar Energy', current: 3900, days1to30: 1200, days31to60: 700, days61to90: 400, days90plus: 150 },
  { vendorName: 'Precision Hardware', current: 3600, days1to30: 1100, days31to60: 650, days61to90: 350, days90plus: 120 },
  { vendorName: 'Greenline Supplies', current: 3200, days1to30: 980, days31to60: 540, days61to90: 280, days90plus: 100 },
  { vendorName: 'Atlas Services', current: 2800, days1to30: 860, days31to60: 460, days61to90: 240, days90plus: 90 },
  { vendorName: 'Pioneer Freight', current: 2600, days1to30: 780, days31to60: 420, days61to90: 220, days90plus: 80 },
  { vendorName: 'Delta Packaging', current: 2400, days1to30: 720, days31to60: 390, days61to90: 200, days90plus: 70 },
  { vendorName: 'Canyon Utilities', current: 2200, days1to30: 650, days31to60: 350, days61to90: 180, days90plus: 60 },
  { vendorName: 'Stonebridge Rentals', current: 2000, days1to30: 600, days31to60: 320, days61to90: 160, days90plus: 50 }
];
const MOCK_UNPAID_BILLS = [
  { vendorName: 'Blue Ridge Materials', billNo: 'B-2049', date: 'Dec 3, 2025', dueDate: 'Jan 2, 2026', amountDue: 3593.75 },
  { vendorName: 'Summit Logistics', billNo: 'B-2015', date: 'Nov 8, 2025', dueDate: 'Dec 8, 2025', amountDue: 3508.15 },
  { vendorName: 'Summit Logistics', billNo: 'B-2031', date: 'Nov 12, 2025', dueDate: 'Dec 12, 2025', amountDue: 3095.56 },
  { vendorName: 'Precision Hardware', billNo: 'B-2083', date: 'Nov 15, 2025', dueDate: 'Dec 15, 2025', amountDue: 2821.48 },
  { vendorName: 'Greenline Supplies', billNo: 'B-2055', date: 'Oct 24, 2025', dueDate: 'Dec 8, 2025', amountDue: 2469.0 },
  { vendorName: 'Atlas Services', billNo: 'B-2092', date: 'Nov 18, 2025', dueDate: 'Dec 18, 2025', amountDue: 2187.32 },
  { vendorName: 'Northstar Energy', billNo: 'B-2024', date: 'Nov 21, 2025', dueDate: 'Dec 21, 2025', amountDue: 1975.4 },
  { vendorName: 'Delta Packaging', billNo: 'B-2107', date: 'Nov 29, 2025', dueDate: 'Dec 29, 2025', amountDue: 1820.0 },
  { vendorName: 'Pioneer Freight', billNo: 'B-2079', date: 'Dec 1, 2025', dueDate: 'Jan 1, 2026', amountDue: 1654.9 },
  { vendorName: 'Canyon Utilities', billNo: 'B-2066', date: 'Dec 4, 2025', dueDate: 'Jan 4, 2026', amountDue: 1525.0 }
];
const MOCK_PAID_BILLS = [
  { vendorName: 'Blue Ridge Materials', currentMonth: 1832, lastMonth: 4210.4, last12Months: 24510.2 },
  { vendorName: 'Summit Logistics', currentMonth: 1520, lastMonth: 0, last12Months: 22340.0 },
  { vendorName: 'Northstar Energy', currentMonth: 0, lastMonth: 0, last12Months: 19870.5 },
  { vendorName: 'Precision Hardware', currentMonth: 0, lastMonth: 2480.5, last12Months: 17560.2 },
  { vendorName: 'Greenline Supplies', currentMonth: 0, lastMonth: 0, last12Months: 16240.0 },
  { vendorName: 'Atlas Services', currentMonth: 0, lastMonth: 1860.0, last12Months: 14890.0 },
  { vendorName: 'Pioneer Freight', currentMonth: 980, lastMonth: 0, last12Months: 13240.0 },
  { vendorName: 'Delta Packaging', currentMonth: 0, lastMonth: 1420.0, last12Months: 11890.0 }
];
const MOCK_VENDOR_BILLS = [
  { vendorName: 'Greenline Supplies', billNo: 'V-1030', date: 'Jan 3, 2026', dueDate: 'Feb 2, 2026', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1062', date: 'Dec 18, 2025', dueDate: 'Jan 17, 2026', currency: 'USD', amountCurrency: 5783, amountHome: 4283.7, amountDueHome: 4283.7 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1083', date: 'Nov 15, 2025', dueDate: 'Dec 15, 2025', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 2821.48 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1022', date: 'Oct 5, 2025', dueDate: 'Nov 4, 2025', currency: 'USD', amountCurrency: 211, amountHome: 156.3, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1020', date: 'Sep 27, 2025', dueDate: 'Oct 27, 2025', currency: 'USD', amountCurrency: 363, amountHome: 268.89, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1034', date: 'Sep 16, 2025', dueDate: 'Oct 16, 2025', currency: 'USD', amountCurrency: 5783, amountHome: 4283.7, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1050', date: 'Aug 24, 2025', dueDate: 'Sep 23, 2025', currency: 'USD', amountCurrency: 211, amountHome: 156.3, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1058', date: 'Aug 7, 2025', dueDate: 'Sep 6, 2025', currency: 'USD', amountCurrency: 3809, amountHome: 2821.48, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1009', date: 'Jun 1, 2025', dueDate: 'Jul 1, 2025', currency: 'USD', amountCurrency: 449, amountHome: 332.59, amountDueHome: 0 },
  { vendorName: 'Greenline Supplies', billNo: 'V-1048', date: 'May 16, 2025', dueDate: 'Jun 15, 2025', currency: 'USD', amountCurrency: 363, amountHome: 268.89, amountDueHome: 0 }
];
const LEGACY_MOCKS_FOR_REFERENCE = [
  MOCK_AR_CUSTOMERS,
  MOCK_UNPAID_INVOICES,
  MOCK_PAID_INVOICES,
  MOCK_CUSTOMER_INVOICES,
  MOCK_AP_VENDORS,
  MOCK_UNPAID_BILLS,
  MOCK_PAID_BILLS,
  MOCK_VENDOR_BILLS,
];
void LEGACY_MOCKS_FOR_REFERENCE;

export default function OperationsTab({ selectedCompanyId, companyName, industrySectorCategory }: OperationsTabProps) {
  const [activeTab, setActiveTab] = useState<OpTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [cashData, setCashData] = useState<any>(null);
  const [arSummaryPage, setArSummaryPage] = useState(1);
  const [unpaidInvoicesPage, setUnpaidInvoicesPage] = useState(1);
  const [customerInvoicePage, setCustomerInvoicePage] = useState(1);
  const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState('All');
  const [apSummaryPage, setApSummaryPage] = useState(1);
  const [unpaidBillsPage, setUnpaidBillsPage] = useState(1);
  const [vendorBillsPage, setVendorBillsPage] = useState(1);
  const [selectedVendorBill, setSelectedVendorBill] = useState('All');
  const [demandSortKey, setDemandSortKey] = useState<'customer' | 'bookingsMtd' | 'bookingsQtd' | 'bookingsYtd' | 'backlogTotal' | 'backlog60' | 'shareBacklog' | 'trend'>('backlogTotal');
  const [demandSortDir, setDemandSortDir] = useState<'asc' | 'desc'>('desc');
  const [opsSectorLayoutConfig, setOpsSectorLayoutConfig] = useState<any | null>(null);
  
  // Date range and frequency filters
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    // Default to 12 months ago for monthly view
    date.setMonth(date.getMonth() - 12);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const normalizeModuleToTab = (moduleId: string): OpTab | null => {
    const m = String(moduleId || '').trim().toLowerCase();
    if (!m) return null;

    if (m === 'customers' || m === 'customers_accounts' || m === 'customers_members' || m === 'clients_customers' || m === 'tenants_customers' || m === 'guests_customers' || m === 'customers_sites' || m === 'payors_customers') return 'customers';
    if (m === 'ar' || m === 'billing_ar' || m === 'ar_receipts' || m === 'receivables') return 'ar';
    if (m === 'ap' || m === 'payables') return 'ap';
    if (m === 'products' || m === 'products_skus' || m === 'products_assortment' || m === 'offerings' || m === 'service_catalog') return 'products';
    if (m === 'inventory') return 'inventory';
    if (m === 'cash' || m === 'cash_liquidity') return 'cash';

    // Route additional sector buckets to the closest existing widget.
    if (m === 'sales' || m === 'orders_sales' || m === 'sales_transactions' || m === 'sales_pipeline' || m === 'backlog_sales' || m === 'leasing_sales' || m === 'ticketing_sales') return 'customers';
    if (m === 'production' || m === 'demand_usage' || m === 'projects_wip' || m === 'work_orders_service_delivery' || m === 'patients_encounters' || m === 'events_programming' || m === 'jobs_work_orders') return 'products';

    return null;
  };

  const orderedContentTabs: OpTab[] = ['customers', 'ar', 'ap', 'products', 'inventory', 'cash'];
  const layoutModules: string[] = Array.isArray(opsSectorLayoutConfig?.modules) ? opsSectorLayoutConfig.modules : [];
  const layoutTabs = Array.from(
    new Set(layoutModules.map(normalizeModuleToTab).filter((tab): tab is OpTab => Boolean(tab)))
  ).filter((tab) => orderedContentTabs.includes(tab));

  const sectorTabs = Array.from(
    new Set(
      getTopLineBucketsForSector(industrySectorCategory)
        .map((bucket) => normalizeModuleToTab(bucket.key))
        .filter((tab): tab is OpTab => Boolean(tab))
    )
  ).filter((tab) => orderedContentTabs.includes(tab));

  const resolvedContentTabs =
    layoutTabs.length > 0 ? orderedContentTabs.filter((tab) => layoutTabs.includes(tab)) :
    sectorTabs.length > 0 ? orderedContentTabs.filter((tab) => sectorTabs.includes(tab)) :
    orderedContentTabs;

  const availableTabs: OpTab[] = ['dashboard', 'overview', ...resolvedContentTabs];

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    loadSummary();
  }, [selectedCompanyId, industrySectorCategory]);

  useEffect(() => {
    if (!industrySectorCategory) {
      setOpsSectorLayoutConfig(null);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/ops-sector-layouts?sectorCategory=${industrySectorCategory}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        setOpsSectorLayoutConfig(data?.config?.config || null);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('Failed to load ops sector layout config:', error);
        }
      });

    return () => controller.abort();
  }, [industrySectorCategory]);

  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'dashboard') {
      loadTabData(activeTab);
    }
  }, [activeTab, selectedCompanyId, industrySectorCategory, frequency, startDate, endDate]);

  // Auto-adjust date range when frequency changes
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    
    if (frequency === 'daily') {
      start.setDate(start.getDate() - 90);
    } else if (frequency === 'weekly') {
      start.setDate(start.getDate() - (16 * 7)); // 16 weeks
    } else {
      start.setMonth(start.getMonth() - 12); // 12 months
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, [frequency]);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      const response = await fetch(`/api/operational-data?${params}`);
      if (!response.ok) throw new Error('Failed to load operational data');
      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      // Map tab names to API type parameter
      const typeMap: Record<string, string> = {
        'customers': 'customers',
        'ar': 'ar-aging',
        'ap': 'ap-aging',
        'products': 'products',
        'inventory': 'inventory',
        'cash': 'cash'
      };
      
      const type = typeMap[tab];
      if (!type) {
        setLoading(false);
        return;
      }
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type,
        frequency,
        startDate,
        endDate,
        ...(industrySectorCategory ? { sectorCategory: industrySectorCategory } : {}),
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      if (!response.ok) throw new Error(`Failed to load ${type} data`);
      const data = await response.json();
      
      switch (tab) {
        case 'customers':
          setCustomerData(data);
          break;
        case 'ar':
          setArData(data);
          break;
        case 'ap':
          setApData(data);
          break;
        case 'products':
          setProductData(data);
          break;
        case 'inventory':
          setInventoryData(data);
          break;
        case 'cash':
          setCashData(data);
          break;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  const formatCurrencyWithCents = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };
  const formatForeignCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Format based on frequency
    if (frequency === 'daily') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (frequency === 'weekly') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    }
  };

  const renderFilters = () => {
    if (activeTab === 'overview' || activeTab === 'dashboard') return null;

    return (
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 24px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Frequency Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            Frequency:
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as any)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b',
              cursor: 'pointer',
              background: 'white'
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {/* Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        {/* Quick Date Range Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          {frequency === 'daily' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - 30);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 30 Days
              </button>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - 90);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 90 Days
              </button>
            </>
          )}
          {frequency === 'weekly' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - (8 * 7)); // 8 weeks
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 8 Weeks
              </button>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - (16 * 7)); // 16 weeks
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 16 Weeks
              </button>
            </>
          )}
          {frequency === 'monthly' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setMonth(start.getMonth() - 6);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 6 Months
              </button>
              <button
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setMonth(start.getMonth() - 12);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Last 12 Months
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Overview Tab
  const renderOverview = () => (
    <div style={{ padding: '16px 24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
        Operational Data Overview
      </h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Loading operational data...
        </div>
      )}

      {error && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          marginBottom: '24px'
        }}>
          <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
          <span style={{ color: '#dc2626' }}>{error}</span>
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('customers')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#dbeafe', padding: '8px', borderRadius: '6px' }}>
                <Users style={{ width: '20px', height: '20px', color: '#2563eb' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Customer Sales</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.customerSalesRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Sales records tracked</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('ar')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '6px' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: '#16a34a' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>AR Aging</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.arAgingRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Monthly snapshots</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('ap')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
                <DollarSign style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>AP Aging</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.apAgingRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Monthly snapshots</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('products')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#fce7f3', padding: '8px', borderRadius: '6px' }}>
                <Package style={{ width: '20px', height: '20px', color: '#ec4899' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Product Sales</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.productSalesRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Product records</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('inventory')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#e0e7ff', padding: '8px', borderRadius: '6px' }}>
                <Warehouse style={{ width: '20px', height: '20px', color: '#6366f1' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Inventory</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.inventoryRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Inventory records</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('cash')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#d1fae5', padding: '8px', borderRadius: '6px' }}>
                <DollarSign style={{ width: '20px', height: '20px', color: '#10b981' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Cash</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.cashRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Cash snapshots</p>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        background: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        borderRadius: '8px', 
        padding: '16px' 
      }}>
        <h3 style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
          About Operational Data
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              📊 Customer Analytics
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Track customer revenue trends, invoice patterns, and identify your top customers and revenue concentration.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              💰 AR & AP Aging
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Monitor accounts receivable and payable aging to optimize cash flow and working capital management.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              📦 Product Performance
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Analyze product sales, margins, and trends to identify your best performers and optimization opportunities.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              🏭 Inventory Management
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Track inventory levels, values, and turnover to optimize stock levels and reduce carrying costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Customer Analytics Tab
  const renderCustomers = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading customer data...</div>;
    }

    if (!customerData) return null;

    const { records, summary } = customerData;

    // Aggregate data by period for trend chart
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!acc[period]) {
        acc[period] = { month: period, revenue: 0, invoices: 0 };
      }
      acc[period].revenue += record.revenue;
      acc[period].invoices += record.invoiceCount;
      return acc;
    }, {});

    const trendData = Object.values(periodTrend);

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Customer Sales Analytics
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Customers</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.topCustomers.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.topCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0))}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Invoices</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {summary.topCustomers.reduce((sum: number, c: any) => sum + c.totalInvoices, 0)}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings</div>
            <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>MTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(420000)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>QTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(1260000)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>YTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(4860000)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Backlog $</div>
            <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(2840000)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 30</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(940000)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 60</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(1120000)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 90</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(780000)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Backlog concentration</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
              Top 5 customers = 56.8%
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings trend (3-month slope)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>+${formatCurrency(420000).replace('$', '')}/mo</span>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>↑</span>
            </div>
          </div>
        </div>

        {(() => {
          const fillNeeded = Math.max(0, 10 - TOP_CUSTOMERS_OVERRIDE.length);
          const filler = OTHER_CUSTOMERS_OVERRIDE.slice(0, fillNeeded);
          const topTen = [...TOP_CUSTOMERS_OVERRIDE, ...filler].map((customer) => {
            const bookingsYtd = customer.totalRevenue;
            const bookingsQtd = Math.round(bookingsYtd * 0.34);
            const bookingsMtd = Math.round(bookingsQtd * 0.45);
            const backlogTotal = Math.round(bookingsYtd * 0.58);
            const backlog30 = Math.round(backlogTotal * 0.32);
            const backlog60 = Math.round(backlogTotal * 0.38);
            const backlog90 = Math.max(0, backlogTotal - backlog30 - backlog60);
            const trend = Math.round((bookingsMtd - bookingsQtd / 3) / 1000);
            return {
              customerName: customer.name,
              bookingsMtd,
              bookingsQtd,
              bookingsYtd,
              backlogTotal,
              backlog30,
              backlog60,
              backlog90,
              trend
            };
          });
          const remainingOthers = OTHER_CUSTOMERS_OVERRIDE.slice(fillNeeded);
          const otherAggregate = remainingOthers.reduce(
            (acc, customer) => {
              acc.bookingsYtd += customer.totalRevenue;
              return acc;
            },
            { bookingsYtd: 0 }
          );
          const allOther = {
            customerName: 'All other',
            bookingsYtd: otherAggregate.bookingsYtd,
            bookingsQtd: Math.round(otherAggregate.bookingsYtd * 0.34),
            bookingsMtd: Math.round(otherAggregate.bookingsYtd * 0.15),
            backlogTotal: Math.round(otherAggregate.bookingsYtd * 0.58),
            backlog30: Math.round(otherAggregate.bookingsYtd * 0.19),
            backlog60: Math.round(otherAggregate.bookingsYtd * 0.22),
            backlog90: Math.round(otherAggregate.bookingsYtd * 0.17),
            trend: Math.round(otherAggregate.bookingsYtd * 0.01 / 1000)
          };
          const demandRows = [...topTen, allOther];
          const backlogTotalAll = demandRows.reduce((sum, row) => sum + row.backlogTotal, 0);
          const sortedRows = [...demandRows].sort((a, b) => {
            const dir = demandSortDir === 'asc' ? 1 : -1;
            switch (demandSortKey) {
              case 'customer':
                return a.customerName.localeCompare(b.customerName) * dir;
              case 'bookingsMtd':
                return (a.bookingsMtd - b.bookingsMtd) * dir;
              case 'bookingsQtd':
                return (a.bookingsQtd - b.bookingsQtd) * dir;
              case 'bookingsYtd':
                return (a.bookingsYtd - b.bookingsYtd) * dir;
              case 'backlog60':
                return (a.backlog60 - b.backlog60) * dir;
              case 'shareBacklog':
                return ((a.backlogTotal / backlogTotalAll) - (b.backlogTotal / backlogTotalAll)) * dir;
              case 'trend':
                return (a.trend - b.trend) * dir;
              case 'backlogTotal':
              default:
                return (a.backlogTotal - b.backlogTotal) * dir;
            }
          });
          const handleSort = (key: typeof demandSortKey) => {
            if (demandSortKey === key) {
              setDemandSortDir(demandSortDir === 'asc' ? 'desc' : 'asc');
            } else {
              setDemandSortKey(key);
              setDemandSortDir('desc');
            }
          };
          return (
            <div style={{ background: 'white', padding: '16px 20px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                  Top Customers Driving Demand
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Default: Top 10 + All other</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th onClick={() => handleSort('customer')} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Customer</th>
                      <th onClick={() => handleSort('bookingsMtd')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Bookings MTD</th>
                      <th onClick={() => handleSort('bookingsQtd')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Bookings QTD</th>
                      <th onClick={() => handleSort('bookingsYtd')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Bookings YTD</th>
                      <th onClick={() => handleSort('backlogTotal')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Backlog total</th>
                      <th onClick={() => handleSort('backlog60')} style={{ textAlign: 'center', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Backlog due 30/60/90</th>
                      <th onClick={() => handleSort('shareBacklog')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Share of backlog %</th>
                      <th onClick={() => handleSort('trend')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Bookings trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const backlogTotal = Math.max(1, row.backlogTotal);
                      const backlog30Pct = (row.backlog30 / backlogTotal) * 100;
                      const backlog60Pct = (row.backlog60 / backlogTotal) * 100;
                      const backlog90Pct = 100 - backlog30Pct - backlog60Pct;
                      const sharePct = backlogTotalAll ? (row.backlogTotal / backlogTotalAll) * 100 : 0;
                      return (
                        <tr key={row.customerName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.bookingsMtd)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.bookingsQtd)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.bookingsYtd)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.backlogTotal)}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <div style={{ display: 'flex', height: '8px', width: '100%', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0' }}>
                              <div style={{ width: `${backlog30Pct}%`, background: AR_TREND_COLORS[0] }} title={`30: ${formatCurrency(row.backlog30)}`} />
                              <div style={{ width: `${backlog60Pct}%`, background: AR_TREND_COLORS[1] }} title={`60: ${formatCurrency(row.backlog60)}`} />
                              <div style={{ width: `${backlog90Pct}%`, background: AR_TREND_COLORS[2] }} title={`90: ${formatCurrency(row.backlog90)}`} />
                            </div>
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{sharePct.toFixed(1)}%</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: row.trend >= 0 ? '#16a34a' : '#ef4444', textAlign: 'right', fontWeight: 600 }}>
                            {row.trend >= 0 ? '+' : '-'}${Math.abs(row.trend)}k/mo
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {(() => {
          const tableCustomers = TOP_CUSTOMERS_OVERRIDE.map((customer) => ({
            ...customer,
            totalInvoices: Math.max(1, Math.round(customer.totalRevenue / 10000))
          }));
          const chartCustomers = tableCustomers;
          const chartTotal = chartCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0);
          const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
            const radius = outerRadius + 16;
            const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
            const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
            return (
              <text
                x={x}
                y={y}
                fill="#475569"
                textAnchor={x > cx ? 'start' : 'end'}
                dominantBaseline="central"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {`${(percent * 100).toFixed(1)}%`}
              </text>
            );
          };
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Top Customers Table */}
              <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
                  Top Customers by Revenue
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Rank</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Customer</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Total Revenue</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Invoices</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Avg Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableCustomers.map((customer: any, index: number) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b' }}>#{index + 1}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{customer.name}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                            {formatCurrency(customer.totalRevenue)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b', textAlign: 'right' }}>{customer.totalInvoices}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b', textAlign: 'right' }}>
                            {formatCurrency(customer.totalRevenue / customer.totalInvoices)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Customer Revenue Distribution Chart */}
              <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
                  Revenue Distribution by Customer
                </h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ flex: 1.4 }}>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={chartCustomers}
                          cx="50%"
                          cy="50%"
                        labelLine={true}
                        label={renderPieLabel}
                          outerRadius={115}
                          fill="#8884d8"
                          dataKey="totalRevenue"
                        >
                          {chartCustomers.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 0.8, display: 'grid', gap: '6px' }}>
                    {chartCustomers.map((entry: any, index: number) => (
                      <div key={`legend-${entry.name}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                        <span style={{ fontSize: '12px', color: '#475569' }}>{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // AR Aging Tab
  const renderARaging = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading AR data...</div>;
    }

    if (!arData) return null;

    const { records, summary } = arData;
    const sectorFallback = getSectorArApFallbacks(industrySectorCategory);
    const latestRecord = records[0];
    const arCustomers = (summary?.breakdown || summary?.unpaidByCustomer || sectorFallback.unpaidByCustomer).map((row: any) => ({
      customerName: row.customerName || row.name,
      current: row.current || 0,
      days1to30: row.days1to30 || 0,
      days31to60: row.days31to60 || 0,
      days61to90: row.days61to90 || 0,
      days90plus: row.days90plus || 0,
      totalDue: row.totalDue || row.total || (row.current || 0) + (row.days1to30 || 0) + (row.days31to60 || 0) + (row.days61to90 || 0) + (row.days90plus || 0),
    }));
    const unpaidByCustomer = arCustomers
      .map((row) => ({ customerName: row.customerName, totalDue: row.totalDue }))
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 10);
    const unpaidTotal = unpaidByCustomer.reduce((sum, item) => sum + item.totalDue, 0);
    const invoices = (summary?.unpaidInvoices || sectorFallback.unpaidInvoices).map((row: any) => ({
      customerName: row.customerName || row.customer,
      customerNumber: row.customerNumber || row.customerId || row.customerNo || '-',
      invoiceDate: row.invoiceDate || row.date,
      dueDate: row.dueDate,
      amountDue: row.amountDue || row.balance || 0,
    }));
    const paidByCustomer = (summary?.paidInvoices || sectorFallback.paidInvoices)
      .map((row: any) => ({
        customerName: row.customerName || row.customer,
        currentMonth: row.currentMonth || 0,
        lastMonth: row.lastMonth || 0,
        last12Months: row.last12Months || 0,
      }))
      .sort((a: any, b: any) => b.last12Months - a.last12Months)
      .slice(0, 10);
    const paidTotal = paidByCustomer.reduce((sum: number, item: any) => sum + item.last12Months, 0);
    const customerInvoiceRows = (summary?.customerInvoices || sectorFallback.customerInvoices).map((row: any) => ({
      customerName: row.customerName || row.customer,
      invoiceNo: row.invoiceNo || row.invoiceNumber,
      date: row.date,
      dueDate: row.dueDate,
      currency: 'USD',
      amountCurrency: row.amountCurrency || row.amount || 0,
      amountHome: row.amountHome || row.amountHomeCurrency || 0,
      amountDueHome: row.amountDueHome || row.amountDue || 0,
    }));
    const customerOptions = Array.from(new Set(customerInvoiceRows.map((row) => row.customerName))).sort();
    const filteredCustomerInvoices =
      selectedInvoiceCustomer === 'All'
        ? customerInvoiceRows
        : customerInvoiceRows.filter((row) => row.customerName === selectedInvoiceCustomer);
    const customerInvoicePageSize = 50;
    const customerInvoiceTotalPages = Math.max(1, Math.ceil(filteredCustomerInvoices.length / customerInvoicePageSize));
    const customerInvoiceSlice = filteredCustomerInvoices.slice(
      (customerInvoicePage - 1) * customerInvoicePageSize,
      customerInvoicePage * customerInvoicePageSize
    );
    const invoiceTotals = filteredCustomerInvoices.reduce(
      (acc, row) => {
        acc.amountCurrency += row.amountCurrency;
        acc.amountHome += row.amountHome;
        acc.amountDueHome += row.amountDueHome;
        return acc;
      },
      { amountCurrency: 0, amountHome: 0, amountDueHome: 0 }
    );
    const unpaidSummaryRows = summary
      ? [
          { label: 'Total AR', value: formatCurrency(summary.totalAR || 0) },
          { label: 'Current %', value: `${summary.currentPct?.toFixed(1) || '0.0'}%` },
          { label: 'Over 30 %', value: `${summary.over30Pct?.toFixed(1) || '0.0'}%` },
          { label: 'Over 90 %', value: `${summary.over90Pct?.toFixed(1) || '0.0'}%` },
          { label: 'DSO (Days)', value: summary.dso?.toFixed(0) || '0' },
        ]
      : [];

    // Prepare stacked area chart data
    const chartData = records.map((record: any) => ({
      month: formatDate(record.snapshotDate),
      Current: record.current,
      '1-30 Days': record.days1to30,
      '31-60 Days': record.days31to60,
      '61-90 Days': record.days61to90,
      '90+ Days': record.days90plus,
      total: record.totalAR
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Accounts Receivable Aging
        </h2>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total AR</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(summary.totalAR)}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Current %</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {summary.currentPct.toFixed(1)}%
                {summary.currentPct >= 70 ? <ArrowUp size={20} /> : <ArrowDown size={20} color="#ef4444" />}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {summary.over30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: summary.over90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {summary.over90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DSO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {summary.dso.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AR Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            AR Aging Trend
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="Current" stackId="a" fill={AR_TREND_COLORS[0]} />
              <Bar dataKey="1-30 Days" stackId="a" fill={AR_TREND_COLORS[1]} />
              <Bar dataKey="31-60 Days" stackId="a" fill={AR_TREND_COLORS[2]} />
              <Bar dataKey="61-90 Days" stackId="a" fill={AR_TREND_COLORS[3]} />
              <Bar dataKey="90+ Days" stackId="a" fill={AR_TREND_COLORS[4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Unpaid Invoices by Customer (Top 10) */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>
            Unpaid Invoices Amount by Customer (Top 10)
          </h3>
          {unpaidByCustomer.length === 0 ? (
            <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No unpaid invoice detail available for this period.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1.8, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={unpaidByCustomer} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="customerName" stroke="#64748b" style={{ fontSize: '12px' }} width={140} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="totalDue" name="Unpaid Amount">
                      {unpaidByCustomer.map((entry, index) => (
                        <Cell key={`bar-cell-${entry.customerName}-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1.2, minWidth: 280, display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={unpaidByCustomer}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={110}
                        dataKey="totalDue"
                        nameKey="customerName"
                        labelLine={false}
                        label={renderDonutLabel}
                      >
                        {unpaidByCustomer.map((entry, index) => (
                          <Cell key={`cell-${entry.customerName}-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: '6px' }}>
                  {unpaidByCustomer.map((entry, index) => (
                    <div key={`legend-${entry.customerName}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                      <span style={{ fontSize: '12px', color: '#475569' }}>{entry.customerName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '11fr 9fr', gap: '24px' }}>
          {/* AR Summary Table */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              AR Summary Table
            </h3>
            {arCustomers.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Current</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>1-30</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>31-60</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>61-90</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>91+</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arCustomers
                      .sort((a, b) => b.totalDue - a.totalDue)
                      .slice((arSummaryPage - 1) * 8, arSummaryPage * 8)
                      .map((row) => (
                        <tr key={row.customerName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#16a34a', textAlign: 'right' }}>
                            {formatCurrency(row.current)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f59e0b', textAlign: 'right' }}>
                            {formatCurrency(row.days1to30)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f97316', textAlign: 'right' }}>
                            {formatCurrency(row.days31to60)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#ef4444', textAlign: 'right' }}>
                            {formatCurrency(row.days61to90)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#991b1b', textAlign: 'right' }}>
                            {formatCurrency(row.days90plus)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                            {formatCurrency(row.totalDue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No AR summary available for this period.
              </div>
            )}
            {arCustomers.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                <span>
                  {Math.min((arSummaryPage - 1) * 8 + 1, arCustomers.length)}-
                  {Math.min(arSummaryPage * 8, arCustomers.length)} of {arCustomers.length}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setArSummaryPage((page) => Math.max(1, page - 1))}
                    disabled={arSummaryPage === 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: arSummaryPage === 1 ? '#f1f5f9' : 'white',
                      cursor: arSummaryPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setArSummaryPage((page) => Math.min(Math.ceil(arCustomers.length / 8), page + 1))}
                    disabled={arSummaryPage >= Math.ceil(arCustomers.length / 8)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: arSummaryPage >= Math.ceil(arCustomers.length / 8) ? '#f1f5f9' : 'white',
                      cursor: arSummaryPage >= Math.ceil(arCustomers.length / 8) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unpaid Invoices Summary */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Unpaid Invoices
            </h3>
            {invoices.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Due Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices
                      .slice((unpaidInvoicesPage - 1) * 8, unpaidInvoicesPage * 8)
                      .map((row, index) => (
                        <tr key={`${row.customerName}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.invoiceDate}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.dueDate}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                            {formatCurrency(row.amountDue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No unpaid invoices available for this period.
              </div>
            )}
            {invoices.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                <span>
                  {Math.min((unpaidInvoicesPage - 1) * 8 + 1, invoices.length)}-
                  {Math.min(unpaidInvoicesPage * 8, invoices.length)} of {invoices.length}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setUnpaidInvoicesPage((page) => Math.max(1, page - 1))}
                    disabled={unpaidInvoicesPage === 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: unpaidInvoicesPage === 1 ? '#f1f5f9' : 'white',
                      cursor: unpaidInvoicesPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setUnpaidInvoicesPage((page) => Math.min(Math.ceil(invoices.length / 8), page + 1))}
                    disabled={unpaidInvoicesPage >= Math.ceil(invoices.length / 8)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: unpaidInvoicesPage >= Math.ceil(invoices.length / 8) ? '#f1f5f9' : 'white',
                      cursor: unpaidInvoicesPage >= Math.ceil(invoices.length / 8) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '11fr 9fr', gap: '24px', marginTop: '24px' }}>
          {/* Paid Invoices by Customer */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Paid Invoices by Customer
            </h3>
            {paidByCustomer.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Current Month</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Last Month</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Last 12 Months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidByCustomer.map((row: any) => (
                      <tr key={row.customerName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                          {formatCurrency(row.currentMonth)}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                          {formatCurrency(row.lastMonth)}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(row.last12Months)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No paid invoices available for this period.
              </div>
            )}
          </div>

          {/* Last 12 Month Paid Invoices Amount */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Last 12 Month Paid Invoices Amount
            </h3>
            {paidByCustomer.length > 0 ? (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={paidByCustomer}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={100}
                        dataKey="last12Months"
                        nameKey="customerName"
                        labelLine={false}
                        label={renderDonutLabel}
                      >
                        {paidByCustomer.map((entry: any, index: number) => (
                          <Cell key={`paid-cell-${entry.customerName}-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: '6px' }}>
                  {paidByCustomer.map((entry: any, index: number) => (
                    <div key={`paid-legend-${entry.customerName}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                      <span style={{ fontSize: '12px', color: '#475569' }}>{entry.customerName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No paid invoices available for this period.
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Customer Invoices
            </h3>
            <select
              value={selectedInvoiceCustomer}
              onChange={(event) => {
                setSelectedInvoiceCustomer(event.target.value);
                setCustomerInvoicePage(1);
              }}
              style={{
                padding: '6px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="All">All Customers</option>
              {customerOptions.map((customer) => (
                <option key={customer} value={customer}>
                  {customer}
                </option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Invoice No.</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Due Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Currency</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount in currency
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount in home currency
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount Due in home currency
                  </th>
                </tr>
              </thead>
              <tbody>
                {customerInvoiceSlice.map((row, index) => (
                  <tr key={`${row.customerName}-${row.invoiceNo}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.invoiceNo}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.date}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.dueDate}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.currency}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                      {formatCurrencyWithCents(row.amountCurrency)}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                      {formatCurrencyWithCents(row.amountHome)}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrencyWithCents(row.amountDueHome)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '700' }} colSpan={5}>
                    Grand total
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(invoiceTotals.amountCurrency)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(invoiceTotals.amountHome)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(invoiceTotals.amountDueHome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
            <span>
              {filteredCustomerInvoices.length === 0 ? 0 : (customerInvoicePage - 1) * customerInvoicePageSize + 1}-
              {Math.min(customerInvoicePage * customerInvoicePageSize, filteredCustomerInvoices.length)} / {filteredCustomerInvoices.length}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCustomerInvoicePage((page) => Math.max(1, page - 1))}
                disabled={customerInvoicePage === 1}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: customerInvoicePage === 1 ? '#f1f5f9' : 'white',
                  cursor: customerInvoicePage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                {'<'}
              </button>
              <button
                onClick={() => setCustomerInvoicePage((page) => Math.min(customerInvoiceTotalPages, page + 1))}
                disabled={customerInvoicePage >= customerInvoiceTotalPages}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: customerInvoicePage >= customerInvoiceTotalPages ? '#f1f5f9' : 'white',
                  cursor: customerInvoicePage >= customerInvoiceTotalPages ? 'not-allowed' : 'pointer'
                }}
              >
                {'>'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // AP Aging Tab
  const renderAPaging = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading AP data...</div>;
    }

    if (!apData) return null;

    const { records, summary } = apData;
    const sectorFallback = getSectorArApFallbacks(industrySectorCategory);
    const latestRecord = records[0];
    const apVendors = (summary?.breakdown || summary?.unpaidByVendor || sectorFallback.unpaidByVendor).map((row: any) => ({
      vendorName: row.vendorName || row.name,
      current: row.current || 0,
      days1to30: row.days1to30 || 0,
      days31to60: row.days31to60 || 0,
      days61to90: row.days61to90 || 0,
      days90plus: row.days90plus || 0,
      totalDue: row.totalDue || row.total || (row.current || 0) + (row.days1to30 || 0) + (row.days31to60 || 0) + (row.days61to90 || 0) + (row.days90plus || 0),
    }));
    const unpaidByVendor = apVendors
      .map((row) => ({ vendorName: row.vendorName, totalDue: row.totalDue }))
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 10);
    const unpaidVendorTotal = unpaidByVendor.reduce((sum, item) => sum + item.totalDue, 0);
    const unpaidBills = (summary?.unpaidBills || sectorFallback.unpaidBills).map((row: any) => ({
      vendorName: row.vendorName || row.vendor,
      billNo: row.billNo || row.billNumber,
      date: row.date,
      dueDate: row.dueDate,
      amountDue: row.amountDue || row.balance || 0,
    }));
    const paidBills = (summary?.paidBills || sectorFallback.paidBills)
      .map((row: any) => ({
        vendorName: row.vendorName || row.vendor,
        currentMonth: row.currentMonth || 0,
        lastMonth: row.lastMonth || 0,
        last12Months: row.last12Months || 0,
      }))
      .sort((a: any, b: any) => b.last12Months - a.last12Months)
      .slice(0, 10);
    const paidBillsTotal = paidBills.reduce((sum: number, item: any) => sum + item.last12Months, 0);
    const vendorBillRows = (summary?.vendorBills || sectorFallback.vendorBills).map((row: any) => ({
      vendorName: row.vendorName || row.vendor,
      billNo: row.billNo || row.billNumber,
      date: row.date,
      dueDate: row.dueDate,
      currency: 'USD',
      amountCurrency: row.amountCurrency || row.amount || 0,
      amountHome: row.amountHome || row.amountHomeCurrency || 0,
      amountDueHome: row.amountDueHome || row.amountDue || 0,
    }));
    const vendorOptions = Array.from(new Set(vendorBillRows.map((row) => row.vendorName))).sort();
    const filteredVendorBills =
      selectedVendorBill === 'All'
        ? vendorBillRows
        : vendorBillRows.filter((row) => row.vendorName === selectedVendorBill);
    const vendorBillPageSize = 50;
    const vendorBillTotalPages = Math.max(1, Math.ceil(filteredVendorBills.length / vendorBillPageSize));
    const vendorBillSlice = filteredVendorBills.slice(
      (vendorBillsPage - 1) * vendorBillPageSize,
      vendorBillsPage * vendorBillPageSize
    );
    const vendorBillTotals = filteredVendorBills.reduce(
      (acc, row) => {
        acc.amountCurrency += row.amountCurrency;
        acc.amountHome += row.amountHome;
        acc.amountDueHome += row.amountDueHome;
        return acc;
      },
      { amountCurrency: 0, amountHome: 0, amountDueHome: 0 }
    );

    const chartData = records.map((record: any) => ({
      month: formatDate(record.snapshotDate),
      Current: record.current,
      '1-30 Days': record.days1to30,
      '31-60 Days': record.days31to60,
      '61-90 Days': record.days61to90,
      '90+ Days': record.days90plus,
      total: record.totalAP
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Accounts Payable Aging
        </h2>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total AP</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(summary.totalAP)}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Current %</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
                {summary.currentPct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {summary.over30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: summary.over90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {summary.over90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DPO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {summary.dpo.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AP Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            AP Aging Trend
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="Current" stackId="a" fill={AR_TREND_COLORS[0]} />
              <Bar dataKey="1-30 Days" stackId="a" fill={AR_TREND_COLORS[1]} />
              <Bar dataKey="31-60 Days" stackId="a" fill={AR_TREND_COLORS[2]} />
              <Bar dataKey="61-90 Days" stackId="a" fill={AR_TREND_COLORS[3]} />
              <Bar dataKey="90+ Days" stackId="a" fill={AR_TREND_COLORS[4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Unpaid Bills by Vendor (Top 10) */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>
            Unpaid Bills Amount by Vendor (Top 10)
          </h3>
          {unpaidByVendor.length === 0 ? (
            <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No unpaid bills detail available for this period.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1.8, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={unpaidByVendor} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="vendorName" stroke="#64748b" style={{ fontSize: '12px' }} width={140} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="totalDue" name="Unpaid Amount">
                      {unpaidByVendor.map((entry, index) => (
                        <Cell key={`ap-bar-${entry.vendorName}-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1.2, minWidth: 280, display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={unpaidByVendor}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={110}
                        dataKey="totalDue"
                        nameKey="vendorName"
                        labelLine={false}
                        label={renderDonutLabel}
                      >
                        {unpaidByVendor.map((entry, index) => (
                          <Cell key={`ap-donut-${entry.vendorName}-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: '6px' }}>
                  {unpaidByVendor.map((entry, index) => (
                    <div key={`ap-legend-${entry.vendorName}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                      <span style={{ fontSize: '12px', color: '#475569' }}>{entry.vendorName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* AP Summary Table */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              AP Summary Table
            </h3>
            {apVendors.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Current</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>1-30</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>31-60</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>61-90</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>91+</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apVendors
                      .sort((a, b) => b.totalDue - a.totalDue)
                      .slice((apSummaryPage - 1) * 8, apSummaryPage * 8)
                      .map((row) => (
                        <tr key={row.vendorName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#16a34a', textAlign: 'right' }}>
                            {formatCurrency(row.current)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f59e0b', textAlign: 'right' }}>
                            {formatCurrency(row.days1to30)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f97316', textAlign: 'right' }}>
                            {formatCurrency(row.days31to60)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#ef4444', textAlign: 'right' }}>
                            {formatCurrency(row.days61to90)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#991b1b', textAlign: 'right' }}>
                            {formatCurrency(row.days90plus)}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                            {formatCurrency(row.totalDue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No AP summary available for this period.
              </div>
            )}
            {apVendors.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                <span>
                  {Math.min((apSummaryPage - 1) * 8 + 1, apVendors.length)}-
                  {Math.min(apSummaryPage * 8, apVendors.length)} of {apVendors.length}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setApSummaryPage((page) => Math.max(1, page - 1))}
                    disabled={apSummaryPage === 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: apSummaryPage === 1 ? '#f1f5f9' : 'white',
                      cursor: apSummaryPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setApSummaryPage((page) => Math.min(Math.ceil(apVendors.length / 8), page + 1))}
                    disabled={apSummaryPage >= Math.ceil(apVendors.length / 8)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: apSummaryPage >= Math.ceil(apVendors.length / 8) ? '#f1f5f9' : 'white',
                      cursor: apSummaryPage >= Math.ceil(apVendors.length / 8) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unpaid Bills */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Unpaid Bills
            </h3>
            {unpaidBills.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Due Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidBills
                      .slice((unpaidBillsPage - 1) * 8, unpaidBillsPage * 8)
                      .map((row, index) => (
                        <tr key={`${row.vendorName}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.date}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.dueDate}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                            {formatCurrency(row.amountDue)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No unpaid bills available for this period.
              </div>
            )}
            {unpaidBills.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                <span>
                  {Math.min((unpaidBillsPage - 1) * 8 + 1, unpaidBills.length)}-
                  {Math.min(unpaidBillsPage * 8, unpaidBills.length)} of {unpaidBills.length}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setUnpaidBillsPage((page) => Math.max(1, page - 1))}
                    disabled={unpaidBillsPage === 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: unpaidBillsPage === 1 ? '#f1f5f9' : 'white',
                      cursor: unpaidBillsPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setUnpaidBillsPage((page) => Math.min(Math.ceil(unpaidBills.length / 8), page + 1))}
                    disabled={unpaidBillsPage >= Math.ceil(unpaidBills.length / 8)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: unpaidBillsPage >= Math.ceil(unpaidBills.length / 8) ? '#f1f5f9' : 'white',
                      cursor: unpaidBillsPage >= Math.ceil(unpaidBills.length / 8) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
          {/* Paid Bills Table */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Paid Bills by Vendor
            </h3>
            {paidBills.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Current Month</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Last Month</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Last 12 Months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidBills.map((row: any) => (
                      <tr key={row.vendorName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                          {formatCurrency(row.currentMonth)}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                          {formatCurrency(row.lastMonth)}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(row.last12Months)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No paid bills available for this period.
              </div>
            )}
          </div>

          {/* Last 12 Month Bills Paid */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Last 12 Month Bills Paid
            </h3>
            {paidBills.length > 0 ? (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={paidBills}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={100}
                        dataKey="last12Months"
                        nameKey="vendorName"
                        labelLine={false}
                        label={renderDonutLabel}
                      >
                        {paidBills.map((entry: any, index: number) => (
                          <Cell key={`ap-paid-${entry.vendorName}-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: '6px' }}>
                  {paidBills.map((entry: any, index: number) => (
                    <div key={`ap-paid-legend-${entry.vendorName}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[index % COLORS.length] }} />
                      <span style={{ fontSize: '12px', color: '#475569' }}>{entry.vendorName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No paid bills available for this period.
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Vendor Bills
            </h3>
            <select
              value={selectedVendorBill}
              onChange={(event) => {
                setSelectedVendorBill(event.target.value);
                setVendorBillsPage(1);
              }}
              style={{
                padding: '6px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="All">All Vendors</option>
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Bill No.</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Due Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Currency</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount in currency
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount in home currency
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
                    Amount Due in home currency
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendorBillSlice.map((row, index) => (
                  <tr key={`${row.vendorName}-${row.billNo}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.billNo}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.date}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.dueDate}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.currency}</td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                      {formatCurrencyWithCents(row.amountCurrency)}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>
                      {formatCurrencyWithCents(row.amountHome)}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrencyWithCents(row.amountDueHome)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '700' }} colSpan={5}>
                    Grand total
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(vendorBillTotals.amountCurrency)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(vendorBillTotals.amountHome)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>
                    {formatCurrencyWithCents(vendorBillTotals.amountDueHome)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
            <span>
              {filteredVendorBills.length === 0 ? 0 : (vendorBillsPage - 1) * vendorBillPageSize + 1}-
              {Math.min(vendorBillsPage * vendorBillPageSize, filteredVendorBills.length)} / {filteredVendorBills.length}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setVendorBillsPage((page) => Math.max(1, page - 1))}
                disabled={vendorBillsPage === 1}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: vendorBillsPage === 1 ? '#f1f5f9' : 'white',
                  cursor: vendorBillsPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                {'<'}
              </button>
              <button
                onClick={() => setVendorBillsPage((page) => Math.min(vendorBillTotalPages, page + 1))}
                disabled={vendorBillsPage >= vendorBillTotalPages}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: vendorBillsPage >= vendorBillTotalPages ? '#f1f5f9' : 'white',
                  cursor: vendorBillsPage >= vendorBillTotalPages ? 'not-allowed' : 'pointer'
                }}
              >
                {'>'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Product Sales Tab  
  const renderProducts = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading product data...</div>;
    }

    if (!productData) return null;

    const { records, summary } = productData;

    // Aggregate revenue by product over time
    const productTrends: any = {};
    records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!productTrends[period]) {
        productTrends[period] = { month: period };
      }
      productTrends[period][record.itemName] = record.revenue;
    });

    const trendData = Object.values(productTrends);
    const productNames = Array.from(new Set(records.map((r: any) => r.itemName)));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Product Sales Performance
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Products</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.topProducts.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.topProducts.reduce((sum: number, p: any) => sum + p.totalRevenue, 0))}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Avg Margin %</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {(summary.topProducts.reduce((sum: number, p: any) => sum + p.grossMarginPct, 0) / summary.topProducts.length).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Product Revenue Trend */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Revenue Trend by Product
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              {productNames.map((name: any, index: number) => (
                <Line 
                  key={name} 
                  type="monotone" 
                  dataKey={name} 
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2} 
                  dot={{ r: 3 }} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Product Performance Summary
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Total Revenue</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Units Sold</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Gross Margin</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((product: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b' }}>#{index + 1}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{product.name}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(product.totalRevenue)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>{product.totalQuantity}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(product.grossMargin)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: product.grossMarginPct >= 50 ? '#16a34a' : '#f59e0b', textAlign: 'right', fontWeight: '600' }}>
                      {product.grossMarginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Inventory Tab
  const renderInventory = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading inventory data...</div>;
    }

    if (!inventoryData) return null;

    const { records, summary } = inventoryData;

    // Get latest snapshot data
    const latestSnapshot = Math.max(...records.map((r: any) => new Date(r.snapshotDate).getTime()));
    const latestRecords = records.filter((r: any) => new Date(r.snapshotDate).getTime() === latestSnapshot);

    // Aggregate inventory value over time
    const periodValue: any = {};
    records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!periodValue[period]) {
        periodValue[period] = { month: period, value: 0, quantity: 0 };
      }
      periodValue[period].value += record.assetValue;
      periodValue[period].quantity += record.qtyOnHand;
    });

    const trendData = Object.values(periodValue);

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Inventory Management
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Items</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.itemCount}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Value</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.totalValue)}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Units</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {latestRecords.reduce((sum: number, item: any) => sum + item.qtyOnHand, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Inventory Value Trend */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Inventory Value Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'value' ? formatCurrency(value) : value.toLocaleString(),
                  name === 'value' ? 'Value' : 'Quantity'
                ]}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#667eea" strokeWidth={2} dot={{ fill: '#667eea', r: 4 }} name="Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Current Inventory Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Current Inventory (Latest Month)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Item Name</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>SKU</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Qty on Hand</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Avg Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Asset Value</th>
                </tr>
              </thead>
              <tbody>
                {latestRecords.map((item: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.itemName}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{item.sku}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>
                      {item.qtyOnHand.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(item.avgCost)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(item.assetValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Distribution Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Inventory Value Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={latestRecords}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.itemName}: ${formatCurrency(entry.assetValue)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="assetValue"
              >
                {latestRecords.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderCash = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading cash data...</div>;
    }

    if (!cashData) return null;

    const { records, summary } = cashData;

    // Aggregate data by period for trend chart
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!acc[period]) {
        acc[period] = { period, totalCash: 0 };
      }
      acc[period].totalCash += record.cashBalance;
      return acc;
    }, {});

    const trendData = Object.values(periodTrend);

    // Prepare data for account breakdown chart
    const accountData = summary.accounts.map((acct: any) => ({
      name: acct.accountName,
      balance: acct.currentBalance,
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Cash Management
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Cash</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
              {formatCurrency(summary.totalCash)}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Change</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: summary.changeAmount >= 0 ? '#10b981' : '#ef4444' }}>
              {summary.changeAmount >= 0 ? '+' : ''}{formatCurrency(summary.changeAmount)}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Change %</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: summary.changePercent >= 0 ? '#10b981' : '#ef4444' }}>
              {summary.changePercent >= 0 ? '+' : ''}{summary.changePercent.toFixed(2)}%
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Accounts</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.accountCount}
            </div>
          </div>
        </div>

        {/* Cash Balance Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            {frequency.charAt(0).toUpperCase() + frequency.slice(1)} Cash Balance Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => [formatCurrency(value), 'Total Cash']}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="totalCash" fill="#10b981" name="Total Cash" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Account Breakdown Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Bank Accounts
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Current Balance</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Avg Balance</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Min Balance</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Max Balance</th>
                </tr>
              </thead>
              <tbody>
                {summary.accounts.map((account: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                      {account.accountName}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#10b981', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(account.currentBalance)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(account.avgBalance)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(account.minBalance)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(account.maxBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Account Distribution Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Cash Distribution by Account
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={accountData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${formatCurrency(entry.balance)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="balance"
              >
                {accountData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      maxWidth: '1600px', 
      margin: '0 auto', 
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      {/* Spacer for main nav */}
      <div style={{ height: '20px' }}></div>

      {/* Tabs */}
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        gap: '20px'
      }}>
        {availableTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 0',
              fontSize: '19px',
              fontWeight: '600',
              color: activeTab === tab ? '#667eea' : '#64748b',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '3px solid #667eea' : '3px solid transparent',
              transition: 'all 0.2s',
              textTransform: 'capitalize'
            }}
          >
            {tab === 'dashboard' ? 'Ops Dashboard' : tab === 'ar' ? 'AR Aging' : tab === 'ap' ? 'AP Aging' : tab}
          </button>
        ))}
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Content */}
      {activeTab === 'dashboard' && (
        <OpsDashboard
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          industrySectorCategory={industrySectorCategory}
        />
      )}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'customers' && renderCustomers()}
      {activeTab === 'ar' && renderARaging()}
      {activeTab === 'ap' && renderAPaging()}
      {activeTab === 'products' && renderProducts()}
      {activeTab === 'inventory' && renderInventory()}
      {activeTab === 'cash' && renderCash()}
    </div>
  );
}
