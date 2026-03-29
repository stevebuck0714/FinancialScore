'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Users, Package, DollarSign, Warehouse, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
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
import FinancialForecastTab from '../FinancialForecastTab';
import WorkingCapitalForecastTab from './WorkingCapitalForecastTab';
import { getSdeSectorBenchmarks } from '@/lib/sde-sector-benchmarks';
import { getSectorMockProfile, getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { getModuleLabel, mapModuleToDataType, type OpsDataType } from '@/lib/operations/module-registry';
import { buildWeeklyProductMarginModel } from '@/lib/operations/product-margin-weekly';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';

interface OperationsTabProps {
  selectedCompanyId: string;
  companyName: string;
  industrySectorCategory?: string | null;
  operationalHubConfig?: any;
  viewMode?: 'full' | 'overview-only';
  initialTab?: string;
  initialForecastBasisTab?: 'cash-basis' | 'accrual-basis';
  initialForecastSubTab?: 'income-statement-forecast' | 'cash-forecast' | 'graphs';
}

type OpTab = 'dashboard' | 'overview' | string;

const COLORS = ['#0f2b4b', '#1f4e79', '#2e6f9e', '#3e8db5', '#5aa5a7', '#7d8f6a', '#8b6a3d', '#7a4e8a'];
const CASH_DISTRIBUTION_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#65a30d', '#4f46e5', '#ea580c'];
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

type MonitorCard = {
  title: string;
  question: string;
  trigger: string;
  drill: string;
  dataType?: OpsDataType;
};
type CardSeverity = 'normal' | 'warning' | 'critical' | 'loading';

type InvestigatePlaybook = {
  title: string;
  path: string;
  outcome: string;
  dataType?: OpsDataType;
};

type InvestigateInsight = {
  whyNow: string;
  impact: string;
  drivers: string[];
  startHere: string;
  owner: string;
  eta: string;
  freshness: string;
  confidence: 'Low' | 'Medium' | 'High';
  severity: CardSeverity;
  focusCustomer?: string | null;
  focusVendor?: string | null;
};

const UNIVERSAL_MONITOR_CARDS: MonitorCard[] = [
  { title: 'DSO Drift', question: 'Are collections slowing?', trigger: 'DSO +5 days vs trailing 60', drill: 'Customer -> invoices -> aging buckets', dataType: 'ar-aging' },
  { title: 'Past-Due AR Spike', question: 'Is receivables quality deteriorating?', trigger: '% AR >30 days up 15%+ vs prior 30', drill: 'Top customers -> invoice aging', dataType: 'ar-aging' },
  { title: 'AP Past Due Risk', question: 'Are vendor obligations building?', trigger: '$ past due AP up 20%+ vs prior 30', drill: 'Vendor -> invoices -> approval lag', dataType: 'ap-aging' },
  { title: 'Spend Acceleration', question: 'What is driving cost jumps?', trigger: 'Any major spend category +15% MoM', drill: 'Category -> vendor -> transactions', dataType: 'ap-aging' },
  { title: 'Working Capital Spike', question: 'Is cash being trapped?', trigger: 'AR + Inventory - AP up 10%+ MoM', drill: 'AR vs Inventory vs AP contribution', dataType: 'cash' },
  { title: 'Cash Runway', question: 'How long can operations self-fund?', trigger: 'Runway below 8 weeks', drill: 'Cash bridge -> AR/AP/Inventory drivers', dataType: 'cash' },
];

const UNIVERSAL_INVESTIGATIONS: InvestigatePlaybook[] = [
  { title: 'Why did cash change?', path: 'Cash bridge -> receipts/disbursements -> top contributors', outcome: 'Ranked cash drivers with owner actions', dataType: 'cash' },
  { title: 'Why did AR worsen?', path: 'AR delta -> customer concentration -> invoice aging', outcome: 'Top delinquent accounts and next-step actions', dataType: 'ar-aging' },
  { title: 'Why did margin shrink?', path: 'Price/mix/discount -> credits/returns -> cost drift', outcome: 'Leakage diagnosis by root cause', dataType: 'products' },
  { title: 'Why did spend spike?', path: 'Category -> vendor -> transaction detail', outcome: 'Unplanned spend sources and controls', dataType: 'ap-aging' },
  { title: 'What moved working capital?', path: 'AR vs Inventory vs AP bridge', outcome: 'Dollar-impact decomposition and playbook', dataType: 'cash' },
  { title: 'What should we do next?', path: 'Synthesize top drivers into role-based actions', outcome: 'Prioritized action list by owner', dataType: 'customers' },
];

const SECTOR_NAMES: Record<string, string> = {
  '42': 'Wholesale Trade',
  '32': 'Manufacturing',
  '23': 'Construction',
  '45': 'Retail Trade',
  '48': 'Transportation & Warehousing',
  '51': 'Information',
  '54': 'Professional, Scientific & Technical Services',
  '62': 'Health Care & Social Assistance',
};

const SECTOR_MONITOR_OVERRIDES: Record<string, MonitorCard[]> = {
  '42': [
    { title: 'Deductions / Chargebacks Trend', question: 'Are deductions eroding cash and margin?', trigger: 'Deduction $ +25% vs trailing 8 weeks', drill: 'Reason code -> customer -> invoice', dataType: 'ar-aging' },
    { title: 'Inventory Turns Deterioration', question: 'Is inventory velocity falling?', trigger: 'Turns down 10%+ vs trailing quarter', drill: 'Category/SKU contributors', dataType: 'inventory' },
    { title: 'Discount Rate Creep', question: 'Are discounts rising without volume lift?', trigger: 'Average discount +1 point while volume flat/down', drill: 'Rep/customer/SKU', dataType: 'products' },
  ],
  '32': [
    { title: 'WIP Build', question: 'Is production bottlenecking?', trigger: 'WIP $ +10% MoM', drill: 'WIP aging -> bottleneck area/SKU family', dataType: 'products' },
    { title: 'FG Aging / Overproduction', question: 'Are finished goods accumulating?', trigger: 'FG >90-day $ +15%', drill: 'SKU -> last shipped -> demand trend', dataType: 'inventory' },
    { title: 'Material Cost Drift', question: 'Are material costs moving against us?', trigger: 'Purchase unit cost +5% on top materials', drill: 'Item -> vendor -> PO/invoice history', dataType: 'ap-aging' },
  ],
  '23': [
    { title: 'Unbilled / WIP Growth', question: 'Are we funding work before billing?', trigger: 'Unbilled/WIP +15% MoM', drill: 'Project -> billing lag -> change orders', dataType: 'ar-aging' },
    { title: 'Retainage Exposure', question: 'Is cash locked in retainage?', trigger: 'Retainage receivable +10% MoM', drill: 'Owner/GC -> project -> aging', dataType: 'ar-aging' },
    { title: 'Subcontractor AP Risk', question: 'Are critical subcontractors overdue?', trigger: 'Top subcontractor past due +15%', drill: 'Vendor -> invoice -> approval stage', dataType: 'ap-aging' },
  ],
  '45': [
    { title: 'Stockout Proxy', question: 'Are we losing sales from out-of-stocks?', trigger: 'Stockout incidents +25% vs trailing 8 weeks', drill: 'Store/channel -> SKU -> lost demand', dataType: 'inventory' },
    { title: 'Sell-Through Slowdown', question: 'Is assortment getting stale?', trigger: 'Sell-through down 10%+ QoQ', drill: 'Category/SKU -> markdown path', dataType: 'products' },
    { title: 'Returns Rate Increase', question: 'Are quality or fit issues rising?', trigger: 'Credits/returns +30% vs trailing 8 weeks', drill: 'Reason -> SKU -> location/channel', dataType: 'products' },
  ],
  '48': [
    { title: 'Billing Leakage Proxy', question: 'Are loads shipped but under-billed?', trigger: 'Receipts lag shipments by 10%+', drill: 'Customer -> lane -> shipment/accessorial', dataType: 'customers' },
    { title: 'Fuel & Vendor Cost Spike', question: 'Are transport costs compressing margin?', trigger: 'Fuel/vendor spend +15% MoM', drill: 'Vendor -> lane/site -> period variance', dataType: 'ap-aging' },
    { title: 'Claims / Credits Increase', question: 'Are service failures rising?', trigger: 'Claims/credits +25% vs trailing 8 weeks', drill: 'Reason -> lane/site -> customer', dataType: 'customers' },
  ],
  '51': [
    { title: 'Credits / SLA Penalties', question: 'Are service credits increasing?', trigger: 'Credits +25% vs trailing 8 weeks', drill: 'Account -> issue type -> invoice', dataType: 'customers' },
    { title: 'Cloud/Tooling Spend Drift', question: 'Is platform spend rising faster than revenue?', trigger: 'Spend +15% MoM with flat revenue', drill: 'Vendor -> service -> period variance', dataType: 'ap-aging' },
    { title: 'Renewal Risk Proxy', question: 'Are key accounts weakening?', trigger: 'Large account revenue down 10%+ with slower pay', drill: 'Account -> invoice/payment trend', dataType: 'customers' },
  ],
  '54': [
    { title: 'Unbilled Services Growth', question: 'Are delivered services not being invoiced?', trigger: 'Unbilled/WIP proxy +12% MoM', drill: 'Client -> engagement -> invoice cadence', dataType: 'ar-aging' },
    { title: 'Write-off / Credit Trend', question: 'Are scope disputes increasing?', trigger: 'Credits/write-offs +20% vs trailing 8 weeks', drill: 'Client -> project -> reason', dataType: 'customers' },
    { title: 'Contractor Spend Spike', question: 'Is delivery mix eroding margin?', trigger: 'Contractor AP +15% MoM', drill: 'Vendor -> engagement -> rate/volume', dataType: 'ap-aging' },
  ],
  '62': [
    { title: 'Payer AR Deterioration', question: 'Are collections slowing by payer?', trigger: 'Payer AR >30 days +15% vs prior 30', drill: 'Payer -> claim/invoice aging', dataType: 'ar-aging' },
    { title: 'Write-offs / Denial Proxy', question: 'Are denials or adjustments increasing?', trigger: 'Credits/write-offs +20% vs trailing 8 weeks', drill: 'Reason -> service line -> location', dataType: 'customers' },
    { title: 'Staffing Cost Acceleration', question: 'Are labor costs spiking?', trigger: 'Staffing-related AP +15% MoM', drill: 'Vendor category -> location -> time window', dataType: 'ap-aging' },
  ],
};

const SECTOR_INVESTIGATE_OVERRIDES: Record<string, InvestigatePlaybook[]> = {
  '42': [
    { title: 'Why are deductions rising?', path: 'Reason codes -> customer patterns -> SKU correlation', outcome: 'Deduction root-cause tree with recovery actions', dataType: 'ar-aging' },
    { title: 'Why are we stocking out?', path: 'SKU demand spike vs supply delay -> reorder cadence', outcome: 'Stockout driver map and replenishment actions', dataType: 'inventory' },
  ],
  '32': [
    { title: 'Why did WIP build?', path: 'WIP delta -> aging buckets -> SKU family', outcome: 'Bottleneck diagnosis and throughput actions', dataType: 'products' },
    { title: 'Why did material costs rise?', path: 'Unit cost vs volume -> vendor changes -> PO history', outcome: 'Cost inflation decomposition and sourcing actions', dataType: 'ap-aging' },
  ],
  '23': [
    { title: 'Why is WIP/unbilled growing?', path: 'Project billing lag -> change-order backlog', outcome: 'Billing acceleration playbook by project', dataType: 'ar-aging' },
    { title: 'Why are job costs spiking?', path: 'Materials/subcontractor spend -> project variance', outcome: 'Cost overrun causes and controls', dataType: 'ap-aging' },
  ],
  '45': [
    { title: 'Why did margin drop?', path: 'Discounts/markdowns -> returns -> vendor cost drift', outcome: 'Retail margin bridge by category/SKU', dataType: 'products' },
    { title: 'Why is inventory bloating?', path: 'Buying vs demand -> aged stock -> markdown path', outcome: 'Inventory action list by category', dataType: 'inventory' },
  ],
  '48': [
    { title: 'Why did cash drop this week?', path: 'Collections vs fuel/payroll/claims', outcome: 'Transport cash bridge with owner actions', dataType: 'cash' },
    { title: 'Which lanes/customers are unprofitable?', path: 'Revenue vs credits/claims vs pay speed', outcome: 'Lane-account profitability risk list', dataType: 'customers' },
  ],
  '51': [
    { title: 'Why did credits increase?', path: 'Issue/SLA -> account -> contract period', outcome: 'Service-quality and revenue leakage actions', dataType: 'customers' },
    { title: 'Why did cloud spend jump?', path: 'Vendor -> service -> team/project driver', outcome: 'Cloud/tooling cost containment actions', dataType: 'ap-aging' },
  ],
  '54': [
    { title: 'Why did AR worsen?', path: 'Client aging -> invoice cadence -> disputes', outcome: 'Collection and billing cadence action plan', dataType: 'ar-aging' },
    { title: 'Which clients are unprofitable?', path: 'Slow pay + credits + contractor-heavy delivery', outcome: 'Client portfolio risk ranking', dataType: 'customers' },
  ],
  '62': [
    { title: 'Why did collections fall?', path: 'Payer mix -> aging -> adjustment/credit patterns', outcome: 'Payer-focused collections recovery plan', dataType: 'ar-aging' },
    { title: 'Where is margin leaking?', path: 'Payer mix + write-offs + staffing cost drift', outcome: 'Healthcare margin leakage map', dataType: 'ap-aging' },
  ],
};

export default function OperationsTab({
  selectedCompanyId,
  companyName,
  industrySectorCategory,
  operationalHubConfig,
  viewMode = 'full',
  initialTab,
  initialForecastBasisTab,
  initialForecastSubTab
}: OperationsTabProps) {
  const isOverviewOnly = viewMode === 'overview-only';
  const [activeTab, setActiveTab] = useState<OpTab>(() => {
    if (initialTab) return initialTab as OpTab;
    return isOverviewOnly ? 'overview' : 'dashboard';
  });
  const [activeForecastBasisTab, setActiveForecastBasisTab] = useState<'cash-basis' | 'accrual-basis'>('accrual-basis');
  const [activeCashBasisForecastTab, setActiveCashBasisForecastTab] = useState<'income-statement-forecast' | 'cash-forecast' | 'graphs'>('income-statement-forecast');
  const [activeAccrualBasisForecastTab, setActiveAccrualBasisForecastTab] = useState<'income-statement-forecast' | 'cash-forecast' | 'graphs'>('income-statement-forecast');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [cashData, setCashData] = useState<any>(null);
  const [selectedCashTrendAccount, setSelectedCashTrendAccount] = useState<string>('__TOTAL__');
  const [dailyFinancialData, setDailyFinancialData] = useState<any>(null);
  const [cashConversionFinancialData, setCashConversionFinancialData] = useState<any>(null);
  const [companyOperationalHubConfig, setCompanyOperationalHubConfig] = useState<any>(operationalHubConfig || null);
  const [dailyFinancialView, setDailyFinancialView] = useState<'summary' | 'income' | 'balance' | 'cashflow'>('summary');
  const [selectedDailyTrendMetrics, setSelectedDailyTrendMetrics] = useState<Array<'revenue' | 'expense' | 'net' | 'cash' | 'grossMargin' | 'marginPct'>>([
    'revenue',
    'expense',
    'net',
  ]);
  const [dailyFinancialWindowStart, setDailyFinancialWindowStart] = useState(0);
  const [arSummaryPage, setArSummaryPage] = useState(1);
  const [arAgingPage, setArAgingPage] = useState(1);
  const [unpaidInvoicesPage, setUnpaidInvoicesPage] = useState(1);
  const [unpaidInvoicesSortKey, setUnpaidInvoicesSortKey] = useState<'customerName' | 'invoiceDate' | 'daysOutstanding' | 'amountDue'>('invoiceDate');
  const [unpaidInvoicesSortDir, setUnpaidInvoicesSortDir] = useState<'asc' | 'desc'>('desc');
  const [customerInvoicePage, setCustomerInvoicePage] = useState(1);
  const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState('All');
  const [apSummaryPage, setApSummaryPage] = useState(1);
  const [unpaidBillsPage, setUnpaidBillsPage] = useState(1);
  const [vendorBillsPage, setVendorBillsPage] = useState(1);
  const [selectedVendorBill, setSelectedVendorBill] = useState('All');
  const [demandSortKey, setDemandSortKey] = useState<'customer' | 'bookingsMtd' | 'bookingsQtd' | 'bookingsYtd' | 'backlogTotal' | 'backlog60' | 'shareBacklog' | 'trend'>('backlogTotal');
  const [demandSortDir, setDemandSortDir] = useState<'asc' | 'desc'>('desc');
  const [customerDateRangeSaveStatus, setCustomerDateRangeSaveStatus] = useState<string | null>(null);
  const [customerRevenuePeriodMode, setCustomerRevenuePeriodMode] = useState<'year' | 'quarter' | 'month'>('month');
  const [customerRevenuePeriodKey, setCustomerRevenuePeriodKey] = useState<string>('all');
  const [opsSectorLayoutConfig, setOpsSectorLayoutConfig] = useState<any | null>(null);
  const [smartCardsLoading, setSmartCardsLoading] = useState(false);
  const [showPriceCostExceptionsOnly, setShowPriceCostExceptionsOnly] = useState(false);
  const [priceCostSearchTerm, setPriceCostSearchTerm] = useState('');
  const [priceCostTableExpanded, setPriceCostTableExpanded] = useState(true);
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [hideZeroQtyInventory, setHideZeroQtyInventory] = useState(false);
  const [inventoryTableExpanded, setInventoryTableExpanded] = useState(true);
  const [inventorySortKey, setInventorySortKey] = useState<
    'itemName' | 'sku' | 'warehouse' | 'bin' | 'lot' | 'qtyOnHand' | 'avgCost' | 'assetValue'
  >('assetValue');
  const [inventorySortDir, setInventorySortDir] = useState<'asc' | 'desc'>('desc');
  const [productScopeMode, setProductScopeMode] = useState<'total' | 'product'>('total');
  const [selectedScopeSku, setSelectedScopeSku] = useState('');
  const operationalHubSections =
    companyOperationalHubConfig &&
    typeof companyOperationalHubConfig === 'object' &&
    companyOperationalHubConfig.sections &&
    typeof companyOperationalHubConfig.sections === 'object' &&
    !Array.isArray(companyOperationalHubConfig.sections)
      ? (companyOperationalHubConfig.sections as Record<string, any>)
      : {};
  const isSectionEnabled = (sectionKey: string): boolean => {
    const value = operationalHubSections[sectionKey];
    return value === undefined ? true : value !== false;
  };
  const isCustomersTab = mapModuleToDataType(activeTab) === 'customers' || activeTab === 'customers';
  const isTabModuleEnabled = (moduleKey: string): boolean => {
    const normalized = String(moduleKey || '').trim();
    if (!normalized) return true;
    const value = operationalHubSections[`tab:${normalized}`];
    return value === undefined ? true : value !== false;
  };
  
  // Date range and frequency filters
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const toLocalInputDate = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const yesterdayLocal = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  })();
  const todayLocalInputDate = toLocalInputDate(new Date());
  const maxSelectableEndDate = toLocalInputDate(yesterdayLocal);
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date(yesterdayLocal);
    // Default to last 90 days for daily view
    date.setDate(date.getDate() - 90);
    return toLocalInputDate(date);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return maxSelectableEndDate;
  });
  const hasHydratedDateRangeRef = useRef(false);

  useEffect(() => {
    if (endDate > maxSelectableEndDate) setEndDate(maxSelectableEndDate);
  }, [endDate, maxSelectableEndDate]);

  useEffect(() => {
    // Enforce product/user date pickers defaulting to prior day.
    if (endDate === todayLocalInputDate) {
      setEndDate(maxSelectableEndDate);
    }
  }, [endDate, todayLocalInputDate, maxSelectableEndDate]);

  const orderedDashboardDataTypes: OpsDataType[] = ['customers', 'ar-aging', 'ap-aging', 'products', 'inventory', 'cash', 'daily-financials'];
  const layoutModules: string[] = Array.isArray(opsSectorLayoutConfig?.modules)
    ? opsSectorLayoutConfig.modules
        .map((module: unknown) => String(module || '').trim())
        .filter((module: string) => module && module.toLowerCase() !== 'ops-default')
    : [];
  const sectorModules = getTopLineBucketsForSector(industrySectorCategory).map((bucket) => bucket.key);
  const moduleSource: 'layout-config' | 'sector-default' = layoutModules.length > 0 ? 'layout-config' : 'sector-default';
  const resolvedModules = moduleSource === 'layout-config' ? layoutModules : sectorModules;
  const enabledDashboardModules = resolvedModules.filter((module) => isTabModuleEnabled(module));
  const availableModuleTabs = Array.from(
    new Set([
      ...(resolvedModules.length > 0 ? resolvedModules : ['customers', 'ar', 'ap', 'products', 'inventory', 'cash']),
      'daily_financials',
      'working_capital_forecast',
    ])
  ).filter((module) => isTabModuleEnabled(module) && !['working_capital_forecast', 'working-capital-forecast'].includes(module));
  const availableTabs: OpTab[] = isOverviewOnly ? ['overview'] : ['dashboard', 'forecast', ...availableModuleTabs];
  const moduleTitlesByType = Object.fromEntries(
    orderedDashboardDataTypes
      .map((type) => {
        const modulesForType = availableModuleTabs.filter((module) => mapModuleToDataType(module) === type);
        if (!modulesForType.length) return [type, null];
        const labels = modulesForType.map((module) => getModuleLabel(module));
        return [type, labels.length === 1 ? labels[0] : `${labels[0]} (+${labels.length - 1})`];
      })
      .filter(([, label]) => Boolean(label))
  ) as Partial<Record<OpsDataType, string>>;
  const sectorProfile = getSectorMockProfile(industrySectorCategory);
  const sectorCode = sectorProfile.sectorCategory;
  const sectorLabel = SECTOR_NAMES[sectorCode] || 'This Sector';
  const monitorCards = [...(SECTOR_MONITOR_OVERRIDES[sectorCode] || []), ...UNIVERSAL_MONITOR_CARDS];
  const investigatePlaybooks = [...(SECTOR_INVESTIGATE_OVERRIDES[sectorCode] || []), ...UNIVERSAL_INVESTIGATIONS];

  const jumpToDataType = (type?: OpsDataType) => {
    if (!type) return;
    const targetModule = availableModuleTabs.find((module) => mapModuleToDataType(module) === type);
    if (targetModule) setActiveTab(targetModule as OpTab);
  };

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!initialTab) return;
    if (availableTabs.includes(initialTab as OpTab)) {
      setActiveTab(initialTab as OpTab);
    }
  }, [initialTab, availableTabs]);

  useEffect(() => {
    if (initialForecastBasisTab) {
      setActiveForecastBasisTab(initialForecastBasisTab);
    }
  }, [initialForecastBasisTab]);

  useEffect(() => {
    if (!initialForecastSubTab) return;
    if (initialForecastBasisTab === 'cash-basis') {
      setActiveCashBasisForecastTab(initialForecastSubTab);
      return;
    }
    if (initialForecastBasisTab === 'accrual-basis') {
      setActiveAccrualBasisForecastTab(initialForecastSubTab);
      return;
    }
    // Fallback when basis isn't explicitly provided: apply to current basis tab.
    if (activeForecastBasisTab === 'cash-basis') {
      setActiveCashBasisForecastTab(initialForecastSubTab);
    } else {
      setActiveAccrualBasisForecastTab(initialForecastSubTab);
    }
  }, [initialForecastSubTab, initialForecastBasisTab, activeForecastBasisTab]);

  useEffect(() => {
    const needsCashConversionData =
      activeTab === 'forecast' &&
      activeForecastBasisTab === 'cash-basis';
    if (!needsCashConversionData) return;

    let cancelled = false;
    Promise.all([fetchCashConversionFinancialData()])
      .then(([nextFinancialSeries]) => {
        if (cancelled) return;
        if (nextFinancialSeries) setCashConversionFinancialData(nextFinancialSeries);
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error('Failed to preload cash conversion analysis data:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    activeForecastBasisTab,
    activeAccrualBasisForecastTab,
    selectedCompanyId,
    industrySectorCategory,
    frequency,
    startDate,
    endDate,
  ]);

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
    if (activeTab !== 'overview' && activeTab !== 'dashboard' && mapModuleToDataType(activeTab)) {
      loadTabData(activeTab);
    }
  }, [activeTab, selectedCompanyId, industrySectorCategory, frequency, startDate, endDate]);

  useEffect(() => {
    setCompanyOperationalHubConfig(operationalHubConfig || null);
  }, [operationalHubConfig]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    const controller = new AbortController();
    fetch(`/api/companies?companyId=${encodeURIComponent(selectedCompanyId)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        const company = Array.isArray(data?.companies) ? data.companies[0] : null;
        const uda =
          company?.userDefinedAllocations &&
          typeof company.userDefinedAllocations === 'object' &&
          !Array.isArray(company.userDefinedAllocations)
            ? company.userDefinedAllocations
            : {};
        const nextConfig =
          uda?.operationalHub &&
          typeof uda.operationalHub === 'object' &&
          !Array.isArray(uda.operationalHub)
            ? uda.operationalHub
            : null;
        setCompanyOperationalHubConfig(nextConfig);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error('Failed to load company Operational Hub config:', error);
        }
      });
    return () => controller.abort();
  }, [selectedCompanyId]);

  useEffect(() => {
    const records = Array.isArray(dailyFinancialData?.records) ? dailyFinancialData.records : [];
    const maxStart = Math.max(0, records.length - 30);
    if (dailyFinancialWindowStart > maxStart) {
      setDailyFinancialWindowStart(maxStart);
    }
  }, [dailyFinancialData, dailyFinancialWindowStart]);

  useEffect(() => {
    setCustomerRevenuePeriodKey('all');
  }, [startDate, endDate, frequency, customerData]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    hasHydratedDateRangeRef.current = false;
    try {
      const storageKey = `ops:date-range:${selectedCompanyId}`;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        hasHydratedDateRangeRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as {
        frequency?: 'daily' | 'weekly' | 'monthly';
        startDate?: string;
        endDate?: string;
      };
      if (parsed.frequency === 'daily' || parsed.frequency === 'weekly' || parsed.frequency === 'monthly') {
        setFrequency(parsed.frequency);
      }
      if (typeof parsed.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)) {
        setStartDate(parsed.startDate);
      }
      if (typeof parsed.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)) {
        setEndDate(parsed.endDate > maxSelectableEndDate ? maxSelectableEndDate : parsed.endDate);
      }
    } catch {
      // Ignore invalid persisted payload
    } finally {
      hasHydratedDateRangeRef.current = true;
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId || !hasHydratedDateRangeRef.current) return;
    try {
      const storageKey = `ops:date-range:${selectedCompanyId}`;
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          frequency,
          startDate,
          endDate,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore storage failures
    }
  }, [selectedCompanyId, frequency, startDate, endDate]);

  useEffect(() => {
    if (!isCustomersTab || !selectedCompanyId) return;
    try {
      const unifiedStorageKey = `ops:date-range:${selectedCompanyId}`;
      const legacyStorageKey = `ops:customers:date-range:${selectedCompanyId}`;
      const raw = window.localStorage.getItem(unifiedStorageKey) || window.localStorage.getItem(legacyStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        frequency?: 'daily' | 'weekly' | 'monthly';
        startDate?: string;
        endDate?: string;
      };
      if (parsed.frequency === 'daily' || parsed.frequency === 'weekly' || parsed.frequency === 'monthly') {
        setFrequency(parsed.frequency);
      }
      if (typeof parsed?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)) {
        setStartDate(parsed.startDate);
      }
      if (typeof parsed?.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)) {
        setEndDate(parsed.endDate > maxSelectableEndDate ? maxSelectableEndDate : parsed.endDate);
      }
    } catch {
      // Ignore invalid saved range payloads
    }
  }, [isCustomersTab, selectedCompanyId]);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const needsAnyCoreData = !arData || !apData || !cashData || !inventoryData || !customerData || !productData;
    if (!needsAnyCoreData) return;

    let cancelled = false;
    setSmartCardsLoading(true);
    Promise.all([
      arData ? Promise.resolve(arData) : fetchOperationalType('ar-aging'),
      apData ? Promise.resolve(apData) : fetchOperationalType('ap-aging'),
      cashData ? Promise.resolve(cashData) : fetchOperationalType('cash'),
      inventoryData ? Promise.resolve(inventoryData) : fetchOperationalType('inventory'),
      customerData ? Promise.resolve(customerData) : fetchOperationalType('customers'),
      productData ? Promise.resolve(productData) : fetchOperationalType('products'),
    ])
      .then(([nextAr, nextAp, nextCash, nextInventory, nextCustomers, nextProducts]) => {
        if (cancelled) return;
        if (!arData && nextAr) setArData(nextAr);
        if (!apData && nextAp) setApData(nextAp);
        if (!cashData && nextCash) setCashData(nextCash);
        if (!inventoryData && nextInventory) setInventoryData(nextInventory);
        if (!customerData && nextCustomers) setCustomerData(nextCustomers);
        if (!productData && nextProducts) setProductData(nextProducts);
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error('Failed to preload smart card data:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setSmartCardsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, arData, apData, cashData, inventoryData, customerData, productData, selectedCompanyId, industrySectorCategory, frequency, startDate, endDate]);

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

  const fetchOperationalType = async (type: OpsDataType) => {
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
    return response.json();
  };

  const fetchCashConversionFinancialData = async () => {
    const response = await fetch(`/api/financials?companyId=${selectedCompanyId}`);
    if (!response.ok) throw new Error('Failed to load cash conversion financial data');
    const payload = await response.json();
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const latestRecord = records[0];
    const monthlyData = Array.isArray(latestRecord?.monthlyData) ? latestRecord.monthlyData : [];
    const normalizedRecords = monthlyData
      .map((row: any) => ({
        ...row,
        snapshotDate: row?.monthDate || row?.date || row?.snapshotDate,
        frequency: 'monthly',
      }))
      .filter((row: any) => Boolean(row?.snapshotDate))
      .sort((a: any, b: any) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime());

    return {
      records: normalizedRecords,
      mappedLines: [],
      summary: {
        source: 'master-financials',
        months: normalizedRecords.length,
      },
    };
  };

  const loadTabData = async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      const type = mapModuleToDataType(tab) || null;
      if (!type) {
        setLoading(false);
        return;
      }
      const data = await fetchOperationalType(type);
      
      switch (type) {
        case 'customers':
          setCustomerData(data);
          break;
        case 'ar-aging':
          setArData(data);
          break;
        case 'ap-aging':
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
        case 'daily-financials':
          setDailyFinancialData(data);
          break;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const severityStyles: Record<CardSeverity, { border: string; bg: string; badgeBg: string; badgeColor: string; label: string }> = {
    normal: { border: '#bfdbfe', bg: '#f8fafc', badgeBg: '#dcfce7', badgeColor: '#166534', label: 'Normal' },
    warning: { border: '#fde68a', bg: '#fffbeb', badgeBg: '#fef3c7', badgeColor: '#92400e', label: 'Watch' },
    critical: { border: '#fecaca', bg: '#fef2f2', badgeBg: '#fee2e2', badgeColor: '#991b1b', label: 'Alert' },
    loading: { border: '#e2e8f0', bg: '#f8fafc', badgeBg: '#f1f5f9', badgeColor: '#475569', label: 'Loading' },
  };

  const hasRealModuleData = (type?: OpsDataType): boolean => {
    if (!type) return false;
    const dataset =
      type === 'ar-aging'
        ? arData
        : type === 'ap-aging'
          ? apData
          : type === 'cash'
            ? cashData
            : type === 'inventory'
              ? inventoryData
              : type === 'customers'
                ? customerData
                : type === 'products'
                  ? productData
                  : null;
    return Array.isArray(dataset?.records) && dataset.records.length > 0;
  };

  const getMonitorInsight = (card: MonitorCard): { headline: string; detail: string; severity: CardSeverity } => {
    if (card.dataType && !hasRealModuleData(card.dataType)) {
      return {
        headline: 'No real data for this module yet',
        detail: 'Run operational sync and expand date range to populate this signal.',
        severity: 'loading',
      };
    }

    const arSummary = arData.summary || {};
    const apSummary = apData.summary || {};
    const cashSummary = cashData.summary || {};
    const arRecords = Array.isArray(arData.records) ? arData.records : [];
    const apRecords = Array.isArray(apData.records) ? apData.records : [];
    const inventorySummary = inventoryData?.summary || {};

    if (card.title === 'DSO Drift') {
      const currentDso = Number(arSummary.dso || 0);
      const latestAr = Number(arRecords[0]?.totalAR || arSummary.totalAR || 0);
      const trailingAvgAr = arRecords.length
        ? arRecords.reduce((sum: number, row: any) => sum + Number(row.totalAR || 0), 0) / arRecords.length
        : latestAr;
      const baselineDso = trailingAvgAr > 0 ? currentDso * (trailingAvgAr / Math.max(latestAr, 1)) : currentDso;
      const delta = currentDso - baselineDso;
      const severity: CardSeverity = delta >= 5 ? 'critical' : delta >= 2 ? 'warning' : 'normal';
      return {
        headline: `DSO ${currentDso.toFixed(1)} days (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs baseline)`,
        detail: `Baseline ${baselineDso.toFixed(1)} days (trailing-window proxy)`,
        severity,
      };
    }

    if (card.title === 'Past-Due AR Spike') {
      const currentOver30 = Number(arSummary.over30Pct || 0);
      const latest = arRecords[0];
      const previous = arRecords[1];
      const prevOver30 = previous
        ? ((Number(previous.days31to60 || 0) + Number(previous.days61to90 || 0) + Number(previous.days90plus || 0)) / Math.max(Number(previous.totalAR || 1), 1)) * 100
        : currentOver30;
      const delta = currentOver30 - prevOver30;
      const severity: CardSeverity = delta >= 15 ? 'critical' : delta >= 8 ? 'warning' : 'normal';
      return {
        headline: `AR >30d ${currentOver30.toFixed(1)}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts)`,
        detail: `Latest AR ${formatCurrency(Number(latest?.totalAR || arSummary.totalAR || 0))}`,
        severity,
      };
    }

    if (card.title === 'AP Past Due Risk') {
      const currentOver30 = Number(apSummary.over30Pct || 0);
      const totalAp = Number(apSummary.totalAP || 0);
      const severity: CardSeverity = currentOver30 >= 40 ? 'critical' : currentOver30 >= 28 ? 'warning' : 'normal';
      return {
        headline: `AP >30d ${currentOver30.toFixed(1)}%`,
        detail: `Total AP ${formatCurrency(totalAp)}`,
        severity,
      };
    }

    if (card.title === 'Spend Acceleration') {
      const latestAp = Number(apRecords[0]?.totalAP || apSummary.totalAP || 0);
      const previousAp = Number(apRecords[1]?.totalAP || latestAp || 0);
      const pct = previousAp > 0 ? ((latestAp - previousAp) / previousAp) * 100 : 0;
      const severity: CardSeverity = pct >= 15 ? 'critical' : pct >= 8 ? 'warning' : 'normal';
      return {
        headline: `AP trend ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% period-over-period`,
        detail: `${formatCurrency(previousAp)} -> ${formatCurrency(latestAp)}`,
        severity,
      };
    }

    if (card.title === 'Working Capital Spike') {
      const ar = Number(arSummary.totalAR || 0);
      const inv = Number(inventorySummary.totalValue || 0);
      const ap = Number(apSummary.totalAP || 0);
      const net = ar + inv - ap;
      const prevAr = Number(arRecords[1]?.totalAR || ar);
      const prevAp = Number(apRecords[1]?.totalAP || ap);
      const prevInv = Number(inventorySummary.totalValue || inv);
      const prevNet = prevAr + prevInv - prevAp;
      const pct = prevNet > 0 ? ((net - prevNet) / prevNet) * 100 : 0;
      const severity: CardSeverity = pct >= 10 ? 'critical' : pct >= 5 ? 'warning' : 'normal';
      return {
        headline: `Net working capital ${formatCurrency(net)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
        detail: `AR ${formatCurrency(ar)} + Inv ${formatCurrency(inv)} - AP ${formatCurrency(ap)}`,
        severity,
      };
    }

    if (card.title === 'Cash Runway') {
      const totalCash = Number(cashSummary.totalCash || 0);
      const monthlyBurn = Math.max(1, Math.abs(Number(cashSummary.changeAmount || 0)));
      const runwayMonths = totalCash / monthlyBurn;
      const runwayWeeks = runwayMonths * 4.33;
      const severity: CardSeverity = runwayWeeks < 8 ? 'critical' : runwayWeeks < 16 ? 'warning' : 'normal';
      return {
        headline: `Runway ~${runwayWeeks.toFixed(1)} weeks`,
        detail: `Cash ${formatCurrency(totalCash)} / burn proxy ${formatCurrency(monthlyBurn)} per period`,
        severity,
      };
    }

    if (card.dataType === 'ar-aging') {
      const over30 = Number(arSummary.over30Pct || 0);
      return {
        headline: `AR signal: ${over30.toFixed(1)}% over 30 days`,
        detail: `DSO ${Number(arSummary.dso || 0).toFixed(1)} days`,
        severity: over30 >= 35 ? 'warning' : 'normal',
      };
    }
    if (card.dataType === 'ap-aging') {
      const over30 = Number(apSummary.over30Pct || 0);
      return {
        headline: `AP signal: ${over30.toFixed(1)}% over 30 days`,
        detail: `DPO ${Number(apSummary.dpo || 0).toFixed(1)} days`,
        severity: over30 >= 35 ? 'warning' : 'normal',
      };
    }
    if (card.dataType === 'cash') {
      const change = Number(cashSummary.changePercent || 0);
      return {
        headline: `Cash ${change >= 0 ? '+' : ''}${change.toFixed(1)}% period change`,
        detail: `Total ${formatCurrency(Number(cashSummary.totalCash || 0))}`,
        severity: change <= -10 ? 'warning' : 'normal',
      };
    }
    if (card.dataType === 'inventory') {
      const totalValue = Number(inventorySummary.totalValue || 0);
      const itemCount = Number(inventorySummary.itemCount || 0);
      return {
        headline: `Inventory ${formatCurrency(totalValue)}`,
        detail: `${itemCount} items with tracked value`,
        severity: totalValue > 0 ? 'normal' : 'loading',
      };
    }
    if (card.dataType === 'products') {
      const products = Array.isArray(productData?.summary?.topProducts) ? productData.summary.topProducts : [];
      const avgMargin = products.length
        ? products.reduce((sum: number, row: any) => sum + Number(row.grossMarginPct || 0), 0) / products.length
        : 0;
      return {
        headline: `Avg product margin ${avgMargin.toFixed(1)}%`,
        detail: `${products.length} products with sales rows`,
        severity: products.length ? 'normal' : 'loading',
      };
    }
    if (card.dataType === 'customers') {
      const customers = Array.isArray(customerData?.summary?.topCustomers) ? customerData.summary.topCustomers : [];
      const totalRevenue = customers.reduce((sum: number, row: any) => sum + Number(row.totalRevenue || 0), 0);
      return {
        headline: `${customers.length} customers with sales`,
        detail: `Revenue tracked ${formatCurrency(totalRevenue)}`,
        severity: customers.length ? 'normal' : 'loading',
      };
    }

    return {
      headline: 'No real data-backed signal available',
      detail: 'This card is hidden until a mapped module has real records.',
      severity: 'loading',
    };
  };

  const getInvestigateInsight = (playbook: InvestigatePlaybook): InvestigateInsight => {
    if (playbook.dataType && !hasRealModuleData(playbook.dataType)) {
      return {
        whyNow: 'No real data for this module yet',
        impact: 'Run operational sync and widen date range to generate investigate outputs',
        drivers: [],
        startHere: playbook.path,
        owner: 'Ops Team',
        eta: '1-2 days',
        freshness: 'No records',
        confidence: 'Low',
        severity: smartCardsLoading ? 'loading' : 'normal',
      };
    }

    const arSummary = arData.summary || {};
    const apSummary = apData.summary || {};
    const cashSummary = cashData.summary || {};
    const inventorySummary = inventoryData?.summary || {};
    const productsSummary = productData?.summary || {};
    const customersSummary = customerData?.summary || {};

    const arDrivers = (Array.isArray(arSummary.unpaidByCustomer) ? arSummary.unpaidByCustomer : [])
      .map((row: any) => ({
        name: row.customerName,
        overdue: Number(row.days31to60 || 0) + Number(row.days61to90 || 0) + Number(row.days90plus || 0),
      }))
      .sort((a: any, b: any) => b.overdue - a.overdue);
    const apDrivers = (Array.isArray(apSummary.unpaidByVendor) ? apSummary.unpaidByVendor : [])
      .map((row: any) => ({
        name: row.vendorName,
        overdue: Number(row.days31to60 || 0) + Number(row.days61to90 || 0) + Number(row.days90plus || 0),
      }))
      .sort((a: any, b: any) => b.overdue - a.overdue);

    const ownerByType: Record<string, { owner: string; eta: string }> = {
      'ar-aging': { owner: 'Collections Lead', eta: '24-72 hours' },
      'ap-aging': { owner: 'AP Manager', eta: '1-3 days' },
      cash: { owner: 'Controller', eta: 'Same day' },
      products: { owner: 'Ops + Finance', eta: '2-4 days' },
      customers: { owner: 'Revenue Ops', eta: '1-2 days' },
      inventory: { owner: 'Supply Chain', eta: '2-4 days' },
    };
    const ownerMeta = ownerByType[playbook.dataType || ''] || { owner: 'Ops Team', eta: '1-3 days' };

    if (playbook.title === 'Why did AR worsen?') {
      const over30 = Number(arSummary.over30Pct || 0);
      const dso = Number(arSummary.dso || 0);
      const top = arDrivers[0];
      const impact = arDrivers.slice(0, 3).reduce((sum: number, row: any) => sum + row.overdue, 0);
      const severity: CardSeverity = over30 >= 35 || dso >= 50 ? 'critical' : over30 >= 25 ? 'warning' : 'normal';
      return {
        whyNow: `AR >30d is ${over30.toFixed(1)}% with DSO at ${dso.toFixed(1)} days`,
        impact: `~${formatCurrency(impact)} concentrated in top overdue accounts`,
        drivers: arDrivers.slice(0, 3).map((row: any) => `${row.name} (${formatCurrency(row.overdue)})`),
        startHere: top ? `Open AR for ${top.name}` : playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: arDrivers.length >= 3 ? 'High' : 'Medium',
        severity,
        focusCustomer: top?.name || null,
      };
    }

    if (playbook.title === 'Why did spend spike?') {
      const totalAp = Number(apSummary.totalAP || 0);
      const over30 = Number(apSummary.over30Pct || 0);
      const top = apDrivers[0];
      const impact = apDrivers.slice(0, 3).reduce((sum: number, row: any) => sum + row.overdue, 0);
      const severity: CardSeverity = over30 >= 35 ? 'critical' : over30 >= 25 ? 'warning' : 'normal';
      return {
        whyNow: `AP aging pressure: ${over30.toFixed(1)}% over 30 days`,
        impact: `~${formatCurrency(impact)} in top overdue vendors; total AP ${formatCurrency(totalAp)}`,
        drivers: apDrivers.slice(0, 3).map((row: any) => `${row.name} (${formatCurrency(row.overdue)})`),
        startHere: top ? `Open AP for ${top.name}` : playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: apDrivers.length >= 3 ? 'High' : 'Medium',
        severity,
        focusVendor: top?.name || null,
      };
    }

    if (playbook.title === 'Why did cash change?') {
      const totalCash = Number(cashSummary.totalCash || 0);
      const changeAmt = Number(cashSummary.changeAmount || 0);
      const changePct = Number(cashSummary.changePercent || 0);
      const accounts = Array.isArray(cashSummary.accounts) ? cashSummary.accounts : [];
      const drivers = accounts
        .sort((a: any, b: any) => Math.abs(Number(b.currentBalance || 0) - Number(b.avgBalance || 0)) - Math.abs(Number(a.currentBalance || 0) - Number(a.avgBalance || 0)))
        .slice(0, 3)
        .map((acct: any) => `${acct.accountName} (${formatCurrency(Number(acct.currentBalance || 0))})`);
      const severity: CardSeverity = changePct <= -10 ? 'critical' : changePct <= -4 ? 'warning' : 'normal';
      return {
        whyNow: `Cash moved ${changeAmt >= 0 ? '+' : ''}${formatCurrency(changeAmt)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`,
        impact: `Current liquidity ${formatCurrency(totalCash)}`,
        drivers,
        startHere: 'Open cash trend + account variance',
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: drivers.length ? 'High' : 'Medium',
        severity,
      };
    }

    if (playbook.title === 'Why did margin shrink?') {
      const products = Array.isArray(productsSummary.topProducts) ? productsSummary.topProducts : [];
      const lowestMargin = [...products]
        .sort((a: any, b: any) => Number(a.grossMarginPct || 0) - Number(b.grossMarginPct || 0))
        .slice(0, 3);
      const atRiskRevenue = lowestMargin.reduce((sum: number, row: any) => sum + Number(row.totalRevenue || 0), 0);
      const avgMargin = products.length
        ? products.reduce((sum: number, row: any) => sum + Number(row.grossMarginPct || 0), 0) / products.length
        : 0;
      const severity: CardSeverity = avgMargin < 25 ? 'critical' : avgMargin < 35 ? 'warning' : 'normal';
      return {
        whyNow: `Average gross margin is ${avgMargin.toFixed(1)}% across top products`,
        impact: `${formatCurrency(atRiskRevenue)} revenue tied to lowest-margin items`,
        drivers: lowestMargin.map((row: any) => `${row.name} (${Number(row.grossMarginPct || 0).toFixed(1)}%)`),
        startHere: 'Open products sorted by gross margin %',
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: lowestMargin.length ? 'Medium' : 'Low',
        severity,
      };
    }

    if (playbook.title === 'What moved working capital?') {
      const ar = Number(arSummary.totalAR || 0);
      const ap = Number(apSummary.totalAP || 0);
      const inv = Number(inventorySummary.totalValue || 0);
      const net = ar + inv - ap;
      const components = [
        { name: 'AR', value: ar },
        { name: 'Inventory', value: inv },
        { name: 'AP (offset)', value: -ap },
      ].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const severity: CardSeverity = net > 250000 ? 'warning' : 'normal';
      return {
        whyNow: `Net working capital sits at ${formatCurrency(net)}`,
        impact: `Cash tied up by AR + Inventory less AP offset`,
        drivers: components.slice(0, 3).map((row) => `${row.name}: ${row.value >= 0 ? '' : '-'}${formatCurrency(Math.abs(row.value))}`),
        startHere: 'Open cash and reconcile AR / Inventory / AP contributions',
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: 'Medium',
        severity,
      };
    }

    if (playbook.title === 'What should we do next?') {
      const topCustomers = (Array.isArray(customersSummary.topCustomers) ? customersSummary.topCustomers : []).slice(0, 3);
      const over30 = Number(arSummary.over30Pct || 0);
      const changePct = Number(cashSummary.changePercent || 0);
      const severity: CardSeverity = over30 > 30 || changePct < -8 ? 'warning' : 'normal';
      return {
        whyNow: `Cash ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% and AR >30d at ${over30.toFixed(1)}%`,
        impact: 'Focus response on collection acceleration and spend controls',
        drivers: topCustomers.map((row: any) => `${row.name} (${formatCurrency(Number(row.totalRevenue || 0))})`),
        startHere: topCustomers[0] ? `Open customer trends for ${topCustomers[0].name}` : playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: topCustomers.length ? 'Medium' : 'Low',
        severity,
      };
    }

    if (playbook.dataType === 'products') {
      const products = Array.isArray(productsSummary.topProducts) ? productsSummary.topProducts : [];
      const avgMargin = products.length
        ? products.reduce((sum: number, row: any) => sum + Number(row.grossMarginPct || 0), 0) / products.length
        : 0;
      return {
        whyNow: `Product margin context ${avgMargin.toFixed(1)}% across ${products.length} items`,
        impact: playbook.outcome,
        drivers: products.slice(0, 3).map((row: any) => `${row.name} (${formatCurrency(Number(row.totalRevenue || 0))})`),
        startHere: playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: products.length ? 'Medium' : 'Low',
        severity: products.length ? 'normal' : 'loading',
      };
    }
    if (playbook.dataType === 'inventory') {
      const totalValue = Number(inventorySummary.totalValue || 0);
      const itemCount = Number(inventorySummary.itemCount || 0);
      return {
        whyNow: `Inventory snapshot ${formatCurrency(totalValue)} across ${itemCount} items`,
        impact: playbook.outcome,
        drivers: [],
        startHere: playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: itemCount > 0 ? 'Medium' : 'Low',
        severity: itemCount > 0 ? 'normal' : 'loading',
      };
    }
    if (playbook.dataType === 'customers') {
      const topCustomers = (Array.isArray(customersSummary.topCustomers) ? customersSummary.topCustomers : []).slice(0, 3);
      return {
        whyNow: `Customer sales rows present for ${topCustomers.length} leading accounts`,
        impact: playbook.outcome,
        drivers: topCustomers.map((row: any) => `${row.name} (${formatCurrency(Number(row.totalRevenue || 0))})`),
        startHere: playbook.path,
        owner: ownerMeta.owner,
        eta: ownerMeta.eta,
        freshness: `As of ${new Date(endDate).toLocaleDateString()}`,
        confidence: topCustomers.length ? 'Medium' : 'Low',
        severity: topCustomers.length ? 'normal' : 'loading',
      };
    }

    return {
      whyNow: 'No real data-backed investigate output yet',
      impact: 'This playbook is unavailable until real records exist for its module',
      drivers: [],
      startHere: playbook.path,
      owner: ownerMeta.owner,
      eta: ownerMeta.eta,
      freshness: 'No records',
      confidence: 'Low',
      severity: 'loading',
    };
  };

  const openInvestigate = (playbook: InvestigatePlaybook, insight: InvestigateInsight) => {
    if (playbook.dataType === 'ar-aging' && insight.focusCustomer) {
      setSelectedInvoiceCustomer(insight.focusCustomer);
      setCustomerInvoicePage(1);
    }
    if (playbook.dataType === 'ap-aging' && insight.focusVendor) {
      setSelectedVendorBill(insight.focusVendor);
      setVendorBillsPage(1);
    }
    if (playbook.dataType === 'customers') {
      setDemandSortKey('backlogTotal');
      setDemandSortDir('desc');
    }
    jumpToDataType(playbook.dataType);
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
  const formatUnitCost = (value: number) => {
    const abs = Math.abs(Number(value || 0));
    const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : abs > 0 ? 4 : 2;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number(value || 0));
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
  const parseDateValue = (raw: string | undefined | null): Date | null => {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const formatDateUtcMinus4 = (
    raw: string | Date | null | undefined,
    options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
  ): string => {
    const parsed = raw instanceof Date ? raw : parseDateValue(raw ?? null);
    if (!parsed) return 'N/A';
    const shifted = new Date(parsed.getTime() - 4 * 60 * 60 * 1000);
    return shifted.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  };

  const renderFilters = () => {
    if (
      isOverviewOnly ||
      activeTab === 'overview' ||
      activeTab === 'dashboard' ||
      activeTab === 'forecast' ||
      activeTab === 'working_capital_forecast' ||
      activeTab === 'working-capital-forecast'
    ) {
      return null;
    }

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
        {!isCustomersTab && (
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
        )}

        {/* Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            From:
          </label>
          <input
            type="date"
            value={startDate}
            max={endDate}
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
            max={maxSelectableEndDate}
            onChange={(e) => {
              const candidate = e.target.value;
              setEndDate(candidate > maxSelectableEndDate ? maxSelectableEndDate : candidate);
            }}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
          {isCustomersTab ? (
            <>
              {customerDateRangeSaveStatus && (
                <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                  {customerDateRangeSaveStatus}
                </span>
              )}
              <button
                onClick={() => {
                  try {
                    const unifiedStorageKey = `ops:date-range:${selectedCompanyId}`;
                    const legacyStorageKey = `ops:customers:date-range:${selectedCompanyId}`;
                    const payload = JSON.stringify({
                      frequency,
                      startDate,
                      endDate,
                      savedAt: new Date().toISOString(),
                    });
                    window.localStorage.setItem(
                      unifiedStorageKey,
                      payload
                    );
                    window.localStorage.setItem(legacyStorageKey, payload);
                    setCustomerDateRangeSaveStatus('Saved');
                  } catch {
                    setCustomerDateRangeSaveStatus('Save failed');
                  }
                  window.setTimeout(() => setCustomerDateRangeSaveStatus(null), 2500);
                }}
                style={{
                  padding: '6px 12px',
                  background: '#2563eb',
                  border: '1px solid #1d4ed8',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </>
          ) : frequency === 'daily' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setDate(start.getDate() - 30);
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setDate(start.getDate() - 90);
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
          {!isCustomersTab && frequency === 'weekly' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setDate(start.getDate() - (8 * 7)); // 8 weeks
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setDate(start.getDate() - (16 * 7)); // 16 weeks
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
          {!isCustomersTab && frequency === 'monthly' && (
            <>
              <button
                onClick={() => {
                  const end = new Date();
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setMonth(start.getMonth() - 6);
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
                  end.setDate(end.getDate() - 1);
                  const start = new Date(end);
                  start.setMonth(start.getMonth() - 12);
                  setStartDate(toLocalInputDate(start));
                  setEndDate(toLocalInputDate(end));
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
    <div style={{ padding: '12px 24px' }}>
      {(() => {
        const severityRank: Record<CardSeverity, number> = {
          critical: 3,
          warning: 2,
          normal: 1,
          loading: 0,
        };
        const rankedMonitorCards = monitorCards
          .map((card, index) => ({ card, insight: getMonitorInsight(card), index }))
          .sort((a, b) => (severityRank[b.insight.severity] - severityRank[a.insight.severity]) || (a.index - b.index))
          .slice(0, 6);
        const rankedInvestigateCards = investigatePlaybooks
          .map((playbook, index) => ({ playbook, insight: getInvestigateInsight(playbook), index }))
          .sort((a, b) => (severityRank[b.insight.severity] - severityRank[a.insight.severity]) || (a.index - b.index))
          .slice(0, 6);

        return (
          <>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>
        Operations Overview
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px 12px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: '0 0 3px 0', lineHeight: 1.2 }}>Monitor</h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px 0' }}>Trigger cards for near-term risk and change detection.</p>
          <div style={{ display: 'grid', gap: '8px' }}>
            {rankedMonitorCards.map(({ card, insight }) => {
              const severity = severityStyles[insight.severity];
              return (
              <div key={card.title} style={{ border: `1px solid ${severity.border}`, borderRadius: '8px', padding: '8px 10px', background: severity.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{card.title}</h4>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', padding: '3px 9px', borderRadius: '999px', background: severity.badgeBg, color: severity.badgeColor, fontWeight: 700 }}>
                      {severity.label}
                    </span>
                    {card.dataType && (
                      <button
                        onClick={() => jumpToDataType(card.dataType)}
                        style={{ fontSize: '13px', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: '2px', fontSize: '15px', color: '#0f172a', fontWeight: 700, lineHeight: 1.35 }}>{insight.headline}</div>
                <div style={{ marginTop: '3px', fontSize: '14px', color: '#334155', lineHeight: 1.35 }}>{insight.detail}</div>
                <div style={{ fontSize: '14px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}><strong>Question:</strong> {card.question}</div>
                <div style={{ fontSize: '14px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}><strong>Trigger:</strong> {card.trigger}</div>
                <div style={{ fontSize: '14px', color: '#475569', marginTop: '3px', lineHeight: 1.35 }}><strong>Drill:</strong> {card.drill}</div>
              </div>
            )})}
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px 12px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: '0 0 3px 0', lineHeight: 1.2 }}>Investigate</h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px 0' }}>Playbooks to explain deltas and produce actions.</p>
          <div style={{ display: 'grid', gap: '8px' }}>
            {rankedInvestigateCards.map(({ playbook, insight }) => {
              const severity = severityStyles[insight.severity];
              return (
                <div key={playbook.title} style={{ border: `1px solid ${severity.border}`, borderRadius: '8px', padding: '8px 10px', background: severity.bg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{playbook.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', padding: '3px 9px', borderRadius: '999px', background: severity.badgeBg, color: severity.badgeColor, fontWeight: 700 }}>
                        {severity.label}
                      </span>
                      <button
                        onClick={() => openInvestigate(playbook, insight)}
                        style={{ fontSize: '13px', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Investigate
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', color: '#0f172a', marginTop: '3px', fontWeight: 700, lineHeight: 1.35 }}><strong>Why now:</strong> {insight.whyNow}</div>
                  <div style={{ fontSize: '14px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}><strong>Impact:</strong> {insight.impact}</div>
                  {insight.drivers.length > 0 && (
                    <div style={{ fontSize: '14px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}>
                      <strong>Top drivers:</strong> {insight.drivers.join(' | ')}
                    </div>
                  )}
                  <div style={{ fontSize: '14px', color: '#334155', marginTop: '3px', lineHeight: 1.35 }}><strong>Start:</strong> {insight.startHere}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px', lineHeight: 1.35 }}>
                    <strong>Owner/ETA:</strong> {insight.owner} / {insight.eta} | <strong>Confidence:</strong> {insight.confidence} | <strong>Data:</strong> {insight.freshness}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

          </>
        );
      })()}
    </div>
  );

  // Customer Analytics Tab
  const renderCustomers = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading customer data...</div>;
    }

    if (!customerData) return null;

    const { records, summary } = customerData;
    const customerTotalsFromRecords = records.reduce((acc: Record<string, { name: string; totalRevenue: number; totalInvoices: number }>, record: any) => {
      const name = String(record?.customerName || 'Unknown Customer');
      if (!acc[name]) {
        acc[name] = {
          name,
          totalRevenue: 0,
          totalInvoices: 0,
        };
      }
      acc[name].totalRevenue += Number(record?.revenue || 0);
      acc[name].totalInvoices += Number(record?.invoiceCount || 0);
      return acc;
    }, {});
    const rankedCustomers = Object.values(customerTotalsFromRecords).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);

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
    const customerCoverageDates = records
      .map((record: any) => parseDateValue(record.snapshotDate))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());
    const customerCoverageStart = customerCoverageDates[0] || null;
    const customerCoverageEnd = customerCoverageDates[customerCoverageDates.length - 1] || null;
    const customerAsOfLabel = customerCoverageEnd
      ? customerCoverageEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';
    const customerCoverageLabel =
      customerCoverageStart && customerCoverageEnd
        ? `${formatDateUtcMinus4(customerCoverageStart)} - ${formatDateUtcMinus4(customerCoverageEnd)} (UTC-4)`
        : 'N/A';
    const selectedStartDate = parseDateValue(startDate);
    const selectedEndDate = parseDateValue(endDate);
    const selectedDateRangeLabel =
      selectedStartDate && selectedEndDate
        ? `${formatDateUtcMinus4(selectedStartDate)} - ${formatDateUtcMinus4(selectedEndDate)} (UTC-4)`
        : customerCoverageLabel;
    const kpiDateRangeLabel = `Date range: ${selectedDateRangeLabel}`;
    const totalRevenueAll = rankedCustomers.reduce((sum: number, customer: any) => sum + Number(customer.totalRevenue || 0), 0);
    const top1Revenue = rankedCustomers.slice(0, 1).reduce((sum: number, customer: any) => sum + Number(customer.totalRevenue || 0), 0);
    const top5Revenue = rankedCustomers.slice(0, 5).reduce((sum: number, customer: any) => sum + Number(customer.totalRevenue || 0), 0);
    const top10Revenue = rankedCustomers.slice(0, 10).reduce((sum: number, customer: any) => sum + Number(customer.totalRevenue || 0), 0);
    const top1Share = totalRevenueAll > 0 ? (top1Revenue / totalRevenueAll) * 100 : 0;
    const top5Share = totalRevenueAll > 0 ? (top5Revenue / totalRevenueAll) * 100 : 0;
    const top10Share = totalRevenueAll > 0 ? (top10Revenue / totalRevenueAll) * 100 : 0;
    const concentrationStatus = top5Share > 65 ? 'Investigate' : top5Share > 50 ? 'Warning' : 'Acceptable';
    const customerPeriodRecords = records
      .map((record: any) => {
        const parsed = parseDateValue(record.snapshotDate);
        if (!parsed) return null;
        const utcDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
        const yearKey = String(utcDate.getUTCFullYear());
        const quarterKey = `${yearKey}-Q${Math.floor(utcDate.getUTCMonth() / 3) + 1}`;
        const monthKey = `${yearKey}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}`;
        return { record, utcDate, yearKey, quarterKey, monthKey };
      })
      .filter((row: any): row is NonNullable<typeof row> => Boolean(row));
    const periodAccessor =
      customerRevenuePeriodMode === 'year'
        ? 'yearKey'
        : customerRevenuePeriodMode === 'quarter'
          ? 'quarterKey'
          : 'monthKey';
    const periodSet = new Set<string>();
    for (const row of customerPeriodRecords) {
      periodSet.add(String((row as any)[periodAccessor]));
    }
    const periodOptions = Array.from(periodSet).sort((a, b) => String(b).localeCompare(String(a)));
    const effectivePeriodKey =
      customerRevenuePeriodKey !== 'all' && periodOptions.includes(customerRevenuePeriodKey)
        ? customerRevenuePeriodKey
        : periodOptions[0] || 'all';
    const filteredRecordsForTopCustomers =
      effectivePeriodKey === 'all'
        ? records
        : customerPeriodRecords
            .filter((row: any) => String((row as any)[periodAccessor]) === effectivePeriodKey)
            .map((row: any) => row.record);
    const tableCustomerTotals = filteredRecordsForTopCustomers.reduce((acc: Record<string, { name: string; totalRevenue: number; totalInvoices: number }>, record: any) => {
      const name = String(record?.customerName || 'Unknown Customer');
      if (!acc[name]) {
        acc[name] = { name, totalRevenue: 0, totalInvoices: 0 };
      }
      acc[name].totalRevenue += Number(record?.revenue || 0);
      acc[name].totalInvoices += Number(record?.invoiceCount || 0);
      return acc;
    }, {});
    const rankedCustomersForTable = Object.values(tableCustomerTotals).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);
    const selectedPeriodLabel =
      customerRevenuePeriodMode === 'year'
        ? effectivePeriodKey
        : customerRevenuePeriodMode === 'quarter'
          ? effectivePeriodKey
          : effectivePeriodKey === 'all'
            ? 'All Months'
            : (() => {
                const [y, m] = String(effectivePeriodKey).split('-');
                const monthDate = new Date(Date.UTC(Number(y), Math.max(0, Number(m) - 1), 1));
                return Number.isNaN(monthDate.getTime())
                  ? String(effectivePeriodKey)
                  : monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
              })();
    const retentionProxyRows = rankedCustomers.slice(0, 8).map((customer: any, index: number) => {
      const baselineFactor = 0.88 + (index % 5) * 0.03;
      const priorRevenue = Number(customer.totalRevenue || 0) * baselineFactor;
      const currentRevenue = Number(customer.totalRevenue || 0);
      const changePct = priorRevenue > 0 ? ((currentRevenue - priorRevenue) / priorRevenue) * 100 : 0;
      return {
        customer: customer.name,
        priorRevenue,
        currentRevenue,
        changePct,
        status: changePct < -5 ? 'At Risk' : changePct < 2 ? 'Flat' : 'Expanding',
      };
    });
    const invoiceVelocityTrend = trendData.map((row: any) => ({
      month: row.month,
      revenue: Number(row.revenue || 0),
      avgInvoice: Number(row.invoices || 0) > 0 ? Number(row.revenue || 0) / Number(row.invoices || 1) : 0,
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Customer Sales Analytics
        </h2>

        {(() => {
          const topTenRaw = rankedCustomersForTable.slice(0, 10);
          const tableCustomers = topTenRaw.map((customer) => ({
            ...customer,
            totalInvoices: Math.max(1, Math.round(customer.totalInvoices || customer.totalRevenue / 10000)),
          }));
          const chartCustomers = tableCustomers;
          const chartTotal = chartCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0);
          const bookingsSummary = summary?.bookings || {};
          const bookingsTotals = {
            mtd: Number(bookingsSummary?.totals?.mtd || 0),
            qtd: Number(bookingsSummary?.totals?.qtd || 0),
            ytd: Number(bookingsSummary?.totals?.ytd || 0),
          };
          const bookingsTop5 = {
            mtd: Number(bookingsSummary?.top5?.mtd || 0),
            qtd: Number(bookingsSummary?.top5?.qtd || 0),
            ytd: Number(bookingsSummary?.top5?.ytd || 0),
          };
          const bookingsTopRows = (Array.isArray(bookingsSummary?.topCustomers) ? bookingsSummary.topCustomers : [])
            .map((row: any) => ({
              customerName: String(row?.customerName || 'Unknown Customer'),
              mtd: Number(row?.mtd || 0),
              qtd: Number(row?.qtd || 0),
              ytd: Number(row?.ytd || 0),
            }))
            .sort((a: any, b: any) => b.ytd - a.ytd)
            .slice(0, 10);
          const atRiskRows: any[] = [];

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
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(280px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings</div>
                  <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>MTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTotals.mtd)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>QTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTotals.qtd)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>YTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTotals.ytd)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings Top 5 Customers</div>
                  <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>MTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTop5.mtd)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>QTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTop5.qtd)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>YTD</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(bookingsTop5.ytd)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'white', padding: '16px 20px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0, marginBottom: '10px' }}>
                  Top Customers by Bookings
                </h3>
                {bookingsTopRows.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>No bookings found in selected window.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                          <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Rank</th>
                          <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Customer</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>MTD</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>QTD</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>YTD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookingsTopRows.map((row: any, index: number) => (
                          <tr key={`${row.customerName}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b' }}>#{index + 1}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{row.customerName}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.mtd)}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.qtd)}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#16a34a', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(row.ytd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Top Customers Table */}
              <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                    Top Customers by Revenue
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                      value={customerRevenuePeriodMode}
                      onChange={(e) => {
                        const mode = e.target.value as 'year' | 'quarter' | 'month';
                        setCustomerRevenuePeriodMode(mode);
                        setCustomerRevenuePeriodKey('all');
                      }}
                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', color: '#334155', background: 'white' }}
                    >
                      <option value="year">Year</option>
                      <option value="quarter">Quarter</option>
                      <option value="month">Month</option>
                    </select>
                    <select
                      value={effectivePeriodKey}
                      onChange={(e) => setCustomerRevenuePeriodKey(e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', color: '#334155', background: 'white' }}
                    >
                      {periodOptions.map((option) => (
                        <option key={option} value={option}>
                          {customerRevenuePeriodMode === 'month'
                            ? (() => {
                                const [y, m] = String(option).split('-');
                                const d = new Date(Date.UTC(Number(y), Math.max(0, Number(m) - 1), 1));
                                return Number.isNaN(d.getTime())
                                  ? option
                                  : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                              })()
                            : option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                  Selected period: {selectedPeriodLabel}
                </div>
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

            {(isSectionEnabled('customersConcentrationRisk') || isSectionEnabled('customersRetentionProxy')) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isSectionEnabled('customersConcentrationRisk') && isSectionEnabled('customersRetentionProxy') ? '1fr 1fr' : '1fr',
                  gap: '24px',
                  marginBottom: '24px',
                }}
              >
              {isSectionEnabled('customersConcentrationRisk') && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  Customer Concentration Risk
                </h3>
                <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
                  As of: {customerAsOfLabel} | Coverage: {customerCoverageLabel}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Metric</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Share</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Top 1 Revenue Share', value: top1Share, status: top1Share > 30 ? 'Investigate' : top1Share > 20 ? 'Warning' : 'Acceptable' },
                      { label: 'Top 5 Revenue Share', value: top5Share, status: top5Share > 65 ? 'Investigate' : top5Share > 50 ? 'Warning' : 'Acceptable' },
                      { label: 'Top 10 Revenue Share', value: top10Share, status: top10Share > 85 ? 'Investigate' : top10Share > 70 ? 'Warning' : 'Acceptable' },
                    ].map((row) => (
                      <tr key={row.label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{row.label}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: 700 }}>{row.value.toFixed(1)}%</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: row.status === 'Investigate' ? '#dc2626' : row.status === 'Warning' ? '#d97706' : '#16a34a', fontWeight: 700 }}>
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}

              {isSectionEnabled('customersRetentionProxy') && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  Revenue Retention Proxy (Top Accounts)
                </h3>
                <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
                  Current vs baseline-period proxy for top accounts.
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={retentionProxyRows} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" tickFormatter={(value) => `$${(Number(value || 0) / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="customer" stroke="#64748b" width={150} style={{ fontSize: '12px' }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Bar dataKey="priorRevenue" fill="#94a3b8" name="Baseline Revenue" />
                    <Bar dataKey="currentRevenue" fill="#2563eb" name="Current Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </div>
            )}

            {(isSectionEnabled('customersInvoiceVelocity') || isSectionEnabled('customersAtRiskQueue')) && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isSectionEnabled('customersInvoiceVelocity') && isSectionEnabled('customersAtRiskQueue') ? '1fr 1fr' : '1fr',
                  gap: '24px',
                }}
              >
              {isSectionEnabled('customersInvoiceVelocity') && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  Revenue vs Invoice Velocity
                </h3>
                <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
                  Tracks revenue and average invoice value over time.
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={invoiceVelocityTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
                    <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(Number(value || 0) / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(Number(value || 0) / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" fill="#1d4ed8" name="Revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="avgInvoice" stroke="#16a34a" strokeWidth={2} dot={false} name="Avg Invoice Value" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              )}

              {false && isSectionEnabled('customersAtRiskQueue') && (
                <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  At-Risk Accounts Queue
                </h3>
                <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
                  Prioritized by declining trend and aged backlog mix.
                </div>
                {atRiskRows.length === 0 ? (
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    No at-risk accounts detected for this window.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                          <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Customer</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>YTD Bookings</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Backlog 90+</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Backlog 90+ %</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: 700, color: 'white' }}>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atRiskRows.map((row) => (
                          <tr key={row.customerName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{row.customerName}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.bookingsYtd)}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#991b1b', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(row.backlog90)}</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{row.backlog90Pct.toFixed(1)}%</td>
                            <td style={{ padding: '6px 10px', fontSize: '13px', color: row.trendK < 0 ? '#dc2626' : '#16a34a', textAlign: 'right', fontWeight: 700 }}>
                              {row.trendK >= 0 ? '+' : '-'}${Math.abs(row.trendK)}k/mo
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </div>
            )}
            </>
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
    const arCurrentPct = Number(summary?.currentPct ?? 0);
    const arOver30Pct = Number(summary?.over30Pct ?? 0);
    const arOver90Pct = Number(summary?.over90Pct ?? 0);
    const arDso = Number(summary?.dso ?? 0);
    const latestRecord = records[0];
    const arCustomers = (summary?.breakdown || summary?.unpaidByCustomer || []).map((row: any) => ({
      customerId: row.customerId || row.customerNumber || '-',
      customerName: row.customerName || row.name,
      current: row.current || 0,
      days1to30: row.days1to30 || 0,
      days31to60: row.days31to60 || 0,
      days61to90: row.days61to90 || 0,
      days90plus: row.days90plus || 0,
      totalDue: row.totalDue || row.total || (row.current || 0) + (row.days1to30 || 0) + (row.days31to60 || 0) + (row.days61to90 || 0) + (row.days90plus || 0),
      contractValueTotal: row.contractValueTotal || 0,
      remainingToInvoice: row.remainingToInvoice || 0,
      accruedRevenueUnbilled: row.accruedRevenueUnbilled || 0,
      invoicedRevenue: row.invoicedRevenue || 0,
      cashCollectedToDate: row.cashCollectedToDate || 0,
      lastPaymentDate: row.lastPaymentDate || null,
    }));
    const unpaidByCustomer = arCustomers
      .map((row) => ({ customerName: row.customerName, totalDue: row.totalDue }))
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, 10);
    const unpaidTotal = unpaidByCustomer.reduce((sum, item) => sum + item.totalDue, 0);
    const invoices = (summary?.unpaidInvoices || []).map((row: any) => ({
      customerName: row.customerName || row.customer,
      customerNumber: row.customerNumber || row.customerId || row.customerNo || '-',
      invoiceDate: row.invoiceDate || row.date,
      amountDue: row.amountDue || row.balance || 0,
      daysOutstanding: (() => {
        const invoiceDate = row.invoiceDate || row.date;
        if (!invoiceDate) return null;
        const invoiceDt = parseDateValue(invoiceDate);
        if (!invoiceDt) return null;
        const now = new Date();
        const dayMs = 24 * 60 * 60 * 1000;
        const diff = Math.floor(
          (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
            Date.UTC(invoiceDt.getFullYear(), invoiceDt.getMonth(), invoiceDt.getDate())) /
            dayMs
        );
        return Math.max(0, diff);
      })(),
    }));
    const sortedInvoices = [...invoices].sort((a, b) => {
      const dir = unpaidInvoicesSortDir === 'asc' ? 1 : -1;
      if (unpaidInvoicesSortKey === 'customerName') {
        return a.customerName.localeCompare(b.customerName) * dir;
      }
      if (unpaidInvoicesSortKey === 'amountDue') {
        return (Number(a.amountDue || 0) - Number(b.amountDue || 0)) * dir;
      }
      if (unpaidInvoicesSortKey === 'invoiceDate') {
        const aDate = a.invoiceDate ? new Date(a.invoiceDate).getTime() : -Infinity;
        const bDate = b.invoiceDate ? new Date(b.invoiceDate).getTime() : -Infinity;
        return (aDate - bDate) * dir;
      }
      if (unpaidInvoicesSortKey === 'daysOutstanding') {
        return (Number(a.daysOutstanding ?? -1) - Number(b.daysOutstanding ?? -1)) * dir;
      }
      return 0;
    });
    const toggleUnpaidInvoicesSort = (key: 'customerName' | 'invoiceDate' | 'daysOutstanding' | 'amountDue') => {
      setUnpaidInvoicesPage(1);
      if (unpaidInvoicesSortKey === key) {
        setUnpaidInvoicesSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setUnpaidInvoicesSortKey(key);
        setUnpaidInvoicesSortDir(key === 'amountDue' || key === 'daysOutstanding' ? 'desc' : 'asc');
      }
    };
    const paidByCustomerAll = (summary?.paidInvoices || [])
      .map((row: any) => ({
        customerName: row.customerName || row.customer,
        currentMonth: row.currentMonth || 0,
        lastMonth: row.lastMonth || 0,
        last12Months: row.last12Months || 0,
        cashCollectedToDate: row.cashCollectedToDate || row.last12Months || 0,
        lastPaymentDate: row.lastPaymentDate || null,
      }))
      .sort((a: any, b: any) => b.last12Months - a.last12Months);
    const paidByCustomer = paidByCustomerAll.slice(0, 10);
    const paidTotal = paidByCustomerAll.reduce((sum: number, item: any) => sum + item.last12Months, 0);
    const customerInvoiceRows = (summary?.customerInvoices || []).map((row: any) => ({
      customerName: row.customerName || row.customer,
      invoiceNo: row.invoiceNo || row.invoiceNumber,
      date: row.date,
      dueDate: row.dueDate,
      currency: 'USD',
      amountCurrency: row.amountCurrency || row.amount || 0,
      amountHome: row.amountHome || row.amountHomeCurrency || 0,
      amountDueHome: row.amountDueHome || row.amountDue || 0,
    }));
    const parseInputUtcDay = (raw: string | null | undefined): Date | null => {
      const value = String(raw || '').trim();
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return new Date(Date.UTC(year, month - 1, day));
    };
    const formatUtcDayLabel = (
      raw: Date | null | undefined,
      options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
    ): string => {
      if (!raw) return 'N/A';
      return raw.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
    };
    const arCoverageStart = parseInputUtcDay(startDate);
    const arCoverageEnd = parseInputUtcDay(endDate);
    const arCoverageLabel =
      arCoverageStart && arCoverageEnd
        ? `${formatUtcDayLabel(arCoverageStart)} - ${formatUtcDayLabel(arCoverageEnd)}`
        : 'N/A';
    const arAsOfLabel = arCoverageEnd
      ? formatUtcDayLabel(arCoverageEnd)
      : 'N/A';
    const paidByCustomerMap = new Map(paidByCustomerAll.map((row: any) => [row.customerName, row]));
    const contractAndCashFlowRows = arCustomers
      .map((row: any) => {
        const paid = paidByCustomerMap.get(row.customerName);
        const contractValueTotal = Number(row.contractValueTotal || 0);
        const remainingToInvoice = Number(row.remainingToInvoice || 0);
        const accruedRevenueUnbilled = Number(row.accruedRevenueUnbilled || 0);
        const invoicedRevenue = Number(row.invoicedRevenue || row.totalDue || 0);
        const arOutstanding = Number(row.totalDue || 0);
        const cashCollectedToDate = Number(row.cashCollectedToDate || paid?.cashCollectedToDate || 0);
        const totalBilledRevenue = invoicedRevenue;
        const totalExposure = arOutstanding + remainingToInvoice;
        const billingProgressPct = contractValueTotal > 0 ? (invoicedRevenue / contractValueTotal) * 100 : 0;
        const collectionRatio = invoicedRevenue > 0 ? cashCollectedToDate / invoicedRevenue : 0;
        return {
          customerId: row.customerId || '-',
          customerName: row.customerName,
          contractValueTotal,
          remainingToInvoice,
          accruedRevenueUnbilled,
          invoicedRevenue,
          arOutstanding,
          arCurrent: Number(row.current || 0),
          ar31to60: Number(row.days1to30 || 0),
          ar61to90: Number(row.days31to60 || 0),
          ar91to120: Number(row.days61to90 || 0),
          ar121plus: Number(row.days90plus || 0),
          cashCollectedToDate,
          lastPaymentDate: row.lastPaymentDate || paid?.lastPaymentDate || '-',
          totalBilledRevenue,
          totalExposure,
          billingProgressPct,
          collectionRatio,
        };
      })
      .sort((a, b) => b.totalExposure - a.totalExposure);
    const arAgingRows = [...contractAndCashFlowRows].sort(
      (a, b) =>
        b.arOutstanding - a.arOutstanding ||
        b.ar121plus + b.ar91to120 + b.ar61to90 + b.ar31to60 - (a.ar121plus + a.ar91to120 + a.ar61to90 + a.ar31to60)
    );
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
          { label: 'Total Open AR', value: formatCurrency((summary.totalOpenAR ?? summary.totalAR) || 0) },
          { label: 'Current %', value: `${summary.currentPct?.toFixed(1) || '0.0'}%` },
          { label: 'Over 30 %', value: `${summary.over30Pct?.toFixed(1) || '0.0'}%` },
          { label: 'Over 90 %', value: `${summary.over90Pct?.toFixed(1) || '0.0'}%` },
          { label: 'DSO (Days)', value: summary.dso?.toFixed(0) || '0' },
        ]
      : [];

    const formatArTrendDate = (value: string | Date) => {
      const parsed = parseDateValue(value);
      if (!parsed) return String(value || '');
      // AR trend period keys are canonical UTC day anchors; render labels in UTC
      // so bars map to the exact requested day without -1 day timezone drift.
      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    };
    const toUtcDay = (value: string | Date) => {
      const parsed = parseDateValue(value);
      if (!parsed) return null;
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    };
    const selectedStartUtc = toUtcDay(startDate) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 90));
    const selectedEndUtc = toUtcDay(endDate) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const toIsoDay = (d: Date) => d.toISOString().split('T')[0];
    const weekStartUtc = (d: Date) => {
      const day = d.getUTCDay(); // 0=Sun
      const offset = day === 0 ? -6 : 1 - day; // Monday-start week
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
    };
    const periodKey = (d: Date) => {
      if (frequency === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (frequency === 'weekly') return toIsoDay(weekStartUtc(d));
      return toIsoDay(d);
    };
    const periodAnchor = (d: Date) => {
      if (frequency === 'monthly') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      if (frequency === 'weekly') return weekStartUtc(d);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    };
    const periodRecordsAsc = [...records]
      .map((record: any) => ({ record, day: toUtcDay(record.snapshotDate) }))
      .filter((entry: any) => Boolean(entry.day))
      .sort((a: any, b: any) => a.day.getTime() - b.day.getTime());
    // AR trend must honor the user-selected From/To window exactly.
    // Do not shift the start based on first observed data day.
    const trendStartUtc = selectedStartUtc;
    const latestRecordByPeriod = new Map<string, { anchor: Date; record: any }>();
    for (const entry of periodRecordsAsc as any[]) {
      const key = periodKey(entry.day);
      latestRecordByPeriod.set(key, { anchor: periodAnchor(entry.day), record: entry.record });
    }
    const requestedPeriods: Array<{ key: string; anchor: Date }> = [];
    if (frequency === 'monthly') {
      for (
        let cursor = new Date(Date.UTC(trendStartUtc.getUTCFullYear(), trendStartUtc.getUTCMonth(), 1));
        cursor <= selectedEndUtc;
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
      ) {
        requestedPeriods.push({ key: periodKey(cursor), anchor: periodAnchor(cursor) });
      }
    } else if (frequency === 'weekly') {
      for (
        let cursor = periodAnchor(trendStartUtc);
        cursor <= selectedEndUtc;
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 7))
      ) {
        requestedPeriods.push({ key: periodKey(cursor), anchor: periodAnchor(cursor) });
      }
    } else {
      for (
        let cursor = trendStartUtc;
        cursor <= selectedEndUtc;
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1))
      ) {
        requestedPeriods.push({ key: periodKey(cursor), anchor: periodAnchor(cursor) });
      }
    }
    const chartData = requestedPeriods.map((period) => {
      const point = latestRecordByPeriod.get(period.key);
      const record = point?.record || null;
      return {
        periodKey: toIsoDay(period.anchor),
        month: formatArTrendDate(period.anchor),
        'Open AR 0-30': record ? Number(record.current || 0) : null,
        'Open AR 31-60': record ? Number(record.days1to30 || 0) : null,
        'Open AR 61-90': record ? Number(record.days31to60 || 0) : null,
        'Open AR 91-120': record ? Number(record.days61to90 || 0) : null,
        'Open AR 121+': record ? Number(record.days90plus || 0) : null,
        total: record ? Number(record.totalAR || 0) : 0,
        hasData: Boolean(record),
      };
    });
    const arXAxisInterval =
      frequency === 'daily'
        ? Math.max(Math.ceil(chartData.length / 16) - 1, 0)
        : frequency === 'weekly'
          ? Math.max(Math.ceil(chartData.length / 20) - 1, 0)
          : 0;
    const arCollectionsTrend = chartData.map((row: any) => ({
      period: row.month,
      dso: 0,
      over30Pct:
        row.total > 0
          ? ((row['Open AR 31-60'] + row['Open AR 61-90'] + row['Open AR 91-120'] + row['Open AR 121+']) / row.total) * 100
          : 0,
      over90Pct: row.total > 0 ? ((row['Open AR 91-120'] + row['Open AR 121+']) / row.total) * 100 : 0,
    }));
    const arCollectionsRiskQueue = arCustomers
      .map((row) => {
        const overdue =
          Number(row.days1to30 || 0) + Number(row.days31to60 || 0) + Number(row.days61to90 || 0) + Number(row.days90plus || 0);
        const over90 = Number(row.days61to90 || 0) + Number(row.days90plus || 0);
        const riskScore = overdue + over90 * 0.5;
        return {
          customerName: row.customerName,
          overdue,
          over90,
          totalDue: Number(row.totalDue || 0),
          riskScore,
        };
      })
      .filter((row) => row.overdue > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Accounts Receivable Aging
        </h2>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total Open AR</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency((summary.totalOpenAR ?? summary.totalAR) || 0)}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Current %</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {arCurrentPct.toFixed(1)}%
                {arCurrentPct >= 70 ? <ArrowUp size={20} /> : <ArrowDown size={20} color="#ef4444" />}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {arOver30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: arOver90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {arOver90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DSO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {arDso.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AR Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Open AR Aging Trend
          </h3>
          <div style={{ marginTop: '-10px', marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
            As of: {arAsOfLabel} | Coverage: {arCoverageLabel}
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="month"
                interval={arXAxisInterval}
                minTickGap={24}
                stroke="#64748b"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="Open AR 0-30" stackId="a" fill={AR_TREND_COLORS[0]} />
              <Bar dataKey="Open AR 31-60" stackId="a" fill={AR_TREND_COLORS[2]} />
              <Bar dataKey="Open AR 61-90" stackId="a" fill={AR_TREND_COLORS[3]} />
              <Bar dataKey="Open AR 91-120" stackId="a" fill={AR_TREND_COLORS[1]} />
              <Bar dataKey="Open AR 121+" stackId="a" fill={AR_TREND_COLORS[4]} />
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {/* Customer Contract and Cash Flow Summary */}
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Customer Contract and Cash Flow Summary
            </h3>
            {contractAndCashFlowRows.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Cust ID</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Contract Total</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Remaining to Invoice</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Invoiced</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Open AR</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Cash Collected</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Last Payment</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Total Billed</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Total Exposure</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Billing %</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Collection Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractAndCashFlowRows
                      .slice((arSummaryPage - 1) * 8, arSummaryPage * 8)
                      .map((row) => (
                        <tr key={`${row.customerId}-${row.customerName}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '500' }}>{row.customerId}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>{formatCurrency(row.contractValueTotal)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>{formatCurrency(row.remainingToInvoice)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.invoicedRevenue)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(row.arOutstanding)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.cashCollectedToDate)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b' }}>{row.lastPaymentDate}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(row.totalBilledRevenue)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right', fontWeight: '700' }}>{formatCurrency(row.totalExposure)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>{row.billingProgressPct.toFixed(1)}%</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>{row.collectionRatio.toFixed(2)}</td>
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
            {contractAndCashFlowRows.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
                <span>
                  {Math.min((arSummaryPage - 1) * 8 + 1, contractAndCashFlowRows.length)}-
                  {Math.min(arSummaryPage * 8, contractAndCashFlowRows.length)} of {contractAndCashFlowRows.length}
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
                    onClick={() => setArSummaryPage((page) => Math.min(Math.ceil(contractAndCashFlowRows.length / 8), page + 1))}
                    disabled={arSummaryPage >= Math.ceil(contractAndCashFlowRows.length / 8)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: arSummaryPage >= Math.ceil(contractAndCashFlowRows.length / 8) ? '#f1f5f9' : 'white',
                      cursor: arSummaryPage >= Math.ceil(contractAndCashFlowRows.length / 8) ? 'not-allowed' : 'pointer'
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
                      <th onClick={() => toggleUnpaidInvoicesSort('customerName')} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Customer</th>
                      <th onClick={() => toggleUnpaidInvoicesSort('invoiceDate')} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: '110px' }}>Date</th>
                      <th
                        onClick={() => toggleUnpaidInvoicesSort('daysOutstanding')}
                        style={{
                          textAlign: 'right',
                          padding: '6px 6px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: 'white',
                          cursor: 'pointer',
                          width: '40px',
                          minWidth: '40px',
                          maxWidth: '40px',
                          lineHeight: 1.1,
                        }}
                      >
                        Days
                      </th>
                      <th onClick={() => toggleUnpaidInvoicesSort('amountDue')} style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white', cursor: 'pointer' }}>Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInvoices
                      .slice((unpaidInvoicesPage - 1) * 8, unpaidInvoicesPage * 8)
                      .map((row, index) => (
                        <tr key={`${row.customerName}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                          <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.invoiceDate || 'Old outstanding'}</td>
                          <td style={{ padding: '6px 4px', fontSize: '13px', color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap', width: '40px', minWidth: '40px', maxWidth: '40px' }}>{row.daysOutstanding ?? '-'}</td>
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

        {/* AR Aging Detail */}
        <div style={{ marginTop: '24px', background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
            AR Aging Detail
          </h3>
          {arAgingRows.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Cust ID</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Open AR</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Current</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>31-60</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>61-90</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>91-120</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>121+</th>
                  </tr>
                </thead>
                <tbody>
                  {arAgingRows
                    .slice((arAgingPage - 1) * 8, arAgingPage * 8)
                    .map((row) => (
                      <tr key={`aging-${row.customerId}-${row.customerName}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '500' }}>{row.customerId}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(row.arOutstanding)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#16a34a', textAlign: 'right' }}>{formatCurrency(row.arCurrent)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#f97316', textAlign: 'right' }}>{formatCurrency(row.ar31to60)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#ef4444', textAlign: 'right' }}>{formatCurrency(row.ar61to90)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#991b1b', textAlign: 'right' }}>{formatCurrency(row.ar91to120)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '12px', color: '#7f1d1d', textAlign: 'right' }}>{formatCurrency(row.ar121plus)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No AR aging detail available for this period.
            </div>
          )}
          {arAgingRows.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '13px', color: '#64748b' }}>
              <span>
                {Math.min((arAgingPage - 1) * 8 + 1, arAgingRows.length)}-
                {Math.min(arAgingPage * 8, arAgingRows.length)} of {arAgingRows.length}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setArAgingPage((page) => Math.max(1, page - 1))}
                  disabled={arAgingPage === 1}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: arAgingPage === 1 ? '#f1f5f9' : 'white',
                    cursor: arAgingPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setArAgingPage((page) => Math.min(Math.ceil(arAgingRows.length / 8), page + 1))}
                  disabled={arAgingPage >= Math.ceil(arAgingRows.length / 8)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: arAgingPage >= Math.ceil(arAgingRows.length / 8) ? '#f1f5f9' : 'white',
                    cursor: arAgingPage >= Math.ceil(arAgingRows.length / 8) ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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

        {(isSectionEnabled('arCollectionsTrend') || isSectionEnabled('arCollectionsRiskQueue')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('arCollectionsTrend') && isSectionEnabled('arCollectionsRiskQueue') ? '1fr 1fr' : '1fr',
              gap: '24px',
              marginTop: '24px',
            }}
          >
          {isSectionEnabled('arCollectionsTrend') && (
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Collections Trend / DSO Proxy
            </h3>
            <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
              As of: {arAsOfLabel} | Coverage: {arCoverageLabel}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={arCollectionsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '12px' }} domain={[0, 100]} />
                <Tooltip formatter={(value: any, key: any) => (String(key).includes('Pct') ? `${Number(value || 0).toFixed(1)}%` : Number(value || 0).toFixed(1))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="dso" stroke="#2563eb" strokeWidth={2} dot={false} name="DSO" />
                <Line yAxisId="right" type="monotone" dataKey="over30Pct" stroke="#f59e0b" strokeWidth={2} dot={false} name="Over 30 %" />
                <Line yAxisId="right" type="monotone" dataKey="over90Pct" stroke="#ef4444" strokeWidth={2} dot={false} name="Over 90 %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}

          {isSectionEnabled('arCollectionsRiskQueue') && (
            <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Collections Risk Queue
            </h3>
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
              Prioritized by overdue balance and 90+ concentration.
            </div>
            {arCollectionsRiskQueue.length === 0 ? (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No overdue balances in this period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Customer</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Overdue 31+ </th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>90+ Days</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Total Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arCollectionsRiskQueue.map((row) => (
                      <tr key={row.customerName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.customerName}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f97316', textAlign: 'right' }}>{formatCurrency(row.overdue)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#991b1b', textAlign: 'right' }}>{formatCurrency(row.over90)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(row.totalDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
        )}
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
    const apCurrentPct = Number(summary?.currentPct ?? 0);
    const apOver30Pct = Number(summary?.over30Pct ?? 0);
    const apOver90Pct = Number(summary?.over90Pct ?? 0);
    const apDpo = Number(summary?.dpo ?? 0);
    const latestRecord = records[0];
    const apVendors = (summary?.breakdown || summary?.unpaidByVendor || []).map((row: any) => ({
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
    const unpaidBills = (summary?.unpaidBills || []).map((row: any) => ({
      vendorName: row.vendorName || row.vendor,
      billNo: row.billNo || row.billNumber,
      date: row.date,
      dueDate: row.dueDate,
      amountDue: row.amountDue || row.balance || 0,
    }));
    const paidBills = (summary?.paidBills || [])
      .map((row: any) => ({
        vendorName: row.vendorName || row.vendor,
        currentMonth: row.currentMonth || 0,
        lastMonth: row.lastMonth || 0,
        last12Months: row.last12Months || 0,
      }))
      .sort((a: any, b: any) => b.last12Months - a.last12Months)
      .slice(0, 10);
    const paidBillsTotal = paidBills.reduce((sum: number, item: any) => sum + item.last12Months, 0);
    const vendorBillRows = (summary?.vendorBills || []).map((row: any) => ({
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
    const apCoverageDates = records
      .map((record: any) => parseDateValue(record.snapshotDate))
      .filter((date): date is Date => Boolean(date));
    const apCoverageStart = apCoverageDates.length > 0 ? new Date(Math.min(...apCoverageDates.map((date) => date.getTime()))) : null;
    const apCoverageEnd = apCoverageDates.length > 0 ? new Date(Math.max(...apCoverageDates.map((date) => date.getTime()))) : null;
    const apCoverageLabel =
      apCoverageStart && apCoverageEnd
        ? `${formatDateUtcMinus4(apCoverageStart)} - ${formatDateUtcMinus4(apCoverageEnd)} (UTC-4)`
        : 'N/A';
    const apAsOfDate = apCoverageEnd || parseDateValue(latestRecord?.snapshotDate) || new Date();
    const apAsOfLabel = apAsOfDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const paymentCadenceTrend = [...records]
      .reverse()
      .map((record: any) => ({
        period: formatDate(record.snapshotDate),
        dpo: Number(record.dpo || 0),
        over30Pct: Number(record.over30Pct || 0),
        over90Pct: Number(record.over90Pct || 0),
      }));
    const apPastDueRiskQueue = apVendors
      .map((row) => {
        const pastDue = Number(row.days1to30 || 0) + Number(row.days31to60 || 0) + Number(row.days61to90 || 0) + Number(row.days90plus || 0);
        const severePastDue = Number(row.days61to90 || 0) + Number(row.days90plus || 0);
        const riskScore = pastDue + severePastDue * 0.5;
        return {
          vendorName: row.vendorName,
          pastDue,
          severePastDue,
          totalDue: Number(row.totalDue || 0),
          riskScore,
        };
      })
      .filter((row) => row.pastDue > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
    const upcomingDueCalendar = unpaidBills
      .map((row) => {
        const due = parseDateValue(row.dueDate);
        const daysUntil = due ? Math.ceil((due.getTime() - apAsOfDate.getTime()) / 86400000) : null;
        return {
          ...row,
          daysUntil,
        };
      })
      .filter((row) => row.daysUntil !== null && row.daysUntil <= 30)
      .sort((a, b) => Number(a.daysUntil || 0) - Number(b.daysUntil || 0))
      .slice(0, 12);

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
                {apCurrentPct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {apOver30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: apOver90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {apOver90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DPO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {apDpo.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AP Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            AP Aging Trend
          </h3>
          <div style={{ marginTop: '-10px', marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
            As of: {apAsOfLabel} | Coverage: {apCoverageLabel}
          </div>
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

        {(isSectionEnabled('apPaymentCadenceTrend') || isSectionEnabled('apPastDueRiskQueue')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('apPaymentCadenceTrend') && isSectionEnabled('apPastDueRiskQueue') ? '1fr 1fr' : '1fr',
              gap: '24px',
              marginTop: '24px',
            }}
          >
          {isSectionEnabled('apPaymentCadenceTrend') && (
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              Payment Cadence / DPO Proxy
            </h3>
            <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
              As of: {apAsOfLabel} | Coverage: {apCoverageLabel}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={paymentCadenceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '12px' }} domain={[0, 100]} />
                <Tooltip formatter={(value: any, key: any) => (String(key).includes('Pct') ? `${Number(value || 0).toFixed(1)}%` : Number(value || 0).toFixed(1))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="dpo" stroke="#1d4ed8" strokeWidth={2} dot={false} name="DPO" />
                <Line yAxisId="right" type="monotone" dataKey="over30Pct" stroke="#f59e0b" strokeWidth={2} dot={false} name="Over 30 %" />
                <Line yAxisId="right" type="monotone" dataKey="over90Pct" stroke="#ef4444" strokeWidth={2} dot={false} name="Over 90 %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
          {isSectionEnabled('apPastDueRiskQueue') && (
            <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
              AP Past-Due Risk Queue
            </h3>
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
              Ranked by total past due and severe delinquency concentration.
            </div>
            {apPastDueRiskQueue.length === 0 ? (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No past-due vendor exposure in this period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Past Due</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>61+ Days</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Total Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apPastDueRiskQueue.map((row) => (
                      <tr key={row.vendorName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#f97316', textAlign: 'right' }}>{formatCurrency(row.pastDue)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#991b1b', textAlign: 'right' }}>{formatCurrency(row.severePastDue)}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(row.totalDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
        )}

        {isSectionEnabled('apUpcomingDueCalendar') && (
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
            Upcoming Due Calendar (Next 30 Days)
          </h3>
          <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
            As of: {apAsOfLabel} | Coverage: {apCoverageLabel}
          </div>
          {upcomingDueCalendar.length === 0 ? (
            <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No bills due in the next 30 days.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Vendor</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Bill</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Due Date</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Days Until Due</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Amount Due</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDueCalendar.map((row, index) => (
                    <tr key={`${row.vendorName}-${row.billNo}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{row.vendorName}</td>
                      <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.billNo}</td>
                      <td style={{ padding: '6px 10px', fontSize: '13px', color: '#64748b' }}>{row.dueDate}</td>
                      <td style={{ padding: '6px 10px', fontSize: '13px', color: Number(row.daysUntil || 0) < 0 ? '#dc2626' : '#1e293b', textAlign: 'right', fontWeight: 600 }}>
                        {Number(row.daysUntil || 0)}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(Number(row.amountDue || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
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
    const weeklyMarginModel = buildWeeklyProductMarginModel({
      records: Array.isArray(records) ? records : [],
      topProducts: Array.isArray(summary?.topProducts) ? summary.topProducts : [],
      rangeStart: startDate,
      rangeEnd: endDate,
    });

    const comparisonRowsWithSignal = weeklyMarginModel.comparisonRows.filter((row) => {
      const hasSignal =
        Number(row.revenueThisWeek || 0) !== 0 ||
        Number(row.marginAmountThisWeek || 0) !== 0 ||
        row.priceThisWeek != null ||
        row.costThisWeek != null ||
        row.spreadThisWeek != null ||
        row.pricePriorWeek != null ||
        row.costPriorWeek != null ||
        row.spreadPriorWeek != null;
      return hasSignal;
    });
    const filteredComparisonRows = comparisonRowsWithSignal.filter((row) => {
      const matchesSearch =
        !priceCostSearchTerm.trim() ||
        row.itemName.toLowerCase().includes(priceCostSearchTerm.toLowerCase()) ||
        row.sku.toLowerCase().includes(priceCostSearchTerm.toLowerCase()) ||
        row.site.toLowerCase().includes(priceCostSearchTerm.toLowerCase());
      const matchesException = !showPriceCostExceptionsOnly || row.status !== 'acceptable';
      return matchesSearch && matchesException;
    });
    const paretoRows = [...comparisonRowsWithSignal]
      .sort((a, b) => b.revenueThisWeek - a.revenueThisWeek)
      .slice(0, 10);
    const paretoRevenueTotal = paretoRows.reduce((sum, row) => sum + Number(row.revenueThisWeek || 0), 0);
    let cumulativeRevenue = 0;
    const paretoData = paretoRows.map((row) => {
      cumulativeRevenue += Number(row.revenueThisWeek || 0);
      return {
        name: row.itemName,
        revenue: Number(row.revenueThisWeek || 0),
        cumulativePct: paretoRevenueTotal > 0 ? (cumulativeRevenue / paretoRevenueTotal) * 100 : 0,
      };
    });
    const scatterData = comparisonRowsWithSignal.map((row) => ({
      name: row.itemName,
      sku: row.sku,
      site: row.site,
      revenue: Number(row.revenueThisWeek || 0),
      marginPct: Number(row.marginPctThisWeek || 0),
      contribution: Math.max(1, Math.abs(Number(row.marginAmountThisWeek || 0))),
    }));
    const lossMakers = [...weeklyMarginModel.comparisonRows]
      .filter((row) => (row.marginPctThisWeek ?? 0) < 0 || (row.spreadThisWeek ?? 0) < 0)
      .sort((a, b) => (a.marginAmountThisWeek ?? 0) - (b.marginAmountThisWeek ?? 0))
      .slice(0, 10);
    const productScopeOptions = [...weeklyMarginModel.comparisonRows]
      .sort((a, b) => b.revenueThisWeek - a.revenueThisWeek)
      .map((row) => ({
        sku: row.sku,
        label: `${row.itemName} (${row.sku})`,
      }));
    const effectiveScopeSku =
      selectedScopeSku && productScopeOptions.some((option) => option.sku === selectedScopeSku)
        ? selectedScopeSku
        : (productScopeOptions[0]?.sku || '');
    const scopedProductSeries = weeklyMarginModel.productWeekly
      .filter((row) => row.sku === effectiveScopeSku)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const scopedSeriesByWeek = scopedProductSeries.reduce((acc: Record<string, any>, row: any) => {
      acc[row.weekStart] = row;
      return acc;
    }, {});
    const scopedSeries = weeklyMarginModel.weeks.map((row) => {
      if (productScopeMode === 'total') {
        const derivedPrice =
          row.units > 0 ? row.netRevenue / row.units : row.netRevenue !== 0 ? row.netRevenue : 0;
        const derivedCost =
          row.units > 0 ? row.cogs / row.units : row.cogs !== 0 ? row.cogs : 0;
        return {
          weekStart: row.weekStart,
          units: row.units,
          netRevenue: row.netRevenue,
          cogs: row.cogs,
          marginAmount: row.marginAmount,
          returns: row.returns,
          returnsMagnitude: row.returnsMagnitude,
          freightBilled: row.freightBilled,
          otherRevenue: row.otherRevenue,
          price: derivedPrice,
          cost: derivedCost,
          spread: derivedPrice - derivedCost,
        };
      }
      const scoped = scopedSeriesByWeek[row.weekStart];
      return {
        weekStart: row.weekStart,
        units: Number(scoped?.units || 0),
        netRevenue: Number(scoped?.netRevenue || 0),
        cogs: Number(scoped?.cogs || 0),
        marginAmount: Number(scoped?.marginAmount || 0),
        returns: Number(scoped?.returns || 0),
        returnsMagnitude: Number(scoped?.returnsMagnitude || 0),
        freightBilled: Number(scoped?.freightBilled || 0),
        otherRevenue: Number(scoped?.otherRevenue || 0),
        price: Number(scoped?.pricePerUnit || 0),
        cost: Number(scoped?.costPerUnit || 0),
        spread: Number(scoped?.spreadPerUnit || 0),
      };
    });
    const priceCostTrendData = scopedSeries;
    const latestWeekRow = scopedSeries[scopedSeries.length - 1];
    const priorWeekRow = scopedSeries[scopedSeries.length - 2];
    const latestPrice =
      latestWeekRow
        ? latestWeekRow.units > 0
          ? latestWeekRow.netRevenue / latestWeekRow.units
          : latestWeekRow.netRevenue !== 0
            ? latestWeekRow.netRevenue
            : 0
        : 0;
    const priorPrice =
      priorWeekRow
        ? priorWeekRow.units > 0
          ? priorWeekRow.netRevenue / priorWeekRow.units
          : priorWeekRow.netRevenue !== 0
            ? priorWeekRow.netRevenue
            : 0
        : 0;
    const latestCost =
      latestWeekRow
        ? latestWeekRow.units > 0
          ? latestWeekRow.cogs / latestWeekRow.units
          : latestWeekRow.cogs !== 0
            ? latestWeekRow.cogs
            : 0
        : 0;
    const priorCost =
      priorWeekRow
        ? priorWeekRow.units > 0
          ? priorWeekRow.cogs / priorWeekRow.units
          : priorWeekRow.cogs !== 0
            ? priorWeekRow.cogs
            : 0
        : 0;
    const baselineUnits = Math.max(1, Number(priorWeekRow?.units || 1));
    const priceImpact = (latestPrice - priorPrice) * baselineUnits;
    const costImpact = -1 * (latestCost - priorCost) * baselineUnits;
    const returnsImpact = -1 * (Math.abs(Number(latestWeekRow?.returns || 0)) - Math.abs(Number(priorWeekRow?.returns || 0)));
    const totalDeltaMargin = Number(latestWeekRow?.marginAmount || 0) - Number(priorWeekRow?.marginAmount || 0);
    const mixImpact = totalDeltaMargin - priceImpact - costImpact - returnsImpact;
    const waterfallData = [
      { step: 'Price Impact', value: priceImpact },
      { step: 'Cost Impact', value: costImpact },
      { step: 'Returns Impact', value: returnsImpact },
      { step: 'Mix/Volume Impact', value: mixImpact },
      { step: 'Total Margin Delta', value: totalDeltaMargin },
    ];
    const parseCoverageUtcDay = (raw?: string): Date | null => {
      const value = String(raw || '').trim();
      if (!value) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      }
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
        const [m, d, y] = value.split('/').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    };
    const formatCoverageDate = (rawDate?: string) => {
      const utcDay = parseCoverageUtcDay(rawDate);
      return utcDay
        ? utcDay.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
        : 'N/A';
    };
    const asOfDateLabel = formatCoverageDate(endDate);
    const coverageLabel = startDate && endDate ? `${formatCoverageDate(startDate)} - ${formatCoverageDate(endDate)} (selected)` : 'N/A';
    const renderCoverageMeta = () => (
      <div style={{ marginTop: '4px', marginBottom: '10px', fontSize: '11px', color: '#64748b' }}>
        As of: {asOfDateLabel} | Coverage: {coverageLabel}
      </div>
    );

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Product Sales Performance
        </h2>

        {isSectionEnabled('productsPriceCostComparison') && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Weekly Price-Cost Comparison</h3>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                Sorted by Spread Delta ascending (worst deterioration first).
              </div>
              {renderCoverageMeta()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setPriceCostTableExpanded((prev) => !prev)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {priceCostTableExpanded ? 'Collapse' : 'Expand'}
              </button>
              <input
                value={priceCostSearchTerm}
                onChange={(event) => setPriceCostSearchTerm(event.target.value)}
                placeholder="Search SKU, item, site..."
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', minWidth: '220px' }}
              />
              <button
                onClick={() => setShowPriceCostExceptionsOnly((prev) => !prev)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  background: showPriceCostExceptionsOnly ? '#fff7ed' : '#ffffff',
                  color: showPriceCostExceptionsOnly ? '#9a3412' : '#334155',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {showPriceCostExceptionsOnly ? 'Showing Exceptions' : 'Exceptions Only'}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1450px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Item</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>SKU</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Site</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Price (This)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Price (Prior)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Price Delta</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Cost (This)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Cost (Prior)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Cost Delta</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Spread (This)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Spread (Prior)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Spread Delta</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Margin % (This)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Margin % (Prior)</th>
                  <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Margin Delta pts</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Status</th>
                </tr>
              </thead>
              {priceCostTableExpanded && (
                <tbody>
                  {filteredComparisonRows.map((row, idx) => (
                    <tr key={`${row.itemName}-${row.sku}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>{row.itemName}</td>
                      <td style={{ padding: '8px', fontSize: '13px', color: '#475569' }}>{row.sku}</td>
                      <td style={{ padding: '8px', fontSize: '13px', color: '#475569' }}>{row.site}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.priceThisWeek == null ? 'N/A' : formatCurrencyWithCents(row.priceThisWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.pricePriorWeek == null ? 'N/A' : formatCurrencyWithCents(row.pricePriorWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: (row.priceDelta ?? 0) >= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                        {row.priceDelta == null ? 'N/A' : `${row.priceDelta >= 0 ? '+' : ''}${formatCurrencyWithCents(row.priceDelta)}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.costThisWeek == null ? 'N/A' : formatCurrencyWithCents(row.costThisWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.costPriorWeek == null ? 'N/A' : formatCurrencyWithCents(row.costPriorWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: (row.costDelta ?? 0) <= 0 ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                        {row.costDelta == null ? 'N/A' : `${row.costDelta >= 0 ? '+' : ''}${formatCurrencyWithCents(row.costDelta)}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.spreadThisWeek == null ? 'N/A' : formatCurrencyWithCents(row.spreadThisWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.spreadPriorWeek == null ? 'N/A' : formatCurrencyWithCents(row.spreadPriorWeek)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: (row.spreadDelta ?? 0) >= 0 ? '#166534' : '#b91c1c', fontWeight: 700 }}>
                        {row.spreadDelta == null ? 'N/A' : `${row.spreadDelta >= 0 ? '+' : ''}${formatCurrencyWithCents(row.spreadDelta)}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.marginPctThisWeek == null ? 'N/A' : `${row.marginPctThisWeek.toFixed(1)}%`}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px' }}>{row.marginPctPriorWeek == null ? 'N/A' : `${row.marginPctPriorWeek.toFixed(1)}%`}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: '13px', color: (row.marginDeltaPts ?? 0) >= 0 ? '#166534' : '#b91c1c', fontWeight: 700 }}>
                        {row.marginDeltaPts == null ? 'N/A' : `${row.marginDeltaPts >= 0 ? '+' : ''}${row.marginDeltaPts.toFixed(1)}`}
                      </td>
                      <td style={{ padding: '8px', fontSize: '12px' }}>
                        <span style={{
                          borderRadius: '999px',
                          padding: '4px 8px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          background: row.status === 'acceptable' ? '#dcfce7' : row.status === 'warning' ? '#fef3c7' : '#fee2e2',
                          color: row.status === 'acceptable' ? '#166534' : row.status === 'warning' ? '#92400e' : '#991b1b',
                        }}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredComparisonRows.length === 0 && (
                    <tr>
                      <td colSpan={16} style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>
                        No rows match current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
        )}

        {(isSectionEnabled('productsPareto') || isSectionEnabled('productsScatter')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('productsPareto') && isSectionEnabled('productsScatter') ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
          {isSectionEnabled('productsPareto') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>Top Products by Revenue (Pareto)</h3>
            {renderCoverageMeta()}
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#2563eb" name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#f97316" strokeWidth={2} dot={false} name="Cumulative %" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}

          {isSectionEnabled('productsScatter') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>Product Profitability Scatter</h3>
            {renderCoverageMeta()}
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="revenue" name="Revenue" stroke="#64748b" tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`} />
                <YAxis type="number" dataKey="marginPct" name="Margin %" stroke="#64748b" tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                <ZAxis type="number" dataKey="contribution" range={[40, 320]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload || {};
                    return (
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '10px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          fontSize: '12px',
                          color: '#0f172a',
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: '2px' }}>{point.name || 'Unknown Product'}</div>
                        <div style={{ color: '#475569', marginBottom: '6px' }}>SKU: {point.sku || 'N/A'} | Site: {point.site || 'N/A'}</div>
                        <div>Revenue: {formatCurrency(Number(point.revenue || 0))}</div>
                        <div>Margin %: {Number(point.marginPct || 0).toFixed(1)}%</div>
                        <div>Margin $: {formatCurrency(Number(point.contribution || 0))}</div>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Scatter data={scatterData} fill="#0ea5e9" name="Products" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        )}

        {isSectionEnabled('productsScopeSelector') && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Scope</span>
            <button
              onClick={() => setProductScopeMode('total')}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 10px',
                background: productScopeMode === 'total' ? '#e0e7ff' : '#ffffff',
                color: productScopeMode === 'total' ? '#3730a3' : '#334155',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Total
            </button>
            <button
              onClick={() => setProductScopeMode('product')}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 10px',
                background: productScopeMode === 'product' ? '#e0e7ff' : '#ffffff',
                color: productScopeMode === 'product' ? '#3730a3' : '#334155',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Product
            </button>
            {productScopeMode === 'product' && (
              <select
                value={effectiveScopeSku}
                onChange={(event) => setSelectedScopeSku(event.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', minWidth: '240px' }}
              >
                {productScopeOptions.map((option) => (
                  <option key={option.sku} value={option.sku}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Applied to: Price-Cost Trend, Waterfall, Freight/Other Revenue Tracker
          </div>
        </div>
        )}

        {(isSectionEnabled('productsPriceCostTrend') || isSectionEnabled('productsPriceCostWaterfall')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('productsPriceCostTrend') && isSectionEnabled('productsPriceCostWaterfall') ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
          {isSectionEnabled('productsPriceCostTrend') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>
              Price-Cost Trend ({productScopeMode === 'total' ? 'Total' : `Product: ${effectiveScopeSku || 'N/A'}`})
            </h3>
            {renderCoverageMeta()}
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={priceCostTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="weekStart" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                <Tooltip formatter={(value: any) => formatCurrencyWithCents(Number(value || 0))} />
                <Legend />
                <Line type="monotone" dataKey="price" stroke="#0f766e" strokeWidth={2} dot={false} name="Avg Price/Unit" />
                <Line type="monotone" dataKey="cost" stroke="#dc2626" strokeWidth={2} dot={false} name="Avg Cost/Unit" />
                <Line type="monotone" dataKey="spread" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Spread/Unit" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}

          {isSectionEnabled('productsPriceCostWaterfall') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>
              Price-Cost Waterfall ({productScopeMode === 'total' ? 'Total' : `Product: ${effectiveScopeSku || 'N/A'}`})
            </h3>
            {renderCoverageMeta()}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="step" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                <Bar
                  dataKey="value"
                  name="Margin Impact"
                  fill="#64748b"
                >
                  {waterfallData.map((entry, index) => (
                    <Cell key={`waterfall-${index}`} fill={entry.value >= 0 ? '#16a34a' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        )}

        {(isSectionEnabled('productsBottomLossMakers') || isSectionEnabled('productsFreightOtherTracker')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('productsBottomLossMakers') && isSectionEnabled('productsFreightOtherTracker') ? 'repeat(2, minmax(0, 1fr))' : '1fr',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
          {isSectionEnabled('productsBottomLossMakers') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>Bottom Products (Loss Makers)</h3>
            {renderCoverageMeta()}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Item</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Site</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Revenue</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Margin $</th>
                    <th style={{ textAlign: 'right', padding: '8px', fontSize: '12px', color: '#334155' }}>Margin %</th>
                    <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#334155' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lossMakers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>
                        No active loss makers in this weekly window.
                      </td>
                    </tr>
                  ) : (
                    lossMakers.map((row, idx) => (
                      <tr key={`${row.itemName}-loss-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>{row.itemName}</td>
                        <td style={{ padding: '8px', fontSize: '13px', color: '#475569' }}>{row.site}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{formatCurrency(row.revenueThisWeek)}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>
                          {formatCurrency(row.marginAmountThisWeek)}
                        </td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>
                          {(row.marginPctThisWeek ?? 0).toFixed(1)}%
                        </td>
                        <td style={{ padding: '8px', fontSize: '12px' }}>
                          <span style={{ borderRadius: '999px', padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>
                            Investigate
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {isSectionEnabled('productsFreightOtherTracker') && (
            <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#1e293b', marginBottom: '12px' }}>
              Freight and Other Revenue Tracker ({productScopeMode === 'total' ? 'Total' : `Product: ${effectiveScopeSku || 'N/A'}`})
            </h3>
            {renderCoverageMeta()}
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={scopedSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="weekStart" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                <Legend />
                <Line type="monotone" dataKey="freightBilled" stroke="#f59e0b" strokeWidth={2} dot={false} name="Freight (separate)" />
                <Line type="monotone" dataKey="otherRevenue" stroke="#7c3aed" strokeWidth={2} dot={false} name="Other Revenue (separate)" />
                <Line type="monotone" dataKey="returnsMagnitude" stroke="#dc2626" strokeWidth={2} dot={false} name="Returns (abs)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        )}

      </div>
    );
  };

  // Inventory Tab
  const renderInventory = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading inventory data...</div>;
    }

    if (!inventoryData) return null;

    const { records, summary, trend, agingReport } = inventoryData;

    // Inventory API already returns latest snapshot rows (aggregated to unique SKU),
    // but keep a UI-side guard against accidental duplicate SKU variants.
    const latestRecords = (() => {
      const base = Array.isArray(records) ? records : [];
      const bySku = new Map<string, any>();
      for (const row of base) {
        const key =
          String(row?.sku || row?.itemId || row?.itemName || '')
            .trim()
            .replace(/\s+/g, '')
            .toUpperCase();
        if (!key) continue;
        if (!bySku.has(key)) {
          bySku.set(key, {
            ...row,
            qtyOnHand: Number(row?.qtyOnHand || 0),
            assetValue: Number(row?.assetValue || 0),
          });
          continue;
        }
        const acc = bySku.get(key);
        acc.qtyOnHand = Number(acc.qtyOnHand || 0) + Number(row?.qtyOnHand || 0);
        acc.assetValue = Number(acc.assetValue || 0) + Number(row?.assetValue || 0);
        acc.avgCost = Number(acc.qtyOnHand || 0) > 0 ? Number(acc.assetValue || 0) / Number(acc.qtyOnHand || 0) : 0;
      }
      return Array.from(bySku.values());
    })();
    const uniqueSkuCount = new Set(
      latestRecords.map((item: any) => String(item.sku || item.itemId || item.itemName || '').trim()).filter(Boolean)
    ).size;
    const inventoryAsOfDateLabel = (() => {
      const raw = String(endDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'N/A';
      const [y, m, d] = raw.split('-').map((n) => Number(n));
      const utc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      return utc.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    })();
    const inventorySearch = String(inventorySearchTerm || '').trim().toLowerCase();
    const filteredInventoryRecords = latestRecords.filter((item: any) => {
      if (hideZeroQtyInventory && Number(item?.qtyOnHand || 0) === 0) return false;
      if (!inventorySearch) return true;
      const itemName = String(item.itemName || '').toLowerCase();
      const sku = String(item.sku || '').toLowerCase();
      return itemName.includes(inventorySearch) || sku.includes(inventorySearch);
    });
    const sortedInventoryRecords = [...filteredInventoryRecords].sort((a: any, b: any) => {
      const dir = inventorySortDir === 'asc' ? 1 : -1;
      if (inventorySortKey === 'qtyOnHand' || inventorySortKey === 'avgCost' || inventorySortKey === 'assetValue') {
        const aValue = Number(a?.[inventorySortKey] || 0);
        const bValue = Number(b?.[inventorySortKey] || 0);
        return (aValue - bValue) * dir;
      }
      const aText = String(a?.[inventorySortKey] || '').toLowerCase();
      const bText = String(b?.[inventorySortKey] || '').toLowerCase();
      return aText.localeCompare(bText) * dir;
    });
    const handleInventorySort = (
      key: 'itemName' | 'sku' | 'warehouse' | 'bin' | 'lot' | 'qtyOnHand' | 'avgCost' | 'assetValue'
    ) => {
      if (inventorySortKey === key) {
        setInventorySortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setInventorySortKey(key);
      setInventorySortDir(key === 'itemName' || key === 'sku' || key === 'warehouse' || key === 'bin' || key === 'lot' ? 'asc' : 'desc');
    };
    const inventorySortLabel = (key: string) =>
      inventorySortKey === key ? (inventorySortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const inventoryAgingRows = Array.isArray(agingReport) ? agingReport.slice(0, 100) : [];
    const top10InventoryByValue = [...latestRecords]
      .sort((a: any, b: any) => Number(b?.assetValue || 0) - Number(a?.assetValue || 0))
      .slice(0, 10);

    const toIsoDay = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const formatInventoryDay = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const formatInventoryMonth = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const weekStartUtc = (date: Date): Date => {
      const day = date.getUTCDay(); // 0=Sun ... 6=Sat
      const diffToMonday = day === 0 ? -6 : 1 - day;
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diffToMonday));
    };

    const trendRows = Array.isArray(trend) ? trend : [];
    const trendRowsSorted = trendRows
      .map((point: any) => {
        const parsed = parseDateValue(point.snapshotDate);
        if (!parsed) return null;
        const utcDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
        return { utcDay, dateKey: toIsoDay(utcDay), value: Number(point.assetValue || 0) };
      })
      .filter((row: any): row is { utcDay: Date; dateKey: string; value: number } => Boolean(row))
      .sort((a: any, b: any) => a.utcDay.getTime() - b.utcDay.getTime());
    const periodEndRows =
      frequency === 'daily'
        ? trendRowsSorted
        : frequency === 'weekly'
          ? (() => {
              const byWeek = new Map<string, { utcDay: Date; dateKey: string; label: string; value: number }>();
              for (const row of trendRowsSorted) {
                const start = weekStartUtc(row.utcDay);
                const key = toIsoDay(start);
                const prior = byWeek.get(key);
                if (!prior || row.utcDay.getTime() >= prior.utcDay.getTime()) {
                  byWeek.set(key, {
                    utcDay: row.utcDay,
                    dateKey: row.dateKey,
                    label: formatInventoryDay(row.utcDay),
                    value: row.value,
                  });
                }
              }
              return Array.from(byWeek.values()).sort((a, b) => a.utcDay.getTime() - b.utcDay.getTime());
            })()
          : (() => {
              const byMonth = new Map<string, { utcDay: Date; dateKey: string; label: string; value: number }>();
              for (const row of trendRowsSorted) {
                const key = `${row.utcDay.getUTCFullYear()}-${String(row.utcDay.getUTCMonth() + 1).padStart(2, '0')}`;
                const prior = byMonth.get(key);
                if (!prior || row.utcDay.getTime() >= prior.utcDay.getTime()) {
                  byMonth.set(key, {
                    utcDay: row.utcDay,
                    dateKey: row.dateKey,
                    label: formatInventoryMonth(row.utcDay),
                    value: row.value,
                  });
                }
              }
              return Array.from(byMonth.values()).sort((a, b) => a.utcDay.getTime() - b.utcDay.getTime());
            })();
    const trendData: Array<{ dateKey: string; label: string; value: number }> = periodEndRows.map((row: any) => ({
      dateKey: row.dateKey,
      label: row.label || formatInventoryDay(row.utcDay),
      value: row.value,
    }));
    const trendLabelByKey = new Map<string, string>(trendData.map((row) => [row.dateKey, row.label]));
    const inventoryXAxisInterval =
      frequency === 'daily'
        ? Math.max(Math.ceil(trendData.length / 16) - 1, 0)
        : frequency === 'weekly'
          ? Math.max(Math.ceil(trendData.length / 20) - 1, 0)
          : 0;

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
              {uniqueSkuCount}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Value</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.totalValue)}
            </div>
          </div>
        </div>

        {/* Inventory Value Trend */}
        {isSectionEnabled('inventoryValueTrend') && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Inventory Value Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="dateKey"
                tickFormatter={(value) => trendLabelByKey.get(String(value)) || String(value)}
                interval={inventoryXAxisInterval}
                minTickGap={24}
                stroke="#64748b"
                style={{ fontSize: '12px' }}
              />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip
                labelFormatter={(value: any) => trendLabelByKey.get(String(value)) || String(value)}
                formatter={(value: any) => formatCurrency(Number(value || 0))}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#667eea" strokeWidth={2} dot={{ fill: '#667eea', r: 4 }} name="Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        )}

        {/* Current Inventory Table */}
        {isSectionEnabled('inventoryCurrentTable') && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setInventoryTableExpanded((prev) => !prev)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {inventoryTableExpanded ? 'Collapse' : 'Expand'}
              </button>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                Inventory (As of {inventoryAsOfDateLabel})
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={hideZeroQtyInventory}
                  onChange={(event) => setHideZeroQtyInventory(event.target.checked)}
                />
                Hide zero qty SKUs
              </label>
              <input
                value={inventorySearchTerm}
                onChange={(event) => setInventorySearchTerm(event.target.value)}
                placeholder="Search item name or SKU"
                style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', minWidth: '240px' }}
              />
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th onClick={() => handleInventorySort('itemName')} style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Item Name{inventorySortLabel('itemName')}</th>
                  <th onClick={() => handleInventorySort('sku')} style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>SKU{inventorySortLabel('sku')}</th>
                  <th onClick={() => handleInventorySort('warehouse')} style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Warehouse{inventorySortLabel('warehouse')}</th>
                  <th onClick={() => handleInventorySort('bin')} style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Bin{inventorySortLabel('bin')}</th>
                  <th onClick={() => handleInventorySort('lot')} style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Lot{inventorySortLabel('lot')}</th>
                  <th onClick={() => handleInventorySort('qtyOnHand')} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Qty on Hand{inventorySortLabel('qtyOnHand')}</th>
                  <th onClick={() => handleInventorySort('avgCost')} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Avg Cost{inventorySortLabel('avgCost')}</th>
                  <th onClick={() => handleInventorySort('assetValue')} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>Asset Value{inventorySortLabel('assetValue')}</th>
                </tr>
              </thead>
              {inventoryTableExpanded && (
                <tbody>
                  {sortedInventoryRecords.map((item: any, index: number) => (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.itemName}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{item.sku}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{String(item.warehouse || '').trim() || 'N/A'}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{String(item.bin || '').trim() || 'N/A'}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{String(item.lot || '').trim() || 'N/A'}</td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>
                        {item.qtyOnHand.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                        {formatUnitCost(Number(item.avgCost || 0))}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                        {formatCurrency(item.assetValue)}
                      </td>
                    </tr>
                  ))}
                  {sortedInventoryRecords.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        No inventory rows match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
        )}

        {/* Inventory Distribution Chart */}
        {isSectionEnabled('inventoryDistribution') && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Top 10 SKUs by Inventory Asset Value
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={top10InventoryByValue}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.itemName}: ${formatCurrency(entry.assetValue)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="assetValue"
              >
                {top10InventoryByValue.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        )}

        {isSectionEnabled('inventoryAgingObsolescenceV1') && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Inventory Aging & Obsolescence (V1 Proxy)
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Sales-driven proxy using outbound activity from latest available order-line snapshot (top 100 exposure rows).
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Item Name</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>SKU</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Qty on Hand</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Asset Value</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Last Sale Date</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Days Since Last Sale</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Shipped Qty (30d)</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Shipped Qty (60d)</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Shipped Qty (90d)</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Risk Tier</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Est. Obsolescence Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryAgingRows.map((row: any, index: number) => {
                    const riskColor =
                      row.riskTier === 'High' ? '#b91c1c' : row.riskTier === 'Medium' ? '#b45309' : '#166534';
                    return (
                      <tr key={`${row.sku || row.itemName || 'row'}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#1e293b', fontWeight: 500 }}>{row.itemName}</td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#64748b' }}>{row.sku || 'N/A'}</td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#2563eb', textAlign: 'right', fontWeight: 600 }}>
                          {Number(row.qtyOnHand || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#16a34a', textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(Number(row.assetValue || 0))}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#475569' }}>
                          {row.lastSaleDate ? formatDateUtcMinus4(row.lastSaleDate) : 'N/A'}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#475569', textAlign: 'right' }}>
                          {row.daysSinceLastSale == null ? 'N/A' : Number(row.daysSinceLastSale).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#475569', textAlign: 'right' }}>
                          {Number(row.shippedQty30 || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#475569', textAlign: 'right' }}>
                          {Number(row.shippedQty60 || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#475569', textAlign: 'right' }}>
                          {Number(row.shippedQty90 || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: riskColor, fontWeight: 600 }}>{row.riskTier || 'Low'}</td>
                        <td style={{ padding: '10px', fontSize: '13px', color: '#7c3aed', textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(Number(row.estimatedObsolescenceExposure || 0))}
                        </td>
                      </tr>
                    );
                  })}
                  {inventoryAgingRows.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        No aging proxy rows available for the selected range yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCash = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading cash data...</div>;
    }

    if (!cashData) return null;

    const { records, summary } = cashData;

    const cashTrendAccountOptions = [
      '__TOTAL__',
      ...Array.from(
        new Set(
          (summary.accounts || [])
            .map((account: any) => String(account.accountName || '').trim())
            .filter(Boolean)
        )
      ),
    ];
    const effectiveCashTrendAccount = cashTrendAccountOptions.includes(selectedCashTrendAccount)
      ? selectedCashTrendAccount
      : '__TOTAL__';
    const cashTrendSeriesLabel =
      effectiveCashTrendAccount === '__TOTAL__' ? 'Total Cash' : effectiveCashTrendAccount;

    // Aggregate data by exact snapshot date for trend chart.
    const periodTrend = records.reduce((acc: any, record: any) => {
      const recordAccountName = String(record.accountName || '').trim();
      if (effectiveCashTrendAccount !== '__TOTAL__' && recordAccountName !== effectiveCashTrendAccount) {
        return acc;
      }
      const parsed = parseDateValue(record.snapshotDate);
      if (!parsed) return acc;
      const key = parsed.getTime();
      if (!acc[key]) {
        acc[key] = { key, snapshotDate: parsed, period: formatDate(record.snapshotDate), totalCash: 0 };
      }
      acc[key].totalCash += Number(record.cashBalance || 0);
      return acc;
    }, {});

    const trendData = Object.values(periodTrend).sort((a: any, b: any) => Number(a.key) - Number(b.key));

    // Prepare data for account breakdown chart
    const accountData = summary.accounts.map((acct: any) => ({
      name: acct.accountName,
      balance: acct.currentBalance,
    }));
    const cashCoverageDates = trendData
      .map((row: any) => row.snapshotDate as Date)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());
    const cashCoverageStart = cashCoverageDates[0] || null;
    const cashCoverageEnd = cashCoverageDates[cashCoverageDates.length - 1] || null;
    const cashAsOfLabel = cashCoverageEnd
      ? cashCoverageEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';
    const cashCoverageLabel =
      cashCoverageStart && cashCoverageEnd
        ? `${formatDateUtcMinus4(cashCoverageStart)} - ${formatDateUtcMinus4(cashCoverageEnd)} (UTC-4)`
        : 'N/A';
    const startOfWeek = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay(); // 0=Sun ... 6=Sat
      const diffToMonday = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diffToMonday);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const weeklyTotals = trendData.reduce((acc: Record<string, { weekStart: Date; weekEnd: Date; totalCash: number }>, row: any) => {
      const snapshotDate = row.snapshotDate as Date;
      if (!snapshotDate) return acc;
      const weekStart = startOfWeek(snapshotDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const key = weekStart.toISOString().slice(0, 10);
      acc[key] = {
        weekStart,
        weekEnd,
        // Use period-end value inside each week (latest point in that week).
        totalCash: Number(row.totalCash || 0),
      };
      return acc;
    }, {});
    const cash13WeekRows = Object.values(weeklyTotals)
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .slice(-13)
      .map((row) => ({
        period: row.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalCash: row.totalCash,
        weekStart: row.weekStart,
        weekEnd: row.weekEnd,
      }));
    const cash13WeekCoverageStart = cash13WeekRows.length > 0 ? cash13WeekRows[0].weekStart : null;
    const cash13WeekCoverageEnd = cash13WeekRows.length > 0 ? cash13WeekRows[cash13WeekRows.length - 1].weekEnd : null;
    const cash13WeekAsOfLabel = cash13WeekCoverageEnd
      ? cash13WeekCoverageEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';
    const cash13WeekCoverageLabel =
      cash13WeekCoverageStart && cash13WeekCoverageEnd
        ? `${formatDateUtcMinus4(cash13WeekCoverageStart)} - ${formatDateUtcMinus4(cash13WeekCoverageEnd)} (UTC-4)`
        : 'N/A';
    const cashBridgeRows = cash13WeekRows.map((row, index) => {
      const prior = index > 0 ? cash13WeekRows[index - 1] : null;
      const delta = prior ? row.totalCash - prior.totalCash : 0;
      return {
        period: row.period,
        receipts: Math.max(delta, 0),
        disbursements: -Math.max(-delta, 0),
        netChange: delta,
      };
    });
    const covenantFloor = Math.max(
      0,
      Number(
        summary.accounts?.reduce((min: number, account: any) => {
          const value = Number(account.minBalance ?? account.currentBalance ?? 0);
          return Math.min(min, value);
        }, Number.POSITIVE_INFINITY) || 0
      )
    );
    const covenantBreaches = cash13WeekRows.filter((row) => row.totalCash < covenantFloor).length;

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
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Covenant Breaches (13W)</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: covenantBreaches > 0 ? '#ef4444' : '#16a34a' }}>
              {covenantBreaches}
            </div>
          </div>
        </div>

        {/* Cash Balance Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            {frequency.charAt(0).toUpperCase() + frequency.slice(1)} Cash Balance Trend
          </h3>
          <div className="ops-print-hide" style={{ marginTop: '-10px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="cashTrendAccountSelect" style={{ fontSize: '12px', color: '#64748b' }}>
              View:
            </label>
            <select
              id="cashTrendAccountSelect"
              value={effectiveCashTrendAccount}
              onChange={(event) => setSelectedCashTrendAccount(event.target.value)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                background: 'white',
                color: '#334155',
                fontSize: '12px',
                padding: '4px 8px',
              }}
            >
              {cashTrendAccountOptions.map((accountName) => (
                <option key={accountName} value={accountName}>
                  {accountName === '__TOTAL__' ? 'Total Cash' : accountName}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: '-10px', marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
            As of: {cashAsOfLabel} | Coverage: {cashCoverageLabel}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => [formatCurrency(value), cashTrendSeriesLabel]}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="totalCash" fill="#10b981" name={cashTrendSeriesLabel} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {(isSectionEnabled('cash13WeekTrend') || isSectionEnabled('cashBridge')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('cash13WeekTrend') && isSectionEnabled('cashBridge') ? '1fr 1fr' : '1fr',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
          {isSectionEnabled('cash13WeekTrend') && (
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              13-Week Cash Trend
            </h3>
            <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
              As of: {cash13WeekAsOfLabel} | Coverage: {cash13WeekCoverageLabel}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={cash13WeekRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(Number(value || 0) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                <Line type="monotone" dataKey="totalCash" stroke="#10b981" strokeWidth={2} dot={false} name="Cash Balance" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
          {isSectionEnabled('cashBridge') && (
            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Cash Bridge (Receipts vs Disbursements)
            </h3>
            <div style={{ marginBottom: '12px', fontSize: '11px', color: '#64748b' }}>
              Movement proxy built from period-over-period cash deltas.
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={cashBridgeRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(Number(value || 0) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                <Legend />
                <Bar dataKey="receipts" fill="#16a34a" name="Receipts Proxy" />
                <Bar dataKey="disbursements" fill="#ef4444" name="Disbursements Proxy" />
                <Line type="monotone" dataKey="netChange" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Net Change" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        )}

        {(isSectionEnabled('cashBankAccounts') || isSectionEnabled('cashDistributionByAccount')) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSectionEnabled('cashBankAccounts') && isSectionEnabled('cashDistributionByAccount') ? '1fr 1fr' : '1fr',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
            {/* Account Breakdown Table */}
            {isSectionEnabled('cashBankAccounts') && (
              <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
                Bank Accounts
              </h3>
              <div style={{ marginBottom: '10px', fontSize: '11px', color: '#64748b' }}>
                As of: {cashAsOfLabel} | Input Range (Current/Avg/Min/Max): {cashCoverageLabel}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Account Name</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Current Balance</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Avg Balance</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Min Balance</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Max Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.accounts.map((account: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px', fontSize: '12px', color: '#1e293b', fontWeight: '600' }}>
                          {account.accountName}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '12px', color: '#10b981', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrencyWithCents(account.currentBalance)}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                          {formatCurrencyWithCents(account.avgBalance)}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                          {formatCurrencyWithCents(account.minBalance)}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                          {formatCurrencyWithCents(account.maxBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Account Distribution Chart */}
            {isSectionEnabled('cashDistributionByAccount') && (
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
                    label={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="balance"
                  >
                    {accountData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CASH_DISTRIBUTION_COLORS[index % CASH_DISTRIBUTION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value: string) => <span style={{ color: '#334155', fontSize: '12px' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>
        )}

        {isSectionEnabled('cashCovenantMonitor') && (
          <div style={{ background: 'white', padding: '8px 24px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
            Minimum Cash Covenant Monitor
          </h3>
          <div style={{ marginBottom: '8px', fontSize: '11px', color: '#64748b' }}>
            Threshold proxy (floor): {formatCurrency(covenantFloor)} | As of: {cashAsOfLabel}
          </div>
          {cash13WeekRows.length === 0 ? (
            <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              Not enough cash history to evaluate covenant coverage.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #1d4ed8', background: '#2563eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Period</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Cash Balance</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Variance to Floor</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cash13WeekRows.map((row) => {
                    const variance = Number(row.totalCash || 0) - covenantFloor;
                    const isBreach = variance < 0;
                    return (
                      <tr key={row.period} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{row.period}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: '#1e293b', textAlign: 'right' }}>{formatCurrency(Number(row.totalCash || 0))}</td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: isBreach ? '#dc2626' : '#16a34a', textAlign: 'right', fontWeight: 600 }}>
                          {isBreach ? '-' : '+'}
                          {formatCurrency(Math.abs(variance))}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', color: isBreach ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                          {isBreach ? 'Breach' : 'Compliant'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
    );
  };

  const renderDailyFinancials = () => {
    if (loading && !dailyFinancialData) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading daily financials...</div>;
    }
    if (!dailyFinancialData) return null;

    const records = Array.isArray(dailyFinancialData.records) ? dailyFinancialData.records : [];
    const summary = dailyFinancialData.summary || {};
    const sortedRecords = [...records].sort(
      (a: any, b: any) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
    );
    const maxStart = Math.max(0, sortedRecords.length - 30);
    const windowStart = Math.min(dailyFinancialWindowStart, maxStart);
    const statementWindow = sortedRecords.slice(windowStart, windowStart + 30);
    const trendRows = [...sortedRecords]
      .reverse()
      .map((row: any) => ({
        date: new Date(row.snapshotDate).toLocaleDateString(),
        revenue: Number(row.revenue || 0),
        expense: Number(row.expense || 0),
        cogs: Number(row.cogsTotal || 0),
        grossMargin: Number(row.revenue || 0) - Number(row.cogsTotal || 0),
        marginPct:
          Number(row.revenue || 0) !== 0
            ? ((Number(row.revenue || 0) - Number(row.cogsTotal || 0)) / Number(row.revenue || 0)) * 100
            : null,
        net: Number(row.revenue || 0) - Number(row.expense || 0),
        cash: Number(row.cash || 0),
      }));
    const recent30Days = sortedRecords.slice(0, 30);
    const recent30Count = recent30Days.length || 1;
    const avgRevenue30 = recent30Days.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0) / recent30Count;
    const avgExpense30 = recent30Days.reduce((sum: number, row: any) => sum + Number(row.expense || 0), 0) / recent30Count;
    const avgNet30 =
      recent30Days.reduce((sum: number, row: any) => sum + (Number(row.revenue || 0) - Number(row.expense || 0)), 0) / recent30Count;
    const avgCash30 = recent30Days.reduce((sum: number, row: any) => sum + Number(row.cash || 0), 0) / recent30Count;
    const dailyTrendMetricOptions: Array<{
      key: 'revenue' | 'expense' | 'net' | 'cash' | 'grossMargin' | 'marginPct';
      label: string;
      color: string;
    }> = [
      { key: 'revenue', label: 'Revenue', color: '#3b82f6' },
      { key: 'expense', label: 'Expense', color: '#ef4444' },
      { key: 'net', label: 'Net', color: '#10b981' },
      { key: 'cash', label: 'Cash', color: '#8b5cf6' },
      { key: 'grossMargin', label: 'Gross Margin', color: '#f59e0b' },
      { key: 'marginPct', label: 'Margin %', color: '#7c3aed' },
    ];
    const toggleDailyTrendMetric = (metric: 'revenue' | 'expense' | 'net' | 'cash' | 'grossMargin' | 'marginPct') => {
      setSelectedDailyTrendMetrics((prev) => {
        const isSelected = prev.includes(metric);
        if (isSelected) {
          // Keep at least one metric active.
          if (prev.length === 1) return prev;
          return prev.filter((entry) => entry !== metric);
        }
        return [...prev, metric];
      });
    };
    const marginPctValues = trendRows
      .map((row: any) => Number(row.marginPct))
      .filter((value) => Number.isFinite(value));
    const marginPctMin = marginPctValues.length > 0 ? Math.min(...marginPctValues) : -10;
    const marginPctMax = marginPctValues.length > 0 ? Math.max(...marginPctValues) : 50;
    const marginPctDomain: [number, number] = [Math.floor((Math.min(0, marginPctMin) - 5) / 5) * 5, Math.ceil((Math.max(0, marginPctMax) + 5) / 5) * 5];

    const statementDays = statementWindow.map((row: any) => {
      const revenue = Number(row.revenue || 0);
      const cogsTotal = Number(row.cogsTotal || 0);
      const grossProfit = revenue - cogsTotal;
      const opex = Number(row.expense || 0);
      const operatingIncome = grossProfit - opex;
      const interestExpense = Number(row.interestExpense || 0);
      const nonOperatingIncome = Number(row.nonOperatingIncome || 0);
      const extraordinaryItems = Number(row.extraordinaryItems || 0);
      const incomeBeforeTax = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
      const stateIncomeTaxes = Number(row.stateIncomeTaxes || 0);
      const federalIncomeTaxes = Number(row.federalIncomeTaxes || 0);
      const netIncome = incomeBeforeTax - stateIncomeTaxes - federalIncomeTaxes;
      return {
        dateLabel: new Date(row.snapshotDate).toLocaleDateString(),
        revenue,
        cogsTotal,
        grossProfit,
        expense: opex,
        operatingIncome,
        interestExpense,
        nonOperatingIncome,
        extraordinaryItems,
        incomeBeforeTax,
        stateIncomeTaxes,
        federalIncomeTaxes,
        netIncome,
        cash: Number(row.cash || 0),
        ar: Number(row.ar || 0),
        inventory: Number(row.inventory || 0),
        otherCA: Number(row.otherCA || 0),
        tca: Number(row.tca || 0),
        fixedAssets: Number(row.fixedAssets || 0),
        otherAssets: Number(row.otherAssets || 0),
        totalAssets: Number(row.totalAssets || 0),
        ap: Number(row.ap || 0),
        loc: Number(row.loc || 0),
        otherCL: Number(row.otherCL || 0),
        tcl: Number(row.tcl || 0),
        ltd: Number(row.ltd || 0),
        totalLiab: Number(row.totalLiab || 0),
        ownersCapital: Number(row.ownersCapital || 0),
        ownersDraw: Number(row.ownersDraw || 0),
        retainedEarnings: Number(row.retainedEarnings || 0),
        totalEquity: Number(row.totalEquity || 0),
        totalLAndE: Number(row.totalLAndE || 0),
      };
    });

    type StatementRowDef = {
      key?: keyof (typeof statementDays)[number];
      label: string;
      styleType?: 'normal' | 'section' | 'subtotal' | 'total';
      valuesByDate?: Record<string, number>;
      suppressValues?: boolean;
    };

    const mappedLines = Array.isArray(dailyFinancialData?.mappedLines) ? dailyFinancialData.mappedLines : [];
    const lineIndex: Record<string, Record<string, number>> = {};
    mappedLines.forEach((line: any) => {
      const targetField = String(line.targetField || '').trim();
      if (!targetField) return;
      const dateLabel = new Date(line.snapshotDate).toLocaleDateString();
      lineIndex[targetField] ||= {};
      lineIndex[targetField][dateLabel] =
        Number(lineIndex[targetField][dateLabel] || 0) + Number(line.amount || 0);
    });

    const mappedFieldHasAnyValue = (field: string): boolean =>
      Object.values(lineIndex[field] || {}).some((value) => Number(value || 0) !== 0);

    const revenueDetailFields = Object.keys(lineIndex)
      .filter((field) => field.startsWith('rev_') && mappedFieldHasAnyValue(field))
      .sort((a, b) => getFieldDisplayName(a).localeCompare(getFieldDisplayName(b)));
    const dynamicCogsFields = Object.keys(lineIndex)
      .filter((field) => field.startsWith('cogs_') && field !== 'cogs_total' && mappedFieldHasAnyValue(field))
      .sort((a, b) => getFieldDisplayName(a).localeCompare(getFieldDisplayName(b)));
    const cogsDetailFields = dynamicCogsFields;
    const operatingExpenseFields = [
      'payroll', 'ownerBasePay', 'ownersRetirement', 'benefits', 'insurance', 'professionalFees',
      'subcontractors', 'rent', 'utilities', 'taxLicense', 'phoneComm', 'infrastructure', 'autoTravel',
      'salesExpense', 'marketing', 'trainingCert', 'mealsEntertainment', 'interestExpense',
      'depreciationAmortization', 'otherExpense',
    ].filter((field) => mappedFieldHasAnyValue(field));

    const dateLabels = statementDays.map((day) => day.dateLabel);
    const getMappedValue = (field: string, dateLabel: string): number =>
      Number(lineIndex[field]?.[dateLabel] || 0);
    const sumFieldsForDate = (fields: string[], dateLabel: string): number =>
      fields.reduce((sum, field) => sum + getMappedValue(field, dateLabel), 0);
    const buildSeriesFromDateLabels = (calculator: (dateLabel: string) => number): Record<string, number> =>
      dateLabels.reduce<Record<string, number>>((acc, dateLabel) => {
        acc[dateLabel] = calculator(dateLabel);
        return acc;
      }, {});

    const revenueByDate = buildSeriesFromDateLabels((dateLabel) =>
      revenueDetailFields.length > 0
        ? sumFieldsForDate(revenueDetailFields, dateLabel)
        : getMappedValue('revenue', dateLabel)
    );
    const cogsTotalByDate = buildSeriesFromDateLabels((dateLabel) =>
      cogsDetailFields.length > 0
        ? sumFieldsForDate(cogsDetailFields, dateLabel)
        : getMappedValue('cogsTotal', dateLabel)
    );
    const totalOperatingExpensesByDate = buildSeriesFromDateLabels((dateLabel) =>
      operatingExpenseFields.length > 0
        ? sumFieldsForDate(operatingExpenseFields, dateLabel)
        : getMappedValue('expense', dateLabel)
    );
    const grossProfitByDate = buildSeriesFromDateLabels(
      (dateLabel) => Number(revenueByDate[dateLabel] || 0) - Number(cogsTotalByDate[dateLabel] || 0)
    );
    const operatingIncomeByDate = buildSeriesFromDateLabels(
      (dateLabel) => Number(grossProfitByDate[dateLabel] || 0) - Number(totalOperatingExpensesByDate[dateLabel] || 0)
    );
    const nonOperatingIncomeByDate = buildSeriesFromDateLabels((dateLabel) => {
      const mapped = getMappedValue('nonOperatingIncome', dateLabel);
      if (mapped !== 0) return mapped;
      const day = statementDays.find((d) => d.dateLabel === dateLabel);
      return Number(day?.nonOperatingIncome || 0);
    });
    const extraordinaryItemsByDate = buildSeriesFromDateLabels((dateLabel) => {
      const mapped = getMappedValue('extraordinaryItems', dateLabel);
      if (mapped !== 0) return mapped;
      const day = statementDays.find((d) => d.dateLabel === dateLabel);
      return Number(day?.extraordinaryItems || 0);
    });
    const stateIncomeTaxesByDate = buildSeriesFromDateLabels((dateLabel) => {
      const mapped = getMappedValue('stateIncomeTaxes', dateLabel);
      if (mapped !== 0) return mapped;
      const day = statementDays.find((d) => d.dateLabel === dateLabel);
      return Number(day?.stateIncomeTaxes || 0);
    });
    const federalIncomeTaxesByDate = buildSeriesFromDateLabels((dateLabel) => {
      const mapped = getMappedValue('federalIncomeTaxes', dateLabel);
      if (mapped !== 0) return mapped;
      const day = statementDays.find((d) => d.dateLabel === dateLabel);
      return Number(day?.federalIncomeTaxes || 0);
    });
    const incomeBeforeTaxByDate = buildSeriesFromDateLabels(
      (dateLabel) =>
        Number(operatingIncomeByDate[dateLabel] || 0) +
        Number(nonOperatingIncomeByDate[dateLabel] || 0) +
        Number(extraordinaryItemsByDate[dateLabel] || 0)
    );
    const netIncomeByDate = buildSeriesFromDateLabels(
      (dateLabel) =>
        Number(incomeBeforeTaxByDate[dateLabel] || 0) -
        Number(stateIncomeTaxesByDate[dateLabel] || 0) -
        Number(federalIncomeTaxesByDate[dateLabel] || 0)
    );

    const incomeRowDefs: StatementRowDef[] = [
      { label: 'Total Revenue', styleType: 'section', valuesByDate: revenueByDate },
      ...revenueDetailFields.map((field) => ({
        label: `  ${getFieldDisplayName(field)}`,
        styleType: 'normal' as const,
        valuesByDate: lineIndex[field],
      })),
      { label: 'Cost of Goods Sold', styleType: 'section', suppressValues: true },
      ...dynamicCogsFields.map((field) => ({
        label: `  ${getFieldDisplayName(field)}`,
        styleType: 'normal' as const,
        valuesByDate: lineIndex[field],
      })),
      { label: 'Total COGS', styleType: 'subtotal', valuesByDate: cogsTotalByDate },
      { label: 'GROSS PROFIT', styleType: 'subtotal', valuesByDate: grossProfitByDate },
      { label: 'Operating Expenses', styleType: 'section', suppressValues: true },
      ...operatingExpenseFields.map((field) => ({
        label: `  ${getFieldDisplayName(field)}`,
        styleType: 'normal' as const,
        valuesByDate: lineIndex[field],
      })),
      { label: 'Total Operating Expenses', styleType: 'subtotal', valuesByDate: totalOperatingExpensesByDate },
      { label: 'Operating Income', styleType: 'subtotal', valuesByDate: operatingIncomeByDate },
      { label: 'Other Income/(Expense)', styleType: 'section', suppressValues: true },
      { label: getFieldDisplayName('nonOperatingIncome'), styleType: 'normal', valuesByDate: nonOperatingIncomeByDate },
      { label: getFieldDisplayName('extraordinaryItems'), styleType: 'normal', valuesByDate: extraordinaryItemsByDate },
      { label: getFieldDisplayName('incomeBeforeTax'), styleType: 'subtotal', valuesByDate: incomeBeforeTaxByDate },
      { label: 'Income Taxes', styleType: 'section', suppressValues: true },
      { label: `  ${getFieldDisplayName('stateIncomeTaxes')}`, styleType: 'normal', valuesByDate: stateIncomeTaxesByDate },
      { label: `  ${getFieldDisplayName('federalIncomeTaxes')}`, styleType: 'normal', valuesByDate: federalIncomeTaxesByDate },
      { label: getFieldDisplayName('netIncome'), styleType: 'total', valuesByDate: netIncomeByDate },
    ];

    const balanceRowDefs: StatementRowDef[] = [
      { label: 'Current Assets', styleType: 'section', suppressValues: true },
      { key: 'cash', label: `  ${getFieldDisplayName('cash')}`, styleType: 'normal' },
      { key: 'ar', label: `  ${getFieldDisplayName('accountsReceivable')}`, styleType: 'normal' },
      { key: 'inventory', label: `  ${getFieldDisplayName('inventory')}`, styleType: 'normal' },
      { key: 'otherCA', label: `  ${getFieldDisplayName('otherCurrentAssets')}`, styleType: 'normal' },
      { key: 'tca', label: getFieldDisplayName('totalCurrentAssets'), styleType: 'subtotal' },
      { label: 'Long-Term Assets', styleType: 'section', suppressValues: true },
      { key: 'fixedAssets', label: `  ${getFieldDisplayName('fixedAssets')}`, styleType: 'normal' },
      { key: 'otherAssets', label: `  ${getFieldDisplayName('otherAssets')}`, styleType: 'normal' },
      { key: 'totalAssets', label: getFieldDisplayName('totalAssets'), styleType: 'total' },
      { label: 'Current Liabilities', styleType: 'section', suppressValues: true },
      { key: 'ap', label: `  ${getFieldDisplayName('accountsPayable')}`, styleType: 'normal' },
      { key: 'loc', label: `  ${getFieldDisplayName('loc')}`, styleType: 'normal' },
      { key: 'otherCL', label: `  ${getFieldDisplayName('otherCurrentLiabilities')}`, styleType: 'normal' },
      { key: 'tcl', label: getFieldDisplayName('totalCurrentLiabilities'), styleType: 'subtotal' },
      { label: 'Long-Term Liabilities', styleType: 'section', suppressValues: true },
      { key: 'ltd', label: `  ${getFieldDisplayName('longTermDebt')}`, styleType: 'normal' },
      { key: 'totalLiab', label: getFieldDisplayName('totalLiabilities'), styleType: 'subtotal' },
      { label: 'Equity', styleType: 'section', suppressValues: true },
      { key: 'ownersCapital', label: `  ${getFieldDisplayName('ownersCapital')}`, styleType: 'normal' },
      { key: 'ownersDraw', label: `  ${getFieldDisplayName('ownersDraw')}`, styleType: 'normal' },
      { key: 'retainedEarnings', label: `  ${getFieldDisplayName('retainedEarnings')}`, styleType: 'normal' },
      { key: 'totalEquity', label: getFieldDisplayName('totalEquity'), styleType: 'subtotal' },
      { key: 'totalLAndE', label: getFieldDisplayName('totalLiabilitiesAndEquity'), styleType: 'total' },
    ];

    const statementRowStyle = (
      styleType: 'normal' | 'section' | 'subtotal' | 'total' | undefined
    ): { rowBg: string; textColor: string; weight: 400 | 500 | 600 | 700 } => {
      if (styleType === 'section') return { rowBg: '#f8fafc', textColor: '#1e293b', weight: 600 };
      if (styleType === 'subtotal') return { rowBg: '#dbeafe', textColor: '#1e40af', weight: 700 };
      if (styleType === 'total') return { rowBg: '#16a34a', textColor: '#ffffff', weight: 700 };
      return { rowBg: '#ffffff', textColor: '#334155', weight: 400 };
    };

    const cashFlowRows = statementWindow.map((row: any, index: number) => {
      const currentCash = Number(row.cash || 0);
      const previousCash = index + 1 < sortedRecords.length ? Number(sortedRecords[windowStart + index + 1]?.cash || currentCash) : currentCash;
      const changeCash = currentCash - previousCash;
      const netIncome = Number(row.revenue || 0) - Number(row.expense || 0);
      const depreciation = Number(row.depreciationAmortization || 0);
      const changeAR = index + 1 < sortedRecords.length ? Number(row.ar || 0) - Number(sortedRecords[windowStart + index + 1]?.ar || 0) : 0;
      const changeAP = index + 1 < sortedRecords.length ? Number(row.ap || 0) - Number(sortedRecords[windowStart + index + 1]?.ap || 0) : 0;
      const changeInventory = index + 1 < sortedRecords.length ? Number(row.inventory || 0) - Number(sortedRecords[windowStart + index + 1]?.inventory || 0) : 0;
      const operatingProxy = netIncome + depreciation - changeAR + changeAP - changeInventory;
      return {
        date: new Date(row.snapshotDate).toLocaleDateString(),
        netIncome,
        depreciation,
        changeAR,
        changeAP,
        changeInventory,
        operatingProxy,
        changeCash,
        endingCash: currentCash,
      };
    });
    const cashFlowDays = cashFlowRows.map((row) => ({
      ...row,
      dateLabel: row.date,
    }));
    const cashFlowRowDefs: Array<{
      key: keyof (typeof cashFlowDays)[number];
      label: string;
      styleType?: 'normal' | 'section' | 'subtotal' | 'total';
    }> = [
      { key: 'netIncome', label: getFieldDisplayName('netIncome'), styleType: 'section' },
      { key: 'depreciation', label: getFieldDisplayName('depreciationAmortization'), styleType: 'normal' },
      { key: 'changeAR', label: 'Change in Accounts Receivable', styleType: 'normal' },
      { key: 'changeAP', label: 'Change in Accounts Payable', styleType: 'normal' },
      { key: 'changeInventory', label: 'Change in Inventory', styleType: 'normal' },
      { key: 'operatingProxy', label: 'Operating Cash Flow (Proxy)', styleType: 'subtotal' },
      { key: 'changeCash', label: 'Net Change in Cash', styleType: 'section' },
      { key: 'endingCash', label: 'Ending Cash', styleType: 'total' },
    ];

    const tabButtonStyle = (active: boolean): React.CSSProperties => ({
      background: active ? '#eef2ff' : 'white',
      border: active ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
      color: active ? '#3730a3' : '#475569',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
    });

    const renderStatementWindowControls = () => (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: '#334155', fontSize: '13px', fontWeight: 600 }}>
            Showing {statementWindow.length} days ({windowStart + 1}-{Math.min(windowStart + 30, sortedRecords.length)} of {sortedRecords.length}, newest first)
          </span>
          <span style={{ color: '#64748b', fontSize: '12px' }}>Use slider to move 30-day window</span>
        </div>
        <input
          type="range"
          min={0}
          max={maxStart}
          step={1}
          value={windowStart}
          onChange={(event) => setDailyFinancialWindowStart(Number(event.target.value))}
          style={{ width: '100%' }}
          disabled={maxStart === 0}
        />
      </div>
    );

    return (
      <div>
        <div className="ops-print-hide" style={{ padding: '8px 24px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={tabButtonStyle(dailyFinancialView === 'summary')} onClick={() => setDailyFinancialView('summary')}>Summary</button>
          {isSectionEnabled('dailyIncomeStatement') && (
            <button style={tabButtonStyle(dailyFinancialView === 'income')} onClick={() => setDailyFinancialView('income')}>Income Statements</button>
          )}
          {isSectionEnabled('dailyBalanceSheet') && (
            <button style={tabButtonStyle(dailyFinancialView === 'balance')} onClick={() => setDailyFinancialView('balance')}>Balance Sheets</button>
          )}
          {isSectionEnabled('dailyCashflowStatement') && (
            <button style={tabButtonStyle(dailyFinancialView === 'cashflow')} onClick={() => setDailyFinancialView('cashflow')}>Cash Flow Statement</button>
          )}
        </div>

        {dailyFinancialView === 'summary' && (
          <div style={{ padding: '12px 24px 24px' }}>
            {isSectionEnabled('dailySummaryCards') && (
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', marginBottom: '24px' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#3b82f6', fontSize: '12px' }}>Latest Daily Revenue</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(Number(summary.latestRevenue || 0))}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#3b82f6', fontSize: '12px' }}>Avg. Revenue (30 Days)</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(avgRevenue30)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#ef4444', fontSize: '12px' }}>Latest Daily Expense</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(Number(summary.latestExpense || 0))}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#ef4444', fontSize: '12px' }}>Avg Expense (30 Days)</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(avgExpense30)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#10b981', fontSize: '12px' }}>Latest Net (R-E)</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(Number(summary.latestNet || 0))}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#10b981', fontSize: '12px' }}>Average Net (30 Days)</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(avgNet30)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#8b5cf6', fontSize: '12px' }}>Latest Cash Balance</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(Number(summary.latestCash || 0))}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: '#8b5cf6', fontSize: '12px' }}>Avg Cash (30 Days)</div>
                <div style={{ color: '#0f172a', fontSize: '24px', fontWeight: 700 }}>{formatCurrency(avgCash30)}</div>
              </div>
            </div>
            )}

            {isSectionEnabled('dailyTrendChart') && (
              <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ marginTop: 0, marginBottom: 0, color: '#0f172a' }}>Daily Trend</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {dailyTrendMetricOptions.map((option) => {
                    const selected = selectedDailyTrendMetrics.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        onClick={() => toggleDailyTrendMetric(option.key)}
                        style={{
                          border: `1px solid ${selected ? option.color : '#cbd5e1'}`,
                          borderRadius: '999px',
                          padding: '6px 10px',
                          background: selected ? `${option.color}12` : '#ffffff',
                          color: selected ? option.color : '#475569',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis yAxisId="left" stroke="#64748b" />
                    {selectedDailyTrendMetrics.includes('marginPct') && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#7c3aed"
                        tickFormatter={(value) => `${Number(value || 0).toFixed(0)}%`}
                        domain={marginPctDomain}
                      />
                    )}
                    <Tooltip
                      formatter={(value: any, name: any) => {
                        if (String(name || '').toLowerCase().includes('margin')) {
                          return `${Number(value || 0).toFixed(1)}%`;
                        }
                        return formatCurrency(Number(value || 0));
                      }}
                    />
                    <Legend />
                    {selectedDailyTrendMetrics.includes('revenue') && (
                      <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue" />
                    )}
                    {selectedDailyTrendMetrics.includes('expense') && (
                      <Line yAxisId="left" type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={false} name="Expense" />
                    )}
                    {selectedDailyTrendMetrics.includes('net') && (
                      <Line yAxisId="left" type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} dot={false} name="Net" />
                    )}
                    {selectedDailyTrendMetrics.includes('cash') && (
                      <Line yAxisId="left" type="monotone" dataKey="cash" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Cash" />
                    )}
                    {selectedDailyTrendMetrics.includes('grossMargin') && (
                      <Line yAxisId="left" type="monotone" dataKey="grossMargin" stroke="#f59e0b" strokeWidth={2} dot={false} name="Gross Margin" />
                    )}
                    {selectedDailyTrendMetrics.includes('marginPct') && (
                      <Line yAxisId="right" type="monotone" dataKey="marginPct" stroke="#7c3aed" strokeWidth={2} dot={false} name="Margin %" connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            )}
          </div>
        )}

        {dailyFinancialView === 'income' && isSectionEnabled('dailyIncomeStatement') && (
          <div style={{ padding: '12px 24px 24px' }}>
            {renderStatementWindowControls()}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Account', ...statementDays.map((day) => day.dateLabel)].map((header) => (
                      <th key={header} style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incomeRowDefs.map((rowDef, rowIndex) => (
                    <tr key={`${rowDef.label}-${rowIndex}`} style={{ background: statementRowStyle(rowDef.styleType).rowBg }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', fontWeight: statementRowStyle(rowDef.styleType).weight, color: statementRowStyle(rowDef.styleType).textColor, whiteSpace: 'nowrap' }}>
                        {rowDef.label}
                      </td>
                      {statementDays.map((day) => (
                        <td
                          key={`${rowDef.label}-${day.dateLabel}`}
                          style={{
                            padding: '10px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: statementRowStyle(rowDef.styleType).weight,
                            color: statementRowStyle(rowDef.styleType).textColor,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rowDef.suppressValues
                            ? ''
                            : formatCurrency(Number(
                                rowDef.valuesByDate
                                  ? rowDef.valuesByDate[day.dateLabel] || 0
                                  : (rowDef.key ? day[rowDef.key as keyof typeof day] : 0) || 0
                              ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {dailyFinancialView === 'balance' && isSectionEnabled('dailyBalanceSheet') && (
          <div style={{ padding: '12px 24px 24px' }}>
            {renderStatementWindowControls()}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Account', ...statementDays.map((day) => day.dateLabel)].map((header) => (
                      <th key={header} style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {balanceRowDefs.map((rowDef, rowIndex) => (
                    <tr key={`${rowDef.label}-${rowIndex}`} style={{ background: statementRowStyle(rowDef.styleType).rowBg }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', fontWeight: statementRowStyle(rowDef.styleType).weight, color: statementRowStyle(rowDef.styleType).textColor, whiteSpace: 'nowrap' }}>
                        {rowDef.label}
                      </td>
                      {statementDays.map((day) => (
                        <td
                          key={`${rowDef.label}-${day.dateLabel}`}
                          style={{
                            padding: '10px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: statementRowStyle(rowDef.styleType).weight,
                            color: statementRowStyle(rowDef.styleType).textColor,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rowDef.suppressValues
                            ? ''
                            : formatCurrency(Number(
                                rowDef.valuesByDate
                                  ? rowDef.valuesByDate[day.dateLabel] || 0
                                  : (rowDef.key ? day[rowDef.key as keyof typeof day] : 0) || 0
                              ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {dailyFinancialView === 'cashflow' && isSectionEnabled('dailyCashflowStatement') && (
          <div style={{ padding: '12px 24px 24px' }}>
            {renderStatementWindowControls()}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Account', ...cashFlowDays.map((day) => day.dateLabel)].map((header) => (
                      <th key={header} style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashFlowRowDefs.map((rowDef) => (
                    <tr key={String(rowDef.key)} style={{ background: statementRowStyle(rowDef.styleType).rowBg }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', fontWeight: statementRowStyle(rowDef.styleType).weight, color: statementRowStyle(rowDef.styleType).textColor, whiteSpace: 'nowrap' }}>
                        {rowDef.label}
                      </td>
                      {cashFlowDays.map((day) => (
                        <td
                          key={`${String(rowDef.key)}-${day.dateLabel}`}
                          style={{
                            padding: '10px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: statementRowStyle(rowDef.styleType).weight,
                            color: statementRowStyle(rowDef.styleType).textColor,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatCurrency(Number(day[rowDef.key] || 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
              Cash Flow Statement currently uses an operating cash flow proxy from available daily mapped fields.
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderForecast = () => {
    const renderCashConversionAnalysis = () => {
      const financialRecords = Array.isArray(cashConversionFinancialData?.records) ? cashConversionFinancialData.records : [];
      const mappedLines = Array.isArray(cashConversionFinancialData?.mappedLines) ? cashConversionFinancialData.mappedLines : [];
      const inferredFrequency = String(financialRecords[0]?.frequency || 'monthly').toLowerCase();
      const requiredPeriods = inferredFrequency === 'daily' ? 365 : 12;
      const trailingRecords = financialRecords.slice(0, requiredPeriods);
      const latestDaily = trailingRecords[0] || null;
      const latestSnapshotDate = latestDaily?.snapshotDate
        ? new Date(latestDaily.snapshotDate).toISOString().split('T')[0]
        : null;
      const mappedTotalsForLatestDate = mappedLines.reduce((acc: Record<string, number>, line: any) => {
        if (!latestSnapshotDate) return acc;
        const lineDate = line?.snapshotDate ? new Date(line.snapshotDate).toISOString().split('T')[0] : null;
        if (lineDate !== latestSnapshotDate) return acc;
        const target = String(line?.targetField || '').trim().toLowerCase();
        if (!target) return acc;
        acc[target] = Number(acc[target] || 0) + Number(line?.amount || 0);
        return acc;
      }, {});
      const sumMappedTargets = (targets: string[]) =>
        targets.reduce((sum, target) => sum + Number(mappedTotalsForLatestDate[target] || 0), 0);
      const hasSnapshotAR =
        (latestDaily?.ar !== undefined && latestDaily?.ar !== null) ||
        (latestDaily?.accountsReceivable !== undefined && latestDaily?.accountsReceivable !== null) ||
        (latestDaily?.accounts_receivable !== undefined && latestDaily?.accounts_receivable !== null);
      const hasSnapshotInventory = latestDaily?.inventory !== undefined && latestDaily?.inventory !== null;
      const hasSnapshotAP =
        (latestDaily?.ap !== undefined && latestDaily?.ap !== null) ||
        (latestDaily?.accountsPayable !== undefined && latestDaily?.accountsPayable !== null) ||
        (latestDaily?.accounts_payable !== undefined && latestDaily?.accounts_payable !== null);
      const arBalance = hasSnapshotAR
        ? Number(latestDaily.ar ?? latestDaily.accountsReceivable ?? latestDaily.accounts_receivable ?? 0)
        : sumMappedTargets(['ar', 'accountsreceivable', 'accounts_receivable', 'tradear', 'netar']);
      const inventoryBalance = hasSnapshotInventory
        ? Number(latestDaily.inventory || 0)
        : sumMappedTargets(['inventory', 'inv', 'stock', 'inventoryasset']);
      const apBalance = hasSnapshotAP
        ? Number(latestDaily.ap ?? latestDaily.accountsPayable ?? latestDaily.accounts_payable ?? 0)
        : sumMappedTargets(['ap', 'accountspayable', 'accounts_payable', 'tradeap']);
      const sumRevenue = trailingRecords.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
      const sumCogs = trailingRecords.reduce((sum: number, row: any) => sum + Number(row.cogsTotal || row.cogs || 0), 0);
      const hasRevenue = Number.isFinite(sumRevenue) && sumRevenue > 0;
      const hasCogs = Number.isFinite(sumCogs) && sumCogs > 0;
      const hasAr = Number.isFinite(arBalance);
      const hasInventory = Number.isFinite(inventoryBalance);
      const hasAp = Number.isFinite(apBalance);
      const hasRealCashConversionInputs =
        trailingRecords.length > 0 &&
        hasRevenue &&
        hasCogs &&
        hasAr &&
        hasInventory &&
        hasAp;
      const hasRequiredInputs = hasRealCashConversionInputs;
      const availablePeriods = trailingRecords.length;
      const missingInputs: string[] = [];
      if (!hasRevenue) missingInputs.push('Revenue');
      if (!hasCogs) missingInputs.push('COGS');
      if (!hasAr) missingInputs.push('AR');
      if (!hasInventory) missingInputs.push('Inventory');
      if (!hasAp) missingInputs.push('AP');
      const annualRevenue = sumRevenue;
      const annualCogs = sumCogs;
      const dailyRevenue = annualRevenue / 365;
      const dailyCogs = annualCogs / 365;
      const inventoryDollars = Number(inventoryBalance || 0);
      const dso = dailyRevenue > 0 ? Number(arBalance || 0) / dailyRevenue : 0;
      const dpo = dailyCogs > 0 ? Number(apBalance || 0) / dailyCogs : 0;
      const dio = dailyCogs > 0 ? inventoryDollars / dailyCogs : 0;
      const ccc = dso + dio - dpo;
      const arDollars = dso * dailyRevenue;
      const apDollars = dpo * dailyCogs;
      const owc = arDollars + inventoryDollars - apDollars;
      const owcPctRevenue = annualRevenue > 0 ? (owc / annualRevenue) * 100 : 0;
      const cashPerCccDayShortcut = dailyRevenue;
      const growthRateAssumption = 0.1;
      const revenueGrowthDollars = annualRevenue * growthRateAssumption;
      const growthCashNeeded = annualRevenue > 0 ? (owc / annualRevenue) * revenueGrowthDollars : 0;
      const scenarioDays = [10, 20, 30];
      const sectorBenchmarks = getSdeSectorBenchmarks(industrySectorCategory || null);
      const targetDso = Number(sectorBenchmarks.benchmarkTargets.dso || 0);
      const targetDio = Number(sectorBenchmarks.benchmarkTargets.inventoryDays || 0);
      const targetCcc = Number(sectorBenchmarks.benchmarkTargets.ccc || 0);
      const targetDpo = Math.max(0, targetDso + targetDio - targetCcc);
      const actionLevers = [
        {
          label: 'DSO',
          current: dso,
          target: targetDso,
          gapDays: dso - targetDso,
          cashPerDay: dailyRevenue,
          action: 'Tighten terms, enforce collections cadence, and focus top overdue accounts.',
        },
        {
          label: 'DIO',
          current: dio,
          target: targetDio,
          gapDays: dio - targetDio,
          cashPerDay: dailyCogs,
          action: 'Reduce slow movers, tighten reorder points, and improve demand planning.',
        },
        {
          label: 'DPO',
          current: dpo,
          target: targetDpo,
          gapDays: targetDpo - dpo,
          cashPerDay: dailyCogs,
          action: 'Renegotiate supplier terms and consistently use full approved payment windows.',
        },
      ].map((lever) => {
        const gapDaysPositive = Math.max(0, lever.gapDays);
        const cashImpact = gapDaysPositive * lever.cashPerDay;
        const gapLabel = lever.gapDays >= 0 ? `+${lever.gapDays.toFixed(1)}` : lever.gapDays.toFixed(1);
        const status = lever.gapDays > 1 ? 'Above target' : lever.gapDays < -1 ? 'Better than target' : 'On target';
        return { ...lever, gapDaysPositive, cashImpact, gapLabel, status };
      });

      return (
        <div style={{ background: 'white', borderRadius: '12px', padding: '0 20px 20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: 0, marginBottom: '10px' }}>Cash Conversion Analysis</h3>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '12px' }}>
            Convert CCC days into cash dollars so leadership can quantify working-capital drag, release opportunities, and growth funding needs.
          </p>
          {!hasRequiredInputs ? (
            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px', padding: '12px', color: '#9a3412' }}>
              Cash Conversion Analysis requires master financial monthly data with Revenue, COGS, AR, Inventory, and AP fields. No fallback calculations are used.
              {missingInputs.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#9a3412' }}>
                  Missing/zero inputs detected: {missingInputs.join(', ')}.
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Cash Conversion Cycle</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b' }}>{ccc.toFixed(1)} days</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Operating Working Capital (OWC)</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b' }}>{formatCurrency(owc)}</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>OWC as % of Revenue</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b' }}>{owcPctRevenue.toFixed(1)}%</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Cash Impact per CCC Day (shortcut)</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e293b' }}>{formatCurrency(cashPerCccDayShortcut)}</div>
                </div>
              </div>

              <div style={{ background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', padding: '14px', marginBottom: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e3a8a', marginBottom: '8px' }}>Executive insights</div>
                <div style={{ fontSize: '15px', color: '#1e3a8a', lineHeight: 1.7 }}>
                  <div>Cash tied up in operations: <strong>{formatCurrency(owc)}</strong> ({owcPctRevenue.toFixed(1)}% of annualized revenue).</div>
                  <div>Every 1 CCC day currently represents approximately <strong>{formatCurrency(cashPerCccDayShortcut)}</strong> of cash impact.</div>
                  <div>A 10-day CCC improvement can free approximately <strong>{formatCurrency(10 * cashPerCccDayShortcut)}</strong>.</div>
                  <div>Growth cash requirement (assuming 10% revenue growth): <strong>{formatCurrency(growthCashNeeded)}</strong>.</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  Action levers vs sector ({sectorBenchmarks.sectorLabel})
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
                  Current vs Sector, cash impact, and priority action.
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  {actionLevers.map((lever, index) => {
                    const cashPerDayRounded = Math.round(lever.cashPerDay / 1000);
                    const impactRounded = Math.round(lever.cashImpact / 100000) / 10;
                    const isDpo = lever.label === 'DPO';
                    const isBelowTargetForDpo = isDpo && lever.gapDays > 0;
                    const isAboveTargetForDsoDio = !isDpo && lever.gapDays > 0;
                    const impactText =
                      isBelowTargetForDpo
                        ? `this leaves ~$${impactRounded}M of supplier financing on the table`
                        : isAboveTargetForDsoDio
                          ? `this ties up ~$${impactRounded}M`
                          : `this is within/above sector and not tying up incremental cash`;

                    return (
                      <div
                        key={lever.label}
                        style={{
                          fontSize: '14px',
                          color: '#0f172a',
                          lineHeight: 1.7,
                          padding: index === 0 ? '0 0 6px 0' : '6px 0',
                          borderTop: index === 0 ? 'none' : '1px solid #f1f5f9',
                        }}
                      >
                        <strong>{lever.label}</strong> is {lever.current.toFixed(1)} vs sector {lever.target.toFixed(1)} ({lever.gapLabel}). At ~${cashPerDayRounded}k per day, {impactText}. Priority: {lever.action}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Five-step calculation walkthrough</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div id="cca-step5-calc" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step 1 - CCC formula</div>
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '3px' }}>
                        CCC = DSO + DIO - DPO = {dso.toFixed(1)} + {dio.toFixed(1)} - {dpo.toFixed(1)} = <strong>{ccc.toFixed(1)} days</strong>
                      </div>
                    </div>

                    <div id="cca-step4-calc" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step 3 - Convert components into dollars</div>
                      <div style={{ marginTop: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                          <tbody>
                            <tr style={{ background: '#ffffff' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>AR</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>DSO x Daily Revenue</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {dso.toFixed(1)} x {formatCurrency(dailyRevenue)}
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(arDollars)}
                              </td>
                            </tr>
                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Inventory</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>DIO x Daily COGS</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {dio.toFixed(1)} x {formatCurrency(dailyCogs)}
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(inventoryDollars)}
                              </td>
                            </tr>
                            <tr style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>AP</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>DPO x Daily COGS</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {dpo.toFixed(1)} x {formatCurrency(dailyCogs)}
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(apDollars)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step 5 - Convert CCC days into dollars</div>
                      <div style={{ marginTop: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                          <tbody>
                            <tr style={{ background: '#ffffff' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Shortcut</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>Cash impact per CCC day</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(annualRevenue)} / 365
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(cashPerCccDayShortcut)}
                              </td>
                            </tr>
                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>1 DSO day</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>Cash impact</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>Daily Revenue</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(dailyRevenue)}
                              </td>
                            </tr>
                            <tr style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>1 DIO day</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>Cash impact</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>Daily COGS</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(dailyCogs)}
                              </td>
                            </tr>
                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>1 DPO day</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>Cash impact</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>Daily COGS</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(dailyCogs)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step 2 - Daily operating activity</div>
                      <div style={{ marginTop: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                          <tbody>
                            <tr style={{ background: '#ffffff' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Daily Revenue</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>TTM Revenue / 365</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(annualRevenue)} / 365
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(dailyRevenue)}
                              </td>
                            </tr>
                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Daily COGS</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>TTM COGS / 365</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(annualCogs)} / 365
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(dailyCogs)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                        {`Using trailing 12-month totals from ${availablePeriods} monthly master-financial snapshots, divided by 365.`}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step 4 - Operating Working Capital tied up</div>
                      <div style={{ marginTop: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                          <tbody>
                            <tr style={{ background: '#ffffff' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>OWC</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 0', whiteSpace: 'nowrap' }}>AR + Inventory - AP</td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(arDollars)} + {formatCurrency(inventoryDollars)} - {formatCurrency(apDollars)}
                              </td>
                              <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(owc)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Definitions</div>
                        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
                          <div><strong>CCC</strong>: Cash Conversion Cycle = DSO + DIO - DPO.</div>
                          <div><strong>DSO</strong>: Days Sales Outstanding (how long it takes to collect receivables).</div>
                          <div><strong>DIO</strong>: Days Inventory Outstanding (how long inventory sits before being sold).</div>
                          <div><strong>DPO</strong>: Days Payables Outstanding (how long the company takes to pay suppliers).</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div id="cca-scenario-engine" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>CCC deterioration (cash consumed)</div>
                  {scenarioDays.map((days) => (
                    <div key={`worse-${days}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155', padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>
                      <span>+{days} days</span>
                      <span style={{ fontWeight: 700, color: '#b91c1c' }}>{formatCurrency(days * cashPerCccDayShortcut)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>CCC improvement (cash released)</div>
                  {scenarioDays.map((days) => (
                    <div key={`better-${days}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#334155', padding: '4px 0', borderTop: '1px solid #f1f5f9' }}>
                      <span>-{days} days</span>
                      <span style={{ fontWeight: 700, color: '#166534' }}>{formatCurrency(days * cashPerCccDayShortcut)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div id="cca-growth-calc" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #c7d2fe', padding: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#312e81', marginBottom: '8px' }}>Revenue growth cash requirement</div>
                  <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                      <tbody>
                        <tr style={{ background: '#ffffff' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Formula</td>
                          <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Cash Needed for Growth = CCC x Daily Revenue Growth</td>
                        </tr>
                        <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Daily Revenue Growth</td>
                          <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            ({formatCurrency(annualRevenue)} x {Math.round(growthRateAssumption * 100)}%) / 365 = {formatCurrency(revenueGrowthDollars / 365)}
                          </td>
                        </tr>
                        <tr style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Calculation</td>
                          <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {ccc.toFixed(1)} x {formatCurrency(revenueGrowthDollars / 365)} = <strong>{formatCurrency(growthCashNeeded)}</strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', marginTop: '8px' }}>
                    This tells management how much additional cash growth is expected to consume.
                  </div>
                </div>

                <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #86efac', padding: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#14532d', marginBottom: '8px' }}>Working Capital Leverage Ratio</div>
                  <div style={{ marginTop: '4px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#334155' }}>
                      <tbody>
                        <tr style={{ background: '#ffffff' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Formula</td>
                          <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Working Capital as % of Revenue = OWC / Revenue</td>
                        </tr>
                        <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Calculation</td>
                          <td style={{ padding: '8px 6px', color: '#64748b' }}>=</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(owc)} / {formatCurrency(annualRevenue)} = <strong>{owcPctRevenue.toFixed(1)}%</strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', marginTop: '8px' }}>
                    Meaning: {owcPctRevenue.toFixed(1)}% of revenue is trapped in operations.
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      );
    };

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <div className="ops-print-hide" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
          <button
            onClick={() => setActiveForecastBasisTab('accrual-basis')}
            style={{
              padding: '12px 18px',
              background: activeForecastBasisTab === 'accrual-basis' ? '#667eea' : 'transparent',
              color: activeForecastBasisTab === 'accrual-basis' ? 'white' : '#64748b',
              border: 'none',
              borderBottom: activeForecastBasisTab === 'accrual-basis' ? '3px solid #667eea' : '3px solid transparent',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              transition: 'all 0.2s'
            }}
          >
            Accrual Cash Forecast
          </button>
          <button
            onClick={() => setActiveForecastBasisTab('cash-basis')}
            style={{
              padding: '12px 18px',
              background: activeForecastBasisTab === 'cash-basis' ? '#667eea' : 'transparent',
              color: activeForecastBasisTab === 'cash-basis' ? 'white' : '#64748b',
              border: 'none',
              borderBottom: activeForecastBasisTab === 'cash-basis' ? '3px solid #667eea' : '3px solid transparent',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              borderRadius: '8px 8px 0 0',
              transition: 'all 0.2s'
            }}
          >
            Cash Conversion Analysis
          </button>
        </div>

        {activeForecastBasisTab === 'cash-basis' && (
          renderCashConversionAnalysis()
        )}

        {activeForecastBasisTab === 'accrual-basis' && (
          <>
            <div className="ops-print-hide" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
              <button
                onClick={() => setActiveAccrualBasisForecastTab('income-statement-forecast')}
                style={{
                  padding: '12px 18px',
                  background: activeAccrualBasisForecastTab === 'income-statement-forecast' ? '#667eea' : 'transparent',
                  color: activeAccrualBasisForecastTab === 'income-statement-forecast' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeAccrualBasisForecastTab === 'income-statement-forecast' ? '3px solid #667eea' : '3px solid transparent',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s'
                }}
              >
                Income Statement Forecast
              </button>
              <button
                onClick={() => setActiveAccrualBasisForecastTab('cash-forecast')}
                style={{
                  padding: '12px 18px',
                  background: activeAccrualBasisForecastTab === 'cash-forecast' ? '#667eea' : 'transparent',
                  color: activeAccrualBasisForecastTab === 'cash-forecast' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeAccrualBasisForecastTab === 'cash-forecast' ? '3px solid #667eea' : '3px solid transparent',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s'
                }}
              >
                Cash Forecast
              </button>
              <button
                onClick={() => setActiveAccrualBasisForecastTab('graphs')}
                style={{
                  padding: '12px 18px',
                  background: activeAccrualBasisForecastTab === 'graphs' ? '#667eea' : 'transparent',
                  color: activeAccrualBasisForecastTab === 'graphs' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeAccrualBasisForecastTab === 'graphs' ? '3px solid #667eea' : '3px solid transparent',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  transition: 'all 0.2s'
                }}
              >
                Graphs
              </button>
            </div>

            {activeAccrualBasisForecastTab === 'income-statement-forecast' && (
              <FinancialForecastTab
                selectedCompanyId={selectedCompanyId}
                companyName={companyName}
                industrySectorCategory={industrySectorCategory || null}
                displayMode="no-graphs"
                basisMode="accrual"
              />
            )}
            {activeAccrualBasisForecastTab === 'cash-forecast' && (
              <WorkingCapitalForecastTab selectedCompanyId={selectedCompanyId} basisMode="accrual" />
            )}
            {activeAccrualBasisForecastTab === 'graphs' && (
              <FinancialForecastTab
                selectedCompanyId={selectedCompanyId}
                companyName={companyName}
                industrySectorCategory={industrySectorCategory || null}
                displayMode="graphs-only"
                basisMode="accrual"
              />
            )}
          </>
        )}
      </div>
    );
  };

  const renderModuleTabContent = (moduleKey: string) => {
    if (moduleKey === 'forecast') {
      return renderForecast();
    }
    if (moduleKey === 'working_capital_forecast' || moduleKey === 'working-capital-forecast') {
      return <WorkingCapitalForecastTab selectedCompanyId={selectedCompanyId} />;
    }
    const dataType = mapModuleToDataType(moduleKey);
    if (dataType === 'customers') return renderCustomers();
    if (dataType === 'ar-aging') return renderARaging();
    if (dataType === 'ap-aging') return renderAPaging();
    if (dataType === 'products') return renderProducts();
    if (dataType === 'inventory') return renderInventory();
    if (dataType === 'cash') return renderCash();
    if (dataType === 'daily-financials') return renderDailyFinancials();
    return (
      <div style={{ padding: '32px', color: '#64748b' }}>
        No renderer is configured for module <strong>{moduleKey}</strong>.
      </div>
    );
  };

  if (isOverviewOnly) {
    return (
      <div style={{
        maxWidth: '1600px',
        margin: '0 auto',
        minHeight: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ height: '20px' }}></div>
        {renderOverview()}
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '1600px', 
      margin: '0 auto', 
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      <style>{`
        @media print {
          .ops-print-hide {
            display: none !important;
          }
        }
      `}</style>
      {/* Spacer for main nav */}
      <div style={{ height: '20px' }}></div>

      {/* Tabs */}
      <div className="ops-print-hide" style={{ 
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
              transition: 'all 0.2s'
            }}
          >
            {tab === 'dashboard'
              ? 'Overview'
              : tab === 'forecast'
                ? 'Cash Forecast'
              : getModuleLabel(tab)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="ops-print-hide">{renderFilters()}</div>

      {/* Content */}
      {activeTab === 'dashboard' && (
        <OpsDashboard
          selectedCompanyId={selectedCompanyId}
          companyName={companyName}
          industrySectorCategory={industrySectorCategory}
          activeModules={enabledDashboardModules}
          moduleTitlesByType={moduleTitlesByType}
        />
      )}
      {activeTab !== 'dashboard' && renderModuleTabContent(activeTab)}
    </div>
  );
}
