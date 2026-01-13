/**
 * Covenant Alert Service
 *
 * Manages alert generation, configuration, and notification delivery
 * for covenant breaches and trending issues.
 */

import {
  CovenantTestResult,
  CovenantAlert,
  CovenantAlertConfig,
  AlertType,
  AlertSeverity,
  getCovenantStatusColor
} from '../data/models';
import { CovenantCalculationEngine } from '../calculations/engine';
import { generateAlertRecommendations } from '../calculations/utils';

/**
 * Alert Generation Service
 */
export class CovenantAlertService {

  /**
   * Generate alerts based on covenant test results
   */
  static async generateAlerts(
    testResults: CovenantTestResult[],
    alertConfigs: CovenantAlertConfig[],
    historicalResults?: CovenantTestResult[]
  ): Promise<CovenantAlert[]> {

    const alerts: CovenantAlert[] = [];

    for (const result of testResults) {
      const config = alertConfigs.find(c => c.covenantConfigId === result.covenantConfigId);
      if (!config || !config.isActive) continue;

      const resultAlerts = await this.generateAlertsForResult(result, config, historicalResults);
      alerts.push(...resultAlerts);
    }

    return alerts;
  }

  /**
   * Generate alerts for a single test result
   */
  private static async generateAlertsForResult(
    result: CovenantTestResult,
    config: CovenantAlertConfig,
    historicalResults?: CovenantTestResult[]
  ): Promise<CovenantAlert[]> {

    const alerts: CovenantAlert[] = [];

    // Check for breach alerts
    if (result.isBreached && config.alertOnBreach) {
      alerts.push(this.createBreachAlert(result, config));
    }

    // Check for approaching limit alerts
    if (config.alertOnApproaching && this.isApproachingLimit(result, config)) {
      alerts.push(this.createApproachingAlert(result, config));
    }

    // Check for trending alerts
    if (config.alertOnTrending && historicalResults) {
      const trendingAlert = this.createTrendingAlert(result, config, historicalResults);
      if (trendingAlert) {
        alerts.push(trendingAlert);
      }
    }

    return alerts;
  }

  /**
   * Create a breach alert
   */
  private static createBreachAlert(
    result: CovenantTestResult,
    config: CovenantAlertConfig
  ): CovenantAlert {

    const breachAmount = result.breachAmount || 0;
    const breachSeverity = result.breachSeverity || AlertSeverity.MEDIUM;

    return {
      id: `alert_breach_${result.id}_${Date.now()}`,
      covenantConfigId: result.covenantConfigId,
      companyId: result.companyId,
      alertType: AlertType.BREACH,
      severity: breachSeverity,
      title: `Covenant Breach: ${result.covenantConfigId}`,
      message: `Covenant has been breached by ${this.formatBreachAmount(breachAmount)}. Immediate attention required.`,
      actualValue: result.actualValue,
      thresholdValue: result.thresholdValue,
      breachAmount,
      isActive: true,
      createdAt: new Date()
    };
  }

  /**
   * Create an approaching limit alert
   */
  private static createApproachingAlert(
    result: CovenantTestResult,
    config: CovenantAlertConfig
  ): CovenantAlert {

    const proximityPercent = this.calculateProximityToThreshold(result, config);

    return {
      id: `alert_approaching_${result.id}_${Date.now()}`,
      covenantConfigId: result.covenantConfigId,
      companyId: result.companyId,
      alertType: AlertType.APPROACHING_LIMIT,
      severity: AlertSeverity.MEDIUM,
      title: `Covenant Approaching Limit: ${result.covenantConfigId}`,
      message: `Covenant is ${proximityPercent}% from threshold. Monitor closely.`,
      actualValue: result.actualValue,
      thresholdValue: result.thresholdValue,
      isActive: true,
      createdAt: new Date()
    };
  }

