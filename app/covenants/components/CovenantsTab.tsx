'use client';

import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, Settings, Target } from 'lucide-react';
import type { MonthlyDataRow, User } from '../../types';

// Feature flag for covenants module
const COVENANTS_ENABLED = process.env.NEXT_PUBLIC_COVENANTS_ENABLED === 'true' || true;

interface CovenantsTabProps {
  selectedCompanyId: string;
  currentUser: User | null;
  monthly: MonthlyDataRow[];
  companyName: string;
}

// Mock alerts for demonstration
const mockAlerts = [
  {
    id: '1',
    title: 'Debt-to-Equity Ratio Breach',
    description: 'Current ratio of 1.8 exceeds the maximum threshold of 2.0',
    severity: 'critical',
    status: 'active',
    covenantName: 'Debt-to-Equity Ratio',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
  },
  {
    id: '2',
    title: 'Minimum Liquidity Warning',
    description: 'Cash balance of $450,000 is approaching the minimum requirement of $250,000',
    severity: 'warning',
    status: 'active',
    covenantName: 'Minimum Liquidity',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
  },
  {
    id: '3',
    title: 'Interest Coverage Ratio Alert',
    description: 'Coverage ratio dropped to 3.2, very close to the minimum requirement of 3.0',
    severity: 'warning',
    status: 'active',
    covenantName: 'Interest Coverage Ratio',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
  },
  {
    id: '4',
    title: 'Capex Limit Exceeded',
    description: 'Annual capital expenditures have reached $1.2M, exceeding the $1M limit',
    severity: 'critical',
    status: 'resolved',
    covenantName: 'Capex Limitation',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
  }
];

