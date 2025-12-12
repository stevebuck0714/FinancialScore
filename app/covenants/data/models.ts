/**
 * Covenant Data Models
 *
 * These models define the data structures for covenant configurations,
 * tracking, and alerts. They are completely separate from the main
 * application data models and can be easily removed.
 */

// ============================================================================
// ENUMS AND TYPES
// ============================================================================

export enum CovenantType {
  // Financial Covenants
  TOTAL_LEVERAGE_RATIO = 'total_leverage_ratio',
  NET_LEVERAGE_RATIO = 'net_leverage_ratio',
  SENIOR_LEVERAGE_RATIO = 'senior_leverage_ratio',
  DEBT_TO_EQUITY_RATIO = 'debt_to_equity_ratio',
  INTEREST_COVERAGE_RATIO = 'interest_coverage_ratio',
  FIXED_CHARGE_COVERAGE_RATIO = 'fixed_charge_coverage_ratio',
  DEBT_SERVICE_COVERAGE_RATIO = 'debt_service_coverage_ratio',
  CASH_FLOW_COVERAGE_RATIO = 'cash_flow_coverage_ratio',
  CURRENT_RATIO = 'current_ratio',
  QUICK_RATIO = 'quick_ratio',
  MINIMUM_LIQUIDITY = 'minimum_liquidity',
  MINIMUM_EBITDA = 'minimum_ebitda',
  MINIMUM_GROSS_MARGIN = 'minimum_gross_margin',
  MINIMUM_NET_INCOME = 'minimum_net_income',

  // Negative Covenants (restrictions)
  DEBT_INCURRENCE = 'debt_incurrence',
  LIEN_RESTRICTION = 'lien_restriction',
  DIVIDEND_RESTRICTION = 'dividend_restriction',
  CAPEX_LIMIT = 'capex_limit',
  ASSET_SALE_RESTRICTION = 'asset_sale_restriction',
  MAND_A_RESTRICTION = 'mand_a_restriction',

  // Affirmative Covenants (requirements)
  FINANCIAL_REPORTING = 'financial_reporting',
  INSURANCE_MAINTENANCE = 'insurance_maintenance',
  TAX_PAYMENT = 'tax_payment',
  COMPLIANCE_CERTIFICATE = 'compliance_certificate',
  COLLATERAL_MAINTENANCE = 'collateral_maintenance',

  // Maintenance Covenants
  MAXIMUM_LEVERAGE = 'maximum_leverage',
  MINIMUM_DSCR = 'minimum_dscr',
  MINIMUM_NET_WORTH = 'minimum_net_worth',

  // Incurrence Covenants
  INCURRENCE_LEVERAGE_TEST = 'incurrence_leverage_test',
  INTEREST_COVERAGE_INCURRENCE = 'interest_coverage_incurrence',
  RESTRICTED_PAYMENTS_BASKET = 'restricted_payments_basket'
}

export enum CovenantCategory {
  FINANCIAL = 'financial',
  NEGATIVE = 'negative',
  AFFIRMATIVE = 'affirmative',
  MAINTENANCE = 'maintenance',
  INCURRENCE = 'incurrence'
}

export enum CovenantStatus {
  COMPLIANT = 'compliant',
  WARNING = 'warning',
  BREACHED = 'breached',
  NOT_APPLICABLE = 'not_applicable'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertType {
  BREACH = 'breach',
  APPROACHING_LIMIT = 'approaching_limit',
  TRENDING_NEGATIVE = 'trending_negative',
  COMPLIANCE_RESTORED = 'compliance_restored'
}

// ============================================================================
// CORE COVENANT MODELS
// ============================================================================

/**
 * Covenant Configuration - Defines a covenant threshold/requirement set by a consultant
 */
export interface CovenantConfig {
  id: string;
  companyId: string;
  covenantType: CovenantType;
  category: CovenantCategory;

  // Basic Info
  name: string;
  description?: string;
  isActive: boolean;

  // Threshold Values (for quantitative covenants)
  thresholdValue?: number;        // e.g., 4.0 for leverage ratio
  thresholdUnit?: string;         // e.g., "x", "%", "$", "days"
  minimumValue?: number;          // For minimum requirements
  maximumValue?: number;          // For maximum limits

  // Qualitative Requirements (for non-financial covenants)
  requirements?: string[];        // List of requirements/descriptions
  restrictions?: string[];        // List of restrictions
  deadlines?: Date[];            // Important dates/deadlines

