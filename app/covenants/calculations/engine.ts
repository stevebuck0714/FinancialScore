/**
 * Covenant Calculation Engine
 *
 * Core calculation logic for testing covenant compliance.
 * Uses existing financial ratios and applies consultant-defined thresholds.
 */

import {
  CovenantConfig,
  CovenantType,
  CovenantStatus,
  CovenantTestResult,
  CovenantTestInput,
  AlertSeverity,
  isFinancialCovenant
} from '../data/models';
import { CovenantFinancialRatios } from '../../shared/data-access';

/**
 * Covenant Calculation Result
 */
export interface CovenantCalculationResult {
  status: CovenantStatus;
  actualValue?: number;
  thresholdValue?: number;
  compliancePercentage?: number;
  isBreached: boolean;
  breachAmount?: number;
  breachSeverity?: AlertSeverity;
  calculationDetails?: Record<string, any>;
  notes?: string;
}

/**
 * Covenant Calculation Engine
 */
export class CovenantCalculationEngine {

  /**
   * Test a single covenant for compliance
   */
  static testCovenantCompliance(
    config: CovenantConfig,
    financialRatios: CovenantFinancialRatios,
    testPeriod: string,
    testDate: Date = new Date()
  ): CovenantCalculationResult {

    if (!isFinancialCovenant(config.covenantType)) {
      // Handle non-financial covenants (qualitative)
      return this.testQualitativeCovenant(config);
    }

    // Handle financial covenants (quantitative)
    return this.testFinancialCovenant(config, financialRatios);
  }

  /**
   * Test financial covenant compliance
   */
  private static testFinancialCovenant(
    config: CovenantConfig,
    ratios: CovenantFinancialRatios
  ): CovenantCalculationResult {

    const result: CovenantCalculationResult = {
      status: CovenantStatus.NOT_APPLICABLE,
      isBreached: false,
      calculationDetails: {}
    };

    let actualValue: number | null = null;
    let thresholdValue: number | null = null;

    // Extract actual value based on covenant type
    switch (config.covenantType) {
      // Leverage Ratios
      case CovenantType.TOTAL_LEVERAGE_RATIO:
        actualValue = ratios.totalLeverageRatio;
        thresholdValue = config.maximumValue || config.thresholdValue;
        break;

      case CovenantType.NET_LEVERAGE_RATIO:
        actualValue = ratios.netLeverageRatio;
        thresholdValue = config.maximumValue || config.thresholdValue;
        break;

      case CovenantType.SENIOR_LEVERAGE_RATIO:
        actualValue = ratios.seniorLeverageRatio;
        thresholdValue = config.maximumValue || config.thresholdValue;
        break;

      case CovenantType.DEBT_TO_EQUITY_RATIO:
        actualValue = ratios.debtToEquityRatio;
        thresholdValue = config.maximumValue || config.thresholdValue;
        break;

      // Coverage Ratios
      case CovenantType.INTEREST_COVERAGE_RATIO:
        actualValue = ratios.interestCoverageRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.FIXED_CHARGE_COVERAGE_RATIO:
        actualValue = ratios.fixedChargeCoverageRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.DEBT_SERVICE_COVERAGE_RATIO:
        actualValue = ratios.debtServiceCoverageRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.CASH_FLOW_COVERAGE_RATIO:
        actualValue = ratios.cashFlowCoverageRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      // Liquidity Ratios
      case CovenantType.CURRENT_RATIO:
        actualValue = ratios.currentRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.QUICK_RATIO:
        actualValue = ratios.quickRatio;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.MINIMUM_LIQUIDITY:
        actualValue = ratios.minimumLiquidity;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      // Profitability Covenants
      case CovenantType.MINIMUM_EBITDA:
        actualValue = ratios.minimumEBITDA;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.MINIMUM_GROSS_MARGIN:
        actualValue = ratios.minimumGrossMargin;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      case CovenantType.MINIMUM_NET_INCOME:
        actualValue = ratios.minimumNetIncome;
        thresholdValue = config.minimumValue || config.thresholdValue;
        break;

      default:
        return {
          ...result,
          notes: `Unsupported covenant type: ${config.covenantType}`
        };
    }

    // If we don't have the required data, mark as not applicable
    if (actualValue === null || actualValue === undefined) {
      return {
        ...result,
        status: CovenantStatus.NOT_APPLICABLE,
        notes: `Required financial data not available for ${config.covenantType}`
      };
    }

    result.actualValue = actualValue;
    result.thresholdValue = thresholdValue || undefined;
    result.calculationDetails = {
      covenantType: config.covenantType,
      actualValue,
      thresholdValue,
      baseMetrics: this.extractBaseMetrics(config.covenantType, ratios)
    };

    // Determine compliance status
    if (thresholdValue === null || thresholdValue === undefined) {
      result.status = CovenantStatus.NOT_APPLICABLE;
      result.notes = 'No threshold configured for this covenant';
      return result;
    }

    // Check compliance based on covenant type
    const isCompliant = this.checkCompliance(config.covenantType, actualValue, thresholdValue);

    if (isCompliant) {
      result.status = CovenantStatus.COMPLIANT;

      // Calculate how close we are to the threshold (for monitoring)
      if (this.isMinimumType(config.covenantType)) {
        // For minimum covenants, higher is better
        result.compliancePercentage = thresholdValue > 0 ? (actualValue / thresholdValue) * 100 : 100;
      } else {
        // For maximum covenants, lower is better
        result.compliancePercentage = actualValue > 0 ? (thresholdValue / actualValue) * 100 : 100;
      }
    } else {
      result.isBreached = true;
      result.breachAmount = Math.abs(actualValue - thresholdValue);
      result.breachSeverity = this.calculateBreachSeverity(config.covenantType, actualValue, thresholdValue);

      // Determine if it's a warning or critical breach
      if (this.isNearThreshold(config.covenantType, actualValue, thresholdValue)) {
        result.status = CovenantStatus.WARNING;
      } else {
        result.status = CovenantStatus.BREACHED;
      }
    }

    return result;
  }

