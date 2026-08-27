import { withIsolvedHubReportName } from '@/lib/operations/operational-hub-layout';
import { isAssignedCompanyReportEnabled } from '@/lib/operations/company-specific-reports';

export type OverviewPrintOption = {
  key: string;
  label: string;
  kind: 'overview-subtab' | 'dashboard-section';
  overviewSubTab?: string;
  sectionKey?: string;
};

export const GENERIC_OVERVIEW_WIDGET_REPORT_KEYS = new Set([
  'overviewStdArAging',
  'overviewStdApAging',
  'overviewStdCashTrend',
  'overviewStdInventory',
  'overviewStdRevenue',
  'overviewStdEbitda',
]);

export function sectorHidesGenericOverviewWidgets(sectorCategory?: string | null): boolean {
  return ['32', '42', '53', '54'].includes(String(sectorCategory || '').trim());
}

/** @deprecated Use GENERIC_OVERVIEW_WIDGET_REPORT_KEYS */
export const WHOLESALE_OVERVIEW_EXCLUDED_REPORT_KEYS = GENERIC_OVERVIEW_WIDGET_REPORT_KEYS;

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
export type OverviewPrintCompanyContext = {
  companyId?: string | null;
  companyName?: string | null;
  hubConfig?: unknown;
};

export function getOverviewPrintOptions(
  industrySectorCategory: string | null | undefined,
  operationalHubSections: Record<string, any> | null | undefined,
  company?: OverviewPrintCompanyContext
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
    return wholesalePages;
  }

  const includeGenericOverviewWidgets = !sectorHidesGenericOverviewWidgets(sector);
  const dashboardSections: OverviewPrintOption[] = [
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdRevenue')
      ? [{
          key: 'overviewStdRevenue',
          label: 'Revenue',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdRevenue',
        }]
      : []),
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdArAging')
      ? [{
          key: 'overviewStdArAging',
          label: 'AR Aging',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdArAging',
        }]
      : []),
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdApAging')
      ? [{
          key: 'overviewStdApAging',
          label: 'AP Aging',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdApAging',
        }]
      : []),
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdCashTrend')
      ? [{
          key: 'overviewStdCashTrend',
          label: 'Cash Trend',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdCashTrend',
        }]
      : []),
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdInventory')
      ? [{
          key: 'overviewStdInventory',
          label: 'Inventory',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdInventory',
        }]
      : []),
    ...(includeGenericOverviewWidgets && isSectionEnabled(sections, 'overviewStdEbitda')
      ? [{
          key: 'overviewStdEbitda',
          label: 'EBITDA',
          kind: 'dashboard-section' as const,
          sectionKey: 'overviewStdEbitda',
        }]
      : []),
  ];

  if (sector === '54') {
    const bureauScorecard =
      isSectionEnabled(sections, 'overviewBureauExecutiveScorecard')
        ? [{
            key: 'overviewBureauExecutiveScorecard',
            label: withIsolvedHubReportName('Executive Operational Scorecard'),
            kind: 'dashboard-section' as const,
            sectionKey: 'overviewBureauExecutiveScorecard',
          }]
        : [];
    return bureauScorecard;
  }

  if (
    sector === '53' &&
    isAssignedCompanyReportEnabled({
      reportKey: 'realEstateExecutiveReport',
      companyId: company?.companyId,
      companyName: company?.companyName,
      hubConfig: company?.hubConfig,
      sections,
    })
  ) {
    dashboardSections.unshift({
      key: 'realEstateExecutiveReport',
      label: 'Executive Report',
      kind: 'dashboard-section',
      sectionKey: 'realEstateExecutiveReport',
    });
  }

  return dashboardSections;
}
