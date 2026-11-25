'use client';

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { computeIndications } from '@/lib/business-valuation/indications';
import { computeReconciliation, type Reconciliation } from '@/lib/business-valuation/reconciliation';
import { computeDebtService, type DebtService } from '@/lib/business-valuation/debt-service';
import { BENCHMARK_GROUPS, computeBenchmarks, formatBenchmarkValue, type Benchmarking, type IndustryTable } from '@/lib/business-valuation/benchmarking';
import {
  INDICATOR_SCOPES,
  OUTLOOK_SECTIONS,
  formatIndicatorChange,
  formatIndicatorValue,
  formatObservationDate,
  outlookCitations,
  type Outlook,
} from '@/lib/business-valuation/outlook';
import { INTERVIEW_TOPICS, REP_LETTER_STATUSES, automaticReliedOnSources, representationLetterDraft, type Diligence } from '@/lib/business-valuation/diligence';
import { completeFiscalYears, EARNINGS_SOURCES, normalizeEarningsBase } from '@/lib/business-valuation/earnings-base';
import { QOE_BUCKETS, normalizeIncomeApproach } from '@/lib/business-valuation/income-approach';
import { normalizeAssetApproach } from '@/lib/business-valuation/asset-approach';
import { comparableMultiple, normalizeMarketApproach } from '@/lib/business-valuation/market-approach';
import { INDEPENDENCE_FIELDS, INDEPENDENCE_STATEMENTS } from '@/lib/business-valuation/engagement';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import {
  ASSUMPTIONS_AND_LIMITING_CONDITIONS,
  DEFINITIONS,
  REPORT_FIRM,
  REPORT_TITLE,
  certificationStatements,
  optionLabel,
  reportReadiness,
} from '@/lib/business-valuation/report';
import { FISCAL_YEAR_END_MONTHS } from '@/lib/company/fiscal-year-end';
import { formatEstDate, formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import { CARD, button, cardSubtitle, cardTitle, money } from './styles';

type CompanyProfile = { street: string | null; city: string | null; state: string | null; zip: string | null; sectorCategory: string | null };

type Props = {
  engagement: any;
  snapshot: any;
  companyName: string;
  companyProfile: CompanyProfile | null;
  benchmarkContext: { companyIndustryCode: string | null; industryTable: IndustryTable } | null;
  documents: Array<{ id: string; originalFileName: string }>;
};

const R = {
  page: { fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.45, color: '#1e293b', background: '#fff', maxWidth: '816px', padding: '24px 32px', border: '1px solid #e2e8f0', borderRadius: '6px' } as CSSProperties,
  sectionTitle: { fontSize: '20px', fontWeight: 700, color: '#0f172a', borderBottom: '2px solid #1F70C1', padding: '0 0 4px', margin: '28px 0 10px' } as CSSProperties,
  h2: { fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '14px 0 6px' } as CSSProperties,
  p: { margin: '0 0 8px' } as CSSProperties,
  note: { margin: '4px 0 8px', fontSize: '11px', color: '#475569', fontStyle: 'italic' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', margin: '4px 0 10px' } as CSSProperties,
  th: { padding: '4px 6px', fontSize: '12px', fontWeight: 700, color: '#1E3A5F', background: '#EAF2FB', borderBottom: '1px solid #94a3b8', textAlign: 'left' } as CSSProperties,
  td: { padding: '3px 6px', fontSize: '12px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' } as CSSProperties,
};
const num: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };
const bold: CSSProperties = { fontWeight: 700 };
const total: CSSProperties = { fontWeight: 700, borderTop: '1px solid #64748b' };

const pct = (value: number | null | undefined, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`);
const dateOnly = (value: unknown) => (value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : null);
const longDate = (value: string | null) => (value ? formatEstDateLabel(value, { year: 'numeric', month: 'long', day: 'numeric' }) : '[date]');
const ratioText = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2));
const share = (value: number, base: number) => (base ? pct((value / base) * 100) : '—');
/** Lowercases the first word of a sentence-case label for use mid-sentence, keeping acronyms such as SBA. */
const inSentence = (label: string) => (/^[A-Z0-9]{2,}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));

function Table({ head, rows, numeric = [] }: { head: string[]; rows: Array<{ cells: ReactNode[]; style?: CSSProperties }>; numeric?: number[] }) {
  return (
    <table style={R.table}>
      <thead>
        <tr>{head.map((label, index) => <th key={index} style={{ ...R.th, ...(numeric.includes(index) ? num : {}) }}>{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.cells.map((cell, index) => (
              <td key={index} style={{ ...R.td, ...(numeric.includes(index) ? num : {}), ...row.style }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-report-section={title}>
      <div className="valuation-rich-print-hide" style={R.sectionTitle}>{title}</div>
      {children}
    </section>
  );
}

const H2 = ({ children }: { children: ReactNode }) => <div data-word-heading="2" style={R.h2}>{children}</div>;
const P = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <p style={{ ...R.p, ...style }}>{children}</p>;

export default function ReportTab({ engagement, snapshot, companyName, companyProfile, benchmarkContext, documents }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const valuationDate = dateOnly(engagement.valuationDate);
  const engagementLetterDate = dateOnly(engagement.engagementLetterDate);
  const reportDate = formatEstDate();
  const isStock = engagement.transactionStructure === 'STOCK';
  const interest = engagement.interestPercent ?? 100;
  const reconciliation: Reconciliation = engagement.reconciliation;
  const outlook: Outlook = engagement.outlook;
  const diligence: Diligence = engagement.diligence;
  const benchmarking: Benchmarking = engagement.benchmarking;
  const debtInputs: DebtService = engagement.debtService;
  const earningsInputs = normalizeEarningsBase(engagement.earningsBase);
  const incomeInputs = normalizeIncomeApproach(engagement.incomeApproach);
  const assetInputs = normalizeAssetApproach(engagement.assetApproach);

  const indications = useMemo(() => computeIndications(engagement, snapshot), [engagement, snapshot]);
  const { deal, appraisals, earnings, income, asset, market } = indications;
  const marketInputs = normalizeMarketApproach(engagement.marketApproach);
  const marketPerformed = market.includedCount > 0 && market.indicatedValue !== null;
  const includedSales = marketInputs.comparables.filter((item) => item.included);
  const balanceSheet = snapshot?.trailingTwelveMonths?.balanceSheet || null;
  const result = computeReconciliation(reconciliation, indications, {
    companyName,
    valuationDateLabel: valuationDate ? longDate(valuationDate) : null,
    standardOfValue: engagement.standardOfValue,
    premiseOfValue: engagement.premiseOfValue,
    ownershipBasis: engagement.ownershipBasis,
    transactionStructure: engagement.transactionStructure,
    interestPercent: engagement.interestPercent,
    balanceSheet,
    formatMoney: money,
  });
  const debt = computeDebtService(debtInputs, {
    deal,
    appraisals,
    snapshot,
    earnings,
    value: reconciliation.concludedValue ?? income.indicatedValue,
    valueLabel: reconciliation.concludedValue !== null ? 'Concluded value' : 'Income approach value',
    transactionStructure: engagement.transactionStructure,
    valuationDate,
  });
  const benchmarks = computeBenchmarks(benchmarking, snapshot, benchmarkContext?.industryTable || null);
  const readiness = reportReadiness({
    hasSnapshot: Boolean(snapshot),
    independenceConfirmed: Boolean(engagement.independenceConfirmedAt),
    appraiserName: engagement.appraiserName,
    reviewerName: engagement.reviewerName,
    lenderName: engagement.lenderName,
    status: engagement.status,
    reconciliation,
    result,
    outlook,
    diligence,
  });
  const draft = engagement.status !== 'FINAL';

  const years = completeFiscalYears(snapshot).slice(0, 3).reverse();
  const ttm = snapshot?.trailingTwelveMonths || null;
  const columns = [...years.map((item) => ({ label: item.period.label, summary: item.summary })), ...(ttm ? [{ label: ttm.period?.label || 'Trailing 12 months', summary: ttm }] : [])];
  const documentName = (id: string | null) => documents.find((doc) => doc.id === id)?.originalFileName || null;
  const reliedOn = [
    ...automaticReliedOnSources(snapshot, {
      appraisalCount: appraisals.length,
      dealDocumentName: documentName(deal.dealDocumentId),
      formatMonth: formatMonthKey,
      formatDate: (iso) => (iso ? formatEstDateTime(iso) : ''),
    }).map((source) => `${source.label}: ${source.detail}`),
    ...diligence.reliedOnDocumentIds.map(documentName).filter((name): name is string => Boolean(name)),
  ];
  const location = [companyProfile?.city, companyProfile?.state].filter(Boolean).join(', ');
  const address = [companyProfile?.street, [companyProfile?.city, companyProfile?.state].filter(Boolean).join(', '), companyProfile?.zip].filter(Boolean).join(' ');
  const industry = benchmarkContext?.industryTable ? `${benchmarkContext.industryTable.industryId} ${benchmarkContext.industryTable.industryName}` : benchmarkContext?.companyIndustryCode || '—';
  const appraiser = engagement.appraiserName || '[Appraiser]';
  const subjectAssets = isStock ? 'equity' : 'assets';
  const purposeLabel = inSentence(optionLabel('purpose', engagement.purpose));
  const reportTypeLabel = inSentence(optionLabel('reportType', engagement.reportType));
  const standardLabel = inSentence(optionLabel('standardOfValue', engagement.standardOfValue));
  const premiseLabel = inSentence(optionLabel('premiseOfValue', engagement.premiseOfValue));
  const ttmLabel = ttm ? inSentence(ttm.period?.label || 'Trailing twelve months') : null;
  const weighted = result.lines.filter((line) => line.weight > 0);

  const exportReport = async () => {
    const root = reportRef.current;
    if (!root) return;
    setExporting(true);
    setExportError(null);
    try {
      const { createReportFrontMatter, elementToWordSection, exportWordSections, safeWordFileName } = await import('@/lib/valuation/exportValuationWord');
      const front = await createReportFrontMatter({
        title: REPORT_TITLE,
        subject: companyName,
        draft,
        rows: [
          ['Report date', longDate(reportDate)],
          ['Valuation date', longDate(valuationDate)],
          ['Prepared for', engagement.lenderName || '—'],
          ['Purpose', optionLabel('purpose', engagement.purpose)],
          ['Standard of value', optionLabel('standardOfValue', engagement.standardOfValue)],
          ['Premise of value', optionLabel('premiseOfValue', engagement.premiseOfValue)],
          ['Interest valued', `${interest}% ${optionLabel('ownershipBasis', engagement.ownershipBasis).toLowerCase()}, ${optionLabel('transactionStructure', engagement.transactionStructure).toLowerCase()}`],
          ['Concluded value', result.concludedValue !== null ? money(result.concludedValue) : 'Not concluded'],
          ['Appraiser', engagement.appraiserName || '—'],
          ['Reviewer', engagement.reviewerName || '—'],
        ],
        footnote: 'All amounts are in U.S. dollars.',
      });
      const sections = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('section[data-report-section]'))) {
        sections.push(await elementToWordSection(el, 'portrait', { heading: el.dataset.reportSection || '' }));
      }
      const title = `${REPORT_TITLE} - ${companyName || 'Company'}`;
      await exportWordSections([...front, ...sections], { title, fileName: safeWordFileName(title), qoeBranding: true });
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  };

  const incomeRow = (label: string, field: string, style?: CSSProperties) => ({
    cells: [label, ...columns.flatMap((column) => [money(column.summary.income?.[field]), share(Number(column.summary.income?.[field] || 0), Number(column.summary.income?.revenue || 0))])],
    style,
  });
  const balanceRow = (label: string, value: (bs: Record<string, number>) => number, style?: CSSProperties) => ({
    cells: [label, ...columns.map((column) => (column.summary.balanceSheet ? money(value(column.summary.balanceSheet)) : '—'))],
    style,
  });
  const recastRow = (label: string, value: (summary: any) => number | null, style?: CSSProperties) => ({
    cells: [label, ...columns.flatMap((column) => {
      const amount = value(column.summary);
      return [money(amount), amount === null ? '—' : share(amount, Number(column.summary.income?.revenue || 0))];
    })],
    style,
  });
  const adjustmentTotal = (earnings.ownerCompAdjustment ?? 0) + earnings.normalizationTotal;
  const columnHead = ['', ...columns.flatMap((column) => [column.label, '%'])];
  const columnNumeric = columnHead.map((_, index) => index).filter((index) => index > 0);

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: readiness.length ? '6px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>{REPORT_TITLE}</div>
            <div style={cardSubtitle}>Built from the saved inputs on every tab. Export opens in Word with a cover, table of contents, and page numbers.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {exportError && <span style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>{exportError}</span>}
            <button type="button" disabled={exporting} onClick={() => void exportReport()} style={{ ...button, opacity: exporting ? 0.6 : 1 }}>
              {exporting ? 'Exporting…' : 'Export to Word'}
            </button>
          </div>
        </div>
        {readiness.length > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '6px 10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>Before issuing</div>
            {readiness.map((item) => <div key={item} style={{ fontSize: '12px', color: '#78350f' }}>• {item}</div>)}
          </div>
        )}
      </div>

      <div ref={reportRef} style={R.page}>
        {draft && <div className="valuation-rich-print-hide" style={{ fontSize: '12px', fontWeight: 700, color: '#b91c1c' }}>DRAFT — NOT FOR RELIANCE</div>}

        <Section title="Transmittal Letter">
          <P>{longDate(reportDate)}</P>
          <P>{engagement.lenderName || '[Lender]'}</P>
          <P style={bold}>Re: Valuation of {companyName} as of {longDate(valuationDate)}</P>
          <P>
            {engagementLetterDate ? `At your request, under the engagement letter dated ${longDate(engagementLetterDate)}, ` : 'At your request, '}{REPORT_FIRM} has prepared a {reportTypeLabel} of {interest}% of the {subjectAssets} of {companyName} (the Company) as of{' '}
            {longDate(valuationDate)}, for the purpose of {purposeLabel}. The standard of value is {standardLabel} and the premise of value is {premiseLabel}. The
            valuation assumes {isStock ? 'a stock sale' : 'an asset sale'} of a {engagement.ownershipBasis === 'MINORITY' ? 'minority' : 'controlling'} interest.
          </P>
          <P style={bold}>{result.conclusionStatement || 'The value has not yet been concluded.'}</P>
          <P>
            We considered the income, market, and asset approaches.{' '}
            {weighted.length > 0
              ? `The conclusion weights ${weighted.map((line) => `the ${line.label.toLowerCase()} at ${line.weight}%`).join(' and ')}.`
              : 'No approach has been weighted yet.'}{' '}
            {marketPerformed
              ? `The market approach is based on ${market.includedCount} completed sales of comparable businesses${marketInputs.dataSource ? ` from ${marketInputs.dataSource}` : ''}.`
              : 'The market approach was not performed because sufficient comparable transaction data was not available.'}
          </P>
          {result.purchasePrice !== null && result.concludedValue !== null && (
            <P>
              The purchase price of {money(result.purchasePrice)} is {result.priceSupported ? 'supported by' : 'not supported by'} the concluded value
              {result.priceDifference ? `, which is ${money(Math.abs(result.priceDifference))} ${result.priceDifference > 0 ? 'above' : 'below'} the price` : ''}.
            </P>
          )}
          <P>This letter and the conclusion are subject to the assumptions and limiting conditions and the certification in this report.</P>
          <P>Sincerely,</P>
          <P style={{ margin: '24px 0 0' }}>{appraiser}</P>
          <P>{REPORT_FIRM}</P>
        </Section>

        <Section title="Engagement and Scope">
          <Table
            head={['Item', 'Detail']}
            rows={[
              ['Subject business', companyName],
              ['Intended user', engagement.lenderName || '—'],
              ['Purpose', optionLabel('purpose', engagement.purpose)],
              ['Report type', optionLabel('reportType', engagement.reportType)],
              ['Standard of value', optionLabel('standardOfValue', engagement.standardOfValue)],
              ['Premise of value', optionLabel('premiseOfValue', engagement.premiseOfValue)],
              ['Interest valued', `${interest}%, ${optionLabel('ownershipBasis', engagement.ownershipBasis).toLowerCase()}`],
              ['Transaction structure', optionLabel('transactionStructure', engagement.transactionStructure)],
              ['Engagement letter date', longDate(engagementLetterDate)],
              ['Valuation date', longDate(valuationDate)],
              ['Report date', longDate(reportDate)],
              ['Appraiser', engagement.appraiserName || '—'],
              ['Reviewer', engagement.reviewerName || '—'],
            ].map((cells) => ({ cells }))}
          />
          <H2>Scope of work</H2>
          <P>
            We analyzed the Company&apos;s monthly financial statements{years.length ? ` for fiscal years ${years.map((item) => item.period.label).join(', ')}` : ''}
            {ttmLabel ? ` and the ${ttmLabel}` : ''}, normalized its earnings, and considered the income, market, and asset approaches to value. We
            {diligence.interviewDate ? ` interviewed management on ${longDate(diligence.interviewDate)},` : ''}
            {diligence.siteVisitDate ? ` visited the business on ${longDate(diligence.siteVisitDate)},` : ''} reviewed economic and industry conditions, compared the Company
            with industry benchmarks, and tested whether the earnings support debt service on the purchase.
          </P>
          <H2>Independence</H2>
          {INDEPENDENCE_FIELDS.filter((field) => engagement[field]).map((field) => <P key={field}>• {INDEPENDENCE_STATEMENTS[field]}</P>)}
          <P>Prior or current {REPORT_FIRM} services for this company: {engagement.priorServicesNote || 'None'}.</P>
          <H2>Definitions</H2>
          {DEFINITIONS.filter((item) => !item.when || item.when(engagement)).map((item) => (
            <P key={item.term}><strong>{item.term}.</strong> {item.definition}</P>
          ))}
        </Section>

        <Section title="Company Overview and Diligence">
          <Table
            head={['Item', 'Detail']}
            rows={[
              ['Business name', companyName],
              ['Location', address || location || '—'],
              ['Industry (NAICS)', industry],
              ['Sector', companyProfile?.sectorCategory || '—'],
              ['Fiscal year end', snapshot?.fiscalYear?.endMonth ? FISCAL_YEAR_END_MONTHS[snapshot.fiscalYear.endMonth - 1] : '—'],
              ['Accounting system', snapshot?.company?.accountingSystem || '—'],
            ].map((cells) => ({ cells }))}
          />
          <H2>Management interview</H2>
          <P>
            {diligence.interviewDate
              ? `Interview held ${longDate(diligence.interviewDate)}${diligence.interviewMethod ? ` (${diligence.interviewMethod === 'IN_PERSON' ? 'in person' : diligence.interviewMethod.toLowerCase()})` : ''}${diligence.interviewAttendees ? ` with ${diligence.interviewAttendees}` : ''}.`
              : 'No management interview is recorded.'}
          </P>
          {INTERVIEW_TOPICS.filter((topic) => diligence.responses[topic.key]).map((topic) => (
            <P key={topic.key}><strong>{topic.label}.</strong> {diligence.responses[topic.key]}</P>
          ))}
          <H2>Site visit</H2>
          <P>
            {diligence.siteVisitDate
              ? `Site visit made ${longDate(diligence.siteVisitDate)}${diligence.siteVisitAttendees ? ` with ${diligence.siteVisitAttendees}` : ''}. ${diligence.siteVisitNotes || ''}`
              : 'No site visit was made.'}
          </P>
          <H2>Documents relied on</H2>
          {reliedOn.length ? reliedOn.map((item) => <P key={item}>• {item}</P>) : <P>No documents are recorded.</P>}
        </Section>

        <Section title="Economic and Industry Outlook">
          {!outlook.approvedAt && <P style={{ color: '#b45309' }}>The outlook has not been approved.</P>}
          {OUTLOOK_SECTIONS.map((section) => (
            <div key={section.key}>
              <H2>{section.label}</H2>
              {(outlook[section.key] || 'Not written.').split(/\n{2,}/).map((paragraph, index) => <P key={index}>{paragraph}</P>)}
            </div>
          ))}
          {outlook.indicators.length > 0 && (
            <>
              <H2>Economic indicators</H2>
              <Table
                head={['Area', 'Indicator', 'Latest', 'As of', 'Change from a year earlier']}
                numeric={[2, 4]}
                rows={INDICATOR_SCOPES.flatMap((scope) =>
                  outlook.indicators
                    .filter((indicator) => indicator.scope === scope.value)
                    .map((indicator) => ({
                      cells: [indicator.area, indicator.label, formatIndicatorValue(indicator.value, indicator.unit), formatObservationDate(indicator.date, indicator.frequency), formatIndicatorChange(indicator)],
                    })),
                )}
              />
              <p style={R.note}>Figures {outlook.indicatorsAsOf ? `as published through ${longDate(outlook.indicatorsAsOf)}` : 'as retrieved'}. Sources are listed in the appendix.</p>
            </>
          )}
        </Section>

        <Section title="Financial Analysis">
          <P>
            The tables below summarize the Company&apos;s income statements and balance sheets for its complete fiscal years and the trailing twelve months, with each line as a
            percentage of revenue. Balances are at the end of each period.
          </P>
          {columns.length === 0 ? (
            <P>No financial data has been frozen.</P>
          ) : (
            <>
              <H2>Income statements as reported</H2>
              <Table
                head={columnHead}
                numeric={columnNumeric}
                rows={[
                  incomeRow('Revenue', 'revenue', bold),
                  incomeRow('Cost of goods sold', 'cogsTotal'),
                  incomeRow('Gross profit', 'grossProfit', total),
                  incomeRow('Operating expenses', 'expense'),
                  incomeRow('Includes payroll', 'payroll'),
                  incomeRow('Includes owner pay', 'ownerBasePay'),
                  incomeRow('Includes rent', 'rent'),
                  incomeRow('Operating income', 'operatingIncome', total),
                  incomeRow('Add back interest expense', 'interestExpense'),
                  incomeRow('Add back depreciation and amortization', 'depreciationAmortization'),
                  incomeRow('EBITDA', 'ebitda', total),
                ]}
              />
              <H2>Normalized EBITDA by period</H2>
              <Table
                head={columnHead}
                numeric={columnNumeric}
                rows={[
                  recastRow('EBITDA as reported', (summary) => Number(summary.income?.ebitda || 0)),
                  recastRow('Owner compensation to market', () => earnings.ownerCompAdjustment ?? 0),
                  ...earningsInputs.normalizations.map((item) => recastRow(item.label, () => item.amount)),
                  recastRow('Normalized EBITDA', (summary) => Number(summary.income?.ebitda || 0) + adjustmentTotal, total),
                ]}
              />
              <p style={R.note}>
                The normalizations recorded for the earnings base are applied to each period for comparison. The earnings base itself is set out in the next section.
                {earnings.source === 'QOE_ADJUSTED'
                  ? ` It starts from Quality of Earnings adjusted EBITDA of ${money(earnings.startingEarnings)} for the ${ttmLabel || 'trailing twelve months'}, which includes ${money(snapshot?.qoe?.savedTotals?.qoeTotalAdjustments)} of quality of earnings adjustments not shown by period above.`
                  : ''}
              </p>
              <H2>Balance sheets</H2>
              <Table
                head={['', ...columns.map((column) => column.label)]}
                numeric={columns.map((_, index) => index + 1)}
                rows={[
                  balanceRow('Cash', (bs) => bs.cash),
                  balanceRow('Accounts receivable', (bs) => bs.ar),
                  balanceRow('Inventory', (bs) => bs.inventory),
                  balanceRow('Other current assets', (bs) => bs.otherCA),
                  balanceRow('Fixed assets, net', (bs) => bs.fixedAssets),
                  balanceRow('Other assets', (bs) => bs.otherAssets),
                  balanceRow('Total assets', (bs) => bs.totalAssets, total),
                  balanceRow('Accounts payable', (bs) => bs.ap),
                  balanceRow('Line of credit', (bs) => bs.loc),
                  balanceRow('Other current liabilities', (bs) => bs.otherCL),
                  balanceRow('Long-term debt', (bs) => bs.ltd),
                  balanceRow('Total liabilities', (bs) => bs.totalLiab, total),
                  balanceRow('Equity', (bs) => bs.totalEquity, bold),
                ]}
              />
            </>
          )}
          <H2>Industry benchmarking</H2>
          <P>
            The Company&apos;s latest complete fiscal year is compared with{' '}
            {benchmarking.rmaEdition ? `RMA Annual Statement Studies (${benchmarking.rmaEdition}${benchmarking.rmaIndustry ? `, ${benchmarking.rmaIndustry}` : ''}${benchmarking.rmaSizeBand ? `, ${benchmarking.rmaSizeBand}` : ''}) where entered, and otherwise with ` : ''}
            the industry benchmark table for {industry}
            {benchmarkContext?.industryTable ? ` (${benchmarkContext.industryTable.sizeBand})` : ''}.
          </P>
          <Table
            head={['Metric', ...benchmarks.years.map((year) => year.label), 'Industry', 'Assessment']}
            numeric={benchmarks.years.map((_, index) => index + 1).concat(benchmarks.years.length + 1)}
            rows={BENCHMARK_GROUPS.flatMap((group) => [
              { cells: [group.label, ...benchmarks.years.map(() => ''), '', ''], style: { ...bold, background: '#f8fafc' } },
              ...benchmarks.rows
                .filter((row) => row.group === group.key)
                .map((row) => ({
                  cells: [
                    row.label,
                    ...benchmarks.years.map((_, index) => formatBenchmarkValue(row.company[index] ?? null, row.unit)),
                    `${formatBenchmarkValue(row.benchmark, row.unit)}${row.benchmarkSource === 'RMA' ? ' (RMA)' : ''}`,
                    row.assessment || '—',
                  ],
                })),
            ])}
          />
          {benchmarking.notes && <P>{benchmarking.notes}</P>}
          <H2>Quality of earnings findings</H2>
          {snapshot?.qoe?.savedTotals ? (
            <>
              <Table
                head={['', 'Amount']}
                numeric={[1]}
                rows={[
                  { cells: ['Trailing twelve months EBITDA as reported', money(snapshot.qoe.savedTotals.ttmEbitdaAnalysis)] },
                  { cells: ['Quality of earnings adjustments', money(snapshot.qoe.savedTotals.qoeTotalAdjustments)] },
                  { cells: ['Quality of earnings adjusted EBITDA', money(snapshot.qoe.savedTotals.qualityOfEarnings)], style: total },
                ]}
              />
              <p style={R.note}>From the {REPORT_FIRM} Quality of Earnings analysis{snapshot.qoe.savedAt ? ` saved ${formatEstDateTime(snapshot.qoe.savedAt)}` : ''}. The full analysis is in the Quality of Earnings report.</p>
            </>
          ) : (
            <P>No Quality of Earnings analysis was saved for this company; earnings were normalized as set out in the next section.</P>
          )}
          {incomeInputs.riskFactors.some((factor) => factor.qoeBucket) && (
            <Table
              head={['Finding', 'Risk factor', 'Effect on rate']}
              numeric={[2]}
              rows={incomeInputs.riskFactors
                .filter((factor) => factor.qoeBucket)
                .map((factor) => ({ cells: [QOE_BUCKETS.find((bucket) => bucket.value === factor.qoeBucket)?.label || '', factor.label, pct(factor.premiumPct, 2)] }))}
            />
          )}
        </Section>

        <Section title="Earnings Base and Normalizations">
          <Table
            head={['', 'Amount', 'Support']}
            numeric={[1]}
            rows={[
              { cells: [`Starting earnings: ${EARNINGS_SOURCES.find((item) => item.value === earnings.source)?.label || ''}, ${earnings.periodLabel}`, money(earnings.startingEarnings), ''] },
              ...earnings.weightedLines.map((line) => ({ cells: [`${line.label} EBITDA (weight ${line.weight})`, money(line.ebitda), ''] })),
              {
                cells: [
                  'Owner compensation to market',
                  money(earnings.ownerCompAdjustment),
                  earningsInputs.ownerActualComp !== null && earningsInputs.ownerMarketSalary !== null
                    ? `Actual ${money(earningsInputs.ownerActualComp)} less market ${money(earningsInputs.ownerMarketSalary)}${earningsInputs.ownerMarketSource ? ` (${earningsInputs.ownerMarketSource})` : ''}`
                    : 'Not recorded',
                ],
              },
              ...earningsInputs.normalizations.map((item) => ({ cells: [item.label, money(item.amount), item.note || ''] })),
              { cells: ['Normalized EBITDA', money(earnings.normalizedEbitda), ''], style: total },
              { cells: ['Less normal capital spending', money(earnings.normalCapex === null ? null : -earnings.normalCapex), earningsInputs.capexNote || earnings.capexBasis] },
              { cells: ['Normalized EBITDA less capital spending', money(earnings.ebitdaLessCapex), ''], style: total },
              { cells: ['Seller\'s discretionary earnings (memo)', money(earnings.sde), 'Normalized EBITDA plus market owner compensation'] },
            ]}
          />
          {earningsInputs.reason && <P><strong>Why this earnings base.</strong> {earningsInputs.reason}</P>}
          <H2>Working capital</H2>
          <P>
            Working capital excluding cash and debt was {money(earnings.workingCapital.actual)} ({pct(earnings.workingCapital.actualPct)} of trailing revenue)
            {earnings.workingCapital.month ? ` at ${formatMonthKey(earnings.workingCapital.month)}` : ''}. A normal level of {pct(earnings.workingCapital.normalPct)} of revenue, or{' '}
            {money(earnings.workingCapital.normal)}, is used, so the excess (deficit) is {money(earnings.workingCapital.excess)}.
            {earningsInputs.workingCapitalNote ? ` ${earningsInputs.workingCapitalNote}` : ''}
          </P>
        </Section>

        <Section title="Income Approach">
          <P>
            The income approach uses a single-period capitalization of earnings. Next year&apos;s cash flow is divided by a capitalization rate equal to a discount rate built up
            from market data, less expected long-term growth.
          </P>
          <H2>Discount rate build-up</H2>
          <Table
            head={['Component', 'Rate', 'Source or rationale']}
            numeric={[1]}
            rows={[
              { cells: ['Risk-free rate', pct(incomeInputs.riskFreeRatePct, 2), [incomeInputs.riskFreeSource, incomeInputs.riskFreeAsOf ? `as of ${longDate(incomeInputs.riskFreeAsOf)}` : null].filter(Boolean).join(', ')] },
              { cells: ['Equity risk premium', pct(incomeInputs.equityRiskPremiumPct, 2), incomeInputs.equityRiskPremiumSource || ''] },
              { cells: ['Size premium', pct(incomeInputs.sizePremiumPct, 2), incomeInputs.sizePremiumSource || ''] },
              { cells: ['Industry premium', pct(incomeInputs.industryPremiumPct ?? 0, 2), incomeInputs.industryPremiumSource || ''] },
              ...incomeInputs.riskFactors
                .filter((factor) => factor.premiumPct !== 0 || factor.rationale)
                .map((factor) => ({ cells: [`Company-specific: ${factor.label}`, pct(factor.premiumPct, 2), factor.rationale || ''] })),
              { cells: ['Company-specific risk, total', pct(income.companySpecificPct, 2), ''] },
              { cells: ['Discount rate', pct(income.discountRatePct, 2), ''], style: total },
              { cells: ['Less long-term growth', pct(income.growthPct, 2), incomeInputs.growthSource || ''] },
              { cells: ['Capitalization rate', pct(income.capRatePct, 2), ''], style: total },
            ]}
          />
          <H2>Capitalization of earnings</H2>
          <Table
            head={['', 'Amount']}
            numeric={[1]}
            rows={[
              { cells: [income.earningsLabel, money(income.earnings)] },
              ...(income.taxes ? [{ cells: [`Less income taxes at ${pct(incomeInputs.taxRatePct)}`, money(-income.taxes)] }] : []),
              { cells: ['Net cash flow', money(income.netCashFlow)], style: total },
              { cells: [`Next year's cash flow at ${pct(income.growthPct)} growth, less working capital investment`, money(income.nextYearCashFlow)] },
              { cells: [`Divided by the capitalization rate of ${pct(income.capRatePct, 2)}`, money(income.operatingValue)], style: total },
              ...(income.excessWorkingCapital !== null ? [{ cells: ['Add excess (deduct deficit) working capital', money(income.excessWorkingCapital)] }] : []),
              ...(income.debt !== null ? [{ cells: ['Less interest-bearing debt', money(-income.debt)] }] : []),
              ...(income.cash !== null ? [{ cells: ['Add cash', money(income.cash)] }] : []),
              { cells: ['Income approach value', money(income.indicatedValue)], style: total },
            ]}
          />
          <p style={R.note}>
            Implied multiples: {income.impliedEbitdaMultiple ? `${income.impliedEbitdaMultiple.toFixed(2)} times normalized EBITDA` : '—'}
            {income.impliedSdeMultiple ? `, ${income.impliedSdeMultiple.toFixed(2)} times SDE` : ''}.
          </p>
        </Section>

        <Section title="Market Approach">
          {marketPerformed ? (
            <>
              <P>
                The market approach estimates value from the prices paid for comparable private businesses. We searched
                {marketInputs.dataSource ? ` ${marketInputs.dataSource}${marketInputs.dataEdition ? ` (${marketInputs.dataEdition})` : ''}` : ' a transaction database'}
                {marketInputs.searchCriteria ? ` using the following criteria: ${marketInputs.searchCriteria}` : ''}. Of {marketInputs.comparables.length} sales
                reviewed, {market.includedCount} were judged comparable and are listed in the appendices.
                {marketInputs.priceExcludesInventory ? ' The reported sale prices exclude inventory, so the Company\'s inventory is added to the indicated value.' : ''}
              </P>
              <Table
                head={['Multiple', 'Sales', 'Low', 'Lower quartile', 'Median', 'Upper quartile', 'High', 'Selected']}
                numeric={[1, 2, 3, 4, 5, 6, 7]}
                rows={market.lines
                  .filter((line) => line.stats)
                  .map((line) => ({
                    cells: [
                      line.label,
                      String(line.stats?.count ?? 0),
                      ratioText(line.stats?.min),
                      ratioText(line.stats?.q1),
                      ratioText(line.stats?.median),
                      ratioText(line.stats?.q3),
                      ratioText(line.stats?.max),
                      ratioText(line.selected),
                    ],
                  }))}
              />
              {market.lines
                .filter((line) => line.selected !== null && line.reason)
                .map((line) => (
                  <P key={line.key}>
                    <strong>{line.label}.</strong> {line.reason}
                  </P>
                ))}
              <Table
                head={['', 'Company figure', 'Multiple', 'Indication', 'Weight']}
                numeric={[1, 2, 3, 4]}
                rows={[
                  ...market.lines
                    .filter((line) => line.selected !== null)
                    .map((line) => ({ cells: [line.metricLabel, money(line.companyMetric), ratioText(line.selected), money(line.indication), `${line.weight}%`] })),
                  { cells: ['Weighted value', '', '', money(market.operatingValue), ''], style: total },
                  ...(market.inventory !== null ? [{ cells: ['Add inventory', '', '', money(market.inventory), ''] }] : []),
                  ...(market.debt !== null ? [{ cells: ['Less interest-bearing debt', '', '', money(-market.debt), ''] }] : []),
                  ...(market.cash !== null ? [{ cells: ['Add cash', '', '', money(market.cash), ''] }] : []),
                  { cells: ['Market approach value', '', '', money(market.indicatedValue), ''], style: total },
                ]}
              />
              {marketInputs.notes && <P>{marketInputs.notes}</P>}
            </>
          ) : (
            <P>
              The market approach estimates value from the prices paid for comparable private businesses. It was not performed for this valuation because sufficient
              comparable transaction data was not available, and it carries no weight in the conclusion.
            </P>
          )}
          {reconciliation.reasons.MARKET && <P><strong>Appraiser&apos;s note.</strong> {reconciliation.reasons.MARKET}</P>}
        </Section>

        <Section title="Asset Approach">
          <P>
            The asset approach restates the balance sheet at {asset.month ? formatMonthKey(asset.month) : 'the latest month'} to fair value. Outside appraisals replace book fixed
            assets where recorded.
          </P>
          <Table
            head={['', 'Book', 'Adjustment', 'Fair value', 'Basis']}
            numeric={[1, 2, 3]}
            rows={[
              ...asset.assets.map((row) => ({ cells: [row.label, money(row.book), money(row.adjustment), money(row.fairValue), row.note ? `${row.basis}: ${row.note}` : row.basis] })),
              { cells: ['Total assets', money(asset.bookAssets), '', money(asset.fairAssets), ''], style: total },
              ...asset.liabilities.map((row) => ({ cells: [row.label, money(row.book), money(row.adjustment), money(row.fairValue), row.note ? `${row.basis}: ${row.note}` : row.basis] })),
              { cells: ['Total liabilities', money(asset.bookLiabilities), '', money(asset.fairLiabilities), ''], style: total },
              { cells: ['Adjusted net tangible assets', '', '', money(asset.adjustedNetTangibleAssets), ''], style: total },
              ...assetInputs.intangibles.map((item) => ({ cells: [`Identified intangible: ${item.label}`, '', '', money(item.amount), item.note || ''] })),
              { cells: ['Adjusted net assets', '', '', money(asset.indicatedValue), ''], style: total },
              { cells: [asset.comparableBasis, '', '', money(asset.comparableNetAssets), ''], style: bold },
            ]}
          />
          {assetInputs.notes && <P>{assetInputs.notes}</P>}
        </Section>

        <Section title="Reconciliation and Conclusion of Value">
          <Table
            head={['Approach', 'Indicated value', 'Weight', 'Weighted', 'Reason']}
            numeric={[1, 2, 3]}
            rows={[
              ...result.lines.map((line) => ({ cells: [line.label, line.value === null ? 'Not performed' : money(line.value), `${line.weight}%`, line.weighted === null ? '—' : money(line.weighted), line.reason || ''] })),
              { cells: ['Weighted value', '', `${result.weightTotal}%`, money(result.weightedValue), ''], style: total },
              { cells: [`Concluded value (rounded to ${money(reconciliation.roundingIncrement)})`, '', '', money(result.concludedValue), ''], style: total },
            ]}
          />
          {reconciliation.conclusionNote && <P>{reconciliation.conclusionNote}</P>}
          <P style={{ ...bold, fontSize: '14px' }}>{result.conclusionStatement || 'The value has not yet been concluded.'}</P>
          {result.purchasePrice !== null && (
            <P>
              The purchase price is {money(result.purchasePrice)}.{' '}
              {result.priceSupported === null ? '' : result.priceSupported ? 'The concluded value supports the purchase price.' : 'The concluded value does not support the purchase price.'}{' '}
              {result.priceDifference !== null ? `The difference is ${money(result.priceDifference)}${result.priceDifferencePct !== null ? ` (${pct(result.priceDifferencePct)})` : ''}.` : ''}
            </P>
          )}
          <H2>Breakdown of value</H2>
          <Table
            head={['', 'At concluded value', 'At purchase price', 'Basis']}
            numeric={[1, 2]}
            rows={[
              ...(result.breakdownAtValue?.lines || result.breakdownAtPrice?.lines || []).map((line) => ({
                cells: [
                  line.label,
                  money(result.breakdownAtValue?.lines.find((item) => item.key === line.key)?.amount ?? null),
                  money(result.breakdownAtPrice?.lines.find((item) => item.key === line.key)?.amount ?? null),
                  line.basis,
                ],
                style: line.key === 'goodwill' ? bold : undefined,
              })),
              { cells: ['Total', money(result.breakdownAtValue?.purchasePrice ?? null), money(result.breakdownAtPrice?.purchasePrice ?? null), ''], style: total },
            ]}
          />
          {deal.leasesAssumedNote && <P>Leases assumed: {deal.leasesAssumedNote}</P>}
          {deal.assumedLiabilities ? <P>Liabilities assumed by the buyer: {money(deal.assumedLiabilities)}{deal.assumedLiabilitiesNote ? ` (${deal.assumedLiabilitiesNote})` : ''}.</P> : null}
        </Section>

        <Section title="Debt Service Feasibility">
          <P>
            This section tests whether the Company&apos;s normalized earnings support SBA 7(a) financing of the acquisition, using a {pct(debtInputs.downPaymentPct, 0)} down payment,
            an SBA loan at {pct(debtInputs.sbaRatePct, 2)} over {debtInputs.sbaTermMonths ?? '—'} months
            {debt.tests.some((test) => test.scenario?.realEstate) ? `, real estate financed at ${pct(debtInputs.realEstateRatePct, 2)} over ${debtInputs.realEstateTermMonths ?? '—'} months` : ''},
            and a required debt service coverage ratio of {debt.requiredDscr.toFixed(2)}.
          </P>
          <Table
            head={['', ...debt.tests.map((test) => test.label)]}
            numeric={debt.tests.map((_, index) => index + 1)}
            rows={[
              { cells: ['Price', ...debt.tests.map((test) => money(test.scenario?.price ?? null))], style: bold },
              { cells: ['Working capital financed', ...debt.tests.map((test) => money(test.scenario?.uses.workingCapital ?? null))] },
              { cells: ['Closing costs', ...debt.tests.map((test) => money(test.scenario?.uses.closingCosts ?? null))] },
              { cells: ['SBA guarantee fee', ...debt.tests.map((test) => money(test.scenario?.uses.guaranteeFee ?? null))] },
              { cells: ['Total uses', ...debt.tests.map((test) => money(test.scenario?.uses.total ?? null))], style: total },
              { cells: ['Buyer equity', ...debt.tests.map((test) => money(test.scenario?.sources.buyerEquity ?? null))] },
              { cells: ['Seller note', ...debt.tests.map((test) => money(test.scenario?.sources.sellerNote ?? null))] },
              { cells: ['SBA loan', ...debt.tests.map((test) => money(test.scenario?.sources.sbaLoan ?? null))] },
              { cells: ['Real estate loan', ...debt.tests.map((test) => money(test.scenario?.sources.realEstateLoan ?? null))] },
              { cells: ['Total sources', ...debt.tests.map((test) => money(test.scenario?.sources.total ?? null))], style: total },
              { cells: ['Annual debt service', ...debt.tests.map((test) => money(test.scenario?.debtService.total ?? null))], style: bold },
              ...(debt.tests[0]?.coverage || []).map((line, lineIndex) => ({
                cells: [
                  `Coverage: ${line.label} (${money(line.cashAvailable)})`,
                  ...debt.tests.map((test) => {
                    const coverage = test.coverage[lineIndex];
                    return coverage?.dscr === null || coverage?.dscr === undefined ? '—' : `${coverage.dscr.toFixed(2)}${coverage.passes ? '' : ' (below)'}`;
                  }),
                ],
              })),
              { cells: ['Highest price meeting the requirement', ...debt.tests.map((test) => (test.scenario ? money(test.maxSupportablePrice) : '—'))] },
            ]}
          />
          {debt.existingLoans.some((loan) => loan.stays) && (
            <p style={R.note}>Includes {money(debt.existingAnnual)} a year of existing debt that stays with the business.</p>
          )}
          {debtInputs.notes && <P>{debtInputs.notes}</P>}
        </Section>

        <Section title="Assumptions, Limiting Conditions, and Certification">
          <H2>Assumptions and limiting conditions</H2>
          {ASSUMPTIONS_AND_LIMITING_CONDITIONS.map((item, index) => <P key={index}>{index + 1}. {item}</P>)}
          <H2>Extraordinary assumptions and hypothetical conditions</H2>
          <P>None, except as follows:</P>
          {(snapshot?.notes || []).map((note: string) => <P key={note}>• {note}</P>)}
          <H2>Certification</H2>
          <P>We certify that, to the best of our knowledge and belief:</P>
          {certificationStatements({ siteVisitDate: diligence.siteVisitDate ? longDate(diligence.siteVisitDate) : null, reviewerName: engagement.reviewerName }).map((item) => (
            <P key={item}>• {item}</P>
          ))}
          <P style={{ margin: '24px 0 0' }}>______________________________</P>
          <P style={{ margin: 0 }}>{appraiser}</P>
          <P>{REPORT_FIRM} · {longDate(reportDate)}</P>
          <H2>Qualifications of the appraiser</H2>
          <P>{appraiser}: [credentials and experience].</P>
        </Section>

        <Section title="Appendices">
          <H2>Comparable transactions</H2>
          {marketPerformed ? (
            <>
              <Table
                head={['Sale date', 'Description', 'Location', 'Revenue', 'SDE', 'Sale price', 'Price to SDE', 'Price to revenue']}
                numeric={[3, 4, 5, 6, 7]}
                rows={includedSales.map((item) => ({
                  cells: [
                    item.saleDate || '—',
                    item.description || '—',
                    item.location || '—',
                    money(item.revenue),
                    money(item.sde),
                    money(item.price),
                    ratioText(comparableMultiple(item, 'sde')),
                    ratioText(comparableMultiple(item, 'revenue')),
                  ],
                }))}
              />
              {marketInputs.dataSource && (
                <p style={R.note}>
                  Source: {marketInputs.dataSource}
                  {marketInputs.dataEdition ? `, ${marketInputs.dataEdition}` : ''}.
                </p>
              )}
            </>
          ) : (
            <P>None. The market approach was not performed.</P>
          )}
          <H2>Data sources</H2>
          {[
            ...outlookCitations(outlook).map((citation) => `${citation.label}: ${citation.detail}${citation.url ? ` (${citation.url})` : ''}`),
            ...(
              [
                ['Risk-free rate', incomeInputs.riskFreeSource],
                ['Equity risk premium', incomeInputs.equityRiskPremiumSource],
                ['Size premium', incomeInputs.sizePremiumSource],
                ['Industry premium', incomeInputs.industryPremiumSource],
                ['Long-term growth', incomeInputs.growthSource],
                ['Market owner compensation', earningsInputs.ownerMarketSource],
              ] as const
            )
              .filter(([, source]) => source)
              .map(([label, source]) => `${label}: ${source}`),
            ...(marketPerformed && marketInputs.dataSource ? [`Comparable transactions: ${marketInputs.dataSource}${marketInputs.dataEdition ? `, ${marketInputs.dataEdition}` : ''}`] : []),
            ...(benchmarking.rmaEdition ? [`RMA Annual Statement Studies, ${benchmarking.rmaEdition}`] : []),
            ...(benchmarkContext?.industryTable ? [`Industry benchmark table: ${industry}, ${benchmarkContext.industryTable.sizeBand}`] : []),
          ]
            .filter((item, index, list) => list.indexOf(item) === index)
            .map((item) => <P key={item}>• {item}</P>)}
          <H2>Management representation letter</H2>
          <P>
            Status: {REP_LETTER_STATUSES.find((item) => item.value === diligence.repLetterStatus)?.label || '—'}
            {diligence.repLetterSignerName ? `. Signed by ${diligence.repLetterSignerName}${diligence.repLetterSignerTitle ? `, ${diligence.repLetterSignerTitle}` : ''}` : ''}
            {diligence.repLetterSignedDate ? ` on ${longDate(diligence.repLetterSignedDate)}` : ''}.
          </P>
          {diligence.repLetterStatus !== 'SIGNED' && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', border: '1px solid #e2e8f0', padding: '8px 10px' }}>
              {representationLetterDraft({
                companyName,
                valuationDate: valuationDate ? longDate(valuationDate) : null,
                appraiserFirm: REPORT_FIRM,
                signerName: diligence.repLetterSignerName,
                signerTitle: diligence.repLetterSignerTitle,
                documents: reliedOn,
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