  /**
   * Create a trending alert if needed
   */
  private static createTrendingAlert(
    result: CovenantTestResult,
    config: CovenantAlertConfig,
    historicalResults: CovenantTestResult[]
  ): CovenantAlert | null {

    // Get historical results for this covenant
    const historical = historicalResults
      .filter(h => h.covenantConfigId === result.covenantConfigId)
      .sort((a, b) => b.testDate.getTime() - a.testDate.getTime())
      .slice(0, config.trendPeriod);

    if (historical.length < config.trendPeriod) {
      return null; // Not enough historical data
    }

    // Analyze trend
    const trend = CovenantCalculationEngine.analyzeTrends(result, historical, config.trendPeriod);

    if (!trend.isTrendingNegative) {
      return null; // Not trending negatively
    }

    // Check if trend magnitude exceeds threshold
    if (Math.abs(trend.trendMagnitude) < config.trendThreshold) {
      return null; // Trend not significant enough
    }

    return {
      id: `alert_trending_${result.id}_${Date.now()}`,
      covenantConfigId: result.covenantConfigId,
      companyId: result.companyId,
      alertType: AlertType.TRENDING_NEGATIVE,
      severity: AlertSeverity.LOW,
      title: `Covenant Trending Negative: ${result.covenantConfigId}`,
      message: `Covenant is trending ${trend.trendDirection} over the last ${config.trendPeriod} periods. Monitor closely.`,
      actualValue: result.actualValue,
      thresholdValue: result.thresholdValue,
      isActive: true,
      createdAt: new Date()
    };
  }

  /**
   * Check if result is approaching the configured limit
   */
  private static isApproachingLimit(
    result: CovenantTestResult,
    config: CovenantAlertConfig
  ): boolean {

    if (!result.actualValue || !result.thresholdValue) {
      return false;
    }

    const proximityPercent = this.calculateProximityToThreshold(result, config);
    return proximityPercent >= (100 - config.approachingThreshold);
  }

  /**
   * Calculate proximity to threshold as a percentage
   */
  private static calculateProximityToThreshold(
    result: CovenantTestResult,
    config: CovenantAlertConfig
  ): number {

    if (!result.actualValue || !result.thresholdValue) {
      return 0;
    }

    // For minimum covenants, calculate how close to threshold from below
    // For maximum covenants, calculate how close to threshold from above
    const isMinimumType = this.isMinimumType(result.covenantConfigId);

    if (isMinimumType) {
      // Minimum covenant: actual should be >= threshold
      if (result.actualValue >= result.thresholdValue) {
        return 100; // At or above threshold
      }
      return (result.actualValue / result.thresholdValue) * 100;
    } else {
      // Maximum covenant: actual should be <= threshold
      if (result.actualValue <= result.thresholdValue) {
        return 100; // At or below threshold
      }
      return (result.thresholdValue / result.actualValue) * 100;
    }
  }

  /**
   * Check if covenant type is minimum-based
   */
  private static isMinimumType(covenantConfigId: string): boolean {
    // This is a simplified check - in real implementation, we'd need access to the full config
    const minimumTypes = ['interest_coverage_ratio', 'current_ratio', 'quick_ratio', 'minimum_ebitda'];
    return minimumTypes.some(type => covenantConfigId.includes(type));
  }

