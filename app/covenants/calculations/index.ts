/**
 * Covenant Calculations Module
 *
 * Exports all calculation-related functionality for the covenants module.
 */

// Core calculation engine
export { CovenantCalculationEngine } from './engine';

// Utility functions
export {
  validateCovenantConfig,
  isQuantitativeCovenant,
  formatCovenantValue,
  formatCurrency,
  getCovenantStatusColor,
  getAlertSeverityColor,
  calculateComplianceScore,
  generateAlertRecommendations,
  validateTestResult,
  groupResultsByCategory,
  calculateHealthTrends
} from './utils';

// Re-export types for convenience
export type { CovenantCalculationResult } from './engine';
