import { suggestPropertyTargets } from '@/lib/real-estate/property-income-statement';

type Line = Record<string, any>;
type Mapping = Record<string, any>;

/**
 * Entity lines and mappings as the reports use them:
 * - Some SLN months were loaded from both the monthly SLN workbooks (sln_ codes)
 *   and a one-off import file (numeric codes). The workbooks are the series
 *   every month has, so they win wherever both exist for a month and report type.
 * - QuickBooks Desktop lines are BGAH's books and replace the BGAH workbook
 *   whenever they are loaded, so the two BGAH sources are never added together.
 *   QBD accounts without a saved mapping use the Data Mapping suggestion.
 */
export function buildEntityReportLines(allLines: Line[], mappings: Mapping[]) {
  const slnPeriodKey = (line: Line) => `${String(line.reportType).toUpperCase()}|${new Date(line.periodEnd).toISOString().slice(0, 7)}`;
  const slnWorkbookPeriods = new Set(allLines
    .filter((line) => line.sourceEntity === 'SLN' && String(line.accountCode).startsWith('sln_'))
    .map(slnPeriodKey));
  const lines = allLines.filter((line) => line.sourceEntity !== 'SLN' || String(line.accountCode).startsWith('sln_') || !slnWorkbookPeriods.has(slnPeriodKey(line)));
  const quickBooksLines = lines.filter((line) => line.sourceEntity === 'QBD');
  const savedQuickBooksMappings = mappings.filter((mapping) => mapping.financialFeed === 'QBD');
  const savedQuickBooksCodes = new Set(savedQuickBooksMappings.map((mapping) => String(mapping.accountCode)));
  const quickBooksAccounts = [...new Map(quickBooksLines
    .filter((line) => String(line.reportType).toUpperCase() === 'ACTIVITY')
    .map((line) => [String(line.accountCode), { accountCode: String(line.accountCode), accountName: String(line.accountName || ''), accountType: String(line.accountType || '') }])).values()];
  const suggestedQuickBooksMappings = [...suggestPropertyTargets(quickBooksAccounts).entries()]
    .filter(([accountCode]) => !savedQuickBooksCodes.has(accountCode))
    .map(([accountCode, suggestion]) => ({ financialFeed: 'QBD', accountCode, targetField: suggestion.targetField, bookTreatment: null, suggested: true }));
  const quickBooksMappings = [...savedQuickBooksMappings, ...suggestedQuickBooksMappings];
  const bgahFromQuickBooks = quickBooksLines.length > 0;
  const reportLines = bgahFromQuickBooks
    ? [
        ...lines.filter((line) => line.sourceEntity !== 'QBD' && line.sourceEntity !== 'BGAH'),
        ...quickBooksLines.map((line) => ({ ...line, sourceEntity: 'BGAH', fromQuickBooks: true })),
      ]
    : lines.filter((line) => line.sourceEntity !== 'QBD');
  const reportMappings = bgahFromQuickBooks
    ? [
        ...mappings.filter((mapping) => mapping.financialFeed !== 'QBD' && mapping.financialFeed !== 'BGAH'),
        ...quickBooksMappings.map((mapping) => ({ ...mapping, financialFeed: 'BGAH' })),
      ]
    : mappings.filter((mapping) => mapping.financialFeed !== 'QBD');
  return { lines: reportLines, mappings: reportMappings, quickBooksLines, savedQuickBooksMappings, bgahFromQuickBooks };
}
