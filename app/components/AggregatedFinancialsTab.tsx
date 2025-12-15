'use client';

import React from 'react';
import { useMasterData } from '@/lib/master-data-store';

interface AggregatedFinancialsTabProps {
  selectedCompanyId: string;
  statementType: 'income-statement' | 'balance-sheet' | 'income-statement-percent';
  statementPeriod: 'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years';
  statementDisplay: 'monthly' | 'quarterly' | 'annual';
}

export default function AggregatedFinancialsTab({
  selectedCompanyId,
  statementType,
  statementPeriod,
  statementDisplay
}: AggregatedFinancialsTabProps) {
  // Use master data store instead of monthly prop
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

  // Use master data as monthly data
  const monthly = monthlyData;

  console.log('📊 Financial Statement Render Check:', {
    statementType,
    statementPeriod,
    monthlyLength: monthly?.length || 0,
    hasMonthly: !!monthly,
    monthlyFirst: monthly?.[0],
    condition: statementType === 'income-statement' && statementPeriod === 'current-month' && monthly.length > 0
  });

  // Current Month Income Statement
  if (statementType === 'income-statement' && statementPeriod === 'current-month' && monthly.length > 0) {
    const currentMonth = monthly[monthly.length - 1];
    const monthDate = new Date(currentMonth.monthDate || currentMonth.date || currentMonth.month);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Revenue
    const revenue = currentMonth.revenue || 0;

    // Cost of Goods Sold
    const cogsPayroll = currentMonth.cogsPayroll || 0;
    const cogsOwnerPay = currentMonth.cogsOwnerPay || 0;
    const cogsContractors = currentMonth.cogsContractors || 0;
    const cogsMaterials = currentMonth.cogsMaterials || 0;
    const cogsCommissions = currentMonth.cogsCommissions || 0;
    const cogsOther = currentMonth.cogsOther || 0;
    const cogs = cogsPayroll + cogsOwnerPay + cogsContractors + cogsMaterials + cogsCommissions + cogsOther;

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    // Operating Expenses - All fields that have data from DataReviewTab
    const payroll = currentMonth.payroll || 0;
    const benefits = currentMonth.benefits || 0;
    const insurance = currentMonth.insurance || 0;
    const professionalFees = currentMonth.professionalFees || 0;
    const subcontractors = currentMonth.subcontractors || 0;
    const rent = currentMonth.rent || 0;
    const taxLicense = currentMonth.taxLicense || 0;
    const phoneComm = currentMonth.phoneComm || 0;
    const infrastructure = currentMonth.infrastructure || 0;
    const autoTravel = currentMonth.autoTravel || 0;
    const salesExpense = currentMonth.salesExpense || 0;
    const marketing = currentMonth.marketing || 0;
    const mealsEntertainment = currentMonth.mealsEntertainment || 0;
    const otherExpense = currentMonth.otherExpense || 0;

    // Calculate total operating expenses including all expense fields from DataReviewTab
    const totalOpex = payroll + benefits + insurance + professionalFees + subcontractors +
                     rent + taxLicense + phoneComm + infrastructure + autoTravel +
                     salesExpense + marketing + mealsEntertainment + otherExpense;

    const operatingIncome = grossProfit - totalOpex;
    const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;

    // Other Income/Expense
    const interestExpense = currentMonth.interestExpense || 0;
    const nonOperatingIncome = currentMonth.nonOperatingIncome || 0;
    const extraordinaryItems = currentMonth.extraordinaryItems || 0;

    const netIncome = operatingIncome - interestExpense + nonOperatingIncome + extraordinaryItems;
    const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: '32px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>Income Statement</h2>
            <div style={{ fontSize: '14px', color: '#64748b' }}>For the Month Ended {monthName}</div>
          </div>

          {/* Revenue Section */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>Revenue</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>${revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {/* COGS Section */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Cost of Goods Sold</div>
            {cogsPayroll > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Payroll</span>
                <span style={{ color: '#475569' }}>${cogsPayroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {cogsOwnerPay > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Owner Pay</span>
                <span style={{ color: '#475569' }}>${cogsOwnerPay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {cogsContractors > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Contractors</span>
                <span style={{ color: '#475569' }}>${cogsContractors.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {cogsMaterials > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Materials</span>
                <span style={{ color: '#475569' }}>${cogsMaterials.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {cogsCommissions > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Commissions</span>
                <span style={{ color: '#475569' }}>${cogsCommissions.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {cogsOther > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>COGS - Other</span>
                <span style={{ color: '#475569' }}>${cogsOther.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>Total COGS</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>${cogs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {/* Gross Profit */}
          <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: '700', color: '#1e40af' }}>Gross Profit</span>
              <span style={{ fontWeight: '700', color: '#1e40af' }}>${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
              {grossMargin.toFixed(1)}% margin
            </div>
          </div>

          {/* Operating Expenses */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Operating Expenses</div>
            {payroll > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Payroll</span>
                <span style={{ color: '#475569' }}>${payroll.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {benefits > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Benefits</span>
                <span style={{ color: '#475569' }}>${benefits.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {insurance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Insurance</span>
                <span style={{ color: '#475569' }}>${insurance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {professionalFees > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Professional Services</span>
                <span style={{ color: '#475569' }}>${professionalFees.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {subcontractors > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Subcontractors</span>
                <span style={{ color: '#475569' }}>${subcontractors.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {rent > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Rent/Lease</span>
                <span style={{ color: '#475569' }}>${rent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {taxLicense > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Tax & License</span>
                <span style={{ color: '#475569' }}>${taxLicense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {phoneComm > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Phone & Communication</span>
                <span style={{ color: '#475569' }}>${phoneComm.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {infrastructure > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Infrastructure/Utilities</span>
                <span style={{ color: '#475569' }}>${infrastructure.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {autoTravel > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Auto & Travel</span>
                <span style={{ color: '#475569' }}>${autoTravel.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {salesExpense > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Sales & Marketing</span>
                <span style={{ color: '#475569' }}>${salesExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {marketing > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Marketing</span>
                <span style={{ color: '#475569' }}>${marketing.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {mealsEntertainment > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Meals & Entertainment</span>
                <span style={{ color: '#475569' }}>${mealsEntertainment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            {otherExpense > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                <span style={{ color: '#475569' }}>Other Expenses</span>
                <span style={{ color: '#475569' }}>${otherExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>Total Operating Expenses</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>${totalOpex.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          {/* Operating Income */}
          <div style={{ marginBottom: '12px', background: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: '700', color: '#1e40af' }}>Operating Income</span>
              <span style={{ fontWeight: '700', color: '#1e40af' }}>${operatingIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ fontSize: '13px', color: '#1e40af', textAlign: 'right' }}>
              {operatingMargin.toFixed(1)}% margin
            </div>
          </div>

          {/* Other Income/Expense */}
          {(interestExpense > 0 || nonOperatingIncome !== 0 || extraordinaryItems !== 0) && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Other Income & Expense</div>
              {interestExpense > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                  <span style={{ color: '#475569' }}>Interest Expense</span>
                  <span style={{ color: '#475569' }}>(${interestExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})</span>
                </div>
              )}
              {nonOperatingIncome !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                  <span style={{ color: '#475569' }}>Non-Operating Income</span>
                  <span style={{ color: nonOperatingIncome >= 0 ? '#10b981' : '#ef4444' }}>
                    {nonOperatingIncome >= 0 ? '$' : '($'}${Math.abs(nonOperatingIncome).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{nonOperatingIncome < 0 ? ')' : ''}
                  </span>
                </div>
              )}
              {extraordinaryItems !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 20px', fontSize: '14px' }}>
                  <span style={{ color: '#475569' }}>Extraordinary Items</span>
                  <span style={{ color: extraordinaryItems >= 0 ? '#10b981' : '#ef4444' }}>
                    {extraordinaryItems >= 0 ? '$' : '($'}${Math.abs(extraordinaryItems).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{extraordinaryItems < 0 ? ')' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Net Income */}
          <div style={{ marginBottom: '12px', background: '#16a34a', color: 'white', padding: '12px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: '700' }}>Net Income</span>
              <span style={{ fontWeight: '700' }}>${netIncome.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ fontSize: '13px', textAlign: 'right' }}>
              {netMargin.toFixed(1)}% margin
            </div>
          </div>
        </div>
    );
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
        Currently only Current Month Income Statement is available.
      </p>
    </div>
  );
}
