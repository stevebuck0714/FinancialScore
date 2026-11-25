import { ENGAGEMENT_OPTIONS } from './engagement';
import { diligenceGaps, type Diligence } from './diligence';
import type { Outlook } from './outlook';
import type { ReconciliationResult, Reconciliation } from './reconciliation';

export const REPORT_FIRM = 'Corelytics';
export const REPORT_TITLE = 'Business Valuation Report';

export function optionLabel<K extends keyof typeof ENGAGEMENT_OPTIONS>(field: K, value: string | null | undefined): string {
  return (ENGAGEMENT_OPTIONS[field] as ReadonlyArray<{ value: string; label: string }>).find((option) => option.value === value)?.label || '—';
}

export const DEFINITIONS: Array<{ term: string; definition: string; when?: (engagement: { standardOfValue?: string; premiseOfValue?: string }) => boolean }> = [
  {
    term: 'Fair market value',
    definition:
      'The price, expressed in terms of cash equivalents, at which property would change hands between a hypothetical willing and able buyer and a hypothetical willing and able seller, acting at arm\'s length in an open and unrestricted market, when neither is under compulsion to buy or sell and when both have reasonable knowledge of the relevant facts.',
    when: (engagement) => engagement.standardOfValue !== 'INVESTMENT_VALUE',
  },
  {
    term: 'Investment value',
    definition: 'The value to a particular investor based on that investor\'s individual requirements and expectations.',
    when: (engagement) => engagement.standardOfValue === 'INVESTMENT_VALUE',
  },
  {
    term: 'Going concern',
    definition: 'The premise that the business will continue to operate into the foreseeable future, with its assets used together to produce earnings.',
    when: (engagement) => engagement.premiseOfValue !== 'ORDERLY_LIQUIDATION',
  },
  {
    term: 'Orderly liquidation',
    definition: 'The premise that the assets are sold individually over a reasonable period to obtain the best available price.',
    when: (engagement) => engagement.premiseOfValue === 'ORDERLY_LIQUIDATION',
  },
  { term: 'Controlling interest', definition: 'An ownership interest with the power to direct the management and policies of the business.' },
  { term: 'Asset sale', definition: 'A transfer of the operating assets of the business, tangible and intangible, without transferring the legal entity. The seller typically keeps cash and pays off interest-bearing debt.' },
  { term: 'Stock sale', definition: 'A purchase of the ownership interest in the legal entity, in which the buyer takes on all of its assets and liabilities.' },
  { term: 'EBITDA', definition: 'Earnings before interest, taxes, depreciation, and amortization.' },
  { term: 'Normalization', definition: 'An adjustment to reported earnings that removes non-recurring, non-operating, or discretionary items, and restates owner compensation to a market rate, so the earnings reflect what a buyer could expect.' },
  { term: 'Seller\'s discretionary earnings (SDE)', definition: 'Normalized EBITDA before the market-rate compensation of one full-time owner-operator.' },
  { term: 'Capitalization rate', definition: 'The discount rate less expected long-term growth; dividing next year\'s cash flow by it converts a single year of earnings into a value.' },
  { term: 'Goodwill', definition: 'The value of the business above its identified tangible assets, arising from its earnings capacity, reputation, customers, and workforce.' },
  { term: 'Debt service coverage ratio (DSCR)', definition: 'Cash available for debt service divided by annual principal and interest payments.' },
];

export const ASSUMPTIONS_AND_LIMITING_CONDITIONS = [
  'The conclusion of value is valid only for the stated purpose, standard of value, premise of value, and interest, as of the valuation date.',
  'Financial statements, tax returns, and other information provided by the Company or its representatives were accepted as reflecting the Company\'s results and financial condition without audit, review, or compilation. We express no opinion or other form of assurance on them.',
  'Public, industry, and statistical information was obtained from sources believed to be reliable. We make no representation as to its accuracy or completeness and did not independently verify it.',
  'The valuation assumes that current management\'s competence and the character of the business continue through any sale, and that the business complies with all applicable laws and regulations, except as noted in this report.',
  'We relied on the representations of the owners, management, and third parties concerning the value and condition of equipment, real estate, and other assets and liabilities. We did not confirm title to any asset or whether assets are free of liens and encumbrances.',
  'This report and its conclusion are for the exclusive use of the client and the intended users named in this report for the stated purpose. They may not be used for any other purpose or by any other party without our written consent, and they are not investment advice.',
  'No part of this report may be disseminated to the public through advertising, public relations, news, or sales media without our prior written consent.',
  'We are not required to give testimony or attend court or any other hearing because of this report unless arrangements have been made in advance in writing.',
  'The valuation reflects facts and conditions existing at the valuation date. Events after the valuation date were not considered, and we have no obligation to update this report for them.',
  'No change to any item in this report may be made by anyone other than the appraiser, and we take no responsibility for unauthorized changes.',
  'Amounts are stated in U.S. dollars and may not add because of rounding.',
];

export function certificationStatements(input: { siteVisitDate: string | null; reviewerName: string | null }) {
  return [
    'The statements of fact in this report are true and correct to the best of our knowledge and belief.',
    'The analyses, opinions, and conclusions are limited only by the stated assumptions and limiting conditions, and are our personal, impartial, and unbiased professional analyses, opinions, and conclusions.',
    'We have no present or prospective interest in the business that is the subject of this report, and no personal interest with respect to the parties involved.',
    'Our engagement was not contingent on developing or reporting predetermined results.',
    'Our compensation is not contingent on the development or reporting of a predetermined value, a direction in value that favors the client, the amount of the value concluded, the attainment of a stipulated result, or the closing of any loan or transaction.',
    'The analyses, opinions, and conclusions were developed, and this report prepared, in conformity with [professional standards].',
    input.siteVisitDate ? `A site visit of the business was made on ${input.siteVisitDate}.` : 'No site visit of the business was made.',
    input.reviewerName
      ? `${input.reviewerName} reviewed this report. No one else provided significant professional assistance to the person signing this certification.`
      : 'No one provided significant professional assistance to the person signing this certification.',
  ];
}

export function reportReadiness(input: {
  hasSnapshot: boolean;
  independenceConfirmed: boolean;
  appraiserName: string | null;
  reviewerName: string | null;
  lenderName: string | null;
  status: string;
  reconciliation: Reconciliation;
  result: ReconciliationResult;
  outlook: Outlook;
  diligence: Diligence;
}) {
  const items: string[] = [];
  if (!input.independenceConfirmed) items.push('Independence is not confirmed on the Engagement tab.');
  if (!input.hasSnapshot) items.push('No data is frozen on the Data Snapshot tab.');
  if (!input.appraiserName) items.push('No appraiser is assigned, so the report has no signer.');
  if (!input.reviewerName) items.push('No reviewer is assigned.');
  if (!input.lenderName) items.push('No lender is selected, so the transmittal letter has no addressee.');
  if (!input.reconciliation.concludedAt) items.push('The value is not concluded on the Reconciliation tab.');
  else if (input.result.stale) items.push('Inputs changed after the value was concluded; conclude again on the Reconciliation tab.');
  if (!input.outlook.approvedAt) items.push('The economic and industry outlook is not approved on the Outlook tab.');
  items.push(...diligenceGaps(input.diligence));
  if (input.status !== 'FINAL') items.push('The engagement is not final, so the report is marked DRAFT.');
  return items;
}