  /**
   * Test qualitative covenant compliance (affirmative/negative covenants)
   */
  private static testQualitativeCovenant(config: CovenantConfig): CovenantCalculationResult {
    // For qualitative covenants, we assume compliant unless manually flagged
    // In a real implementation, this would check for:
    // - Document submissions
    // - Deadline compliance
    // - Manual confirmations
    // - External system integrations

    return {
      status: CovenantStatus.COMPLIANT,
      isBreached: false,
      notes: `${config.covenantType} requires manual verification`,
      calculationDetails: {
        covenantType: config.covenantType,
        qualitative: true,
        requirements: config.requirements || [],
        restrictions: config.restrictions || []
      }
    };
  }

  /**
   * Check if a value complies with the covenant threshold
   */
  private static checkCompliance(covenantType: CovenantType, actualValue: number, thresholdValue: number): boolean {
    switch (covenantType) {
      // Minimum covenants (value must be >= threshold)
      case CovenantType.INTEREST_COVERAGE_RATIO:
      case CovenantType.FIXED_CHARGE_COVERAGE_RATIO:
      case CovenantType.DEBT_SERVICE_COVERAGE_RATIO:
      case CovenantType.CASH_FLOW_COVERAGE_RATIO:
      case CovenantType.CURRENT_RATIO:
      case CovenantType.QUICK_RATIO:
      case CovenantType.MINIMUM_LIQUIDITY:
      case CovenantType.MINIMUM_EBITDA:
      case CovenantType.MINIMUM_GROSS_MARGIN:
      case CovenantType.MINIMUM_NET_INCOME:
      case CovenantType.MINIMUM_DSCR:
      case CovenantType.MINIMUM_NET_WORTH:
        return actualValue >= thresholdValue;

      // Maximum covenants (value must be <= threshold)
      case CovenantType.TOTAL_LEVERAGE_RATIO:
      case CovenantType.NET_LEVERAGE_RATIO:
      case CovenantType.SENIOR_LEVERAGE_RATIO:
      case CovenantType.DEBT_TO_EQUITY_RATIO:
      case CovenantType.MAXIMUM_LEVERAGE:
      case CovenantType.CAPEX_LIMIT:
        return actualValue <= thresholdValue;

      default:
        return true; // Assume compliant for unsupported types
    }
  }

  /**
   * Check if covenant type requires minimum values
   */
  private static isMinimumType(covenantType: CovenantType): boolean {
    const minimumTypes = [
      CovenantType.INTEREST_COVERAGE_RATIO,
      CovenantType.FIXED_CHARGE_COVERAGE_RATIO,
      CovenantType.DEBT_SERVICE_COVERAGE_RATIO,
      CovenantType.CASH_FLOW_COVERAGE_RATIO,
      CovenantType.CURRENT_RATIO,
      CovenantType.QUICK_RATIO,
      CovenantType.MINIMUM_LIQUIDITY,
      CovenantType.MINIMUM_EBITDA,
      CovenantType.MINIMUM_GROSS_MARGIN,
      CovenantType.MINIMUM_NET_INCOME,
      CovenantType.MINIMUM_DSCR,
      CovenantType.MINIMUM_NET_WORTH
    ];
    return minimumTypes.includes(covenantType);
  }

  /**
   * Check if actual value is near the threshold (for warning status)
   */
  private static isNearThreshold(covenantType: CovenantType, actualValue: number, thresholdValue: number): boolean {
    const tolerance = this.getTolerancePercentage(covenantType);
    const threshold = thresholdValue * tolerance;

    if (this.isMinimumType(covenantType)) {
      // For minimum covenants, warn if within tolerance above threshold
      return actualValue >= thresholdValue && actualValue <= (thresholdValue + threshold);
    } else {
      // For maximum covenants, warn if within tolerance below threshold
      return actualValue <= thresholdValue && actualValue >= (thresholdValue - threshold);
    }
  }

