'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { financialsApi } from '@/lib/api-client';
import type { MonthlyDataRow } from '@/app/types';

// Define the context interface
interface FinancialDataContextType {
  // Data state
  monthlyData: MonthlyDataRow[];
  companyName: string;
  qbRawData: any;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadFinancialData: (companyId: string, companyName: string) => Promise<void>;
  clearFinancialData: () => void;
  refreshFinancialData: () => Promise<void>;

  // Current company tracking
  currentCompanyId: string | null;
}

// Create the context
const FinancialDataContext = createContext<FinancialDataContextType | undefined>(undefined);

// Provider component
interface FinancialDataProviderProps {
  children: ReactNode;
}

export function FinancialDataProvider({ children }: FinancialDataProviderProps) {
  const [monthlyData, setMonthlyData] = useState<MonthlyDataRow[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [qbRawData, setQbRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  // Convert database monthly data to app format
  const convertMonthlyData = useCallback((monthlyDataArray: any[]): MonthlyDataRow[] => {
    return monthlyDataArray.map((m: any) => ({
      date: new Date(m.monthDate),
      month: new Date(m.monthDate).toLocaleDateString('en-US', { month: '2-digit', year: 'numeric' }),
      revenue: m.revenue || 0,
      expense: m.expense || 0,
      cogsPayroll: m.cogsPayroll || 0,
      cogsOwnerPay: m.cogsOwnerPay || 0,
      cogsContractors: m.cogsContractors || 0,
      cogsMaterials: m.cogsMaterials || 0,
      cogsCommissions: m.cogsCommissions || 0,
      cogsOther: m.cogsOther || 0,
      cogsTotal: m.cogsTotal || 0,
      payroll: m.payroll || 0,
      ownerBasePay: m.ownerBasePay || 0,
      benefits: m.benefits || 0,
      insurance: m.insurance || 0,
      professionalFees: m.professionalFees || 0,
      subcontractors: m.subcontractors || 0,
      rent: m.rent || 0,
      taxLicense: m.taxLicense || 0,
      phoneComm: m.phoneComm || 0,
      infrastructure: m.infrastructure || 0,
      autoTravel: m.autoTravel || 0,
      salesExpense: m.salesExpense || 0,
      marketing: m.marketing || 0,
      trainingCert: m.trainingCert || 0,
      mealsEntertainment: m.mealsEntertainment || 0,
      interestExpense: m.interestExpense || 0,
      depreciationAmortization: m.depreciationAmortization || 0,
      otherExpense: m.otherExpense || 0,
      nonOperatingIncome: m.nonOperatingIncome || 0,
      extraordinaryItems: m.extraordinaryItems || 0,
      netProfit: m.netProfit || 0,
      ownersRetirement: 0,
      operatingExpenseTotal: m.expense || 0,
      cash: m.cash || 0,
      ar: m.ar || 0,
      inventory: m.inventory || 0,
      otherCA: m.otherCA || 0,
      tca: m.tca || 0,
      fixedAssets: m.fixedAssets || 0,
      otherAssets: m.otherAssets || 0,
      totalAssets: m.totalAssets || 0,
      ap: m.ap || 0,
      otherCL: m.otherCL || 0,
      tcl: m.tcl || 0,
      ltd: m.ltd || 0,
      totalLiab: m.totalLiab || 0,
      ownersCapital: m.ownersCapital || 0,
      ownersDraw: m.ownersDraw || 0,
      commonStock: m.commonStock || 0,
      preferredStock: m.preferredStock || 0,
      retainedEarnings: m.retainedEarnings || 0,
      additionalPaidInCapital: m.additionalPaidInCapital || 0,
      treasuryStock: m.treasuryStock || 0,
      totalEquity: m.totalEquity || 0,
      totalLAndE: m.totalLAndE || 0,
      // LOB Breakdown fields
      revenueBreakdown: m.revenueBreakdown || null,
      expenseBreakdown: m.expenseBreakdown || null,
      cogsBreakdown: m.cogsBreakdown || null,
      lobBreakdowns: m.lobBreakdowns || null
    }));
  }, []);

  // Load financial data for a company
  const loadFinancialData = useCallback(async (companyId: string, companyNameParam: string) => {
    if (!companyId) {
      console.warn('No companyId provided to loadFinancialData');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCurrentCompanyId(companyId);
    setCompanyName(companyNameParam);

    try {
      console.log(`📂 LOADING FINANCIAL DATA FOR: "${companyNameParam}" (ID: ${companyId})`);

      const { records } = await financialsApi.getByCompany(companyId);
      console.log(`📂 Found ${records.length} financial records for company "${companyNameParam}"`);

      if (!records || records.length === 0) {
        console.log(`🧹 No financial records found for company "${companyNameParam}"`);
        setMonthlyData([]);
        setQbRawData(null);
        return;
      }

      const latestRecord = records[0];
      console.log(`📂 Latest record ID: ${latestRecord.id}, created: ${latestRecord.createdAt}`);

      // Handle QuickBooks data
      if (latestRecord.rawData && typeof latestRecord.rawData === 'object' &&
          !Array.isArray(latestRecord.rawData) &&
          (latestRecord.rawData.profitAndLoss || latestRecord.rawData.balanceSheet)) {
        console.log(`🔄 Loading QB data for company: "${companyNameParam}" (${companyId})`);

        setQbRawData({
          ...latestRecord.rawData,
          _companyId: companyId,
          _recordId: latestRecord.id
        });

        // Convert QB monthly data to app format
        const convertedMonthly = convertMonthlyData(latestRecord.monthlyData || []);
        setMonthlyData(convertedMonthly);
        console.log(`✅ Loaded ${convertedMonthly.length} months of QB data`);

      } else if (latestRecord.monthlyData && latestRecord.monthlyData.length > 0) {
        // Handle processed Trial Balance data
        console.log(`📊 Loading processed Trial Balance data: ${latestRecord.monthlyData.length} months`);
        const convertedMonthly = convertMonthlyData(latestRecord.monthlyData);
        setMonthlyData(convertedMonthly);
        setQbRawData(null);
        console.log(`✅ Loaded ${convertedMonthly.length} months of processed data`);
      } else {
        // No monthly data available
        console.log(`⚠️ No monthly data available for company "${companyNameParam}"`);
        setMonthlyData([]);
        setQbRawData(null);
      }

    } catch (err) {
      console.error('❌ Error loading financial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load financial data');
      setMonthlyData([]);
      setQbRawData(null);
    } finally {
      setIsLoading(false);
    }
  }, [convertMonthlyData]);

  // Clear all financial data
  const clearFinancialData = useCallback(() => {
    setMonthlyData([]);
    setCompanyName('');
    setQbRawData(null);
    setError(null);
    setCurrentCompanyId(null);
  }, []);

  // Refresh financial data for current company
  const refreshFinancialData = useCallback(async () => {
    if (currentCompanyId && companyName) {
      await loadFinancialData(currentCompanyId, companyName);
    }
  }, [currentCompanyId, companyName, loadFinancialData]);

  const value: FinancialDataContextType = {
    monthlyData,
    companyName,
    qbRawData,
    isLoading,
    error,
    loadFinancialData,
    clearFinancialData,
    refreshFinancialData,
    currentCompanyId
  };

  return (
    <FinancialDataContext.Provider value={value}>
      {children}
    </FinancialDataContext.Provider>
  );
}

// Custom hook to use the financial data context
export function useFinancialData(): FinancialDataContextType {
  const context = useContext(FinancialDataContext);
  if (context === undefined) {
    throw new Error('useFinancialData must be used within a FinancialDataProvider');
  }
  return context;
}

export default FinancialDataContext;