  // Basket/Limit Configurations (for complex covenants)
  basketLimit?: number;          // Dollar amount for baskets
  basketType?: 'fixed' | 'growing' | 'rolling'; // Basket behavior
  exceptions?: string[];         // Allowed exceptions

  // Testing Configuration
  testFrequency: 'continuous' | 'monthly' | 'quarterly' | 'annual';
  testPeriod?: string;           // e.g., "LTM", "current_month"

  // Metadata
  createdBy: string;            // User ID who created
  createdAt: Date;
  updatedAt: Date;
  lastTestedAt?: Date;
  notes?: string;
}

/**
 * Covenant Test Result - Records the outcome of covenant compliance testing
 */
export interface CovenantTestResult {
  id: string;
  covenantConfigId: string;
  companyId: string;

  // Test Details
  testDate: Date;
  periodStart: Date;
  periodEnd: Date;
  testPeriod: string;           // e.g., "2024-01", "LTM"

  // Results
  status: CovenantStatus;
  actualValue?: number;
  thresholdValue?: number;
  compliancePercentage?: number; // How close to threshold (as percentage)

  // Breach Details
  isBreached: boolean;
  breachAmount?: number;        // How much over/under threshold
  breachSeverity?: AlertSeverity;

  // Trend Analysis
  previousValue?: number;
  valueChange?: number;
  trendDirection?: 'improving' | 'deteriorating' | 'stable';

  // Additional Data
  calculationDetails?: Record<string, any>; // Store calculation components
  notes?: string;
}

/**
 * Covenant Alert Configuration - Defines when and how alerts are triggered
 */
export interface CovenantAlertConfig {
  id: string;
  covenantConfigId: string;
  companyId: string;

  // Alert Triggers
  alertOnBreach: boolean;
  breachSeverity: AlertSeverity;

  alertOnApproaching: boolean;
  approachingThreshold: number;    // e.g., 80% of limit triggers warning

  alertOnTrending: boolean;
  trendPeriod: number;            // months to analyze trend
  trendThreshold: number;         // percentage change that triggers alert

  // Notification Settings
  notifyUsers: string[];          // User IDs to notify
  notifyConsultants: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;

  // Escalation
  escalationEnabled: boolean;
  escalationDays: number;         // Days after breach to escalate
  escalationSeverity: AlertSeverity;

  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

/**
 * Covenant Alert - Individual alert instances
 */
export interface CovenantAlert {
  id: string;
  covenantConfigId: string;
  companyId: string;

  // Alert Details
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;

  // Related Data
  testResultId?: string;
  actualValue?: number;
  thresholdValue?: number;
  breachAmount?: number;

  // Status
  isActive: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;

  // Notification Status
  emailSent: boolean;
  inAppRead: boolean;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// COMPOSITE MODELS
// ============================================================================

/**
 * Complete Covenant Definition - Combines config with current status
 */
export interface CovenantDefinition {
  config: CovenantConfig;
  latestTest?: CovenantTestResult;
  alerts: CovenantAlert[];
  alertConfig: CovenantAlertConfig;
}

/**
 * Company Covenant Summary - Overview of all covenants for a company
 */
export interface CompanyCovenantSummary {
  companyId: string;
  totalCovenants: number;
  compliantCount: number;
  warningCount: number;
  breachedCount: number;
  activeAlerts: number;

  // Category breakdown
  financialCovenants: CovenantSummary;
  negativeCovenants: CovenantSummary;
  affirmativeCovenants: CovenantSummary;
  maintenanceCovenants: CovenantSummary;
  incurrenceCovenants: CovenantSummary;

  lastUpdated: Date;
}

export interface CovenantSummary {
  total: number;
  compliant: number;
  warning: number;
  breached: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Covenant Threshold Definition - For setting up new covenants
 */
export interface CovenantThresholdDefinition {
  type: CovenantType;
  category: CovenantCategory;
  name: string;
  description: string;

  // Threshold configuration
  defaultThreshold?: number;
  thresholdUnit?: string;
  minValue?: number;
  maxValue?: number;

