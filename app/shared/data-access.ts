/**
 * Shared Data Access Service for Covenants Module
 *
 * This service provides read-only access to existing financial data
 * for covenant calculations. It does NOT modify any existing data
 * or application behavior.
 *
 * Key Principles:
 * - Read-only access to existing processed financial data
 * - No modifications to current data structures or calculations
 * - Complete isolation from main application
 * - Covenant calculations use existing financial metrics
 */

import type { MonthlyDataRow } from '@/app/types';

/**
 * Financial ratios and metrics available for covenant calculations
 */
export interface CovenantFinancialRatios {
  // Leverage Ratios
  totalLeverageRatio: number | null;
  netLeverageRatio: number | null;
  seniorLeverageRatio: number | null;
  debtToEquityRatio: number | null;

  // Coverage Ratios
  interestCoverageRatio: number | null;
  fixedChargeCoverageRatio: number | null;
  debtServiceCoverageRatio: number | null;
  cashFlowCoverageRatio: number | null;

  // Liquidity Ratios
  currentRatio: number | null;
  quickRatio: number | null;
  minimumLiquidity: number | null;

  // Profitability Ratios
  ebitdaMargin: number | null;
  minimumEBITDA: number | null;
  minimumGrossMargin: number | null;
  minimumNetIncome: number | null;

  // Base Financial Metrics (used for calculations)
  totalDebt: number;
  cash: number;
  ebitda: number;
  interestExpense: number;
  netOperatingIncome: number;
  operatingCashFlow: number;
  capex: number;
  debtService: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  revenue: number;
  cogsTotal: number;
  netProfit: number;
}

/**
 * Covenant data access interface
 */
export interface CovenantDataAccess {
  /**
   * Get financial ratios for a specific company and time period
   * @param companyId - The company ID
   * @param monthKey - Optional month key (YYYY-MM format), defaults to latest available
   * @returns Promise<CovenantFinancialRatios | null>
   */
  getFinancialRatios(companyId: string, monthKey?: string): Promise<CovenantFinancialRatios | null>;

  /**
   * Get historical financial ratios for time-series analysis
   * @param companyId - The company ID
   * @param months - Number of months of historical data (default: 12)
   * @returns Promise<CovenantFinancialRatios[]>
   */
  getHistoricalRatios(companyId: string, months?: number): Promise<CovenantFinancialRatios[]>;

  /**
   * Check if financial data is available for a company
   * @param companyId - The company ID
   * @returns Promise<boolean>
   */
  hasFinancialData(companyId: string): Promise<boolean>;
}

/**
 * Calculate EBITDA from monthly financial data
 * EBITDA = Revenue - COGS - Operating Expenses + Interest Expense + Depreciation & Amortization
 */
function calculateEBITDA(data: MonthlyDataRow): number {
  const revenue = data.revenue || 0;
  const cogs = data.cogsTotal || 0;
  const operatingExpenses = data.expense || 0;
  const interestExpense = data.interestExpense || 0;
  const depreciation = data.depreciationAmortization || 0;

  return revenue - cogs - operatingExpenses + interestExpense + depreciation;
}

/**
 * Calculate financial ratios from monthly data
 */