  /**
   * Get tolerance percentage for near-threshold warnings
   */
  private static getTolerancePercentage(covenantType: CovenantType): number {
    // Different covenants have different warning tolerances
    switch (covenantType) {
      case CovenantType.TOTAL_LEVERAGE_RATIO:
      case CovenantType.NET_LEVERAGE_RATIO:
      case CovenantType.DEBT_TO_EQUITY_RATIO:
        return 0.10; // 10% tolerance

      case CovenantType.INTEREST_COVERAGE_RATIO:
      case CovenantType.DEBT_SERVICE_COVERAGE_RATIO:
        return 0.15; // 15% tolerance

      case CovenantType.CURRENT_RATIO:
      case CovenantType.QUICK_RATIO:
        return 0.05; // 5% tolerance

      default:
        return 0.10; // 10% default tolerance
    }
  }

  /**
   * Calculate breach severity based on how far from threshold
   */
  private static calculateBreachSeverity(
    covenantType: CovenantType,
    actualValue: number,
    thresholdValue: number
  ): AlertSeverity {
    const deviation = Math.abs(actualValue - thresholdValue) / thresholdValue;

    if (deviation < 0.05) return AlertSeverity.LOW;
    if (deviation < 0.15) return AlertSeverity.MEDIUM;
    if (deviation < 0.30) return AlertSeverity.HIGH;
    return AlertSeverity.CRITICAL;
  }

  /**
   * Extract base metrics used in calculation for transparency
   */
  private static extractBaseMetrics(covenantType: CovenantType, ratios: CovenantFinancialRatios): Record<string, any> {
    switch (covenantType) {
      case CovenantType.TOTAL_LEVERAGE_RATIO:
        return {
          totalDebt: ratios.totalDebt,
          ebitda: ratios.ebitda
        };

      case CovenantType.NET_LEVERAGE_RATIO:
        return {
          totalDebt: ratios.totalDebt,
          cash: ratios.cash,
          ebitda: ratios.ebitda
        };

      case CovenantType.INTEREST_COVERAGE_RATIO:
        return {
          ebitda: ratios.ebitda,
          interestExpense: ratios.interestExpense
        };

      case CovenantType.CURRENT_RATIO:
        return {
          currentAssets: ratios.currentAssets,
          currentLiabilities: ratios.currentLiabilities
        };

      // Add more as needed
      default:
        return {};
    }
  }

  /**
   * Test multiple covenants for a company
   */
  static async testMultipleCovenants(
    configs: CovenantConfig[],
    financialRatios: CovenantFinancialRatios,
    testPeriod: string,
    testDate: Date = new Date()
  ): Promise<CovenantTestResult[]> {

    const results: CovenantTestResult[] = [];

    for (const config of configs) {
      if (!config.isActive) continue;

      const calculation = this.testCovenantCompliance(config, financialRatios, testPeriod, testDate);

      const result: CovenantTestResult = {
        id: `test_${config.id}_${testDate.getTime()}`, // Temporary ID generation
        covenantConfigId: config.id,
        companyId: config.companyId,
        testDate,
        periodStart: new Date(testDate.getFullYear(), testDate.getMonth(), 1), // Start of month
        periodEnd: testDate,
        testPeriod,
        status: calculation.status,
        actualValue: calculation.actualValue,
        thresholdValue: calculation.thresholdValue,
        compliancePercentage: calculation.compliancePercentage,
        isBreached: calculation.isBreached,
        breachAmount: calculation.breachAmount,
        breachSeverity: calculation.breachSeverity,
        calculationDetails: calculation.calculationDetails,
        notes: calculation.notes
      };

      results.push(result);
    }

    return results;
  }

  /**
   * Analyze trends across multiple periods
   */
  static analyzeTrends(
    currentResult: CovenantTestResult,
    historicalResults: CovenantTestResult[],
    periods: number = 3
  ): {
    trendDirection: 'improving' | 'deteriorating' | 'stable';
    trendMagnitude: number;
    isTrendingNegative: boolean;
  } {

    if (historicalResults.length < periods) {
      return {
        trendDirection: 'stable',
        trendMagnitude: 0,
        isTrendingNegative: false
      };
    }

    const recentResults = historicalResults
      .sort((a, b) => b.testDate.getTime() - a.testDate.getTime())
      .slice(0, periods);

    if (!currentResult.actualValue) {
      return {
        trendDirection: 'stable',
        trendMagnitude: 0,
        isTrendingNegative: false
      };
    }

    const values = recentResults
      .map(r => r.actualValue)
      .filter(v => v !== null && v !== undefined) as number[];

    if (values.length < 2) {
      return {
        trendDirection: 'stable',
        trendMagnitude: 0,
        isTrendingNegative: false
      };
    }

    // Calculate trend (simple linear regression slope)
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + (val * index), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    const isMinimumType = this.isMinimumType(currentResult.covenantConfigId as any);
    const isTrendingNegative = isMinimumType ? slope < 0 : slope > 0;

    let trendDirection: 'improving' | 'deteriorating' | 'stable';
    if (Math.abs(slope) < 0.01) {
      trendDirection = 'stable';
    } else {
      trendDirection = isMinimumType
        ? (slope > 0 ? 'improving' : 'deteriorating')
        : (slope < 0 ? 'improving' : 'deteriorating');
    }

    return {
      trendDirection,
      trendMagnitude: Math.abs(slope),
      isTrendingNegative
    };
  }
}
