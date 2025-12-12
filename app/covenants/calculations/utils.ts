/**
 * Covenant Calculation Utilities
 *
 * Helper functions and utilities for covenant calculations,
 * validation, and data processing.
 */

import {
  CovenantConfig,
  CovenantType,
  CovenantTestResult,
  CovenantStatus,
  AlertSeverity,
  AlertType
} from '../data/models';

/**
 * Validate covenant configuration
 */
export function validateCovenantConfig(config: CovenantConfig): {
  isValid: boolean;
  errors: string[]
} {
  const errors: string[] = [];

  // Basic validation
  if (!config.name || config.name.trim().length === 0) {
    errors.push('Covenant name is required');
  }

  if (!config.companyId) {
    errors.push('Company ID is required');
  }

  // Type-specific validation
  if (config.covenantType && isQuantitativeCovenant(config.covenantType)) {
    if (config.thresholdValue === undefined && config.minimumValue === undefined && config.maximumValue === undefined) {
      errors.push('Quantitative covenants must have a threshold, minimum, or maximum value');
    }
  }

  // Basket validation for complex covenants
  if (config.covenantType === CovenantType.RESTRICTED_PAYMENTS_BASKET) {
    if (!config.basketLimit || config.basketLimit <= 0) {
      errors.push('Restricted payments basket must have a positive basket limit');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if covenant type requires quantitative thresholds
 */
export function isQuantitativeCovenant(type: CovenantType): boolean {
  const quantitativeTypes = [
    CovenantType.TOTAL_LEVERAGE_RATIO,
    CovenantType.NET_LEVERAGE_RATIO,
    CovenantType.SENIOR_LEVERAGE_RATIO,
    CovenantType.DEBT_TO_EQUITY_RATIO,
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
    CovenantType.MAXIMUM_LEVERAGE,
    CovenantType.MINIMUM_DSCR,
    CovenantType.MINIMUM_NET_WORTH,
    CovenantType.CAPEX_LIMIT,
    CovenantType.RESTRICTED_PAYMENTS_BASKET
  ];
  return quantitativeTypes.includes(type);
}

/**
 * Format covenant value for display
 */
export function formatCovenantValue(value: number | null | undefined, type: CovenantType): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  const isRatio = isRatioType(type);
  const isCurrency = isCurrencyType(type);
  const isPercentage = isPercentageType(type);

  if (isRatio) {
    return value.toFixed(2) + 'x';
  }

  if (isPercentage) {
    return (value * 100).toFixed(1) + '%';
  }

  if (isCurrency) {
    return formatCurrency(value);
  }

  // Default formatting
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M';
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K';
  }

  return value.toFixed(2);
}

/**
 * Check if covenant type represents a ratio
 */
function isRatioType(type: CovenantType): boolean {
  const ratioTypes = [
    CovenantType.TOTAL_LEVERAGE_RATIO,
    CovenantType.NET_LEVERAGE_RATIO,
    CovenantType.SENIOR_LEVERAGE_RATIO,
    CovenantType.DEBT_TO_EQUITY_RATIO,
    CovenantType.INTEREST_COVERAGE_RATIO,
    CovenantType.FIXED_CHARGE_COVERAGE_RATIO,
    CovenantType.DEBT_SERVICE_COVERAGE_RATIO,
    CovenantType.CASH_FLOW_COVERAGE_RATIO,
    CovenantType.CURRENT_RATIO,
    CovenantType.QUICK_RATIO
  ];
  return ratioTypes.includes(type);
}

/**
 * Check if covenant type represents currency values
 */
function isCurrencyType(type: CovenantType): boolean {
  const currencyTypes = [
    CovenantType.MINIMUM_LIQUIDITY,
    CovenantType.MINIMUM_EBITDA,
    CovenantType.MINIMUM_NET_INCOME,
    CovenantType.MINIMUM_NET_WORTH,
    CovenantType.CAPEX_LIMIT,
    CovenantType.RESTRICTED_PAYMENTS_BASKET
  ];
  return currencyTypes.includes(type);
}

/**
 * Check if covenant type represents percentages
 */
function isPercentageType(type: CovenantType): boolean {
  const percentageTypes = [
    CovenantType.MINIMUM_GROSS_MARGIN
  ];
  return percentageTypes.includes(type);
}

/**
 * Format currency value
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Get covenant status color for UI display
 */
export function getCovenantStatusColor(status: CovenantStatus): string {
  switch (status) {
    case CovenantStatus.COMPLIANT:
      return '#10B981'; // Green
    case CovenantStatus.WARNING:
      return '#F59E0B'; // Yellow/Orange
    case CovenantStatus.BREACHED:
      return '#EF4444'; // Red
    case CovenantStatus.NOT_APPLICABLE:
      return '#6B7280'; // Gray
    default:
      return '#6B7280';
  }
}

/**
 * Get alert severity color
 */
export function getAlertSeverityColor(severity: AlertSeverity): string {
  switch (severity) {
    case AlertSeverity.LOW:
      return '#10B981'; // Green
    case AlertSeverity.MEDIUM:
      return '#F59E0B'; // Yellow
    case AlertSeverity.HIGH:
      return '#EF4444'; // Red
    case AlertSeverity.CRITICAL:
      return '#7C2D12'; // Dark Red
    default:
      return '#6B7280';
  }
}

/**
 * Calculate compliance score for a set of covenants
 */
export function calculateComplianceScore(results: CovenantTestResult[]): {
  overallScore: number;
  compliantCount: number;
  warningCount: number;
  breachedCount: number;
  totalCount: number;
} {
  const compliantCount = results.filter(r => r.status === CovenantStatus.COMPLIANT).length;
  const warningCount = results.filter(r => r.status === CovenantStatus.WARNING).length;
  const breachedCount = results.filter(r => r.status === CovenantStatus.BREACHED).length;
  const totalCount = results.length;

  // Weighted score: 100% for compliant, 50% for warning, 0% for breached
  const weightedScore = (compliantCount * 1.0 + warningCount * 0.5 + breachedCount * 0.0);
  const overallScore = totalCount > 0 ? (weightedScore / totalCount) * 100 : 100;

  return {
    overallScore: Math.round(overallScore),
    compliantCount,
    warningCount,
    breachedCount,
    totalCount
  };
}

/**
 * Generate alert recommendations based on test results
 */
export function generateAlertRecommendations(result: CovenantTestResult): string[] {
  const recommendations: string[] = [];

  if (result.status === CovenantStatus.BREACHED) {
    recommendations.push(`Covenant is currently breached. Immediate action required.`);

    if (result.breachSeverity === AlertSeverity.CRITICAL) {
      recommendations.push(`Critical breach detected. Consider immediate remediation plan.`);
    }

    // Covenant-specific recommendations
    switch (result.covenantConfigId) { // This would be the covenant type in real implementation
      case 'total_leverage_ratio':
        recommendations.push(`Consider debt reduction strategies or equity injection to improve leverage ratio.`);
        break;
      case 'interest_coverage_ratio':
        recommendations.push(`Focus on EBITDA improvement or interest expense reduction.`);
        break;
      case 'current_ratio':
        recommendations.push(`Improve working capital management or consider additional financing.`);
        break;
    }
  }

  if (result.status === CovenantStatus.WARNING) {
    recommendations.push(`Covenant is approaching threshold. Monitor closely and develop contingency plans.`);
  }

  return recommendations;
}

/**
 * Validate test result data integrity
 */
export function validateTestResult(result: CovenantTestResult): {
  isValid: boolean;
  errors: string[]
} {
  const errors: string[] = [];

  if (!result.covenantConfigId) {
    errors.push('Covenant config ID is required');
  }

  if (!result.companyId) {
    errors.push('Company ID is required');
  }

  if (!result.testDate) {
    errors.push('Test date is required');
  }

  if (!result.testPeriod) {
    errors.push('Test period is required');
  }

  // Status-specific validation
  if (result.status === CovenantStatus.COMPLIANT || result.status === CovenantStatus.WARNING) {
    if (result.actualValue === undefined) {
      errors.push('Actual value is required for compliant/warning covenants');
    }
    if (result.thresholdValue === undefined) {
      errors.push('Threshold value is required for compliant/warning covenants');
    }
  }

  if (result.isBreached && !result.breachAmount) {
    errors.push('Breach amount is required for breached covenants');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Group test results by category
 */
export function groupResultsByCategory(results: CovenantTestResult[]): {
  financial: CovenantTestResult[];
  negative: CovenantTestResult[];
  affirmative: CovenantTestResult[];
  maintenance: CovenantTestResult[];
  incurrence: CovenantTestResult[];
} {
  // This would need access to covenant configs to determine categories
  // For now, return empty groups
  return {
    financial: [],
    negative: [],
    affirmative: [],
    maintenance: [],
    incurrence: []
  };
}

/**
 * Calculate covenant health trends
 */
export function calculateHealthTrends(
  currentResults: CovenantTestResult[],
  previousResults: CovenantTestResult[]
): {
  improving: number;
  deteriorating: number;
  stable: number;
  total: number;
} {
  // Simple trend calculation - compare current vs previous status
  const trends = {
    improving: 0,
    deteriorating: 0,
    stable: 0,
    total: currentResults.length
  };

  for (const current of currentResults) {
    const previous = previousResults.find(p => p.covenantConfigId === current.covenantConfigId);

    if (!previous) continue;

    const currentScore = getStatusScore(current.status);
    const previousScore = getStatusScore(previous.status);

    if (currentScore > previousScore) {
      trends.improving++;
    } else if (currentScore < previousScore) {
      trends.deteriorating++;
    } else {
      trends.stable++;
    }
  }

  return trends;
}

/**
 * Get numerical score for covenant status (higher is better)
 */
function getStatusScore(status: CovenantStatus): number {
  switch (status) {
    case CovenantStatus.COMPLIANT: return 3;
    case CovenantStatus.WARNING: return 2;
    case CovenantStatus.BREACHED: return 1;
    case CovenantStatus.NOT_APPLICABLE: return 0;
    default: return 0;
  }
}