function calculateRatios(data: MonthlyDataRow): CovenantFinancialRatios {
  const ebitda = calculateEBITDA(data);
  const totalDebt = data.ltd || 0; // Long-term debt
  const cash = data.cash || 0;
  const netDebt = totalDebt - cash;
  const interestExpense = data.interestExpense || 0;
  const revenue = data.revenue || 0;
  const cogsTotal = data.cogsTotal || 0;
  const netProfit = data.netProfit || 0;
  const totalAssets = data.totalAssets || 0;
  const totalLiabilities = data.totalLiab || 0;
  const totalEquity = data.totalEquity || 0;
  const currentAssets = data.tca || 0; // Total Current Assets
  const currentLiabilities = data.tcl || 0; // Total Current Liabilities
  const ar = data.ar || 0; // Accounts Receivable
  const inventory = data.inventory || 0;
  const operatingCashFlow = data.netProfit + data.depreciationAmortization; // Approximation
  const capex = 0; // Not directly available in current data structure
  const debtService = interestExpense; // Approximation - would need principal payments

  return {
    // Leverage Ratios
    totalLeverageRatio: ebitda !== 0 ? totalDebt / ebitda : null,
    netLeverageRatio: ebitda !== 0 ? netDebt / ebitda : null,
    seniorLeverageRatio: null, // Senior debt not separately tracked
    debtToEquityRatio: totalEquity !== 0 ? totalDebt / totalEquity : null,

    // Coverage Ratios
    interestCoverageRatio: interestExpense !== 0 ? ebitda / interestExpense : null,
    fixedChargeCoverageRatio: null, // Would need lease payments data
    debtServiceCoverageRatio: debtService !== 0 ? (data.netProfit + data.depreciationAmortization + data.interestExpense) / debtService : null,
    cashFlowCoverageRatio: debtService !== 0 ? (operatingCashFlow - capex) / debtService : null,

    // Liquidity Ratios
    currentRatio: currentLiabilities !== 0 ? currentAssets / currentLiabilities : null,
    quickRatio: currentLiabilities !== 0 ? (currentAssets - inventory) / currentLiabilities : null,
    minimumLiquidity: cash + (data.ar || 0), // Cash + AR approximation

    // Profitability Ratios
    ebitdaMargin: revenue !== 0 ? ebitda / revenue : null,
    minimumEBITDA: ebitda,
    minimumGrossMargin: revenue !== 0 ? (revenue - cogsTotal) / revenue : null,
    minimumNetIncome: netProfit,

    // Base Financial Metrics
    totalDebt,
    cash,
    ebitda,
    interestExpense,
    netOperatingIncome: data.netProfit, // Approximation
    operatingCashFlow,
    capex,
    debtService,
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentAssets,
    currentLiabilities,
    revenue,
    cogsTotal,
    netProfit
  };
}

/**
 * Covenant Data Access Implementation
 * Uses existing financial data through FinancialDataContext
 */
class CovenantDataAccessService implements CovenantDataAccess {
  private financialDataContext: any = null;

  /**
   * Initialize with access to existing financial data context
   * This is injected to maintain isolation
   */
  setFinancialDataContext(context: any) {
    this.financialDataContext = context;
  }

  async getFinancialRatios(companyId: string, monthKey?: string): Promise<CovenantFinancialRatios | null> {
    if (!this.financialDataContext) {
      console.warn('CovenantDataAccess: Financial data context not available');
      return null;
    }

    try {
      // Access existing financial data through the context
      const { monthlyData } = this.financialDataContext;

      if (!monthlyData || monthlyData.length === 0) {
        return null;
      }

      // Find the requested month or use latest
      let targetData: MonthlyDataRow;
      if (monthKey) {
        targetData = monthlyData.find((data: MonthlyDataRow) => data.month === monthKey) || monthlyData[0];
      } else {
        targetData = monthlyData[0]; // Latest month
      }

      return calculateRatios(targetData);
    } catch (error) {
      console.error('CovenantDataAccess: Error accessing financial ratios:', error);
      return null;
    }
  }

  async getHistoricalRatios(companyId: string, months: number = 12): Promise<CovenantFinancialRatios[]> {
    if (!this.financialDataContext) {
      console.warn('CovenantDataAccess: Financial data context not available');
      return [];
    }

    try {
      const { monthlyData } = this.financialDataContext;

      if (!monthlyData || monthlyData.length === 0) {
        return [];
      }

      // Get historical data (limit to requested months)
      const historicalData = monthlyData.slice(0, months);
      return historicalData.map(calculateRatios);
    } catch (error) {
      console.error('CovenantDataAccess: Error accessing historical ratios:', error);
      return [];
    }
  }

  async hasFinancialData(companyId: string): Promise<boolean> {
    if (!this.financialDataContext) {
      return false;
    }

    try {
      const { monthlyData } = this.financialDataContext;
      return monthlyData && monthlyData.length > 0;
    } catch (error) {
      console.error('CovenantDataAccess: Error checking financial data availability:', error);
      return false;
    }
  }
}

// Singleton instance for the covenants module
export const covenantDataAccess = new CovenantDataAccessService();

/**
 * Hook for covenants module to access financial data
 * This provides a clean interface for the isolated covenants module
 */
export function useCovenantDataAccess() {
  return {
    getFinancialRatios: covenantDataAccess.getFinancialRatios.bind(covenantDataAccess),
    getHistoricalRatios: covenantDataAccess.getHistoricalRatios.bind(covenantDataAccess),
    hasFinancialData: covenantDataAccess.hasFinancialData.bind(covenantDataAccess)
  };
}

/**
 * Initialize covenant data access with existing financial context
 * Call this once when the covenants module is loaded
 */
export function initializeCovenantDataAccess(financialDataContext: any) {
  covenantDataAccess.setFinancialDataContext(financialDataContext);
}