  // Validation rules
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Covenant Test Input - Data needed to test covenant compliance
 */
export interface CovenantTestInput {
  covenantConfig: CovenantConfig;
  financialData: {
    totalDebt: number;
    cash: number;
    ebitda: number;
    interestExpense: number;
    totalEquity: number;
    currentAssets: number;
    currentLiabilities: number;
    revenue: number;
    cogsTotal: number;
    netProfit: number;
    // Add other metrics as needed
  };
  testPeriod: string;
  testDate: Date;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default covenant threshold definitions for quick setup
 */
export const DEFAULT_COVENANT_DEFINITIONS: CovenantThresholdDefinition[] = [
  // Leverage Covenants
  {
    type: CovenantType.TOTAL_LEVERAGE_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Total Leverage Ratio',
    description: 'Total Debt ÷ EBITDA',
    defaultThreshold: 4.0,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 10,
    required: false
  },
  {
    type: CovenantType.NET_LEVERAGE_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Net Leverage Ratio',
    description: '(Total Debt - Cash) ÷ EBITDA',
    defaultThreshold: 3.5,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 10,
    required: false
  },
  {
    type: CovenantType.DEBT_TO_EQUITY_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Debt-to-Equity Ratio',
    description: 'Total Debt ÷ Shareholders\' Equity',
    defaultThreshold: 2.0,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 5,
    required: false
  },

  // Coverage Covenants
  {
    type: CovenantType.INTEREST_COVERAGE_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Interest Coverage Ratio',
    description: 'EBITDA ÷ Interest Expense',
    defaultThreshold: 3.0,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 10,
    required: false
  },
  {
    type: CovenantType.DEBT_SERVICE_COVERAGE_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Debt Service Coverage Ratio',
    description: 'Net Operating Income ÷ Debt Service',
    defaultThreshold: 1.25,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 5,
    required: false
  },

  // Liquidity Covenants
  {
    type: CovenantType.CURRENT_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Current Ratio',
    description: 'Current Assets ÷ Current Liabilities',
    defaultThreshold: 1.5,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 5,
    required: false
  },
  {
    type: CovenantType.QUICK_RATIO,
    category: CovenantCategory.FINANCIAL,
    name: 'Quick Ratio',
    description: '(Cash + AR + Marketable Securities) ÷ Current Liabilities',
    defaultThreshold: 1.0,
    thresholdUnit: 'x',
    minValue: 0,
    maxValue: 3,
    required: false
  }
];

// ============================================================================
// TYPE GUARDS AND UTILITIES
// ============================================================================

/**
 * Type guard to check if a covenant type is financial
 */
export function isFinancialCovenant(type: CovenantType): boolean {
  const financialTypes: CovenantType[] = [
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
    CovenantType.MINIMUM_NET_INCOME
  ];
  return financialTypes.includes(type);
}

/**
 * Get covenant category from type
 */
export function getCovenantCategory(type: CovenantType): CovenantCategory {
  if (isFinancialCovenant(type)) return CovenantCategory.FINANCIAL;

  const categoryMap: Record<CovenantType, CovenantCategory> = {
    [CovenantType.DEBT_INCURRENCE]: CovenantCategory.NEGATIVE,
    [CovenantType.LIEN_RESTRICTION]: CovenantCategory.NEGATIVE,
    [CovenantType.DIVIDEND_RESTRICTION]: CovenantCategory.NEGATIVE,
    [CovenantType.CAPEX_LIMIT]: CovenantCategory.NEGATIVE,
    [CovenantType.ASSET_SALE_RESTRICTION]: CovenantCategory.NEGATIVE,
    [CovenantType.MAND_A_RESTRICTION]: CovenantCategory.NEGATIVE,

    [CovenantType.FINANCIAL_REPORTING]: CovenantCategory.AFFIRMATIVE,
    [CovenantType.INSURANCE_MAINTENANCE]: CovenantCategory.AFFIRMATIVE,
    [CovenantType.TAX_PAYMENT]: CovenantCategory.AFFIRMATIVE,
    [CovenantType.COMPLIANCE_CERTIFICATE]: CovenantCategory.AFFIRMATIVE,
    [CovenantType.COLLATERAL_MAINTENANCE]: CovenantCategory.AFFIRMATIVE,

    [CovenantType.MAXIMUM_LEVERAGE]: CovenantCategory.MAINTENANCE,
    [CovenantType.MINIMUM_DSCR]: CovenantCategory.MAINTENANCE,
    [CovenantType.MINIMUM_NET_WORTH]: CovenantCategory.MAINTENANCE,

    [CovenantType.INCURRENCE_LEVERAGE_TEST]: CovenantCategory.INCURRENCE,
    [CovenantType.INTEREST_COVERAGE_INCURRENCE]: CovenantCategory.INCURRENCE,
    [CovenantType.RESTRICTED_PAYMENTS_BASKET]: CovenantCategory.INCURRENCE
  };

  return categoryMap[type] || CovenantCategory.FINANCIAL;
}

/**
 * Get color for covenant status
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
