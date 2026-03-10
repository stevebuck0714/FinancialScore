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
import FinancialForecastTab from '../FinancialForecastTab';
import WorkingCapitalForecastTab from './WorkingCapitalForecastTab';
import { getSectorMockProfile, getTopLineBucketsForSector } from '@/lib/operations/sector-mock-data';
import { getModuleLabel, mapModuleToDataType, type OpsDataType } from '@/lib/operations/module-registry';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';

interface OperationsTabProps {
  selectedCompanyId: string;
  companyName: string;
  industrySectorCategory?: string | null;
  viewMode?: 'full' | 'overview-only';
}

type OpTab = 'dashboard' | 'overview' | string;

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

export default function OperationsTab({ selectedCompanyId, companyName, industrySectorCategory, viewMode = 'full' }: OperationsTabProps) {
  const isOverviewOnly = viewMode === 'overview-only';
  const [activeTab, setActiveTab] = useState<OpTab>(isOverviewOnly ? 'overview' : 'dashboard');
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
  const [dailyFinancialData, setDailyFinancialData] = useState<any>(null);
  const [dailyFinancialView, setDailyFinancialView] = useState<'summary' | 'income' | 'balance' | 'cashflow'>('summary');
  const [dailyFinancialWindowStart, setDailyFinancialWindowStart] = useState(0);
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
  const [smartCardsLoading, setSmartCardsLoading] = useState(false);
  
  // Date range and frequency filters
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    // Default to last 90 days for daily view
    date.setDate(date.getDate() - 90);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const orderedDashboardDataTypes: OpsDataType[] = ['customers', 'ar-aging', 'ap-aging', 'products', 'inventory', 'cash', 'daily-financials'];
  const layoutModules: string[] = Array.isArray(opsSectorLayoutConfig?.modules)
    ? opsSectorLayoutConfig.modules
        .map((module: unknown) => String(module || '').trim())
        .filter((module: string) => module && module.toLowerCase() !== 'ops-default')
    : [];
  const sectorModules = getTopLineBucketsForSector(industrySectorCategory).map((bucket) => bucket.key);
  const moduleSource: 'layout-config' | 'sector-default' = layoutModules.length > 0 ? 'layout-config' : 'sector-default';
  const resolvedModules = moduleSource === 'layout-config' ? layoutModules : sectorModules;
  const availableModuleTabs = Array.from(
    new Set([
      ...(resolvedModules.length > 0 ? resolvedModules : ['customers', 'ar', 'ap', 'products', 'inventory', 'cash']),
      'daily_financials',
      'working_capital_forecast',
    ])
  ).filter((module) => !['cash', 'working_capital_forecast', 'working-capital-forecast'].includes(module));
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
    const records = Array.isArray(dailyFinancialData?.records) ? dailyFinancialData.records : [];
    const maxStart = Math.max(0, records.length - 30);
    if (dailyFinancialWindowStart > maxStart) {
      setDailyFinancialWindowStart(maxStart);
    }
  }, [dailyFinancialData, dailyFinancialWindowStart]);

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
        ? ((Number(previous.days1to30 || 0) + Number(previous.days31to60 || 0) + Number(previous.days61to90 || 0) + Number(previous.days90plus || 0)) / Math.max(Number(previous.totalAR || 1), 1)) * 100
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
    const summaryTopCustomers = Array.isArray(summary?.topCustomers) ? summary.topCustomers : [];
    const rankedCustomers = summaryTopCustomers
      .map((customer: any) => ({
        name: customer?.name || 'Unknown Customer',
        totalRevenue: Number(customer?.totalRevenue || 0),
        totalInvoices: Number(customer?.totalInvoices || 0),
      }))
      .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);

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
              {rankedCustomers.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(rankedCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0))}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Invoices</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {rankedCustomers.reduce((sum: number, c: any) => sum + c.totalInvoices, 0)}
            </div>
          </div>
        </div>

        {(() => {
          const topTenRaw = rankedCustomers.slice(0, 10);
          const allOtherRaw = rankedCustomers.slice(10);
          const topTen = topTenRaw.map((customer) => {
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
              trend,
            };
          });

          const allOtherRevenue = allOtherRaw.reduce((sum, customer) => sum + customer.totalRevenue, 0);
          const allOtherRow =
            allOtherRevenue > 0
              ? {
                  customerName: 'All other',
                  bookingsYtd: allOtherRevenue,
                  bookingsQtd: Math.round(allOtherRevenue * 0.34),
                  bookingsMtd: Math.round(allOtherRevenue * 0.15),
                  backlogTotal: Math.round(allOtherRevenue * 0.58),
                  backlog30: Math.round(allOtherRevenue * 0.19),
                  backlog60: Math.round(allOtherRevenue * 0.22),
                  backlog90: Math.round(allOtherRevenue * 0.17),
                  trend: Math.round((allOtherRevenue * 0.01) / 1000),
                }
              : null;

          const demandRows = allOtherRow ? [...topTen, allOtherRow] : topTen;
          const totalBookingsMtd = demandRows.reduce((sum, row) => sum + row.bookingsMtd, 0);
          const totalBookingsQtd = demandRows.reduce((sum, row) => sum + row.bookingsQtd, 0);
          const totalBookingsYtd = demandRows.reduce((sum, row) => sum + row.bookingsYtd, 0);
          const backlogTotalAll = demandRows.reduce((sum, row) => sum + row.backlogTotal, 0);
          const due30Total = demandRows.reduce((sum, row) => sum + row.backlog30, 0);
          const due60Total = demandRows.reduce((sum, row) => sum + row.backlog60, 0);
          const due90Total = demandRows.reduce((sum, row) => sum + row.backlog90, 0);
          const top5Backlog = demandRows.slice(0, 5).reduce((sum, row) => sum + row.backlogTotal, 0);
          const top5BacklogPct = backlogTotalAll > 0 ? (top5Backlog / backlogTotalAll) * 100 : 0;
          const monthlyTrend = demandRows.reduce((sum, row) => sum + row.trend, 0);

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
                return ((a.backlogTotal / Math.max(1, backlogTotalAll)) - (b.backlogTotal / Math.max(1, backlogTotalAll))) * dir;
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

          const tableCustomers = topTenRaw.map((customer) => ({
            ...customer,
            totalInvoices: Math.max(1, Math.round(customer.totalInvoices || customer.totalRevenue / 10000)),
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
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings</div>
            <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>MTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(totalBookingsMtd)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>QTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(totalBookingsQtd)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>YTD</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(totalBookingsYtd)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Backlog $</div>
            <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(backlogTotalAll)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 30</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(due30Total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 60</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(due60Total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Due 90</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(due90Total)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Backlog concentration</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
              Top 5 customers = {top5BacklogPct.toFixed(1)}%
            </div>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Bookings trend (3-month slope)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                {monthlyTrend >= 0 ? '+' : '-'}${Math.abs(monthlyTrend)}k/mo
              </span>
              <span style={{ color: monthlyTrend >= 0 ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                {monthlyTrend >= 0 ? '↑' : '↓'}
              </span>
            </div>
          </div>
        </div>

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
    const invoices = (summary?.unpaidInvoices || []).map((row: any) => ({
      customerName: row.customerName || row.customer,
      customerNumber: row.customerNumber || row.customerId || row.customerNo || '-',
      invoiceDate: row.invoiceDate || row.date,
      dueDate: row.dueDate,
      amountDue: row.amountDue || row.balance || 0,
    }));
    const paidByCustomer = (summary?.paidInvoices || [])
      .map((row: any) => ({
        customerName: row.customerName || row.customer,
        currentMonth: row.currentMonth || 0,
        lastMonth: row.lastMonth || 0,
        last12Months: row.last12Months || 0,
      }))
      .sort((a: any, b: any) => b.last12Months - a.last12Months)
      .slice(0, 10);
    const paidTotal = paidByCustomer.reduce((sum: number, item: any) => sum + item.last12Months, 0);
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
    const legacyCogsFields = ['cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials', 'cogsCommissions', 'cogsOther']
      .filter((field) => mappedFieldHasAnyValue(field));
    const dynamicCogsFields = Object.keys(lineIndex)
      .filter((field) => field.startsWith('cogs_') && field !== 'cogs_total' && mappedFieldHasAnyValue(field))
      .sort((a, b) => getFieldDisplayName(a).localeCompare(getFieldDisplayName(b)));
    const cogsDetailFields = [...legacyCogsFields, ...dynamicCogsFields];
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
      ...legacyCogsFields.map((field) => ({
        label: `  ${getFieldDisplayName(field)}`,
        styleType: 'normal' as const,
        valuesByDate: lineIndex[field],
      })),
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
        <div style={{ padding: '8px 24px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={tabButtonStyle(dailyFinancialView === 'summary')} onClick={() => setDailyFinancialView('summary')}>Summary</button>
          <button style={tabButtonStyle(dailyFinancialView === 'income')} onClick={() => setDailyFinancialView('income')}>Income Statements</button>
          <button style={tabButtonStyle(dailyFinancialView === 'balance')} onClick={() => setDailyFinancialView('balance')}>Balance Sheets</button>
          <button style={tabButtonStyle(dailyFinancialView === 'cashflow')} onClick={() => setDailyFinancialView('cashflow')}>Cash Flow Statement</button>
        </div>

        {dailyFinancialView === 'summary' && (
          <div style={{ padding: '12px 24px 24px' }}>
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

            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#0f172a' }}>Daily Trend</h3>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {dailyFinancialView === 'income' && (
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

        {dailyFinancialView === 'balance' && (
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

        {dailyFinancialView === 'cashflow' && (
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
    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
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
            Accural Cash Forecast
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
            Income statement Cash Forecast
          </button>
        </div>

        {activeForecastBasisTab === 'cash-basis' && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
              <button
                onClick={() => setActiveCashBasisForecastTab('income-statement-forecast')}
                style={{
                  padding: '12px 18px',
                  background: activeCashBasisForecastTab === 'income-statement-forecast' ? '#667eea' : 'transparent',
                  color: activeCashBasisForecastTab === 'income-statement-forecast' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeCashBasisForecastTab === 'income-statement-forecast' ? '3px solid #667eea' : '3px solid transparent',
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
                onClick={() => setActiveCashBasisForecastTab('cash-forecast')}
                style={{
                  padding: '12px 18px',
                  background: activeCashBasisForecastTab === 'cash-forecast' ? '#667eea' : 'transparent',
                  color: activeCashBasisForecastTab === 'cash-forecast' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeCashBasisForecastTab === 'cash-forecast' ? '3px solid #667eea' : '3px solid transparent',
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
                onClick={() => setActiveCashBasisForecastTab('graphs')}
                style={{
                  padding: '12px 18px',
                  background: activeCashBasisForecastTab === 'graphs' ? '#667eea' : 'transparent',
                  color: activeCashBasisForecastTab === 'graphs' ? 'white' : '#64748b',
                  border: 'none',
                  borderBottom: activeCashBasisForecastTab === 'graphs' ? '3px solid #667eea' : '3px solid transparent',
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

            {activeCashBasisForecastTab === 'income-statement-forecast' && (
              <FinancialForecastTab
                selectedCompanyId={selectedCompanyId}
                companyName={companyName}
                industrySectorCategory={industrySectorCategory || null}
                displayMode="no-graphs"
                basisMode="cash"
              />
            )}
            {activeCashBasisForecastTab === 'cash-forecast' && (
              <WorkingCapitalForecastTab selectedCompanyId={selectedCompanyId} basisMode="cash" />
            )}
            {activeCashBasisForecastTab === 'graphs' && (
              <FinancialForecastTab
                selectedCompanyId={selectedCompanyId}
                companyName={companyName}
                industrySectorCategory={industrySectorCategory || null}
                displayMode="graphs-only"
                basisMode="cash"
              />
            )}
          </>
        )}

        {activeForecastBasisTab === 'accrual-basis' && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
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
              transition: 'all 0.2s'
            }}
          >
            {tab === 'dashboard'
              ? 'Ops Dashboard'
              : tab === 'forecast'
                ? 'Cash Forecast'
              : getModuleLabel(tab)}
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
          activeModules={resolvedModules}
          moduleTitlesByType={moduleTitlesByType}
        />
      )}
      {activeTab !== 'dashboard' && renderModuleTabContent(activeTab)}
    </div>
  );
}
