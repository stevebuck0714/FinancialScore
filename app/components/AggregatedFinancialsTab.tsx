'use client';

import React from 'react';
import { useMasterData } from '@/lib/master-data-store';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';

interface AggregatedFinancialsTabProps {
  selectedCompanyId: string;
  statementType: 'income-statement' | 'balance-sheet' | 'income-statement-percent';
  statementPeriod: 'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years';
  statementDisplay: 'monthly' | 'quarterly' | 'annual';
}

// Helper function to calculate aggregated values from monthly data
function calculateAggregatedValues(monthly: any[], period: string) {
  // Sort by date to ensure chronological order
  // API returns 'date' and 'month' fields (both set to month.monthDate), not 'monthDate'
  const sortedMonthly = [...monthly].sort((a, b) => {
    const dateA = new Date(a.date || a.month || a.monthDate || 0).getTime();
    const dateB = new Date(b.date || b.month || b.monthDate || 0).getTime();
    return dateA - dateB;
  });

  // Filter by period
  const now = new Date();
  let filteredMonthly: any[] = [];
  
  if (period === 'current-month') {
    // For current-month, use the last item directly (API already returns sorted data)
    // This matches LOBReportingTab's approach: monthly.slice(-1)
    filteredMonthly = sortedMonthly.slice(-1);
  } else if (period === 'current-quarter') {
    filteredMonthly = sortedMonthly.slice(-3);
  } else if (period === 'last-12-months') {
    filteredMonthly = sortedMonthly.slice(-12);
  } else if (period === 'ytd') {
    const currentYear = now.getFullYear();
    filteredMonthly = sortedMonthly.filter(m => {
      const monthDate = new Date(m.date || m.month || m.monthDate || 0);
      return monthDate.getFullYear() === currentYear;
    });
  } else if (period === 'last-year') {
    const lastYear = now.getFullYear() - 1;
    filteredMonthly = sortedMonthly.filter(m => {
      const monthDate = new Date(m.date || m.month || m.monthDate || 0);
      return monthDate.getFullYear() === lastYear;
    });
  } else if (period === 'last-3-years') {
    filteredMonthly = sortedMonthly.slice(-36);
  } else {
    filteredMonthly = sortedMonthly;
  }

  if (filteredMonthly.length === 0) {
    return null;
  }


  // Aggregate values across the period
  const aggregated = {
    revenue: 0,
    cogsPayroll: 0,
    cogsOwnerPay: 0,
    cogsContractors: 0,
    cogsMaterials: 0,
    cogsCommissions: 0,
    cogsOther: 0,
    payroll: 0,
    benefits: 0,
    insurance: 0,
    professionalFees: 0,
    subcontractors: 0,
    rent: 0,
    taxLicense: 0,
    phoneComm: 0,
    infrastructure: 0,
    autoTravel: 0,
    salesExpense: 0,
    marketing: 0,
    mealsEntertainment: 0,
    otherExpense: 0,
    interestExpense: 0,
    nonOperatingIncome: 0,
    extraordinaryItems: 0,
    stateIncomeTaxes: 0,
    federalIncomeTaxes: 0,
  };

  for (const month of filteredMonthly) {
    aggregated.revenue += Number(month.revenue) || 0;
    aggregated.cogsPayroll += Number(month.cogsPayroll) || 0;
    aggregated.cogsOwnerPay += Number(month.cogsOwnerPay) || 0;
    aggregated.cogsContractors += Number(month.cogsContractors) || 0;
    aggregated.cogsMaterials += Number(month.cogsMaterials) || 0;
    aggregated.cogsCommissions += Number(month.cogsCommissions) || 0;
    aggregated.cogsOther += Number(month.cogsOther) || 0;
    aggregated.payroll += Number(month.payroll) || 0;
    aggregated.benefits += Number(month.benefits) || 0;
    aggregated.insurance += Number(month.insurance) || 0;
    aggregated.professionalFees += Number(month.professionalFees) || 0;
    aggregated.subcontractors += Number(month.subcontractors) || 0;
    aggregated.rent += Number(month.rent) || 0;
    aggregated.taxLicense += Number(month.taxLicense) || 0;
    aggregated.phoneComm += Number(month.phoneComm) || 0;
    aggregated.infrastructure += Number(month.infrastructure) || 0;
    aggregated.autoTravel += Number(month.autoTravel) || 0;
    aggregated.salesExpense += Number(month.salesExpense) || 0;
    aggregated.marketing += Number(month.marketing) || 0;
    aggregated.mealsEntertainment += Number(month.mealsEntertainment) || 0;
    aggregated.otherExpense += Number(month.otherExpense) || 0;
    aggregated.interestExpense += Number(month.interestExpense) || 0;
    aggregated.nonOperatingIncome += Number(month.nonOperatingIncome) || 0;
    aggregated.extraordinaryItems += Number(month.extraordinaryItems) || 0;
    
    // Parse income taxes - use EXACT same pattern as DataReviewTab (line 1272-1386)
    // DataReviewTab accesses: (m.stateIncomeTaxes || 0) and (m.federalIncomeTaxes || 0)
    // Access fields the same way DataReviewTab does
    const stateTax = (month.stateIncomeTaxes || 0);
    const federalTax = (month.federalIncomeTaxes || 0);
    
    // Convert to numbers (handle strings, null, undefined)
    const stateTaxNum = typeof stateTax === 'number' ? stateTax : (typeof stateTax === 'string' ? parseFloat(stateTax) : 0) || 0;
    const federalTaxNum = typeof federalTax === 'number' ? federalTax : (typeof federalTax === 'string' ? parseFloat(federalTax) : 0) || 0;
    
    aggregated.stateIncomeTaxes += stateTaxNum;
    aggregated.federalIncomeTaxes += federalTaxNum;
  }
  

  // Calculate derived values
  aggregated.cogs = aggregated.cogsPayroll + aggregated.cogsOwnerPay + aggregated.cogsContractors +
                    aggregated.cogsMaterials + aggregated.cogsCommissions + aggregated.cogsOther;
  
  aggregated.totalOpex = aggregated.payroll + aggregated.benefits + aggregated.insurance +
                         aggregated.professionalFees + aggregated.subcontractors + aggregated.rent +
                         aggregated.taxLicense + aggregated.phoneComm + aggregated.infrastructure +
                         aggregated.autoTravel + aggregated.salesExpense + aggregated.marketing +
                         aggregated.mealsEntertainment + aggregated.otherExpense;
  
  aggregated.grossProfit = aggregated.revenue - aggregated.cogs;
  aggregated.grossMargin = aggregated.revenue > 0 ? (aggregated.grossProfit / aggregated.revenue) * 100 : 0;
  
  aggregated.operatingIncome = aggregated.grossProfit - aggregated.totalOpex;
  aggregated.operatingMargin = aggregated.revenue > 0 ? (aggregated.operatingIncome / aggregated.revenue) * 100 : 0;
  
  aggregated.incomeBeforeTax = aggregated.operatingIncome - aggregated.interestExpense +
                               aggregated.nonOperatingIncome + aggregated.extraordinaryItems;
  
  // Ensure tax values are numbers for net income calculation
  const finalStateTax = Number(aggregated.stateIncomeTaxes) || 0;
  const finalFederalTax = Number(aggregated.federalIncomeTaxes) || 0;
  aggregated.netIncome = aggregated.incomeBeforeTax - finalStateTax - finalFederalTax;
  aggregated.netMargin = aggregated.revenue > 0 ? (aggregated.netIncome / aggregated.revenue) * 100 : 0;
  
  // Store the final parsed values back
  aggregated.stateIncomeTaxes = finalStateTax;
  aggregated.federalIncomeTaxes = finalFederalTax;

  // Get period label
  let periodLabel = '';
  if (period === 'current-month') {
    const lastMonth = filteredMonthly[filteredMonthly.length - 1];
    const monthDate = new Date(lastMonth.date || lastMonth.month || lastMonth.monthDate || 0);
    periodLabel = `For the Month Ended ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  } else if (period === 'current-quarter') {
    const lastMonth = filteredMonthly[filteredMonthly.length - 1];
    const monthDate = lastMonth ? new Date(lastMonth.date || lastMonth.month || lastMonth.monthDate || 0) : null;
    periodLabel = monthDate ? `For the Quarter Ended ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : 'Current Quarter';
  } else if (period === 'last-12-months') {
    periodLabel = 'For the Last 12 Months';
  } else if (period === 'ytd') {
    periodLabel = `Year to Date ${now.getFullYear()}`;
  } else if (period === 'last-year') {
    periodLabel = `For the Year Ended December 31, ${now.getFullYear() - 1}`;
  } else if (period === 'last-3-years') {
    periodLabel = 'For the Last 3 Years';
  }

  return { ...aggregated, periodLabel, filteredMonthly };
}

