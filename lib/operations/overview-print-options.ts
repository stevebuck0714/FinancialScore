import { withIsolvedHubReportName } from '@/lib/operations/operational-hub-layout';

export type OverviewPrintOption = {
  key: string;
  label: string;
  kind: 'overview-subtab' | 'dashboard-section';
  overviewSubTab?: string;
  sectionKey?: string;
};

const isSectionEnabled = (
  sections: Record<string, any> | null | undefined,
  sectionKey: string
): boolean => {
  const value = sections?.[sectionKey];
  return value === undefined ? true : value !== false;
};

/**
 * Overview print targets for the selected company.
 * Mirrors OperationsTab Overview page construction (sector + hub section flags).
 */
export function getOverviewPrintOptions(
  industrySectorCategory: string | null | undefined,
  operationalHubSections: Record<string, any> | null | undefined
): OverviewPrintOption[] {
  const sector = String(industrySectorCategory || '').trim();
  const sections = operationalHubSections || {};

  if (sector === '62') {
    return [
      ...(isSectionEnabled(sections, 'overviewHealthcareEnterpriseReports')
        ? [{
            key: 'overviewHealthcareEnterpriseReports',
            label: 'Enterprise Reports',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'enterprise-reports',
          }]
        : []),
      ...(isSectionEnabled(sections, 'overviewHealthcareRegionReports')
        ? [{
            key: 'overviewHealthcareRegionReports',
            label: 'Region Reports',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'region-reports',
          }]
        : []),
      ...(isSectionEnabled(sections, 'overviewHealthcareServiceReports')
        ? [{
            key: 'overviewHealthcareServiceReports',
            label: 'Service Reports',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'service-reports',
          }]
        : []),
    ];
  }

  if (sector === '42') {
    const wholesalePages: OverviewPrintOption[] = [
      ...(isSectionEnabled(sections, 'overviewStdCashConversionAnalysis')
        ? [{
            key: 'overviewStdCashConversionAnalysis',
            label: 'Cash Conversion Analysis',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'cash-conversion-analysis',
          }]
        : []),
      ...(isSectionEnabled(sections, 'overviewStdEbitdaPerformance')
        ? [{
            key: 'overviewStdEbitdaPerformance',
            label: 'EBITDA Performance',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'ebitda-performance',
          }]
        : []),
      ...(isSectionEnabled(sections, 'overviewStdCustomerConcentrationExposure')
        ? [{
            key: 'overviewStdCustomerConcentrationExposure',
            label: 'Customer Concentration Exposure',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'customer-concentration-exposure',
          }]
        : []),
      ...(isSectionEnabled(sections, 'overviewStdExecutionVelocity')
        ? [{
            key: 'overviewStdExecutionVelocity',
            label: 'Execution Velocity',
            kind: 'overview-subtab' as const,
            overviewSubTab: 'execution-velocity',
          }]
        : []),
    ];
    if (wholesalePages.length > 0) return wholesalePages;
  }

  const dashboardSections: OverviewPrintOption[] = [
    ...(isSectionEnabled(sections, 'overviewStdRevenue')
      ? [{
          key: 'overviewStdRevenue',
          label: 'Revenue',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdRevenue',
        }]
      : []),
    ...(isSectionEnabled(sections, 'overviewStdArAging')
      ? [{
          key: 'overviewStdArAging',
          label: 'AR Aging',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdArAging',
        }]
      : []),
    ...(isSectionEnabled(sections, 'overviewStdApAging')
      ? [{
          key: 'overviewStdApAging',
          label: 'AP Aging',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdApAging',
        }]
      : []),
    ...(isSectionEnabled(sections, 'overviewStdCashTrend')
      ? [{
          key: 'overviewStdCashTrend',
          label: 'Cash Trend',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdCashTrend',
        }]
      : []),
    ...(isSectionEnabled(sections, 'overviewStdInventory')
      ? [{
          key: 'overviewStdInventory',
          label: 'Inventory',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdInventory',
        }]
      : []),
    ...(isSectionEnabled(sections, 'overviewStdEbitda')
      ? [{
          key: 'overviewStdEbitda',
          label: 'EBITDA',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdEbitda',
        }]
      : []),
  ];

  if (sector === '53' && isSectionEnabled(sections, 'realEstateExecutiveReport')) {
    dashboardSections.unshift({
      key: 'realEstateExecutiveReport',
      label: 'Executive Report',
      kind: 'dashboard-section',
      sectionKey: 'realEstateExecutiveReport',
    });
  }

  if (sector === '54' && isSectionEnabled(sections, 'overviewBureauExecutiveScorecard')) {
    dashboardSections.unshift({
      key: 'overviewBureauExecutiveScorecard',
      label: withIsolvedHubReportName('Executive Operational Scorecard'),
      kind: 'dashboard-section',
      sectionKey: 'overviewBureauExecutiveScorecard',
    });
  }

  return dashboardSections;
}
