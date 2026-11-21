import type { PropertyStatementValue } from '@/lib/real-estate/property-income-statement';

type ActivityLine = { sourceEntity: string; periodEnd: string; field: string; label: string; amount: number };
type LineDef = { label: string; matches: (field: string) => boolean };
type Section = { heading: string; total: string; sign: 1 | -1; lines: LineDef[] };

const among = (...fields: string[]) => (field: string) => fields.includes(field);

const REVENUE: Section = {
  heading: 'REVENUE',
  total: 'TOTAL REVENUE',
  sign: 1,
  lines: [
    { label: 'Rental income', matches: among('rev_rental_income') },
    { label: 'Other property income', matches: among('rev_ancillary_income') },
    { label: 'Other revenue', matches: (field) => field === 'revenue' || (field.startsWith('rev_') && field !== 'rev_rental_income' && field !== 'rev_ancillary_income') },
  ],
};
const OPERATING_EXPENSES: Section = {
  heading: 'OPERATING EXPENSES',
  total: 'TOTAL OPERATING EXPENSES',
  sign: -1,
  lines: [
    { label: 'Payroll', matches: among('payroll', 'ownerBasePay') },
    { label: 'Benefits', matches: among('benefits') },
    { label: 'Management and professional fees', matches: among('professionalFees') },
    { label: 'Advertising and marketing', matches: among('marketing', 'salesExpense') },
    { label: 'Utilities', matches: among('infrastructure') },
    { label: 'Telephone and cable', matches: among('phoneComm') },
    { label: 'Insurance', matches: among('insurance') },
    { label: 'Real estate and other taxes', matches: among('taxLicense', 'stateIncomeTaxes', 'federalIncomeTaxes') },
    { label: 'Cost of revenue', matches: (field) => field.startsWith('cogs') },
    { label: 'Other operating expenses', matches: among('otherExpense', 'rent', 'subcontractors', 'autoTravel', 'mealsEntertainment', 'trainingCert') },
  ],
};
const OTHER: Section = {
  heading: 'OTHER INCOME (EXPENSE)',
  total: 'TOTAL OTHER INCOME (EXPENSE)',
  sign: 1,
  lines: [
    { label: 'Interest income', matches: among('nonOperatingIncome') },
    { label: 'Interest expense', matches: among('interestExpense') },
    { label: 'Depreciation and amortization', matches: among('depreciationAmortization') },
    { label: 'Other non-operating expense', matches: among('nonOperatingExpense') },
    { label: 'Extraordinary items', matches: among('extraordinaryItems') },
  ],
};
const INCOME_FIELDS = (field: string) => field === 'revenue' || field.startsWith('rev_') || field === 'nonOperatingIncome' || field === 'extraordinaryItems';

/**
 * Combined BGAH + SLN book-basis income statement from the combination's
 * activity lines. Source amounts roll into category lines; each GAAP
 * adjustment is its own line directly under its category. Revenue and expense
 * lines show as positive amounts; in Other Income (Expense) expenses are negative.
 */
export function buildCombinedIncomeStatement(
  columns: string[],
  monthToColumn: (month: string) => string | null,
  activityLines: ActivityLine[],
): PropertyStatementValue[] {
  const sectionTotals = new Map<Section, Record<string, number>>();
  const output: PropertyStatementValue[] = [];
  const sectionRows = (section: Section) => {
    const totals: Record<string, number> = {};
    output.push({ label: section.heading, kind: 'heading', values: {} });
    section.lines.forEach((definition) => {
      const sourceValues: Record<string, number> = {};
      const adjustments = new Map<string, Record<string, number>>();
      activityLines.forEach((line) => {
        if (!definition.matches(line.field)) return;
        const column = monthToColumn(String(line.periodEnd).slice(0, 7));
        if (!column) return;
        const signed = section === OTHER && !INCOME_FIELDS(line.field) ? -line.amount : line.amount;
        const target = line.sourceEntity === 'CONSOLIDATION' ? adjustments.get(line.label) || {} : sourceValues;
        target[column] = (target[column] || 0) + signed;
        if (line.sourceEntity === 'CONSOLIDATION') adjustments.set(line.label, target);
      });
      const emit = (label: string, values: Record<string, number>) => {
        output.push({ label, kind: 'line', values: Object.fromEntries(columns.map((column) => [column, values[column] ?? null])) });
        columns.forEach((column) => { totals[column] = (totals[column] || 0) + (values[column] || 0); });
      };
      if (Object.keys(sourceValues).length || !adjustments.size) emit(definition.label, sourceValues);
      adjustments.forEach((values, label) => emit(label, values));
    });
    output.push({ label: section.total, kind: 'total', values: Object.fromEntries(columns.map((column) => [column, totals[column] || 0])) });
    sectionTotals.set(section, totals);
  };
  const formula = (label: string, value: (column: string) => number) =>
    output.push({ label, kind: 'formula', values: Object.fromEntries(columns.map((column) => [column, value(column)])) });
  const total = (section: Section, column: string) => sectionTotals.get(section)?.[column] || 0;

  sectionRows(REVENUE);
  sectionRows(OPERATING_EXPENSES);
  formula('NET OPERATING INCOME', (column) => total(REVENUE, column) - total(OPERATING_EXPENSES, column));
  sectionRows(OTHER);
  formula('NET INCOME', (column) => total(REVENUE, column) - total(OPERATING_EXPENSES, column) + total(OTHER, column));
  return output;
}