  /**
   * Format breach amount for display
   */
  private static formatBreachAmount(amount: number): string {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Send alerts via configured channels
   */
  static async sendAlerts(alerts: CovenantAlert[], config: CovenantAlertConfig): Promise<void> {

    // Group alerts by type for batch processing
    const breachAlerts = alerts.filter(a => a.alertType === AlertType.BREACH);
    const approachingAlerts = alerts.filter(a => a.alertType === AlertType.APPROACHING_LIMIT);
    const trendingAlerts = alerts.filter(a => a.alertType === AlertType.TRENDING_NEGATIVE);

    // Send email notifications
    if (config.emailEnabled) {
      await this.sendEmailAlerts(alerts, config);
    }

    // Send in-app notifications
    if (config.inAppEnabled) {
      await this.sendInAppAlerts(alerts, config);
    }

    // Log alerts for audit trail
    this.logAlerts(alerts);
  }

  /**
   * Send email alerts
   */
  private static async sendEmailAlerts(alerts: CovenantAlert[], config: CovenantAlertConfig): Promise<void> {

    // Group alerts by user for consolidated emails
    const alertsByUser = new Map<string, CovenantAlert[]>();

    for (const alert of alerts) {
      for (const userId of config.notifyUsers) {
        if (!alertsByUser.has(userId)) {
          alertsByUser.set(userId, []);
        }
        alertsByUser.get(userId)!.push(alert);
      }
    }

    // Send consolidated emails
    for (const [userId, userAlerts] of alertsByUser) {
      await this.sendUserEmail(userId, userAlerts, config);
    }
  }

  /**
   * Send in-app alerts
   */
  private static async sendInAppAlerts(alerts: CovenantAlert[], config: CovenantAlertConfig): Promise<void> {
    // In a real implementation, this would integrate with your notification system
    // For now, we'll just log the alerts
    console.log(`📱 Sending ${alerts.length} in-app notifications for ${config.companyId}`);
  }

  /**
   * Send email to specific user
   */
  private static async sendUserEmail(
    userId: string,
    alerts: CovenantAlert[],
    config: CovenantAlertConfig
  ): Promise<void> {

    const breachCount = alerts.filter(a => a.alertType === AlertType.BREACH).length;
    const approachingCount = alerts.filter(a => a.alertType === AlertType.APPROACHING_LIMIT).length;
    const trendingCount = alerts.filter(a => a.alertType === AlertType.TRENDING_NEGATIVE).length;

    const subject = `Covenant Alerts: ${alerts.length} issues require attention`;
    const body = `
Covenant Alert Summary for Company ${config.companyId}

You have ${alerts.length} covenant alerts that require attention:

${breachCount > 0 ? `🚨 ${breachCount} BREACHES - Immediate action required\n` : ''}
${approachingCount > 0 ? `⚠️  ${approachingCount} APPROACHING LIMITS - Monitor closely\n` : ''}
${trendingCount > 0 ? `📈 ${trendingCount} TRENDING ISSUES - Watch for deterioration\n` : ''}

Alert Details:
${alerts.map(alert => `- ${alert.title}: ${alert.message}`).join('\n')}

Recommendations:
${alerts.flatMap(alert => generateAlertRecommendations({
  ...alert,
  covenantConfigId: alert.covenantConfigId,
  testDate: new Date(),
  periodStart: new Date(),
  periodEnd: new Date(),
  testPeriod: 'latest',
  status: 'breached' as any,
  isBreached: alert.alertType === AlertType.BREACH
} as CovenantTestResult)).join('\n')}

Please log into the platform to review these alerts and take appropriate action.
    `.trim();

    // In a real implementation, this would send the email
    console.log(`📧 Sending email to user ${userId}:`, { subject, body });
  }

  /**
   * Log alerts for audit trail
   */
  private static logAlerts(alerts: CovenantAlert[]): void {
    for (const alert of alerts) {
      console.log(`🚨 Covenant Alert [${alert.severity}]: ${alert.title} - ${alert.message}`);
    }
  }

  /**
   * Get active alerts for a company
   */
  static getActiveAlerts(companyId: string, alerts: CovenantAlert[]): CovenantAlert[] {
    return alerts.filter(alert =>
      alert.companyId === companyId &&
      alert.isActive &&
      !alert.resolvedAt
    );
  }

  /**
   * Mark alert as acknowledged
   */
  static acknowledgeAlert(alertId: string, userId: string, alerts: CovenantAlert[]): CovenantAlert[] {
    return alerts.map(alert =>
      alert.id === alertId
        ? { ...alert, acknowledgedBy: userId, acknowledgedAt: new Date() }
        : alert
    );
  }

  /**
   * Mark alert as resolved
   */
  static resolveAlert(alertId: string, alerts: CovenantAlert[]): CovenantAlert[] {
    return alerts.map(alert =>
      alert.id === alertId
        ? { ...alert, resolvedAt: new Date(), isActive: false }
        : alert
    );
  }

  /**
   * Get alert statistics for dashboard
   */
  static getAlertStats(alerts: CovenantAlert[]): {
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
    bySeverity: Record<AlertSeverity, number>;
    byType: Record<AlertType, number>;
  } {

    const active = alerts.filter(a => a.isActive && !a.resolvedAt);
    const acknowledged = alerts.filter(a => a.acknowledgedAt && !a.resolvedAt);
    const resolved = alerts.filter(a => a.resolvedAt);

    const bySeverity = {
      [AlertSeverity.LOW]: alerts.filter(a => a.severity === AlertSeverity.LOW).length,
      [AlertSeverity.MEDIUM]: alerts.filter(a => a.severity === AlertSeverity.MEDIUM).length,
      [AlertSeverity.HIGH]: alerts.filter(a => a.severity === AlertSeverity.HIGH).length,
      [AlertSeverity.CRITICAL]: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length
    };

    const byType = {
      [AlertType.BREACH]: alerts.filter(a => a.alertType === AlertType.BREACH).length,
      [AlertType.APPROACHING_LIMIT]: alerts.filter(a => a.alertType === AlertType.APPROACHING_LIMIT).length,
      [AlertType.TRENDING_NEGATIVE]: alerts.filter(a => a.alertType === AlertType.TRENDING_NEGATIVE).length,
      [AlertType.COMPLIANCE_RESTORED]: alerts.filter(a => a.alertType === AlertType.COMPLIANCE_RESTORED).length
    };

    return {
      total: alerts.length,
      active: active.length,
      acknowledged: acknowledged.length,
      resolved: resolved.length,
      bySeverity,
      byType
    };
  }
}