// Mock data for demonstration - All Comprehensive Covenants
const mockCovenantData = [
  // Financial Covenants - Leverage Based
  {
    id: '1',
    name: 'Total Leverage Ratio',
    category: 'Financial',
    subCategory: 'Leverage-Based',
    currentValue: 3.2,
    threshold: 4.0,
    status: 'compliant',
    description: 'Total Debt ÷ EBITDA',
    covenantType: 'maximum',
    applicable: true
  },
  {
    id: '2',
    name: 'Net Leverage Ratio',
    category: 'Financial',
    subCategory: 'Leverage-Based',
    currentValue: 2.8,
    threshold: 3.5,
    status: 'compliant',
    description: '(Total Debt - Cash) ÷ EBITDA',
    covenantType: 'maximum',
    applicable: true
  },
  {
    id: '3',
    name: 'Debt-to-Equity Ratio',
    category: 'Financial',
    subCategory: 'Leverage-Based',
    currentValue: 1.5,
    threshold: 2.0,
    status: 'compliant',
    description: 'Total Debt ÷ Shareholders Equity',
    covenantType: 'maximum',
    applicable: true
  },

  // Financial Covenants - Coverage Based
  {
    id: '4',
    name: 'Interest Coverage Ratio',
    category: 'Financial',
    subCategory: 'Coverage-Based',
    currentValue: 4.5,
    threshold: 3.0,
    status: 'compliant',
    description: 'EBITDA ÷ Interest Expense',
    covenantType: 'minimum',
    applicable: true
  },
  {
    id: '5',
    name: 'Debt Service Coverage Ratio',
    category: 'Financial',
    subCategory: 'Coverage-Based',
    currentValue: 2.2,
    threshold: 1.5,
    status: 'compliant',
    description: 'Net Operating Income ÷ Debt Service',
    covenantType: 'minimum',
    applicable: true
  },

  // Financial Covenants - Liquidity Based
  {
    id: '6',
    name: 'Current Ratio',
    category: 'Financial',
    subCategory: 'Liquidity-Based',
    currentValue: 1.8,
    threshold: 1.5,
    status: 'compliant',
    description: 'Current Assets ÷ Current Liabilities',
    covenantType: 'minimum',
    applicable: true
  },
  {
    id: '7',
    name: 'Quick Ratio',
    category: 'Financial',
    subCategory: 'Liquidity-Based',
    currentValue: 1.2,
    threshold: 1.0,
    status: 'compliant',
    description: '(Cash + AR + Marketable Securities) ÷ Current Liabilities',
    covenantType: 'minimum',
    applicable: true
  },
  {
    id: '8',
    name: 'Minimum Liquidity',
    category: 'Financial',
    subCategory: 'Liquidity-Based',
    currentValue: 500000,
    threshold: 250000,
    status: 'compliant',
    description: 'Cash + Available Revolver ≥ threshold',
    covenantType: 'minimum',
    applicable: true
  },

  // Financial Covenants - Profitability
  {
    id: '9',
    name: 'Minimum EBITDA',
    category: 'Financial',
    subCategory: 'Profitability',
    currentValue: 2500000,
    threshold: 2000000,
    status: 'compliant',
    description: 'Minimum Operating Performance',
    covenantType: 'minimum',
    applicable: true
  },

  // Maintenance Covenants
  {
    id: '10',
    name: 'Maximum Leverage',
    category: 'Maintenance',
    subCategory: 'Leverage',
    currentValue: 3.2,
    threshold: 4.0,
    status: 'compliant',
    description: 'Ongoing leverage ratio ≤ threshold',
    covenantType: 'maximum',
    applicable: true
  },
  {
    id: '11',
    name: 'Minimum DSCR',
    category: 'Maintenance',
    subCategory: 'Coverage',
    currentValue: 2.2,
    threshold: 1.5,
    status: 'compliant',
    description: 'Ongoing DSCR ≥ threshold',
    covenantType: 'minimum',
    applicable: true
  },
  {
    id: '12',
    name: 'Minimum Net Worth',
    category: 'Maintenance',
    subCategory: 'Capital',
    currentValue: 5000000,
    threshold: 4000000,
    status: 'compliant',
    description: 'Tangible Net Worth ≥ threshold',
    covenantType: 'minimum',
    applicable: true
  },

  // Negative Covenants
  {
    id: '13',
    name: 'Debt Incurrence Covenant',
    category: 'Negative',
    subCategory: 'Debt Restrictions',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Limits taking on additional debt - New debt allowed only if leverage ratio ≤ set level',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '14',
    name: 'Lien Covenant',
    category: 'Negative',
    subCategory: 'Security',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Limits granting collateral to others - Cannot create liens unless permitted basket',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '15',
    name: 'Dividend/Distribution Covenant',
    category: 'Negative',
    subCategory: 'Distributions',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Limits paying dividends - Dividends allowed only if leverage < threshold or fixed dollar basket',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '16',
    name: 'Capital Expenditure Covenant',
    category: 'Negative',
    subCategory: 'Capital Expenditures',
    currentValue: null,
    threshold: 1000000,
    status: 'compliant',
    description: 'Caps capex spending - Annual Capex ≤ budget or limit',
    covenantType: 'maximum',
    applicable: true
  },
  {
    id: '17',
    name: 'Asset Sale Covenant',
    category: 'Negative',
    subCategory: 'Asset Sales',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Limits selling assets - Sale proceeds must reduce debt or reinvest',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '18',
    name: 'M&A/Investment Covenant',
    category: 'Negative',
    subCategory: 'Investments',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Limits acquisitions, JV, equity investments - Only allowed within dollar baskets or leverage tests',
    covenantType: 'qualitative',
    applicable: true
  },

  // Affirmative Covenants
  {
    id: '19',
    name: 'Financial Reporting Covenant',
    category: 'Affirmative',
    subCategory: 'Reporting',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Provide financials regularly - Timely delivery (quarterly/annual reports)',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '20',
    name: 'Insurance Covenant',
    category: 'Affirmative',
    subCategory: 'Insurance',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Maintain adequate insurance - Evidence of coverage; limits per policy',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '21',
    name: 'Taxes Covenant',
    category: 'Affirmative',
    subCategory: 'Compliance',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Pay taxes on time - Certification / no tax liens',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '22',
    name: 'Compliance Certificate',
    category: 'Affirmative',
    subCategory: 'Reporting',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Annual/Q compliance reporting - Signed officer certificate',
    covenantType: 'qualitative',
    applicable: true
  },
  {
    id: '23',
    name: 'Collateral Maintenance',
    category: 'Affirmative',
    subCategory: 'Security',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Protect and maintain pledged assets - Inspections; asset condition thresholds',
    covenantType: 'qualitative',
    applicable: true
  },

  // Incurrence Covenants
  {
    id: '24',
    name: 'Incurrence Leverage Test',
    category: 'Incurrence',
    subCategory: 'Leverage',
    currentValue: null,
    threshold: 3.5,
    status: 'compliant',
    description: 'Leverage ratio must be below limit after transaction',
    covenantType: 'maximum',
    applicable: false
  },
  {
    id: '25',
    name: 'Interest Coverage Incurrence Test',
    category: 'Incurrence',
    subCategory: 'Coverage',
    currentValue: null,
    threshold: 3.0,
    status: 'compliant',
    description: 'Coverage must stay above threshold after action',
    covenantType: 'minimum',
    applicable: false
  },
  {
    id: '26',
    name: 'Restricted Payments Builder Basket',
    category: 'Incurrence',
    subCategory: 'Distributions',
    currentValue: null,
    threshold: null,
    status: 'compliant',
    description: 'Dividends allowed only if EBITDA grows and leverage is low',
    covenantType: 'qualitative',
    applicable: false
  }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'compliant': return '#10B981';
    case 'warning': return '#F59E0B';
    case 'breached': return '#EF4444';
    default: return '#6B7280';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'compliant': return <CheckCircle size={14} color="#10B981" />;
    case 'warning': return <AlertTriangle size={14} color="#F59E0B" />;
    case 'breached': return <XCircle size={14} color="#EF4444" />;
    default: return <Target size={14} color="#6B7280" />;
  }
};

// Calculate real financial ratios from monthly data
const calculateFinancialRatios = (monthlyData: MonthlyDataRow[]) => {
  if (!monthlyData || monthlyData.length === 0) {
    return null;
  }

  // Get the most recent month's data
  const latestData = monthlyData[monthlyData.length - 1];

  // Calculate EBITDA using same formula as main reports
  // EBIT = Revenue - COGS - Operating Expenses + Interest Expense (add back interest)
  // EBITDA = EBIT + Depreciation & Amortization
  const revenue = latestData.revenue || 0;
  const cogsTotal = latestData.cogsTotal || 0;
  const expense = latestData.expense || 0;
  const interestExpense = latestData.interestExpense || 0;
  const depreciationAmortization = latestData.depreciationAmortization || 0;

  const ebit = revenue - cogsTotal - expense + interestExpense;
  const ebitda = ebit + depreciationAmortization;

  // Calculate financial ratios
  return {
    // Leverage Ratios
    totalLeverageRatio: latestData.totalLAndE > 0 ? latestData.totalLAndE / ebitda : 0,
    netLeverageRatio: latestData.totalLAndE > 0 && latestData.cash ?
                      (latestData.totalLAndE - latestData.cash) / ebitda : 0,
    debtToEquityRatio: latestData.totalEquity > 0 ? latestData.totalLAndE / latestData.totalEquity : 0,

    // Coverage Ratios
    interestCoverageRatio: latestData.interestExpense > 0 ? ebitda / latestData.interestExpense : 0,
    debtServiceCoverageRatio: latestData.interestExpense > 0 ?
                             latestData.netProfit / latestData.interestExpense : 0,

    // Liquidity Ratios
    currentRatio: latestData.tcl > 0 ? latestData.tca / latestData.tcl : 0,
    quickRatio: latestData.tcl > 0 ?
                (latestData.cash + latestData.ar) / latestData.tcl : 0,
    cashRatio: latestData.tcl > 0 ? latestData.cash / latestData.tcl : 0,

    // Working Capital
    workingCapital: latestData.tca - latestData.tcl,

    // Absolute values for thresholds
    totalDebt: latestData.totalLAndE,
    cash: latestData.cash,
    ar: latestData.ar,
    inventory: latestData.inventory,
    otherCA: latestData.otherCA,
    ebitda: ebitda,
    netIncome: latestData.netProfit,
    totalAssets: latestData.totalAssets,
    totalEquity: latestData.totalEquity,
    currentAssets: latestData.tca,
    currentLiabilities: latestData.tcl
  };
};

