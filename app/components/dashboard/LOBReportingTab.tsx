'use client';

import React from 'react';
import { applyLOBAllocations, AccountValue, AccountMapping, CompanyLOB } from '@/lib/lob-allocator';
import type { MonthlyDataRow } from '../../types';
import { useMasterData } from '@/lib/master-data-store';

interface LOBReportingTabProps {
  company: any;
  selectedCompanyId: string;
  accountMappings: any[];
  statementType: 'income-statement' | 'balance-sheet' | 'income-statement-percent';
  selectedLineOfBusiness: string;
  statementPeriod: string;
  statementDisplay: 'monthly' | 'quarterly' | 'annual';
  onStatementTypeChange: (type: 'income-statement' | 'balance-sheet' | 'income-statement-percent') => void;
  onLineOfBusinessChange: (lob: string) => void;
  onPeriodChange: (period: string) => void;
  onDisplayChange: (display: 'monthly' | 'quarterly' | 'annual') => void;
}

export default function LOBReportingTab({
  company,
  selectedCompanyId,
  accountMappings,
  statementType,
  selectedLineOfBusiness,
  statementPeriod,
  statementDisplay,
  onStatementTypeChange,
  onLineOfBusinessChange,
  onPeriodChange,
  onDisplayChange,
}: LOBReportingTabProps) {
  // Use master data store instead of receiving monthly data as prop
  const { data: masterData, monthlyData, loading: masterDataLoading, error: masterDataError } = useMasterData(selectedCompanyId);
  
  
  // Get Lines of Business from company
  const linesOfBusiness = company?.linesOfBusiness || [];
  
  // Check if LOBs are configured
  if (!linesOfBusiness || linesOfBusiness.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Line of Business Reporting
        </h2>
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <div style={{ fontSize: '14px', color: '#92400e', marginBottom: '8px', fontWeight: '600' }}>
            No Lines of Business Configured
          </div>
          <p style={{ fontSize: '13px', color: '#78350f', marginBottom: '12px' }}>
            To view line of business reporting, you need to configure LOB allocations in your account mappings.
          </p>
          <button
            onClick={() => window.location.href = '#account-mappings'}
            style={{
              padding: '8px 16px',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Go to Account Mappings
          </button>
        </div>
      </div>
    );
  }
  
  // Check if master data exists
  if (masterDataLoading) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Line of Business Reporting
        </h2>
        <div style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            Loading Master Data
          </div>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Loading financial data from master data store...
          </p>
        </div>
      </div>
    );
  }

  if (masterDataError || !monthlyData || monthlyData.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Line of Business Reporting
        </h2>
        <div style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            No Master Data Available
          </div>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            {masterDataError ? `Error: ${masterDataError}` : 'No master data available for LOB reporting. Please process financial data first.'}
          </p>
        </div>
      </div>
    );
  }

  // Use master data monthly data
  const monthly = monthlyData;
  
  // Auto-select first LOB if none selected or invalid (but allow "all")
  React.useEffect(() => {
    if (!selectedLineOfBusiness || (selectedLineOfBusiness !== 'all' && !linesOfBusiness.some((lob: any) => lob.name === selectedLineOfBusiness))) {
      if (linesOfBusiness.length > 0) {
        onLineOfBusinessChange(linesOfBusiness[0].name);
      }
    }
  }, [selectedLineOfBusiness, linesOfBusiness, onLineOfBusinessChange]);
  
  // Filter monthly data by selected period
  const now = new Date();
  let filteredMonthly: any[] = [];
  
  if (statementPeriod === 'current-month') {
    filteredMonthly = monthly.slice(-1);
  } else if (statementPeriod === 'current-quarter') {
    filteredMonthly = monthly.slice(-3);
  } else if (statementPeriod === 'last-12-months') {
    filteredMonthly = monthly.slice(-12);
  } else if (statementPeriod === 'ytd') {
    const currentYear = now.getFullYear();
    filteredMonthly = monthly.filter(m => {
      const monthDate = new Date(m.date || m.month);
      return monthDate.getFullYear() === currentYear;
    });
  } else if (statementPeriod === 'last-year') {
    const lastYear = now.getFullYear() - 1;
    filteredMonthly = monthly.filter(m => {
      const monthDate = new Date(m.date || m.month);
      return monthDate.getFullYear() === lastYear;
    });
  } else if (statementPeriod === 'last-3-years') {
    filteredMonthly = monthly.slice(-36);
  }
  
  // Calculate LOB breakdowns from monthly data (CSV or QB)
  let lobRevenue = 0;
  let lobExpense = 0;
  let lobCOGS = 0;
  let lobCash = 0;
  let lobAR = 0;
  let lobAP = 0;
  let lobEquity = 0;
  let detailedBreakdowns: any = {};
  let monthlyLOBData: any[] = [];
  let monthLabels: string[] = [];
  
  // Helper to get LOB value from a breakdown field - DEFINE BEFORE USE
  const getLOBValue = (fieldName: string): number => {
    if (detailedBreakdowns[fieldName] && detailedBreakdowns[fieldName][selectedLineOfBusiness]) {
      return detailedBreakdowns[fieldName][selectedLineOfBusiness];
    }
    return 0;
  };
  
  // Helper to sum a field across all LOBs (for TOTAL column when showing all LOBs)
  const getTotalAcrossLOBs = (fieldName: string): number => {
    if (!detailedBreakdowns[fieldName]) return 0;
    return Object.values(detailedBreakdowns[fieldName]).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
  };
  
  // Convert account mappings to the format expected by applyLOBAllocations
  const convertMappings = (mappings: any[]): AccountMapping[] => {
    return mappings.map(m => ({
      qbAccount: m.qbAccount || '',
      qbAccountId: m.qbAccountId,
      targetField: m.targetField || '',
      lobAllocations: m.lobAllocations,
      allocationMethod: m.allocationMethod
    }));
  };

  // Convert company LOBs to the format expected by applyLOBAllocations
  const convertCompanyLOBs = (): CompanyLOB[] => {
    return linesOfBusiness.map(lob => ({
      name: lob.name,
      headcountPercentage: lob.headcountPercentage || 0
    }));
  };
  
  // Process monthly data for LOB reporting
  if (filteredMonthly && filteredMonthly.length > 0 && accountMappings && accountMappings.length > 0) {
    
    // Process each month in the filtered monthly data
    const allMonthlyData: any[] = [];
    
    // First, process month by month to build detailed data
    filteredMonthly.forEach((monthData, idx) => {
      const monthLabel = monthData.month || monthData.date || `Month ${idx + 1}`;
      
      // All financial fields we want to track
      const fields = {
        revenue: monthData.revenue || 0,
        cogs: monthData.cogsTotal || monthData.cogs || 0,
        expense: monthData.expense || 0,
        cash: monthData.cash || 0,
        ar: monthData.ar || 0,
        inventory: monthData.inventory || 0,
        otherCA: monthData.otherCA || 0,
        fixedAssets: monthData.fixedAssets || 0,
        otherAssets: monthData.otherAssets || 0,
        ap: monthData.ap || 0,
        otherCL: monthData.otherCL || 0,
        ltd: monthData.ltd || 0,
        ownersCapital: monthData.ownersCapital || 0,
        ownersDraw: monthData.ownersDraw || 0,
        commonStock: monthData.commonStock || 0,
        preferredStock: monthData.preferredStock || 0,
        retainedEarnings: monthData.retainedEarnings || 0,
        additionalPaidInCapital: monthData.additionalPaidInCapital || 0,
        treasuryStock: monthData.treasuryStock || 0,
      };
      
      // Check if we have pre-calculated LOB breakdowns from the database
      let monthBreakdowns: any = {};

      if (monthData.lobBreakdowns && typeof monthData.lobBreakdowns === 'object') {
        // Use pre-calculated breakdowns from database (QuickBooks data)
        monthBreakdowns = monthData.lobBreakdowns;
      } else {
        // Fallback: apply LOB allocations using the same logic as QuickBooks processing
        // Convert monthly data to account values format expected by applyLOBAllocations
        const accountValues: AccountValue[] = Object.entries(fields)
          .filter(([fieldName, value]) => value !== 0)
          .map(([fieldName, value]) => ({
            accountName: `CSV_${fieldName}`, // Use field name as account name for CSV data
            accountId: fieldName,
            value: value as number
          }));

        const convertedMappings = convertMappings(accountMappings);
        const convertedLOBs = convertCompanyLOBs();

        // Apply LOB allocations using the same function as QuickBooks processing
        const lobData = applyLOBAllocations(accountValues, convertedMappings, convertedLOBs);
        monthBreakdowns = lobData.breakdowns;
      }

      // Calculate total COGS and expense for each LOB in this month
      linesOfBusiness.forEach((lob: any) => {
        const lobName = lob.name;

        // Calculate total COGS
        const cogsComponents = ['cogsContractors', 'cogsPayroll', 'cogsMaterials'];
        let totalCogs = 0;
        cogsComponents.forEach(component => {
          if (monthBreakdowns[component]?.[lobName]) {
            totalCogs += Number(monthBreakdowns[component][lobName]) || 0;
          }
        });
        if (!monthBreakdowns.cogs) {
          monthBreakdowns.cogs = {};
        }
        monthBreakdowns.cogs[lobName] = totalCogs;

        // Calculate total expenses
        const expenseComponents = ['payroll', 'rent', 'utilities', 'insurance', 'professionalFees', 'salesExpense', 'taxLicense', 'otherExpense', 'benefits', 'autoTravel', 'phoneComm', 'infrastructure', 'mealsEntertainment'];
        let totalExpense = 0;
        expenseComponents.forEach(component => {
          if (monthBreakdowns[component]?.[lobName]) {
            totalExpense += Number(monthBreakdowns[component][lobName]) || 0;
          }
        });
        if (!monthBreakdowns.expense) {
          monthBreakdowns.expense = {};
        }
        monthBreakdowns.expense[lobName] = totalExpense;
      });

      // Extract values based on selected LOB
      if (selectedLineOfBusiness === 'all') {
        // Sum across all LOBs (use totals)
        const cash = fields.cash;
        const ar = fields.ar;
        const inventory = fields.inventory;
        const otherCA = fields.otherCA;
        const tca = cash + ar + inventory + otherCA;
        const fixedAssets = fields.fixedAssets;
        const otherAssets = fields.otherAssets;
        const totalAssets = tca + fixedAssets + otherAssets;
        
        const ap = fields.ap;
        const otherCL = fields.otherCL;
        const tcl = ap + otherCL;
        const ltd = fields.ltd;
        const totalLiab = tcl + ltd;
        
        const ownersCapital = fields.ownersCapital;
        const ownersDraw = fields.ownersDraw;
        const commonStock = fields.commonStock;
        const preferredStock = fields.preferredStock;
        const retainedEarnings = fields.retainedEarnings;
        const additionalPaidInCapital = fields.additionalPaidInCapital;
        const treasuryStock = fields.treasuryStock;
        const equity = ownersCapital + ownersDraw + commonStock + preferredStock + retainedEarnings + additionalPaidInCapital + treasuryStock;
        
        allMonthlyData.push({
          month: monthLabel,
          revenue: fields.revenue,
          expense: fields.expense,
          cogs: fields.cogs,
          cash,
          ar,
          inventory,
          otherCA,
          tca,
          fixedAssets,
          otherAssets,
          totalAssets,
          ap,
          otherCL,
          tcl,
          ltd,
          totalLiab,
          ownersCapital,
          ownersDraw,
          commonStock,
          preferredStock,
          retainedEarnings,
          additionalPaidInCapital,
          treasuryStock,
          equity,
          breakdowns: monthBreakdowns
        });
      } else {
        // Specific LOB - extract values for this LOB only
        const getLOBVal = (fieldName: string) => {
          return monthBreakdowns[fieldName]?.[selectedLineOfBusiness] || 0;
        };
        
        const cash = getLOBVal('cash');
        const ar = getLOBVal('ar');
        const inventory = getLOBVal('inventory');
        const otherCA = getLOBVal('otherCA');
        const tca = cash + ar + inventory + otherCA;
        const fixedAssets = getLOBVal('fixedAssets');
        const otherAssets = getLOBVal('otherAssets');
        const totalAssets = tca + fixedAssets + otherAssets;
        
        const ap = getLOBVal('ap');
        const otherCL = getLOBVal('otherCL');
        const tcl = ap + otherCL;
        const ltd = getLOBVal('ltd');
        const totalLiab = tcl + ltd;
        
        const ownersCapital = getLOBVal('ownersCapital');
        const ownersDraw = getLOBVal('ownersDraw');
        const commonStock = getLOBVal('commonStock');
        const preferredStock = getLOBVal('preferredStock');
        const retainedEarnings = getLOBVal('retainedEarnings');
        const additionalPaidInCapital = getLOBVal('additionalPaidInCapital');
        const treasuryStock = getLOBVal('treasuryStock');
        const equity = ownersCapital + ownersDraw + commonStock + preferredStock + retainedEarnings + additionalPaidInCapital + treasuryStock;
        
        allMonthlyData.push({
          month: monthLabel,
          revenue: getLOBVal('revenue'),
          expense: getLOBVal('expense'),
          cogs: getLOBVal('cogs'),
          cash,
          ar,
          inventory,
          otherCA,
          tca,
          fixedAssets,
          otherAssets,
          totalAssets,
          ap,
          otherCL,
          tcl,
          ltd,
          totalLiab,
          ownersCapital,
          ownersDraw,
          commonStock,
          preferredStock,
          retainedEarnings,
          additionalPaidInCapital,
          treasuryStock,
          equity,
          breakdowns: monthBreakdowns
        });
      }
    });
    
    // Calculate aggregated totals for summary cards
    const aggregatedBreakdowns: any = {};
    allMonthlyData.forEach(month => {
      Object.entries(month.breakdowns || {}).forEach(([fieldName, lobBreakdown]: [string, any]) => {
        if (!aggregatedBreakdowns[fieldName]) {
          aggregatedBreakdowns[fieldName] = {};
        }
        Object.entries(lobBreakdown).forEach(([lobName, value]) => {
          if (!aggregatedBreakdowns[fieldName][lobName]) {
            aggregatedBreakdowns[fieldName][lobName] = 0;
          }
          aggregatedBreakdowns[fieldName][lobName] += Number(value) || 0;
        });
      });
    });

    // Calculate total COGS and expense by summing their components
    linesOfBusiness.forEach((lob: any) => {
      const lobName = lob.name;

      // Calculate total COGS
      const cogsComponents = ['cogsContractors', 'cogsPayroll', 'cogsMaterials'];
      let totalCogs = 0;
      cogsComponents.forEach(component => {
        if (aggregatedBreakdowns[component]?.[lobName]) {
          totalCogs += Number(aggregatedBreakdowns[component][lobName]) || 0;
        }
      });
      if (!aggregatedBreakdowns.cogs) {
        aggregatedBreakdowns.cogs = {};
      }
      aggregatedBreakdowns.cogs[lobName] = totalCogs;

      // Calculate total expenses
      const expenseComponents = ['payroll', 'rent', 'utilities', 'insurance', 'professionalFees', 'salesExpense', 'taxLicense', 'otherExpense', 'benefits', 'autoTravel', 'phoneComm', 'infrastructure', 'mealsEntertainment'];
      let totalExpense = 0;
      expenseComponents.forEach(component => {
        if (aggregatedBreakdowns[component]?.[lobName]) {
          totalExpense += Number(aggregatedBreakdowns[component][lobName]) || 0;
        }
      });
      if (!aggregatedBreakdowns.expense) {
        aggregatedBreakdowns.expense = {};
      }
      aggregatedBreakdowns.expense[lobName] = totalExpense;
    });

    detailedBreakdowns = aggregatedBreakdowns;
    
    // Now group by display type (monthly, quarterly, annual)
    if (statementDisplay === 'monthly' || statementDisplay === 'quarterly' || statementDisplay === 'annual') {
      
      // Aggregate based on display type
      if (statementDisplay === 'monthly') {
        monthlyLOBData = allMonthlyData;
        monthLabels = allMonthlyData.map(m => m.month);
      } else if (statementDisplay === 'quarterly') {
        // Group by quarter
        const quarterMap = new Map<string, any[]>();
        
        allMonthlyData.forEach(m => {
          const monthStr = m.month;
          let quarter = '';
          
          // Parse month from format like "12/2024" or month names
          const monthMatch = monthStr.match(/^(\d{1,2})\/(\d{4})$/); // MM/YYYY format
          if (monthMatch) {
            const monthNum = parseInt(monthMatch[1]);
            const year = monthMatch[2];
            
            if (monthNum >= 1 && monthNum <= 3) {
              quarter = `Q1 ${year}`;
            } else if (monthNum >= 4 && monthNum <= 6) {
              quarter = `Q2 ${year}`;
            } else if (monthNum >= 7 && monthNum <= 9) {
              quarter = `Q3 ${year}`;
            } else if (monthNum >= 10 && monthNum <= 12) {
              quarter = `Q4 ${year}`;
            }
          } else {
            // Fallback for month names
            const year = monthStr.match(/\d{4}/)?.[0] || '';
            if (monthStr.includes('Jan') || monthStr.includes('Feb') || monthStr.includes('Mar')) {
              quarter = `Q1 ${year}`;
            } else if (monthStr.includes('Apr') || monthStr.includes('May') || monthStr.includes('Jun')) {
              quarter = `Q2 ${year}`;
            } else if (monthStr.includes('Jul') || monthStr.includes('Aug') || monthStr.includes('Sep')) {
              quarter = `Q3 ${year}`;
            } else if (monthStr.includes('Oct') || monthStr.includes('Nov') || monthStr.includes('Dec')) {
              quarter = `Q4 ${year}`;
            }
          }
          
          if (quarter && !quarterMap.has(quarter)) {
            quarterMap.set(quarter, []);
          }
          if (quarter) {
            quarterMap.get(quarter)!.push(m);
          }
        });
        
        // Aggregate quarterly data
        quarterMap.forEach((months, quarter) => {
          const qRevenue = months.reduce((sum, m) => sum + m.revenue, 0);
          const qExpense = months.reduce((sum, m) => sum + m.expense, 0);
          const qCOGS = months.reduce((sum, m) => sum + m.cogs, 0);
          
          // For BS values, take the LAST month in the quarter (BS is a point in time)
          const lastMonth = months[months.length - 1];
          const qCash = lastMonth?.cash || 0;
          const qAR = lastMonth?.ar || 0;
          const qInventory = lastMonth?.inventory || 0;
          const qOtherCA = lastMonth?.otherCA || 0;
          const qTCA = lastMonth?.tca || 0;
          const qFixedAssets = lastMonth?.fixedAssets || 0;
          const qOtherAssets = lastMonth?.otherAssets || 0;
          const qTotalAssets = lastMonth?.totalAssets || 0;
          const qAP = lastMonth?.ap || 0;
          const qOtherCL = lastMonth?.otherCL || 0;
          const qTCL = lastMonth?.tcl || 0;
          const qLTD = lastMonth?.ltd || 0;
          const qTotalLiab = lastMonth?.totalLiab || 0;
          const qOwnersCapital = lastMonth?.ownersCapital || 0;
          const qOwnersDraw = lastMonth?.ownersDraw || 0;
          const qCommonStock = lastMonth?.commonStock || 0;
          const qPreferredStock = lastMonth?.preferredStock || 0;
          const qRetainedEarnings = lastMonth?.retainedEarnings || 0;
          const qAdditionalPaidInCapital = lastMonth?.additionalPaidInCapital || 0;
          const qTreasuryStock = lastMonth?.treasuryStock || 0;
          const qEquity = lastMonth?.equity || 0;
          
          // Merge breakdowns
          const mergedBreakdowns: any = {};
          months.forEach(m => {
            Object.keys(m.breakdowns || {}).forEach(category => {
              if (!mergedBreakdowns[category]) {
                mergedBreakdowns[category] = {};
              }
              Object.keys(m.breakdowns[category] || {}).forEach(lob => {
                if (!mergedBreakdowns[category][lob]) {
                  mergedBreakdowns[category][lob] = 0;
                }
                mergedBreakdowns[category][lob] += m.breakdowns[category][lob] || 0;
              });
            });
          });
          
          monthlyLOBData.push({
            month: quarter,
            revenue: qRevenue,
            expense: qExpense,
            cogs: qCOGS,
            cash: qCash,
            ar: qAR,
            inventory: qInventory,
            otherCA: qOtherCA,
            tca: qTCA,
            fixedAssets: qFixedAssets,
            otherAssets: qOtherAssets,
            totalAssets: qTotalAssets,
            ap: qAP,
            otherCL: qOtherCL,
            tcl: qTCL,
            ltd: qLTD,
            totalLiab: qTotalLiab,
            ownersCapital: qOwnersCapital,
            ownersDraw: qOwnersDraw,
            commonStock: qCommonStock,
            preferredStock: qPreferredStock,
            retainedEarnings: qRetainedEarnings,
            additionalPaidInCapital: qAdditionalPaidInCapital,
            treasuryStock: qTreasuryStock,
            equity: qEquity,
            breakdowns: mergedBreakdowns
          });
          monthLabels.push(quarter);
        });
      } else if (statementDisplay === 'annual') {
        // Group by year
        const yearMap = new Map<string, any[]>();
        
        allMonthlyData.forEach(m => {
          const year = m.month.match(/\d{4}/)?.[0] || '';
          
          if (!yearMap.has(year)) {
            yearMap.set(year, []);
          }
          yearMap.get(year)!.push(m);
        });
        
        // Aggregate annual data
        yearMap.forEach((months, year) => {
          const yRevenue = months.reduce((sum, m) => sum + m.revenue, 0);
          const yExpense = months.reduce((sum, m) => sum + m.expense, 0);
          const yCOGS = months.reduce((sum, m) => sum + m.cogs, 0);
          
          // For BS values, take the LAST month in the year (BS is a point in time)
          const lastMonth = months[months.length - 1];
          const yCash = lastMonth?.cash || 0;
          const yAR = lastMonth?.ar || 0;
          const yInventory = lastMonth?.inventory || 0;
          const yOtherCA = lastMonth?.otherCA || 0;
          const yTCA = lastMonth?.tca || 0;
          const yFixedAssets = lastMonth?.fixedAssets || 0;
          const yOtherAssets = lastMonth?.otherAssets || 0;
          const yTotalAssets = lastMonth?.totalAssets || 0;
          const yAP = lastMonth?.ap || 0;
          const yOtherCL = lastMonth?.otherCL || 0;
          const yTCL = lastMonth?.tcl || 0;
          const yLTD = lastMonth?.ltd || 0;
          const yTotalLiab = lastMonth?.totalLiab || 0;
          const yOwnersCapital = lastMonth?.ownersCapital || 0;
          const yOwnersDraw = lastMonth?.ownersDraw || 0;
          const yCommonStock = lastMonth?.commonStock || 0;
          const yPreferredStock = lastMonth?.preferredStock || 0;
          const yRetainedEarnings = lastMonth?.retainedEarnings || 0;
          const yAdditionalPaidInCapital = lastMonth?.additionalPaidInCapital || 0;
          const yTreasuryStock = lastMonth?.treasuryStock || 0;
          const yEquity = lastMonth?.equity || 0;
          
          // Merge breakdowns
          const mergedBreakdowns: any = {};
          months.forEach(m => {
            Object.keys(m.breakdowns || {}).forEach(category => {
              if (!mergedBreakdowns[category]) {
                mergedBreakdowns[category] = {};
              }
              Object.keys(m.breakdowns[category] || {}).forEach(lob => {
                if (!mergedBreakdowns[category][lob]) {
                  mergedBreakdowns[category][lob] = 0;
                }
                mergedBreakdowns[category][lob] += m.breakdowns[category][lob] || 0;
              });
            });
          });
          
          monthlyLOBData.push({
            month: year,
            revenue: yRevenue,
            expense: yExpense,
            cogs: yCOGS,
            cash: yCash,
            ar: yAR,
            inventory: yInventory,
            otherCA: yOtherCA,
            tca: yTCA,
            fixedAssets: yFixedAssets,
            otherAssets: yOtherAssets,
            totalAssets: yTotalAssets,
            ap: yAP,
            otherCL: yOtherCL,
            tcl: yTCL,
            ltd: yLTD,
            totalLiab: yTotalLiab,
            ownersCapital: yOwnersCapital,
            ownersDraw: yOwnersDraw,
            commonStock: yCommonStock,
            preferredStock: yPreferredStock,
            retainedEarnings: yRetainedEarnings,
            additionalPaidInCapital: yAdditionalPaidInCapital,
            treasuryStock: yTreasuryStock,
            equity: yEquity,
            breakdowns: mergedBreakdowns
          });
          monthLabels.push(year);
        });
      }
    }
    
    // Calculate summary totals for the selected period (for summary cards)
    if (selectedLineOfBusiness === 'all') {
      // Sum across all LOBs
      lobRevenue = allMonthlyData.reduce((sum, m) => sum + (m.revenue || 0), 0);
      lobExpense = allMonthlyData.reduce((sum, m) => sum + (m.expense || 0), 0);
      lobCOGS = allMonthlyData.reduce((sum, m) => sum + (m.cogs || 0), 0);
      // Balance sheet items use the last month (point in time)
      const lastMonth = allMonthlyData[allMonthlyData.length - 1];
      lobCash = lastMonth?.cash || 0;
      lobAR = lastMonth?.ar || 0;
      lobAP = lastMonth?.ap || 0;
      lobEquity = lastMonth?.equity || 0;
    } else {
      // Specific LOB
      lobRevenue = allMonthlyData.reduce((sum, m) => sum + (m.revenue || 0), 0);
      lobExpense = allMonthlyData.reduce((sum, m) => sum + (m.expense || 0), 0);
      lobCOGS = allMonthlyData.reduce((sum, m) => sum + (m.cogs || 0), 0);
      // Balance sheet items use the last month (point in time)
      const lastMonth = allMonthlyData[allMonthlyData.length - 1];
      lobCash = lastMonth?.cash || 0;
      lobAR = lastMonth?.ar || 0;
      lobAP = lastMonth?.ap || 0;
      lobEquity = lastMonth?.equity || 0;
    }
    
  } else {
    console.log('⚠️ No monthly data or account mappings - cannot calculate LOB breakdowns');
  }
  
  // Calculate metrics
  const grossProfit = lobRevenue - lobCOGS;
  const grossMargin = lobRevenue > 0 ? (grossProfit / lobRevenue) * 100 : 0;
  const netIncome = lobRevenue - lobCOGS - lobExpense;
  const netMargin = lobRevenue > 0 ? (netIncome / lobRevenue) * 100 : 0;
  
  // Check if we have any data to display (income statement OR balance sheet items)
  const hasData = lobRevenue > 0 || lobExpense > 0 || lobCOGS > 0 || 
                   lobCash > 0 || lobAR > 0 || lobAP > 0 || lobEquity !== 0 ||
                   monthlyData.length > 0;
  
  // Format currency
  const fmt = (value: number) => {
    const formatted = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value < 0 ? `($${formatted})` : `$${formatted}`;
  };
  
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Line of Business Reporting
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
          View financial performance by line of business. Select a specific business line to see detailed financials.
        </p>
        
        {/* Control Dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {/* Statement Type */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Type of Statement
            </label>
            <select 
              value={statementType}
              onChange={(e) => onStatementTypeChange(e.target.value as 'income-statement' | 'balance-sheet' | 'income-statement-percent')}
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '6px', 
                fontSize: '14px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="income-statement">Income Statement</option>
              <option value="income-statement-percent">Income Statement (% of Revenue)</option>
              <option value="balance-sheet">Balance Sheet</option>
            </select>
          </div>
          
          {/* Line of Business */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Line of Business
            </label>
            <select 
              value={selectedLineOfBusiness}
              onChange={(e) => onLineOfBusinessChange(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '6px', 
                fontSize: '14px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Lines of Business</option>
              {linesOfBusiness.map((lob: any) => (
                <option key={lob.name} value={lob.name}>{lob.name}</option>
              ))}
            </select>
          </div>
          
          {/* Period */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Period
            </label>
            <select 
              value={statementPeriod}
              onChange={(e) => onPeriodChange(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '6px', 
                fontSize: '14px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="current-month">Current Month</option>
              <option value="current-quarter">Current Quarter</option>
              <option value="last-12-months">Last 12 months</option>
              <option value="ytd">YTD</option>
              <option value="last-year">Last Year</option>
              <option value="last-3-years">Last 3 Years</option>
            </select>
          </div>
          
          {/* Display As */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Display As
            </label>
            <select 
              value={statementDisplay}
              onChange={(e) => onDisplayChange(e.target.value as 'monthly' | 'quarterly' | 'annual')}
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '6px', 
                fontSize: '14px',
                color: '#1e293b',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Check if there's data for the selected period */}
      {!hasData ? (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '16px' }}>
          <p style={{ fontSize: '14px', color: '#92400e', margin: 0 }}>
            No data available for "{selectedLineOfBusiness}" in the selected period. Try selecting a different time range or LOB.
          </p>
        </div>
      ) : (
        <>
          {/* Income Statement - LOB COMPARISON (when "all" is selected) */}
          {statementType === 'income-statement' && selectedLineOfBusiness === 'all' && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Income Statement - Line of Business Comparison
              </h3>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#1e293b' }}>Line Item</th>
                    {linesOfBusiness.map((lob: any) => (
                      <th key={lob.name} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '600', color: '#1e293b', minWidth: '120px' }}>
                        {lob.name}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: '#1e293b', minWidth: '120px', background: '#e2e8f0' }}>
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={linesOfBusiness.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      REVENUE
                    </td>
                  </tr>
                  
                  {/* Total Revenue */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Revenue</td>
                    {linesOfBusiness.map((lob: any) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      return (
                        <td key={lob.name} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#059669' }}>
                          {fmt(lobRev)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#059669', background: '#e2e8f0' }}>
                      {fmt(lobRevenue)}
                    </td>
                  </tr>
                  
                  {/* COGS Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={linesOfBusiness.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      COST OF GOODS SOLD
                    </td>
                  </tr>
                  
                  {/* COGS - Contractors */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.cogsContractors?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Contractors</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.cogsContractors?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('cogsContractors'))}
                      </td>
                    </tr>
                  )}
                  
                  {/* COGS - Payroll */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.cogsPayroll?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>COGS Payroll</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.cogsPayroll?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('cogsPayroll'))}
                      </td>
                    </tr>
                  )}
                  
                  {/* COGS - Materials */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.cogsMaterials?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Materials</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.cogsMaterials?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('cogsMaterials'))}
                      </td>
                    </tr>
                  )}
                  
                  {/* Total COGS */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Cost of Goods Sold</td>
                    {linesOfBusiness.map((lob: any) => {
                      const lobCogs = detailedBreakdowns.cogs?.[lob.name] || 0;
                      return (
                        <td key={lob.name} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#dc2626' }}>
                          {fmt(lobCogs)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0' }}>
                      {fmt(lobCOGS)}
                    </td>
                  </tr>
                  
                  {/* Gross Profit */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Gross Profit</td>
                    {linesOfBusiness.map((lob: any) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      const lobCogs = detailedBreakdowns.cogs?.[lob.name] || 0;
                      const gp = lobRev - lobCogs;
                      return (
                        <td key={lob.name} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: gp >= 0 ? '#059669' : '#dc2626' }}>
                          {fmt(gp)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: grossProfit >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                      {fmt(grossProfit)}
                    </td>
                  </tr>
                  
                  {/* Operating Expenses Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={linesOfBusiness.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      OPERATING EXPENSES
                    </td>
                  </tr>

                  {/* Dynamic Operating Expenses Rendering */}
                  {(() => {
                    // Define all possible expense fields with their display names
                    const expenseFieldDefinitions = [
                      // Operating Expenses - Complete list in correct order
                      { key: 'payroll', label: 'Payroll', field: 'payroll' },
                      { key: 'benefits', label: 'Benefits', field: 'benefits' },
                      { key: 'insurance', label: 'Insurance', field: 'insurance' },
                      { key: 'professionalFees', label: 'Professional Services', field: 'professionalFees' },
                      { key: 'subcontractors', label: 'Subcontractors', field: 'subcontractors' },
                      { key: 'rent', label: 'Rent/Lease', field: 'rent' },
                      { key: 'taxLicense', label: 'Tax & License', field: 'taxLicense' },
                      { key: 'phoneComm', label: 'Phone & Communication', field: 'phoneComm' },
                      { key: 'infrastructure', label: 'Infrastructure/Utilities', field: 'infrastructure' },
                      { key: 'autoTravel', label: 'Auto & Travel', field: 'autoTravel' },
                      { key: 'salesExpense', label: 'Sales & Marketing', field: 'salesExpense' },
                      { key: 'marketing', label: 'Marketing', field: 'marketing' },
                      { key: 'mealsEntertainment', label: 'Meals & Entertainment', field: 'mealsEntertainment' },
                      { key: 'otherExpense', label: 'Other Expenses', field: 'otherExpense' }
                    ];

                    // Render only fields that have values in at least one LOB
                    return expenseFieldDefinitions.map(fieldDef => {
                      const hasValue = linesOfBusiness.some((lob: any) => (detailedBreakdowns[fieldDef.field]?.[lob.name] || 0) > 0);

                      if (!hasValue) return null;

                      return (
                        <tr key={fieldDef.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>{fieldDef.label}</td>
                          {linesOfBusiness.map((lob: any) => {
                            const val = detailedBreakdowns[fieldDef.field]?.[lob.name] || 0;
                            return (
                              <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                                {fmt(val)}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                            {fmt(getTotalAcrossLOBs(fieldDef.field))}
                          </td>
                        </tr>
                      );
                    });
                  })()}


                  {/* Sales & Marketing */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.salesExpense?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Sales & Marketing</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.salesExpense?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('salesExpense'))}
                      </td>
                    </tr>
                  )}

                  {/* Marketing */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.marketing?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Marketing</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.marketing?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('marketing'))}
                      </td>
                    </tr>
                  )}

                  {/* Other Expenses */}
                  {linesOfBusiness.some((lob: any) => (detailedBreakdowns.otherExpense?.[lob.name] || 0) > 0) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Other Expenses</td>
                      {linesOfBusiness.map((lob: any) => {
                        const val = detailedBreakdowns.otherExpense?.[lob.name] || 0;
                        return (
                          <td key={lob.name} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(getTotalAcrossLOBs('otherExpense'))}
                      </td>
                    </tr>
                  )}
                  
                  {/* Total Operating Expenses */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</td>
                    {linesOfBusiness.map((lob: any) => {
                      const lobExp = detailedBreakdowns.expense?.[lob.name] || 0;
                      return (
                        <td key={lob.name} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#dc2626' }}>
                          {fmt(lobExp)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0' }}>
                      {fmt(lobExpense)}
                    </td>
                  </tr>
                  
                  {/* Net Income */}
                  <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>Net Income</td>
                    {linesOfBusiness.map((lob: any) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      const lobCogs = detailedBreakdowns.cogs?.[lob.name] || 0;
                      const lobExp = detailedBreakdowns.expense?.[lob.name] || 0;
                      const ni = lobRev - lobCogs - lobExp;
                      return (
                        <td key={lob.name} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: ni >= 0 ? '#059669' : '#dc2626' }}>
                          {fmt(ni)}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', fontSize: '15px', color: netIncome >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                      {fmt(netIncome)}
                    </td>
                  </tr>
                </tbody>
              </table>
              
              {/* Margin Summary by LOB */}
              <div style={{ marginTop: '20px', padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${linesOfBusiness.length}, 1fr)`, gap: '16px' }}>
                  {linesOfBusiness.map((lob: any) => {
                    const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                    const lobCogs = detailedBreakdowns.cogs?.[lob.name] || 0;
                    const lobExp = detailedBreakdowns.expense?.[lob] || 0;
                    const gp = lobRev - lobCogs;
                    const ni = lobRev - lobCogs - lobExp;
                    const gm = lobRev > 0 ? (gp / lobRev) * 100 : 0;
                    const nm = lobRev > 0 ? (ni / lobRev) * 100 : 0;
                    
                    return (
                      <div key={lob.name} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{lob.name}</div>
                        <div style={{ marginBottom: '4px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Gross Margin</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: gm >= 0 ? '#059669' : '#dc2626' }}>
                            {gm.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Net Margin</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: nm >= 0 ? '#059669' : '#dc2626' }}>
                            {nm.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* Income Statement (% of Revenue) - LOB COMPARISON (when "all" is selected) */}
          {statementType === 'income-statement-percent' && selectedLineOfBusiness === 'all' && monthlyLOBData.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Income Statement (% of Revenue) - Line of Business Comparison ({statementDisplay.charAt(0).toUpperCase() + statementDisplay.slice(1)})
              </h3>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1200px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#1e293b' }}>Line Item</th>
                    {monthLabels.map((period, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => (
                          <th key={lob.name} colSpan={2} style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '600', color: '#1e293b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0', fontSize: '11px' }}>
                            {period}<br/>{lob.name}
                          </th>
                        ))}
                      </React.Fragment>
                    ))}
                    <th colSpan={linesOfBusiness.length * 2} style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '700', color: '#1e293b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                      TOTAL (All Periods)
                    </th>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
                    <th></th>
                    {monthLabels.map((period, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => (
                          <React.Fragment key={lob.name}>
                            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '600', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>$</th>
                            <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>%</th>
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: any, lobIdx) => (
                      <React.Fragment key={lob.name}>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>$</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>%</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthLabels.length * linesOfBusiness.length * 2 + linesOfBusiness.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      REVENUE
                    </td>
                  </tr>
                  
                  {/* Total Revenue */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Revenue</td>
                    {monthlyLOBData.map((m, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => {
                          const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                          return (
                            <React.Fragment key={lob.name}>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#059669', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                {fmt(lobRev)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#059669' }}>
                                100.0%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: any, lobIdx) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      return (
                        <React.Fragment key={lob.name}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#059669', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                            {fmt(lobRev)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#059669', background: '#e2e8f0' }}>
                            100.0%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                  
                  {/* COGS Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthLabels.length * linesOfBusiness.length * 2 + linesOfBusiness.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      COST OF GOODS SOLD
                    </td>
                  </tr>
                  
                  {/* COGS - Contractors */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.cogsContractors?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Contractors</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: any, lobIdx) => {
                            const val = m.breakdowns?.cogsContractors?.[lob.name] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: any, lobIdx) => {
                        const val = detailedBreakdowns.cogsContractors?.[lob.name] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}
                  
                  {/* COGS - Payroll */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.cogsPayroll?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>COGS Payroll</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: any, lobIdx) => {
                            const val = m.breakdowns?.cogsPayroll?.[lob.name] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: any, lobIdx) => {
                        const val = detailedBreakdowns.cogsPayroll?.[lob.name] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}
                  
                  {/* COGS - Materials */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.cogsMaterials?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Materials</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: any, lobIdx) => {
                            const val = m.breakdowns?.cogsMaterials?.[lob.name] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: any, lobIdx) => {
                        const val = detailedBreakdowns.cogsMaterials?.[lob.name] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}
                  
                  {/* Total COGS */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Cost of Goods Sold</td>
                    {monthlyLOBData.map((m, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => {
                          const lobCogs = m.breakdowns?.cogs?.[lob.name] || 0;
                          const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                          const pct = lobRev > 0 ? (lobCogs / lobRev) * 100 : 0;
                          return (
                            <React.Fragment key={lob.name}>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#dc2626', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                {fmt(lobCogs)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#64748b' }}>
                                {pct.toFixed(1)}%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: any, lobIdx) => {
                      const lobCogs = detailedBreakdowns.cogs?.[lob.name] || 0;
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      const pct = lobRev > 0 ? (lobCogs / lobRev) * 100 : 0;
                      return (
                        <React.Fragment key={lob}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                            {fmt(lobCogs)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                  
                  {/* Gross Profit */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Gross Profit</td>
                    {monthlyLOBData.map((m, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => {
                          const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                          const lobCogs = m.breakdowns?.cogs?.[lob] || 0;
                          const gp = lobRev - lobCogs;
                          const pct = lobRev > 0 ? (gp / lobRev) * 100 : 0;
                          return (
                            <React.Fragment key={lob.name}>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: gp >= 0 ? '#059669' : '#dc2626', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                {fmt(gp)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: pct >= 0 ? '#059669' : '#dc2626' }}>
                                {pct.toFixed(1)}%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: any, lobIdx) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      const lobCogs = detailedBreakdowns.cogs?.[lob] || 0;
                      const gp = lobRev - lobCogs;
                      const pct = lobRev > 0 ? (gp / lobRev) * 100 : 0;
                      return (
                        <React.Fragment key={lob}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: gp >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                            {fmt(gp)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: pct >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                  
                  {/* Operating Expenses Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthLabels.length * linesOfBusiness.length * 2 + linesOfBusiness.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      OPERATING EXPENSES
                    </td>
                  </tr>
                  
                  {/* Payroll */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.payroll?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Payroll</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: any, lobIdx) => {
                            const val = m.breakdowns?.payroll?.[lob.name] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: any, lobIdx) => {
                        const val = detailedBreakdowns.payroll?.[lob.name] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Insurance */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.insurance?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Insurance</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.insurance?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.insurance?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Professional Services */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.professionalFees?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Professional Services</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.professionalFees?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.professionalFees?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Subcontractors */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.subcontractors?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Subcontractors</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.subcontractors?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.subcontractors?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Rent/Lease */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: any) => (m.breakdowns?.rent?.[lob.name] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Rent/Lease</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: any, lobIdx) => {
                            const val = m.breakdowns?.rent?.[lob.name] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.rent?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Tax & License */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.taxLicense?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Tax & License</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.taxLicense?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.taxLicense?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Infrastructure/Utilities */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.infrastructure?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Infrastructure/Utilities</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.infrastructure?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.infrastructure?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Auto & Travel */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.autoTravel?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Auto & Travel</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.autoTravel?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.autoTravel?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Sales & Marketing */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.salesExpense?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Sales & Marketing</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.salesExpense?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.salesExpense?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Marketing */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.marketing?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Marketing</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.marketing?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.marketing?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}

                  {/* Other Expenses */}
                  {monthlyLOBData.some(m => linesOfBusiness.some((lob: string) => (m.breakdowns?.otherExpense?.[lob] || 0) > 0)) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Other Expenses</td>
                      {monthlyLOBData.map((m, pidx) => (
                        <React.Fragment key={pidx}>
                          {linesOfBusiness.map((lob: string, lobIdx) => {
                            const val = m.breakdowns?.otherExpense?.[lob] || 0;
                            const lobRev = m.breakdowns?.revenue?.[lob] || 0;
                            const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                            return (
                              <React.Fragment key={lob.name}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {linesOfBusiness.map((lob: string, lobIdx) => {
                        const val = detailedBreakdowns.otherExpense?.[lob] || 0;
                        const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                        const pct = lobRev > 0 ? (val / lobRev) * 100 : 0;
                        return (
                          <React.Fragment key={lob.name}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  )}
                  
                  {/* Total Operating Expenses */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</td>
                    {monthlyLOBData.map((m, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => {
                          const lobExp = m.breakdowns?.expense?.[lob.name] || 0;
                          const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                          const pct = lobRev > 0 ? (lobExp / lobRev) * 100 : 0;
                          return (
                            <React.Fragment key={lob.name}>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#dc2626', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                {fmt(lobExp)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#64748b' }}>
                                {pct.toFixed(1)}%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: string, lobIdx) => {
                      const lobExp = detailedBreakdowns.expense?.[lob.name] || 0;
                      const lobRev = detailedBreakdowns.revenue?.[lob] || 0;
                      const pct = lobRev > 0 ? (lobExp / lobRev) * 100 : 0;
                      return (
                        <React.Fragment key={lob}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                            {fmt(lobExp)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                  
                  {/* Net Income */}
                  <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>Net Income</td>
                    {monthlyLOBData.map((m, pidx) => (
                      <React.Fragment key={pidx}>
                        {linesOfBusiness.map((lob: any, lobIdx) => {
                          const lobRev = m.breakdowns?.revenue?.[lob.name] || 0;
                          const lobCogs = m.breakdowns?.cogs?.[lob.name] || 0;
                          const lobExp = m.breakdowns?.expense?.[lob.name] || 0;
                          const ni = lobRev - lobCogs - lobExp;
                          const pct = lobRev > 0 ? (ni / lobRev) * 100 : 0;
                          return (
                            <React.Fragment key={lob.name}>
                              <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', color: ni >= 0 ? '#059669' : '#dc2626', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                                {fmt(ni)}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', color: pct >= 0 ? '#059669' : '#dc2626' }}>
                                {pct.toFixed(1)}%
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {linesOfBusiness.map((lob: any, lobIdx) => {
                      const lobRev = detailedBreakdowns.revenue?.[lob.name] || 0;
                      const lobCogs = detailedBreakdowns.cogs?.[lob] || 0;
                      const lobExp = detailedBreakdowns.expense?.[lob.name] || 0;
                      const ni = lobRev - lobCogs - lobExp;
                      const pct = lobRev > 0 ? (ni / lobRev) * 100 : 0;
                      return (
                        <React.Fragment key={lob}>
                          <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', fontSize: '15px', color: ni >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1', borderLeft: lobIdx === 0 ? '2px solid #94a3b8' : '1px solid #e2e8f0' }}>
                            {fmt(ni)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', fontSize: '15px', color: pct >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* Income Statement - TABLE VIEW (Monthly/Quarterly/Annual) - for specific LOB */}
          {statementType === 'income-statement' && selectedLineOfBusiness !== 'all' && (statementDisplay === 'monthly' || statementDisplay === 'quarterly' || statementDisplay === 'annual') && monthlyLOBData.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Income Statement - {selectedLineOfBusiness} ({statementDisplay.charAt(0).toUpperCase() + statementDisplay.slice(1)})
              </h3>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#1e293b' }}>Line Item</th>
                    {monthLabels.map((month, idx) => (
                      <th key={idx} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '600', color: '#1e293b', minWidth: '90px' }}>
                        {month}
                      </th>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: '#1e293b', minWidth: '100px', background: '#e2e8f0' }}>
                        TOTAL
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthlyLOBData.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      REVENUE
                    </td>
                  </tr>
                  
                  {/* Revenue detail rows - only if there are sub-categories */}
                  {monthlyLOBData.some(m => m.breakdowns?.revenue) && Object.keys(monthlyLOBData[0]?.breakdowns?.revenue || {}).length > 0 && (
                    <>
                      {Object.keys(monthlyLOBData[0]?.breakdowns?.revenue || {}).map((revType) => {
                        const hasValues = monthlyLOBData.some(m => {
                          const val = selectedLineOfBusiness === 'all'
                            ? (m.breakdowns?.revenue?.[revType] ? Object.values(m.breakdowns.revenue[revType]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                            : (m.breakdowns?.revenue?.[revType]?.[selectedLineOfBusiness] || 0);
                          return val > 0;
                        });
                        
                        if (!hasValues) return null;
                        
                        return (
                          <tr key={revType} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>
                              {revType.charAt(0).toUpperCase() + revType.slice(1)}
                            </td>
                            {monthlyLOBData.map((m, idx) => {
                              const val = selectedLineOfBusiness === 'all'
                                ? (m.breakdowns?.revenue?.[revType] ? Object.values(m.breakdowns.revenue[revType]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                                : (m.breakdowns?.revenue?.[revType]?.[selectedLineOfBusiness] || 0);
                              return (
                                <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                                  {fmt(val)}
                                </td>
                              );
                            })}
                            {statementDisplay !== 'annual' && (
                              <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                                {fmt(getLOBValue(`revenue.${revType}`) || 0)}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </>
                  )}
                  
                  {/* Total Revenue */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Revenue</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#059669' }}>
                        {fmt(m.revenue)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#059669', background: '#e2e8f0' }}>
                        {fmt(lobRevenue)}
                      </td>
                    )}
                  </tr>
                  
                  {/* COGS Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthlyLOBData.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      COST OF GOODS SOLD
                    </td>
                  </tr>
                  
                  {/* COGS - Contractors */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsContractors ? Object.values(m.breakdowns.cogsContractors).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsContractors?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Contractors</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsContractors ? Object.values(m.breakdowns.cogsContractors).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsContractors?.[selectedLineOfBusiness] || 0);
                        return (
                          <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                          {fmt(getLOBValue('cogsContractors'))}
                        </td>
                      )}
                    </tr>
                  )}
                  
                  {/* COGS - Payroll */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsPayroll ? Object.values(m.breakdowns.cogsPayroll).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsPayroll?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>COGS Payroll</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsPayroll ? Object.values(m.breakdowns.cogsPayroll).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsPayroll?.[selectedLineOfBusiness] || 0);
                        return (
                          <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                          {fmt(getLOBValue('cogsPayroll'))}
                        </td>
                      )}
                    </tr>
                  )}
                  
                  {/* COGS - Materials */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsMaterials ? Object.values(m.breakdowns.cogsMaterials).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsMaterials?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Materials</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsMaterials ? Object.values(m.breakdowns.cogsMaterials).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsMaterials?.[selectedLineOfBusiness] || 0);
                        return (
                          <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                          {fmt(getLOBValue('cogsMaterials'))}
                        </td>
                      )}
                    </tr>
                  )}
                  
                  {/* Total COGS */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Cost of Goods Sold</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#dc2626' }}>
                        {fmt(m.cogs)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0' }}>
                        {fmt(lobCOGS)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Gross Profit Row */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Gross Profit</td>
                    {monthlyLOBData.map((m, idx) => {
                      const gp = m.revenue - m.cogs;
                      return (
                        <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: gp >= 0 ? '#059669' : '#dc2626' }}>
                          {fmt(gp)}
                        </td>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: grossProfit >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                        {fmt(grossProfit)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Operating Expenses Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={monthlyLOBData.length + 2} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      OPERATING EXPENSES
                    </td>
                  </tr>
                  
                  {/* Dynamic Operating Expenses Rendering */}
                  {(() => {
                    // Define all possible expense fields with their display names
                    const expenseFieldDefinitions = [
                      // Operating Expenses - Complete list in correct order
                      { key: 'payroll', label: 'Payroll', field: 'payroll' },
                      { key: 'benefits', label: 'Benefits', field: 'benefits' },
                      { key: 'insurance', label: 'Insurance', field: 'insurance' },
                      { key: 'professionalFees', label: 'Professional Services', field: 'professionalFees' },
                      { key: 'subcontractors', label: 'Subcontractors', field: 'subcontractors' },
                      { key: 'rent', label: 'Rent/Lease', field: 'rent' },
                      { key: 'taxLicense', label: 'Tax & License', field: 'taxLicense' },
                      { key: 'phoneComm', label: 'Phone & Communication', field: 'phoneComm' },
                      { key: 'infrastructure', label: 'Infrastructure/Utilities', field: 'infrastructure' },
                      { key: 'autoTravel', label: 'Auto & Travel', field: 'autoTravel' },
                      { key: 'salesExpense', label: 'Sales & Marketing', field: 'salesExpense' },
                      { key: 'marketing', label: 'Marketing', field: 'marketing' },
                      { key: 'mealsEntertainment', label: 'Meals & Entertainment', field: 'mealsEntertainment' },
                      { key: 'otherExpense', label: 'Other Expenses', field: 'otherExpense' }
                    ];

                    // Render only fields that have values in at least one period
                    return expenseFieldDefinitions.map(fieldDef => {
                      const hasValue = monthlyLOBData.some(m => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.[fieldDef.field] ? Object.values(m.breakdowns[fieldDef.field]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.[fieldDef.field]?.[selectedLineOfBusiness] || 0);
                        return val > 0;
                      });

                      if (!hasValue) return null;

                      return (
                        <tr key={fieldDef.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>{fieldDef.label}</td>
                          {monthlyLOBData.map((m, idx) => {
                            const val = selectedLineOfBusiness === 'all'
                              ? (m.breakdowns?.[fieldDef.field] ? Object.values(m.breakdowns[fieldDef.field]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                              : (m.breakdowns?.[fieldDef.field]?.[selectedLineOfBusiness] || 0);
                            return (
                              <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                                {fmt(val)}
                              </td>
                            );
                          })}
                          {statementDisplay !== 'annual' && (
                            <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                              {fmt(getLOBValue(fieldDef.field))}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                  
                  {/* Other Expenses */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.otherExpense ? Object.values(m.breakdowns.otherExpense).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.otherExpense?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Other Expenses</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.otherExpense ? Object.values(m.breakdowns.otherExpense).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.otherExpense?.[selectedLineOfBusiness] || 0);
                        return (
                          <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                          {fmt(getLOBValue('otherExpense'))}
                        </td>
                      )}
                    </tr>
                  )}
                  
                  {/* Total Operating Expenses */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#dc2626' }}>
                        {fmt(m.expense)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0' }}>
                        {fmt(lobExpense)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Net Income Row */}
                  <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>Net Income</td>
                    {monthlyLOBData.map((m, idx) => {
                      const ni = m.revenue - m.cogs - m.expense;
                      return (
                        <td key={idx} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: ni >= 0 ? '#059669' : '#dc2626' }}>
                          {fmt(ni)}
                        </td>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', fontSize: '15px', color: netIncome >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                        {fmt(netIncome)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* Income Statement (% of Revenue) - TABLE VIEW (Monthly/Quarterly/Annual) - for specific LOB */}
          {statementType === 'income-statement-percent' && selectedLineOfBusiness !== 'all' && (statementDisplay === 'monthly' || statementDisplay === 'quarterly' || statementDisplay === 'annual') && monthlyLOBData.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Income Statement (% of Revenue) - {selectedLineOfBusiness} ({statementDisplay.charAt(0).toUpperCase() + statementDisplay.slice(1)})
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'normal', marginLeft: '16px' }}>
                  ({monthlyLOBData.length} periods, {monthLabels.length} labels)
                </span>
              </h3>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1200px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#1e293b' }}>Line Item</th>
                    {monthLabels.map((month, idx) => (
                      <th key={idx} colSpan={2} style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '600', color: '#1e293b', minWidth: '140px', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                        {month}
                      </th>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <th colSpan={2} style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '700', color: '#1e293b', minWidth: '160px', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                        TOTAL
                      </th>
                    )}
                  </tr>
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
                    <th></th>
                    {monthLabels.map((month, idx) => (
                      <React.Fragment key={idx}>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '600', color: '#64748b', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>$</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>%</th>
                      </React.Fragment>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>$</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '11px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>%</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length * 2 + 3 : monthlyLOBData.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      REVENUE
                    </td>
                  </tr>
                  
                  {/* Total Revenue */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Revenue</td>
                    {monthlyLOBData.map((m, idx) => (
                      <React.Fragment key={idx}>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#059669', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                          {fmt(m.revenue)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#059669' }}>
                          100.0%
                        </td>
                      </React.Fragment>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#059669', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                          {fmt(lobRevenue)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#059669', background: '#e2e8f0' }}>
                          100.0%
                        </td>
                      </>
                    )}
                  </tr>
                  
                  {/* COGS Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length * 2 + 3 : monthlyLOBData.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      COST OF GOODS SOLD
                    </td>
                  </tr>
                  
                  {/* COGS - Contractors */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsContractors ? Object.values(m.breakdowns.cogsContractors).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsContractors?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Contractors</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsContractors ? Object.values(m.breakdowns.cogsContractors).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsContractors?.[selectedLineOfBusiness] || 0);
                        const pct = m.revenue > 0 ? (val / m.revenue) * 100 : 0;
                        return (
                          <React.Fragment key={idx}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                            {fmt(getLOBValue('cogsContractors'))}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                            {lobRevenue > 0 ? ((getLOBValue('cogsContractors') / lobRevenue) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </>
                      )}
                    </tr>
                  )}
                  
                  {/* COGS - Payroll */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsPayroll ? Object.values(m.breakdowns.cogsPayroll).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsPayroll?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>COGS Payroll</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsPayroll ? Object.values(m.breakdowns.cogsPayroll).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsPayroll?.[selectedLineOfBusiness] || 0);
                        const pct = m.revenue > 0 ? (val / m.revenue) * 100 : 0;
                        return (
                          <React.Fragment key={idx}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                            {fmt(getLOBValue('cogsPayroll'))}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                            {lobRevenue > 0 ? ((getLOBValue('cogsPayroll') / lobRevenue) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </>
                      )}
                    </tr>
                  )}
                  
                  {/* COGS - Materials */}
                  {monthlyLOBData.some(m => {
                    const val = selectedLineOfBusiness === 'all'
                      ? (m.breakdowns?.cogsMaterials ? Object.values(m.breakdowns.cogsMaterials).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                      : (m.breakdowns?.cogsMaterials?.[selectedLineOfBusiness] || 0);
                    return val > 0;
                  }) && (
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Materials</td>
                      {monthlyLOBData.map((m, idx) => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.cogsMaterials ? Object.values(m.breakdowns.cogsMaterials).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.cogsMaterials?.[selectedLineOfBusiness] || 0);
                        const pct = m.revenue > 0 ? (val / m.revenue) * 100 : 0;
                        return (
                          <React.Fragment key={idx}>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                              {fmt(val)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                              {pct.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {statementDisplay !== 'annual' && (
                        <>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                            {fmt(getLOBValue('cogsMaterials'))}
                          </td>
                          <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                            {lobRevenue > 0 ? ((getLOBValue('cogsMaterials') / lobRevenue) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </>
                      )}
                    </tr>
                  )}
                  
                  {/* Total COGS */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Cost of Goods Sold</td>
                    {monthlyLOBData.map((m, idx) => {
                      const pct = m.revenue > 0 ? (m.cogs / m.revenue) * 100 : 0;
                      return (
                        <React.Fragment key={idx}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#dc2626', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                            {fmt(m.cogs)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#64748b' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                          {fmt(lobCOGS)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>
                          {lobRevenue > 0 ? ((lobCOGS / lobRevenue) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </>
                    )}
                  </tr>
                  
                  {/* Gross Profit */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Gross Profit</td>
                    {monthlyLOBData.map((m, idx) => {
                      const gp = m.revenue - m.cogs;
                      const pct = m.revenue > 0 ? (gp / m.revenue) * 100 : 0;
                      return (
                        <React.Fragment key={idx}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: gp >= 0 ? '#059669' : '#dc2626', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                            {fmt(gp)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: pct >= 0 ? '#059669' : '#dc2626' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: grossProfit >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1', borderLeft: '2px solid #94a3b8' }}>
                          {fmt(grossProfit)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: grossMargin >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                          {grossMargin.toFixed(1)}%
                        </td>
                      </>
                    )}
                  </tr>
                  
                  {/* Operating Expenses Section */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length * 2 + 3 : monthlyLOBData.length * 2 + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      OPERATING EXPENSES
                    </td>
                  </tr>

                  {/* Dynamic Operating Expenses Rendering */}
                  {(() => {
                    // Define all possible expense fields with their display names
                    const expenseFieldDefinitions = [
                      // Operating Expenses - Complete list in correct order
                      { key: 'payroll', label: 'Payroll', field: 'payroll' },
                      { key: 'benefits', label: 'Benefits', field: 'benefits' },
                      { key: 'insurance', label: 'Insurance', field: 'insurance' },
                      { key: 'professionalFees', label: 'Professional Services', field: 'professionalFees' },
                      { key: 'subcontractors', label: 'Subcontractors', field: 'subcontractors' },
                      { key: 'rent', label: 'Rent/Lease', field: 'rent' },
                      { key: 'taxLicense', label: 'Tax & License', field: 'taxLicense' },
                      { key: 'phoneComm', label: 'Phone & Communication', field: 'phoneComm' },
                      { key: 'infrastructure', label: 'Infrastructure/Utilities', field: 'infrastructure' },
                      { key: 'autoTravel', label: 'Auto & Travel', field: 'autoTravel' },
                      { key: 'salesExpense', label: 'Sales & Marketing', field: 'salesExpense' },
                      { key: 'marketing', label: 'Marketing', field: 'marketing' },
                      { key: 'mealsEntertainment', label: 'Meals & Entertainment', field: 'mealsEntertainment' },
                      { key: 'otherExpense', label: 'Other Expenses', field: 'otherExpense' }
                    ];

                    // Render only fields that have values in at least one period
                    return expenseFieldDefinitions.map(fieldDef => {
                      const hasValue = monthlyLOBData.some(m => {
                        const val = selectedLineOfBusiness === 'all'
                          ? (m.breakdowns?.[fieldDef.field] ? Object.values(m.breakdowns[fieldDef.field]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                          : (m.breakdowns?.[fieldDef.field]?.[selectedLineOfBusiness] || 0);
                        return val > 0;
                      });

                      if (!hasValue) return null;

                      return (
                        <tr key={fieldDef.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>{fieldDef.label}</td>
                          {monthlyLOBData.map((m, idx) => {
                            const val = selectedLineOfBusiness === 'all'
                              ? (m.breakdowns?.[fieldDef.field] ? Object.values(m.breakdowns[fieldDef.field]).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0) : 0)
                              : (m.breakdowns?.[fieldDef.field]?.[selectedLineOfBusiness] || 0);
                            const pct = m.revenue > 0 ? (val / m.revenue) * 100 : 0;
                            return (
                              <React.Fragment key={idx}>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                                  {fmt(val)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b' }}>
                                  {pct.toFixed(1)}%
                                </td>
                              </React.Fragment>
                            );
                          })}
                          {statementDisplay !== 'annual' && (
                            <>
                              <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                                {fmt(getLOBValue(fieldDef.field))}
                              </td>
                              <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                                {lobRevenue > 0 ? ((getLOBValue(fieldDef.field) / lobRevenue) * 100).toFixed(1) : '0.0'}%
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    });
                  })()}
                  
                  {/* Total Operating Expenses */}
                  <tr style={{ borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</td>
                    {monthlyLOBData.map((m, idx) => {
                      const pct = m.revenue > 0 ? (m.expense / m.revenue) * 100 : 0;
                      return (
                        <React.Fragment key={idx}>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#dc2626', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                            {fmt(m.expense)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '600', color: '#64748b' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#dc2626', background: '#e2e8f0', borderLeft: '2px solid #94a3b8' }}>
                          {fmt(lobExpense)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: '700', color: '#64748b', background: '#e2e8f0' }}>
                          {lobRevenue > 0 ? ((lobExpense / lobRevenue) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </>
                    )}
                  </tr>
                  
                  {/* Net Income */}
                  <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>Net Income</td>
                    {monthlyLOBData.map((m, idx) => {
                      const ni = m.revenue - m.cogs - m.expense;
                      const pct = m.revenue > 0 ? (ni / m.revenue) * 100 : 0;
                      return (
                        <React.Fragment key={idx}>
                          <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', color: ni >= 0 ? '#059669' : '#dc2626', borderLeft: idx === 0 ? 'none' : '1px solid #e2e8f0' }}>
                            {fmt(ni)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', color: pct >= 0 ? '#059669' : '#dc2626' }}>
                            {pct.toFixed(1)}%
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <>
                        <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', fontSize: '15px', color: netIncome >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1', borderLeft: '2px solid #94a3b8' }}>
                          {fmt(netIncome)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '12px 4px', fontWeight: '700', fontSize: '15px', color: netMargin >= 0 ? '#059669' : '#dc2626', background: '#cbd5e1' }}>
                          {netMargin.toFixed(1)}%
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* Income Statement - AGGREGATED (fallback - should not be used now) */}
          {statementType === 'income-statement' && statementDisplay !== 'monthly' && statementDisplay !== 'quarterly' && statementDisplay !== 'annual' && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Income Statement - {selectedLineOfBusiness === 'all' ? 'All Lines of Business' : selectedLineOfBusiness}
              </h3>
              
              {/* Revenue */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                  Revenue
                </div>
                {/* Revenue detail rows would go here if needed */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #cbd5e1', marginTop: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Revenue</span>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{fmt(lobRevenue)}</span>
                </div>
              </div>
              
              {/* COGS */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                  Cost of Goods Sold
                </div>
                {getLOBValue('cogsContractors') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Contractors</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('cogsContractors'))}</span>
                  </div>
                )}
                {getLOBValue('cogsPayroll') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>COGS Payroll</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('cogsPayroll'))}</span>
                  </div>
                )}
                {getLOBValue('cogsMaterials') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Materials</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('cogsMaterials'))}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #cbd5e1', marginTop: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Cost of Goods Sold</span>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{fmt(lobCOGS)}</span>
                </div>
              </div>
              
              {/* Gross Profit */}
              <div style={{ marginBottom: '20px', background: grossProfit >= 0 ? '#d1fae5' : '#fee2e2', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>Gross Profit</span>
                  <span style={{ fontWeight: '700', color: grossProfit >= 0 ? '#059669' : '#dc2626' }}>{fmt(grossProfit)}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Gross Margin: {grossMargin.toFixed(1)}%
                </div>
              </div>
              
              {/* Operating Expenses */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                  Operating Expenses
                </div>
                {getLOBValue('payroll') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Payroll</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('payroll'))}</span>
                  </div>
                )}
                {getLOBValue('rent') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Rent/Lease</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('rent'))}</span>
                  </div>
                )}
                {getLOBValue('utilities') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Utilities</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('utilities'))}</span>
                  </div>
                )}
                {getLOBValue('insurance') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Insurance</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('insurance'))}</span>
                  </div>
                )}
                {getLOBValue('professionalFees') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Professional Fees</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('professionalFees'))}</span>
                  </div>
                )}
                {getLOBValue('marketing') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Marketing</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('marketing'))}</span>
                  </div>
                )}
                {getLOBValue('autoTravel') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Auto & Travel</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('autoTravel'))}</span>
                  </div>
                )}
                {getLOBValue('taxLicense') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Taxes & Licenses</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('taxLicense'))}</span>
                  </div>
                )}
                {getLOBValue('otherExpense') > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px' }}>
                    <span style={{ color: '#475569' }}>Other Expenses</span>
                    <span style={{ color: '#475569' }}>{fmt(getLOBValue('otherExpense'))}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #cbd5e1', marginTop: '8px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</span>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{fmt(lobExpense)}</span>
                </div>
              </div>
              
              {/* Net Income */}
              <div style={{ background: netIncome >= 0 ? '#d1fae5' : '#fee2e2', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>Net Income</span>
                  <span style={{ fontWeight: '700', fontSize: '18px', color: netIncome >= 0 ? '#059669' : '#dc2626' }}>
                    {fmt(netIncome)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Net Margin: {netMargin.toFixed(1)}%
                </div>
              </div>
            </div>
          )}
          
          {/* Balance Sheet - TABLE VIEW (Monthly/Quarterly/Annual) */}
          {statementType === 'balance-sheet' && (statementDisplay === 'monthly' || statementDisplay === 'quarterly' || statementDisplay === 'annual') && monthlyLOBData.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '24px', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                Balance Sheet - {selectedLineOfBusiness === 'all' ? 'All Lines of Business' : selectedLineOfBusiness} ({statementDisplay.charAt(0).toUpperCase() + statementDisplay.slice(1)})
              </h3>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600', color: '#1e293b' }}>Line Item</th>
                    {monthLabels.map((month, idx) => (
                      <th key={idx} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '600', color: '#1e293b', minWidth: '90px' }}>
                        {month}
                      </th>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: '#1e293b', minWidth: '100px', background: '#e2e8f0' }}>
                        TOTAL
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* Assets Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length + 2 : monthlyLOBData.length + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      ASSETS
                    </td>
                  </tr>
                  
                  {/* Current Assets Subheader */}
                  <tr style={{ background: '#f1f5f9' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length + 2 : monthlyLOBData.length + 1} style={{ padding: '6px 8px', paddingLeft: '16px', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                      Current Assets
                    </td>
                  </tr>
                  
                  {/* Cash */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Cash</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.cash || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.cash || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Accounts Receivable */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Accounts Receivable</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.ar || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.ar || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Inventory */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Inventory</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.inventory || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.inventory || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Other Current Assets */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Other Current Assets</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.otherCA || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.otherCA || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Current Assets */}
                  <tr style={{ borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '8px', paddingLeft: '24px', fontWeight: '600', color: '#1e293b', fontSize: '12px' }}>Total Current Assets</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#1e293b', fontSize: '12px' }}>
                        {fmt(m.tca || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#1e293b', background: '#e2e8f0', fontSize: '12px' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.tca || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Fixed Assets */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Fixed Assets</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.fixedAssets || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.fixedAssets || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Other Assets */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Other Assets</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.otherAssets || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.otherAssets || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Assets */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Assets</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>
                        {fmt(m.totalAssets || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#1e293b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.totalAssets || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Liabilities Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length + 2 : monthlyLOBData.length + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      LIABILITIES
                    </td>
                  </tr>
                  
                  {/* Current Liabilities Subheader */}
                  <tr style={{ background: '#f1f5f9' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length + 2 : monthlyLOBData.length + 1} style={{ padding: '6px 8px', paddingLeft: '16px', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
                      Current Liabilities
                    </td>
                  </tr>
                  
                  {/* Accounts Payable */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Accounts Payable</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.ap || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.ap || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Other Current Liabilities */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '32px', fontSize: '12px', color: '#64748b' }}>Other Current Liabilities</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.otherCL || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.otherCL || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Current Liabilities */}
                  <tr style={{ borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '8px', paddingLeft: '24px', fontWeight: '600', color: '#1e293b', fontSize: '12px' }}>Total Current Liabilities</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#1e293b', fontSize: '12px' }}>
                        {fmt(m.tcl || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#1e293b', background: '#e2e8f0', fontSize: '12px' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.tcl || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Long Term Debt */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Long Term Debt</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.ltd || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.ltd || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Liabilities */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Liabilities</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>
                        {fmt(m.totalLiab || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#1e293b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.totalLiab || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Equity Header */}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={statementDisplay !== 'annual' ? monthlyLOBData.length + 2 : monthlyLOBData.length + 1} style={{ padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>
                      EQUITY
                    </td>
                  </tr>
                  
                  {/* Owners Capital */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Owner's Capital</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.ownersCapital || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.ownersCapital || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Owners Draw */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Owner's Draw</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.ownersDraw || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.ownersDraw || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Common Stock */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Common Stock</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.commonStock || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.commonStock || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Preferred Stock */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Preferred Stock</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.preferredStock || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.preferredStock || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Retained Earnings */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Retained Earnings</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.retainedEarnings || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.retainedEarnings || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Additional Paid-In Capital */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Additional Paid-In Capital</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.additionalPaidInCapital || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.additionalPaidInCapital || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Treasury Stock */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', paddingLeft: '24px', fontSize: '12px', color: '#64748b' }}>Treasury Stock</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                        {fmt(m.treasuryStock || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.treasuryStock || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Equity */}
                  <tr style={{ borderBottom: '2px solid #cbd5e1', borderTop: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>Total Equity</td>
                    {monthlyLOBData.map((m, idx) => (
                      <td key={idx} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '600', color: '#1e293b' }}>
                        {fmt(m.equity || 0)}
                      </td>
                    ))}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontWeight: '700', color: '#1e293b', background: '#e2e8f0' }}>
                        {fmt(monthlyLOBData[monthlyLOBData.length - 1]?.equity || 0)}
                      </td>
                    )}
                  </tr>
                  
                  {/* Total Liabilities and Equity */}
                  <tr style={{ borderTop: '2px solid #475569', background: '#f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>Total Liabilities and Equity</td>
                    {monthlyLOBData.map((m, idx) => {
                      const totalLiabAndEquity = (m.totalLiab || 0) + (m.equity || 0);
                      return (
                        <td key={idx} style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>
                          {fmt(totalLiabAndEquity)}
                        </td>
                      );
                    })}
                    {statementDisplay !== 'annual' && (
                      <td style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '700', color: '#1e293b', background: '#e2e8f0' }}>
                        {fmt((monthlyLOBData[monthlyLOBData.length - 1]?.totalLiab || 0) + (monthlyLOBData[monthlyLOBData.length - 1]?.equity || 0))}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