// Income Statement Component
function IncomeStatement({ aggregated }: { aggregated: any }) {
  const fmt = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement</h2>
        <div style={{ fontSize: '14px', color: '#64748b' }}>{aggregated.periodLabel}</div>
      </div>

      {/* Revenue Section */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>{getFieldDisplayName('revenue')}</span>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>${fmt(aggregated.revenue)}</span>
        </div>
      </div>

      {/* COGS Section */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{getFieldDisplayName('costOfGoodsSold')}</div>
        {aggregated.cogsPayroll > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsPayroll')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsPayroll)}</span>
          </div>
        )}
        {aggregated.cogsOwnerPay > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsOwnerPay')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsOwnerPay)}</span>
          </div>
        )}
        {aggregated.cogsContractors > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsContractors')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsContractors)}</span>
          </div>
        )}
        {aggregated.cogsMaterials > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsMaterials')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsMaterials)}</span>
          </div>
        )}
        {aggregated.cogsCommissions > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsCommissions')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsCommissions)}</span>
          </div>
        )}
        {aggregated.cogsOther > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('cogsOther')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.cogsOther)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>{getFieldDisplayName('cogsTotal')}</span>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>${fmt(aggregated.cogs)}</span>
        </div>
      </div>

      {/* Gross Profit */}
      <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', color: '#1e40af' }}>{getFieldDisplayName('grossProfit')}</span>
          <span style={{ fontWeight: '700', color: '#1e40af' }}>${fmt(aggregated.grossProfit)}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
          {aggregated.grossMargin.toFixed(1)}% margin
        </div>
      </div>

      {/* Operating Expenses */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{getFieldDisplayName('operatingExpenses')}</div>
        {aggregated.payroll > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('payroll')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.payroll)}</span>
          </div>
        )}
        {aggregated.benefits > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('benefits')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.benefits)}</span>
          </div>
        )}
        {aggregated.insurance > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('insurance')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.insurance)}</span>
          </div>
        )}
        {aggregated.professionalFees > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('professionalFees')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.professionalFees)}</span>
          </div>
        )}
        {aggregated.subcontractors > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('subcontractors')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.subcontractors)}</span>
          </div>
        )}
        {aggregated.rent > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('rent')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.rent)}</span>
          </div>
        )}
        {aggregated.taxLicense > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('taxLicense')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.taxLicense)}</span>
          </div>
        )}
        {aggregated.phoneComm > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('phoneComm')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.phoneComm)}</span>
          </div>
        )}
        {aggregated.infrastructure > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('infrastructure')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.infrastructure)}</span>
          </div>
        )}
        {aggregated.autoTravel > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('autoTravel')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.autoTravel)}</span>
          </div>
        )}
        {aggregated.salesExpense > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('salesExpense')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.salesExpense)}</span>
          </div>
        )}
        {(Number(aggregated.marketing) || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('marketing')}</span>
            <span style={{ color: '#475569' }}>${fmt(Number(aggregated.marketing) || 0)}</span>
          </div>
        )}
        {aggregated.mealsEntertainment > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('mealsEntertainment')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.mealsEntertainment)}</span>
          </div>
        )}
        {aggregated.otherExpense > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
            <span style={{ color: '#475569' }}>{getFieldDisplayName('otherExpense')}</span>
            <span style={{ color: '#475569' }}>${fmt(aggregated.otherExpense)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>{getFieldDisplayName('totalOperatingExpenses')}</span>
          <span style={{ fontWeight: '600', color: '#1e293b' }}>${fmt(aggregated.totalOpex)}</span>
        </div>
      </div>

      {/* Operating Income */}
      <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', color: '#1e40af' }}>Operating Income</span>
          <span style={{ fontWeight: '700', color: '#1e40af' }}>${fmt(aggregated.operatingIncome)}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
          {aggregated.operatingMargin.toFixed(1)}% margin
        </div>
      </div>

      {/* Other Income/Expense */}
      {(aggregated.interestExpense > 0 || aggregated.nonOperatingIncome !== 0 || aggregated.extraordinaryItems !== 0) && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Other Income & Expense</div>
          {aggregated.interestExpense > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
              <span style={{ color: '#475569' }}>{getFieldDisplayName('interestExpense')}</span>
              <span style={{ color: '#475569' }}>(${fmt(aggregated.interestExpense)})</span>
            </div>
          )}
          {aggregated.nonOperatingIncome !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
              <span style={{ color: '#475569' }}>Non-Operating Income</span>
              <span style={{ color: aggregated.nonOperatingIncome >= 0 ? '#10b981' : '#ef4444' }}>
                {aggregated.nonOperatingIncome >= 0 ? '$' : '($'}${fmt(Math.abs(aggregated.nonOperatingIncome))}{aggregated.nonOperatingIncome < 0 ? ')' : ''}
              </span>
            </div>
          )}
          {aggregated.extraordinaryItems !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
              <span style={{ color: '#475569' }}>Extraordinary Items</span>
              <span style={{ color: aggregated.extraordinaryItems >= 0 ? '#10b981' : '#ef4444' }}>
                {aggregated.extraordinaryItems >= 0 ? '$' : '($'}${fmt(Math.abs(aggregated.extraordinaryItems))}{aggregated.extraordinaryItems < 0 ? ')' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Income Before Tax */}
      <div style={{ marginBottom: '12px', background: '#fef3c7', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700', color: '#92400e' }}>{getFieldDisplayName('incomeBeforeTax')}</span>
          <span style={{ fontWeight: '700', color: '#92400e' }}>${fmt(aggregated.incomeBeforeTax)}</span>
        </div>
      </div>

      {/* Income Taxes - Always render this section (same as DataReviewTab) */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Income Taxes</div>
        {(() => {
          // Parse values carefully - handle null, undefined, strings, and numbers
          const stateTax = aggregated.stateIncomeTaxes !== null && aggregated.stateIncomeTaxes !== undefined 
            ? (typeof aggregated.stateIncomeTaxes === 'string' ? parseFloat(aggregated.stateIncomeTaxes) : Number(aggregated.stateIncomeTaxes)) || 0 
            : 0;
          const federalTax = aggregated.federalIncomeTaxes !== null && aggregated.federalIncomeTaxes !== undefined 
            ? (typeof aggregated.federalIncomeTaxes === 'string' ? parseFloat(aggregated.federalIncomeTaxes) : Number(aggregated.federalIncomeTaxes)) || 0 
            : 0;
          
          // Always show the section - show individual lines only if > 0
          const hasStateTax = stateTax > 0;
          const hasFederalTax = federalTax > 0;
          
          if (!hasStateTax && !hasFederalTax) {
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px', color: '#94a3b8', fontStyle: 'italic' }}>
                <span>No income taxes recorded</span>
                <span>$0</span>
              </div>
            );
          }
          
          return (
            <>
              {hasStateTax && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                  <span style={{ color: '#475569' }}>{getFieldDisplayName('stateIncomeTaxes')}</span>
                  <span style={{ color: '#475569' }}>(${fmt(stateTax)})</span>
                </div>
              )}
              {hasFederalTax && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                  <span style={{ color: '#475569' }}>{getFieldDisplayName('federalIncomeTaxes')}</span>
                  <span style={{ color: '#475569' }}>(${fmt(federalTax)})</span>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Net Income */}
      <div style={{ marginBottom: '12px', background: aggregated.netIncome >= 0 ? '#16a34a' : '#ef4444', color: 'white', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700' }}>{getFieldDisplayName('netIncome')}</span>
          <span style={{ fontWeight: '700' }}>${fmt(aggregated.netIncome)}</span>
        </div>
        <div style={{ fontSize: '13px', textAlign: 'right' }}>
          {aggregated.netMargin.toFixed(1)}% margin
        </div>
      </div>
    </div>
  );
}

export default function AggregatedFinancialsTab({
  selectedCompanyId,
  statementType,
  statementPeriod,
  statementDisplay
}: AggregatedFinancialsTabProps) {
  // Use master data store - SAME as DataReviewTab
  const { monthlyData, loading: masterDataLoading, error: masterDataError } = useMasterData(selectedCompanyId);

  // Show loading state
  if (masterDataLoading) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
          Loading Financial Statements
        </div>
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          Loading data from master data store...
        </p>
      </div>
    );
  }

  // Show error state
  if (masterDataError || !monthlyData || monthlyData.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
          No Financial Data Available
        </div>
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          {masterDataError ? `Error: ${masterDataError}` : 'No master data available for financial statements.'}
        </p>
      </div>
    );
  }

  // Handle Income Statement for all periods
  if (statementType === 'income-statement' && monthlyData.length > 0) {
    const aggregated = calculateAggregatedValues(monthlyData, statementPeriod);
    
    if (!aggregated) {
      return (
        <div style={{ background: 'white', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            No Data Available for Selected Period
          </div>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            There is no financial data available for the selected period: {statementPeriod}.
          </p>
        </div>
      );
    }

    return <IncomeStatement aggregated={aggregated} />;
  }

  // Handle other cases or show not implemented message
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '48px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
      <div style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
        Financial Statement Type Not Yet Implemented
      </div>
      <p style={{ fontSize: '14px', color: '#64748b' }}>
        The combination of {statementType} for {statementPeriod} with {statementDisplay} display is not yet implemented.
        <br />
        Currently only Income Statement is available for all periods.
      </p>
    </div>
  );
}