// Generate historical data for a covenant (36 months) - uses real data when available
const generateHistoricalData = (covenant: any, covenantThresholds: Record<string, number>) => {
  const data = [];
  const currentValue = covenant.currentValue;
  const threshold = covenantThresholds[covenant.id] ?? covenant.threshold;

  // If we have real financial data, generate more realistic historical trends
  // Otherwise, use mock data generation
  const hasRealData = currentValue !== null && !isNaN(currentValue);

  for (let i = 35; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);

    let trendValue;

    if (hasRealData) {
      // Generate realistic historical data based on current value
      const baseValue = currentValue;
      const monthsElapsed = 35 - i;
      const trendProgress = monthsElapsed / 35; // 0 to 1

      // Create a gradual trend toward current value with some variation
      const startValue = baseValue * (0.8 + Math.random() * 0.4); // Start 20-60% of current value
      const trendDirection = (baseValue - startValue) / 35;
      const randomVariation = (Math.random() - 0.5) * 0.15; // ±7.5% variation

      trendValue = startValue + (trendDirection * monthsElapsed) + (baseValue * randomVariation);

      // Occasionally create breaches for demonstration
      if (covenant.covenantType === 'minimum' && Math.random() < 0.08) {
        trendValue = threshold * (0.85 + Math.random() * 0.1); // 85-95% of threshold
      } else if (covenant.covenantType === 'maximum' && Math.random() < 0.06) {
        trendValue = threshold * (1.05 + Math.random() * 0.1); // 105-115% of threshold
      }

      // Ensure reasonable bounds
      if (covenant.covenantType === 'minimum' && threshold) {
        trendValue = Math.max(trendValue, threshold * 0.7); // Don't go too low
      } else if (covenant.covenantType === 'maximum' && threshold) {
        trendValue = Math.min(trendValue, threshold * 1.3); // Don't go too high
      }
    } else {
      // Fallback to mock data generation
      trendValue = covenant.currentValue || 1.0;
      const randomVariation = (Math.random() - 0.5) * 0.3;
      trendValue *= (1 + randomVariation);
    }

    data.push({
      month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      value: Number(trendValue.toFixed(1)),
      date: date
    });
  }

  return data;
};

// Calculate average of historical data points
const calculateAverage = (data: any[]) => {
  const sum = data.reduce((acc, point) => acc + point.value, 0);
  return sum / data.length;
};

export default function CovenantsTab({
  selectedCompanyId,
  currentUser,
  monthly,
  companyName
}: CovenantsTabProps) {
  console.log('🏢 CovenantsTab RENDER - props:', { selectedCompanyId, companyName, monthlyLength: monthly?.length });
  // Feature flag check
  if (!COVENANTS_ENABLED) {
    return (
      <div style={{ padding: '24px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
          Loan Covenants
        </h2>
        <div style={{ color: '#64748b' }}>
          ⚠️ Covenants module is currently disabled.
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'alerts' | 'settings'>('overview');
  const [selectedCovenant, setSelectedCovenant] = useState<any>(null);
  const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'warning'>('all');
  const [alerts, setAlerts] = useState(mockAlerts);
  const [configCategory, setConfigCategory] = useState<'all' | 'financial' | 'maintenance' | 'negative' | 'affirmative' | 'incurrence'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [covenantThresholds, setCovenantThresholds] = useState<Record<string, number>>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('covenantConfiguration');
      if (saved) {
        try {
          const config = JSON.parse(saved);
          return config.covenantThresholds || {
            '1': 4.0, '2': 3.5, '3': 2.0, '4': 3.0, '5': 1.5, '6': 1.5, '7': 1.0, '8': 250000, '9': 2000000,
            '10': 4.0, '11': 1.5, '12': 4000000, '16': 1000000, '24': 3.5, '25': 3.0
          };
        } catch (e) {
          console.warn('Failed to load saved covenant thresholds');
        }
      }
    }
    return {
      '1': 4.0, '2': 3.5, '3': 2.0, '4': 3.0, '5': 1.5, '6': 1.5, '7': 1.0, '8': 250000, '9': 2000000,
      '10': 4.0, '11': 1.5, '12': 4000000, '16': 1000000, '24': 3.5, '25': 3.0
    };
  });

  const [covenantApplicability, setCovenantApplicability] = useState<Record<string, boolean>>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('covenantConfiguration');
      if (saved) {
        try {
          const config = JSON.parse(saved);
          return config.covenantApplicability || {
            '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true, '9': true,
            '10': true, '11': true, '12': true, '13': true, '14': true, '15': true, '16': true, '17': true, '18': true,
            '19': true, '20': true, '21': true, '22': true, '23': true, '24': false, '25': false, '26': false
          };
        } catch (e) {
          console.warn('Failed to load saved covenant applicability');
        }
      }
    }
    return {
      '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true, '9': true,
      '10': true, '11': true, '12': true, '13': true, '14': true, '15': true, '16': true, '17': true, '18': true,
      '19': true, '20': true, '21': true, '22': true, '23': true, '24': false, '25': false, '26': false
    };
  });
  const [covenantAlertLevels, setCovenantAlertLevels] = useState<Record<string, 'none' | 'warning' | 'critical'>>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('covenantConfiguration');
      if (saved) {
        try {
          const config = JSON.parse(saved);
          return config.covenantAlertLevels || {
            '1': 'warning', '2': 'warning', '3': 'warning', '4': 'warning', '5': 'warning', '6': 'warning', '7': 'warning', '8': 'warning', '9': 'warning',
            '10': 'warning', '11': 'warning', '12': 'warning', '13': 'warning', '14': 'warning', '15': 'warning', '16': 'warning', '17': 'warning', '18': 'warning',
            '19': 'warning', '20': 'warning', '21': 'warning', '22': 'warning', '23': 'warning', '24': 'none', '25': 'none', '26': 'none'
          };
        } catch (e) {
          console.warn('Failed to load saved covenant alert levels');
        }
      }
    }
    return {
      '1': 'warning', '2': 'warning', '3': 'warning', '4': 'warning', '5': 'warning', '6': 'warning', '7': 'warning', '8': 'warning', '9': 'warning',
      '10': 'warning', '11': 'warning', '12': 'warning', '13': 'warning', '14': 'warning', '15': 'warning', '16': 'warning', '17': 'warning', '18': 'warning',
      '19': 'warning', '20': 'warning', '21': 'warning', '22': 'warning', '23': 'warning', '24': 'none', '25': 'none', '26': 'none'
    };
  });

  // Calculate real financial ratios from actual data
  const financialRatios = React.useMemo(() => {
    const ratios = calculateFinancialRatios(monthly);
    console.log('📊 calculateFinancialRatios result:', ratios);
    console.log('📊 Ratios properties:', Object.keys(ratios || {}));
    if (ratios) {
      console.log('📊 cash:', ratios.cash, 'ebitda:', ratios.ebitda);
    }
    return ratios;
  }, [monthly]);

  // Generate dynamic covenant data based on real financials
  const covenantData = React.useMemo(() => {
    console.log('🔄 CovenantData useMemo - financialRatios:', financialRatios);
    if (!financialRatios) {
      console.log('❌ No financialRatios, using mock data');
      return mockCovenantData; // Fallback to mock if no data
    }

    console.log('✅ Using real data, mapping covenants...');
    return mockCovenantData.map(covenant => {
      let currentValue = null;
      let status: 'compliant' | 'warning' | 'breached' = 'compliant';

      // Map covenant types to calculated financial ratios

      // Map covenant types to calculated financial ratios
      switch (covenant.covenantType) {
        case 'total_leverage_ratio':
          currentValue = financialRatios.totalLeverageRatio;
          break;
        case 'net_leverage_ratio':
          currentValue = financialRatios.netLeverageRatio;
          break;
        case 'debt_to_equity_ratio':
          currentValue = financialRatios.debtToEquityRatio;
          break;
        case 'interest_coverage_ratio':
          currentValue = financialRatios.interestCoverageRatio;
          break;
        case 'debt_service_coverage_ratio':
          currentValue = financialRatios.debtServiceCoverageRatio;
          break;
        case 'current_ratio':
          currentValue = financialRatios.currentRatio;
          break;
        case 'quick_ratio':
          currentValue = financialRatios.quickRatio;
          break;
        case 'minimum_liquidity':
          // Cash only (since we don't have revolver/line of credit data)
          currentValue = financialRatios.cash;
          break;
        case 'minimum_ebitda':
          currentValue = financialRatios.ebitda;
          break;
        default:
          currentValue = covenant.currentValue; // Keep mock values for qualitative covenants
      }

      // Calculate status based on threshold (use dynamic threshold if set, otherwise default)
      const threshold = covenantThresholds[covenant.id] ?? covenant.threshold;
      if (currentValue !== null && threshold !== null && threshold !== undefined) {
        if (covenant.covenantType === 'minimum') {
          // For minimum covenants (higher values are better): below threshold = breach
          if (currentValue < threshold) {
            status = 'breached';
          }
        } else if (covenant.covenantType === 'maximum') {
          // For maximum covenants (lower values are better): above threshold = breach
          if (currentValue > threshold) {
            status = 'breached';
          }
        }
      }

      return {
        ...covenant,
        currentValue,
        status
      };
    });
  }, [financialRatios, covenantThresholds]);

  console.log('🏢 CovenantsTab RENDER - financialRatios exists:', !!financialRatios, 'covenantData length:', covenantData?.length);

  // Initialize selectedCovenant with first available covenant that has data
  React.useEffect(() => {
    if (covenantData.length > 0 && !selectedCovenant) {
      const firstCovenant = covenantData.find(c => c.currentValue !== null && (covenantApplicability[c.id] ?? c.applicable));
      if (firstCovenant) {
        setSelectedCovenant(firstCovenant);
      }
    }
  }, [covenantData, selectedCovenant, covenantApplicability]);

  const applicableCovenants = (covenantData || []).filter(c => covenantApplicability[c.id] ?? c.applicable);
  const compliantCount = applicableCovenants.filter(c => c.status === 'compliant').length;
  const warningCount = applicableCovenants.filter(c => c.status === 'warning').length;
  const breachedCount = applicableCovenants.filter(c => c.status === 'breached').length;
  const totalCount = applicableCovenants.length;

  const complianceScore = totalCount > 0 ? Math.round(((compliantCount + warningCount * 0.5) / totalCount) * 100) : 100;

  // Function to acknowledge an alert
  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'resolved', timestamp: new Date() }
          : alert
      )
    );
  };

  // Function to update covenant threshold
  const updateCovenantThreshold = (covenantId: string, newThreshold: number) => {
    setCovenantThresholds(prev => ({
      ...prev,
      [covenantId]: newThreshold
    }));
  };

  // Function to update covenant applicability
  const updateCovenantApplicability = (covenantId: string, applicable: boolean) => {
    setCovenantApplicability(prev => ({
      ...prev,
      [covenantId]: applicable
    }));
  };

  // Function to update alert level for a covenant
  const updateAlertLevel = (covenantId: string, alertLevel: 'none' | 'warning' | 'critical') => {
    setCovenantAlertLevels(prev => ({
      ...prev,
      [covenantId]: alertLevel
    }));
  };

  // Function to save configuration
  const saveConfiguration = async () => {
    setIsSaving(true);
    setSaveMessage('💾 Saving configuration...');

    try {
      // Simulate API call to save configuration
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Save current configuration to localStorage for persistence
      const configuration = {
        covenantThresholds,
        covenantApplicability,
        covenantAlertLevels,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem('covenantConfiguration', JSON.stringify(configuration));

      // In a real implementation, this would save to a database
      setSaveMessage('✅ Configuration saved successfully!');

      // Clear message after 4 seconds
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (error) {
      setSaveMessage('❌ Failed to save configuration. Please try again.');
      setTimeout(() => setSaveMessage(''), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Function to reset to defaults
  const resetToDefaults = () => {
    // Reset to default values
    setCovenantThresholds({
      '1': 4.0, '2': 3.5, '3': 2.0, '4': 3.0, '5': 1.5, '6': 1.5, '7': 1.0, '8': 250000, '9': 2000000,
      '10': 4.0, '11': 1.5, '12': 4000000, '16': 1000000, '24': 3.5, '25': 3.0
    });
    setCovenantApplicability({
      '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true, '9': true,
      '10': true, '11': true, '12': true, '13': true, '14': true, '15': true, '16': true, '17': true, '18': true,
      '19': true, '20': true, '21': true, '22': true, '23': true, '24': false, '25': false, '26': false
    });
    setCovenantAlertLevels({
      '1': 'warning', '2': 'warning', '3': 'warning', '4': 'warning', '5': 'warning', '6': 'warning', '7': 'warning', '8': 'warning', '9': 'warning',
      '10': 'warning', '11': 'warning', '12': 'warning', '13': 'warning', '14': 'warning', '15': 'warning', '16': 'warning', '17': 'warning', '18': 'warning',
      '19': 'warning', '20': 'warning', '21': 'warning', '22': 'warning', '23': 'warning', '24': 'none', '25': 'none', '26': 'none'
    });

    // Clear localStorage
    localStorage.removeItem('covenantConfiguration');

    setSaveMessage('🔄 Configuration reset to defaults.');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 16px 16px 8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' }}>
            Loan Covenants
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            {companyName} • {totalCount} covenants monitored
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            padding: '8px 16px',
            background: complianceScore >= 80 ? '#dcfce7' : complianceScore >= 60 ? '#fef3c7' : '#fee2e2',
            border: `1px solid ${complianceScore >= 80 ? '#16a34a' : complianceScore >= 60 ? '#d97706' : '#dc2626'}`,
            borderRadius: '6px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: complianceScore >= 80 ? '#16a34a' : complianceScore >= 60 ? '#d97706' : '#dc2626'
            }}>
              {complianceScore}%
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Compliance</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'details', label: 'Details' },
          { id: 'alerts', label: 'Alerts' },
          { id: 'settings', label: 'Settings' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.id ? '#667eea' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748b',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          {/* Compact Compliance Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '6px', padding: '16px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle style={{ color: '#10B981', marginRight: '6px' }} size={20} />
                  <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#10B981' }}>Compliant</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10B981' }}>{compliantCount}</div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '6px', padding: '16px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <AlertTriangle style={{ color: '#F59E0B', marginRight: '6px' }} size={20} />
                  <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#F59E0B' }}>Warning</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#F59E0B' }}>{warningCount}</div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '6px', padding: '16px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <XCircle style={{ color: '#EF4444', marginRight: '6px' }} size={20} />
                  <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#EF4444' }}>Breached</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#EF4444' }}>{breachedCount}</div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '6px', padding: '16px', border: '2px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Target style={{ color: '#667eea', marginRight: '6px' }} size={20} />
                  <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#667eea' }}>Total</span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#667eea' }}>{totalCount}</div>
              </div>
            </div>
          </div>

          {/* Covenant List by Category */}
          <div style={{ display: 'grid', gap: '16px' }}>
            {[
              { key: 'financial', title: 'Financial Covenants', color: '#3b82f6' },
              { key: 'maintenance', title: 'Maintenance Covenants', color: '#059669' },
              { key: 'incurrence', title: 'Incurrence Covenants', color: '#7c3aed' },
              { key: 'negative', title: 'Negative Covenants', color: '#dc2626' },
              { key: 'affirmative', title: 'Affirmative Covenants', color: '#ea580c' }
            ].map(({ key, title, color }) => {
              const categoryCovenants = covenantData.filter(c => c.category.toLowerCase() === key && (covenantApplicability[c.id] ?? c.applicable));
              if (categoryCovenants.length === 0) return null;

              return (
                <div key={key} style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      {title}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {categoryCovenants.filter(c => c.status === 'compliant').length}/{categoryCovenants.length} compliant
                    </div>
                  </div>

                  {/* Covenant Grid for this Category */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {categoryCovenants.map((covenant) => (
                      <div key={covenant.id} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '12px',
                        border: `1px solid ${getStatusColor(covenant.status)}`,
                        borderRadius: '6px',
                        background: covenant.status === 'compliant' ? '#f0fdf4' : covenant.status === 'warning' ? '#fffbeb' : '#fef2f2',
                        minHeight: '80px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                          {getStatusIcon(covenant.status)}
                          <div style={{ marginLeft: '8px', flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', lineHeight: '1.3' }}>
                              {covenant.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.3', marginTop: '4px' }}>
                              {covenant.description}
                            </div>
                          </div>
                        </div>

                        {covenant.currentValue !== null && covenant.threshold !== null && (covenantApplicability[covenant.id] ?? covenant.applicable) && (
                          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px', marginTop: '8px' }}>
                            {covenant.id === '8' && console.log('🎯 Rendering Minimum Liquidity - currentValue:', covenant.currentValue)}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', fontWeight: '500' }}>Current</div>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: getStatusColor(covenant.status) }}>
                                  {typeof covenant.currentValue === 'number'
                                    ? (covenant.currentValue > 1000
                                        ? `$${covenant.currentValue.toLocaleString()}`
                                        : Number(covenant.currentValue).toFixed(1))
                                    : covenant.currentValue
                                  }
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', fontWeight: '500' }}>Required</div>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151' }}>
                                  {typeof (covenantThresholds[covenant.id] ?? covenant.threshold) === 'number'
                                    ? ((covenantThresholds[covenant.id] ?? covenant.threshold) > 1000
                                        ? `$${(covenantThresholds[covenant.id] ?? covenant.threshold).toLocaleString()}`
                                        : Number(covenantThresholds[covenant.id] ?? covenant.threshold).toFixed(1))
                                    : (covenantThresholds[covenant.id] ?? covenant.threshold)
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {covenant.currentValue !== null && covenant.threshold === null && (
                          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px', marginTop: '8px' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px', fontWeight: '500' }}>Current Value</div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: getStatusColor(covenant.status) }}>
                              {typeof covenant.currentValue === 'number'
                                ? (covenant.currentValue > 1000
                                    ? `$${covenant.currentValue.toLocaleString()}`
                                    : Number(covenant.currentValue).toFixed(1))
                                : covenant.currentValue
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'details' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Covenant Trend Analysis
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              Historical performance and threshold tracking for all financial covenants
            </p>
          </div>

          {/* 2x3 Grid of Covenant Charts - Full Size */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {covenantData
              .filter(covenant => covenant.currentValue !== null && covenant.threshold !== null && (covenantApplicability[covenant.id] ?? covenant.applicable))
              .slice(0, 9) // Show all applicable quantitative covenants with thresholds
              .map((covenant, index) => (
              <div key={covenant.id} style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: '0 0 4px 0' }}>
                      {covenant.name}
                    </h4>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      {covenant.description}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                        Current: <span style={{ color: getStatusColor(covenant.status), fontWeight: '700' }}>
                          {covenant.currentValue?.toFixed(1)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                        Required: <span style={{ color: '#374151', fontWeight: '700' }}>
                          {Number(covenantThresholds[covenant.id] ?? covenant.threshold).toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: covenant.status === 'compliant' ? '#10b981' : covenant.status === 'warning' ? '#f59e0b' : '#ef4444',
                      fontWeight: '600',
                      marginTop: '4px'
                    }}>
                      {covenant.status}
                    </div>
                  </div>
                </div>

                {/* Compact chart for 2x3 grid */}
                <svg width="500" height="250" style={{ maxWidth: '100%', marginBottom: '5px' }} viewBox="0 0 500 250" preserveAspectRatio="xMidYMid meet">
                  {(() => {
                    const historicalData = generateHistoricalData(covenant, covenantThresholds);
                    const dynamicThreshold = covenantThresholds[covenant.id] ?? covenant.threshold;
                    const maxValue = Math.max(...historicalData.map(p => p.value), dynamicThreshold || 0);
                    const minValue = Math.min(...historicalData.map(p => p.value), dynamicThreshold || 0);
                    const range = maxValue - minValue || 1;
                    const padding = { top: 15, right: 20, bottom: 30, left: 40 };
                    const chartWidth = 500 - padding.left - padding.right;
                    const chartHeight = 250 - padding.top - padding.bottom;

                    // Calculate points
                    const points = historicalData.map((d, i) => {
                      const x = padding.left + (i / (historicalData.length - 1)) * chartWidth;
                      const clampedValue = Math.max(minValue, Math.min(maxValue, d.value));
                      const y = padding.top + chartHeight - ((clampedValue - minValue) / range) * chartHeight;
                      return { x, y, month: d.month, value: d.value, isAboveThreshold: d.value > (dynamicThreshold || 0) };
                    });

                    // Generate line path
                    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    // Grid lines
                    const gridValues = [];
                    const step = range / 4;
                    for (let i = 0; i <= 4; i++) {
                      gridValues.push(minValue + step * i);
                    }

                    return (
                      <>
                        {/* Grid lines */}
                        {gridValues.map((val, idx) => {
                          const y = padding.top + chartHeight - ((val - minValue) / range) * chartHeight;
                          return (
                            <g key={idx}>
                              <line x1={padding.left} y1={y} x2={500 - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                                {Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(1)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Axis lines */}
                        <line x1={padding.left} y1={250 - padding.bottom} x2={500 - padding.right} y2={250 - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
                        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={250 - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />

                        {/* Threshold line */}
                        {dynamicThreshold && dynamicThreshold >= minValue && dynamicThreshold <= maxValue && (
                          <>
                            <line
                              x1={padding.left}
                              y1={padding.top + chartHeight - ((dynamicThreshold - minValue) / range) * chartHeight}
                              x2={500 - padding.right}
                              y2={padding.top + chartHeight - ((dynamicThreshold - minValue) / range) * chartHeight}
                              stroke="#ef4444"
                              strokeWidth="2"
                              strokeDasharray="5,5"
                            />
                            <text
                              x={500 - padding.right - 5}
                              y={padding.top + chartHeight - ((dynamicThreshold - minValue) / range) * chartHeight - 8}
                              fontSize="8"
                              fill="#ef4444"
                              fontWeight="600"
                              textAnchor="end"
                            >
                              Threshold
                            </text>
                          </>
                        )}

                        {/* Trend line */}
                        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                        {/* Data points */}
                        {points.map((point, index) => (
                          <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r="3"
                            fill={point.isAboveThreshold ? '#ef4444' : '#3b82f6'}
                            stroke="white"
                            strokeWidth="2"
                          />
                        ))}

                        {/* Month labels - show every 6th month for readability */}
                        {points.filter((_, index) => index % 6 === 0).map((point, index) => (
                          <text
                            key={index}
                            x={point.x}
                            y={245}
                            textAnchor="middle"
                            fontSize="9"
                            fill="#64748b"
                          >
                            {point.month}
                          </text>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            ))}

            {/* Empty space for the 6th spot */}
            <div></div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div>
          {/* Alert Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <AlertTriangle style={{ color: '#EF4444', marginRight: '8px' }} size={24} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#EF4444' }}>Critical Alerts</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Require immediate attention</div>
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
                  {mockAlerts.filter(a => a.severity === 'critical' && a.status === 'active').length}
                </div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <AlertTriangle style={{ color: '#F59E0B', marginRight: '8px' }} size={24} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#F59E0B' }}>Warning Alerts</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Approaching thresholds</div>
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
                  {mockAlerts.filter(a => a.severity === 'warning' && a.status === 'active').length}
                </div>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircle style={{ color: '#10B981', marginRight: '8px' }} size={24} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#10B981' }}>Resolved</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Acknowledged this month</div>
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
                  {mockAlerts.filter(a => a.status === 'resolved').length}
                </div>
              </div>
            </div>
          </div>

          {/* Active Alerts List */}
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                Active Alerts
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setAlertFilter('all')}
                  style={{
                    padding: '6px 12px',
                    background: alertFilter === 'all' ? '#667eea' : '#f3f4f6',
                    color: alertFilter === 'all' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  All
                </button>
                <button
                  onClick={() => setAlertFilter('critical')}
                  style={{
                    padding: '6px 12px',
                    background: alertFilter === 'critical' ? '#dc2626' : '#f3f4f6',
                    color: alertFilter === 'critical' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Critical
                </button>
                <button
                  onClick={() => setAlertFilter('warning')}
                  style={{
                    padding: '6px 12px',
                    background: alertFilter === 'warning' ? '#d97706' : '#f3f4f6',
                    color: alertFilter === 'warning' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Warning
                </button>
              </div>
            </div>

            <div style={{ spaceY: '12px' }}>
              {mockAlerts
                .filter(alert => alertFilter === 'all' || alert.severity === alertFilter)
                .filter(alert => alert.status === 'active')
                .map((alert) => (
                <div key={alert.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: `1px solid ${alert.severity === 'critical' ? '#fee2e2' : '#fef3c7'}`,
                  borderRadius: '6px',
                  background: alert.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <AlertTriangle
                      size={16}
                      color={alert.severity === 'critical' ? '#dc2626' : '#d97706'}
                      style={{ marginRight: '12px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '2px' }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        {alert.description}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {alert.timestamp.toLocaleDateString()} • {alert.covenantName}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10px',
                      fontWeight: '600',
                      background: alert.severity === 'critical' ? '#dc2626' : '#d97706',
                      color: 'white'
                    }}>
                      {alert.severity}
                    </span>
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}

              {mockAlerts.filter(alert => alertFilter === 'all' || alert.severity === alertFilter).filter(alert => alert.status === 'active').length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                  <CheckCircle size={32} style={{ margin: '0 auto 12px', color: '#10b981' }} />
                  <div style={{ fontSize: '14px' }}>No active alerts</div>
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>
                    All covenants are within acceptable ranges
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div>
          {/* Configuration Header */}
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                Covenant Configuration - {companyName}
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setConfigCategory('all')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'all' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'all' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  All Covenants
                </button>
                <button
                  onClick={() => setConfigCategory('financial')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'financial' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'financial' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Financial
                </button>
                <button
                  onClick={() => setConfigCategory('maintenance')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'maintenance' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'maintenance' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Maintenance
                </button>
                <button
                  onClick={() => setConfigCategory('negative')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'negative' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'negative' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Negative
                </button>
                <button
                  onClick={() => setConfigCategory('affirmative')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'affirmative' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'affirmative' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Affirmative
                </button>
                <button
                  onClick={() => setConfigCategory('incurrence')}
                  style={{
                    padding: '6px 12px',
                    background: configCategory === 'incurrence' ? '#667eea' : '#f3f4f6',
                    color: configCategory === 'incurrence' ? 'white' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Incurrence
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', color: '#374151', fontWeight: '600', marginBottom: '8px' }}>
                  📋 How Consultants Set Covenant Requirements:
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                  <strong>Step 1:</strong> Check "Applicable" for covenants included in your client's loan agreement<br/>
                  <strong>Step 2:</strong> Enter threshold values in the "Min Required" or "Max Allowed" input fields<br/>
                  <strong>Step 3:</strong> Set alert levels (Warning/Critical) for breach notifications<br/>
                  <strong>Step 4:</strong> Click "Save Configuration" to apply all changes
                </div>
              </div>

              {saveMessage && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  background: saveMessage.includes('✅') ? '#dcfce7' : saveMessage.includes('❌') ? '#fee2e2' : '#fef3c7',
                  color: saveMessage.includes('✅') ? '#166534' : saveMessage.includes('❌') ? '#dc2626' : '#92400e',
                  border: `1px solid ${saveMessage.includes('✅') ? '#16a34a' : saveMessage.includes('❌') ? '#dc2626' : '#d97706'}`
                }}>
                  {saveMessage}
                </div>
              )}
            </div>
          </div>

          {/* Covenant Configuration Grid */}
          <div style={{ display: 'grid', gap: '12px' }}>
            {covenantData
              .filter(covenant => configCategory === 'all' || covenant.category.toLowerCase() === configCategory)
              .map((covenant) => (
              <div key={covenant.id} style={{
                background: 'white',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                border: `1px solid ${getStatusColor(covenant.status)}`,
                opacity: (covenantApplicability[covenant.id] ?? covenant.applicable) ? 1 : 0.6
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 2fr 1fr 1fr 80px', gap: '16px', alignItems: 'center' }}>
                          {/* Applicable Checkbox */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px' }}>
                              <input
                                type="checkbox"
                                checked={covenantApplicability[covenant.id] ?? covenant.applicable}
                                onChange={(e) => updateCovenantApplicability(covenant.id, e.target.checked)}
                                style={{ width: '14px', height: '14px' }}
                              />
                              <span style={{ fontSize: '11px', color: '#374151', fontWeight: '500' }}>Applicable</span>
                            </label>
                          </div>

                  {/* Covenant Info */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                      {covenant.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                      {covenant.description}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {covenant.category}{covenant.subCategory ? ` • ${covenant.subCategory}` : ''} • Status: {covenant.status}
                    </div>
                  </div>

                  {/* Current Value */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Current Value</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: getStatusColor(covenant.status) }}>
                      {covenant.currentValue !== null ? (
                        typeof covenant.currentValue === 'number' && covenant.currentValue > 1000
                          ? `$${covenant.currentValue.toLocaleString()}`
                          : typeof covenant.currentValue === 'number' ? covenant.currentValue.toFixed(1) : covenant.currentValue
                      ) : 'N/A'}
                    </div>
                  </div>

                          {/* Threshold Configuration */}
                          <div>
                            {covenant.threshold !== null && (covenantApplicability[covenant.id] ?? covenant.applicable) ? (
                              <>
                                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                                  {covenant.covenantType === 'minimum' ? 'Min Required' : covenant.covenantType === 'maximum' ? 'Max Allowed' : 'Threshold'}
                                </div>
                                <input
                                  type="number"
                                  value={covenantThresholds[covenant.id] ?? covenant.threshold}
                                  onChange={(e) => updateCovenantThreshold(covenant.id, parseFloat(e.target.value) || 0)}
                                  disabled={!(covenantApplicability[covenant.id] ?? covenant.applicable)}
                                  placeholder={(covenantApplicability[covenant.id] ?? covenant.applicable) ? "Enter threshold..." : ""}
                                  title={(covenantApplicability[covenant.id] ?? covenant.applicable) ? `Set the ${covenant.covenantType === 'minimum' ? 'minimum required' : 'maximum allowed'} value for ${covenant.name}` : "Enable covenant to set threshold"}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '13px',
                                    textAlign: 'center',
                                    opacity: (covenantApplicability[covenant.id] ?? covenant.applicable) ? 1 : 0.5,
                                    backgroundColor: (covenantApplicability[covenant.id] ?? covenant.applicable) ? 'white' : '#f9fafb'
                                  }}
                                />
                              </>
                            ) : (
                              <div style={{ fontSize: '12px', color: '#9ca3b8', fontStyle: 'italic' }}>
                                {covenant.threshold !== null ? 'N/A' : 'Qualitative'}
                              </div>
                            )}
                          </div>

                          {/* Alert Settings */}
                          <div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Alert Level</div>
                            <select
                              value={covenantAlertLevels[covenant.id] ?? (covenant.alertLevel || 'warning')}
                              onChange={(e) => updateAlertLevel(covenant.id, e.target.value as 'none' | 'warning' | 'critical')}
                              disabled={!(covenantApplicability[covenant.id] ?? covenant.applicable)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '12px',
                                opacity: (covenantApplicability[covenant.id] ?? covenant.applicable) ? 1 : 0.5
                              }}
                            >
                              <option value="none">None</option>
                              <option value="warning">Warning</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                💡 Changes take effect immediately for compliance monitoring and alerting
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={resetToDefaults}
                  style={{
                    padding: '8px 16px',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Reset to Defaults
                </button>
                <button
                  onClick={saveConfiguration}
                  disabled={isSaving}
                  style={{
                    padding: '8px 16px',
                    background: isSaving ? '#9ca3af' : '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSaving ? '💾 Saving...' : '💾 Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}