import { optionalText } from './deal-terms';

export const INTERVIEW_TOPICS = [
  { key: 'history', label: 'History and ownership', prompt: 'How did the business start, who owns it, and has ownership changed?' },
  { key: 'customers', label: 'Customers', prompt: 'Largest customers and their share of revenue, contracts, retention, and any recent losses.' },
  { key: 'employees', label: 'Employees', prompt: 'Headcount, key people, pay versus market, turnover, and who stays after the sale.' },
  { key: 'suppliers', label: 'Suppliers and franchisor', prompt: 'Key suppliers or franchisor, terms, concentration, and alternatives.' },
  { key: 'competition', label: 'Competition and market', prompt: 'Main competitors, market position, pricing power, and trends.' },
  { key: 'facilities', label: 'Facilities and equipment', prompt: 'Lease terms and renewal options, condition of the premises, and equipment needing replacement.' },
  { key: 'litigation', label: 'Litigation and compliance', prompt: 'Pending or threatened claims, licenses, permits, and regulatory issues.' },
  { key: 'transition', label: 'Transition', prompt: 'Seller transition period, training, non-compete, and risks to the business after the sale.' },
  { key: 'outlook', label: 'Outlook', prompt: 'Management expectations for revenue and margins, planned investments, and known changes.' },
] as const;
export type InterviewTopicKey = (typeof INTERVIEW_TOPICS)[number]['key'];

export const REP_LETTER_STATUSES = [
  { value: 'NOT_SENT', label: 'Not sent' },
  { value: 'SENT', label: 'Sent for signature' },
  { value: 'SIGNED', label: 'Signed' },
] as const;
export type RepLetterStatus = (typeof REP_LETTER_STATUSES)[number]['value'];

export type Diligence = {
  interviewDate: string | null;
  interviewAttendees: string | null;
  interviewMethod: 'IN_PERSON' | 'VIDEO' | 'PHONE' | null;
  responses: Partial<Record<InterviewTopicKey, string>>;
  siteVisitDate: string | null;
  siteVisitAttendees: string | null;
  siteVisitNotes: string | null;
  /** Data room documents the appraiser relied on, in addition to the automatic list. */
  reliedOnDocumentIds: string[];
  repLetterStatus: RepLetterStatus;
  repLetterSignerName: string | null;
  repLetterSignerTitle: string | null;
  repLetterSentDate: string | null;
  repLetterSignedDate: string | null;
  repLetterDocumentId: string | null;
};

export const DEFAULT_DILIGENCE: Diligence = {
  interviewDate: null,
  interviewAttendees: null,
  interviewMethod: null,
  responses: {},
  siteVisitDate: null,
  siteVisitAttendees: null,
  siteVisitNotes: null,
  reliedOnDocumentIds: [],
  repLetterStatus: 'NOT_SENT',
  repLetterSignerName: null,
  repLetterSignerTitle: null,
  repLetterSentDate: null,
  repLetterSignedDate: null,
  repLetterDocumentId: null,
};

const MAX_RESPONSE_LENGTH = 5000;
const MAX_RELIED_ON = 200;

const dateOnly = (value: unknown) => {
  const text = optionalText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

export function normalizeDiligence(raw: unknown): Diligence {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawResponses = source.responses && typeof source.responses === 'object' ? (source.responses as Record<string, unknown>) : {};
  const responses: Diligence['responses'] = {};
  for (const topic of INTERVIEW_TOPICS) {
    const text = optionalText(rawResponses[topic.key]);
    if (text) responses[topic.key] = text;
  }
  const method = String(source.interviewMethod ?? '');
  const status = String(source.repLetterStatus ?? '');
  return {
    interviewDate: dateOnly(source.interviewDate),
    interviewAttendees: optionalText(source.interviewAttendees),
    interviewMethod: method === 'IN_PERSON' || method === 'VIDEO' || method === 'PHONE' ? method : null,
    responses,
    siteVisitDate: dateOnly(source.siteVisitDate),
    siteVisitAttendees: optionalText(source.siteVisitAttendees),
    siteVisitNotes: optionalText(source.siteVisitNotes),
    reliedOnDocumentIds: Array.from(new Set((Array.isArray(source.reliedOnDocumentIds) ? source.reliedOnDocumentIds : []).map(String).filter(Boolean))),
    repLetterStatus: REP_LETTER_STATUSES.some((item) => item.value === status) ? (status as RepLetterStatus) : 'NOT_SENT',
    repLetterSignerName: optionalText(source.repLetterSignerName),
    repLetterSignerTitle: optionalText(source.repLetterSignerTitle),
    repLetterSentDate: dateOnly(source.repLetterSentDate),
    repLetterSignedDate: dateOnly(source.repLetterSignedDate),
    repLetterDocumentId: optionalText(source.repLetterDocumentId),
  };
}

/** Returns an error message, or null when the record is acceptable to save. */
export function validateDiligence(diligence: Diligence): string | null {
  if (Object.values(diligence.responses).some((text) => (text || '').length > MAX_RESPONSE_LENGTH)) return `Interview notes are limited to ${MAX_RESPONSE_LENGTH} characters per topic.`;
  if ((diligence.siteVisitNotes || '').length > MAX_RESPONSE_LENGTH) return `Site visit notes are limited to ${MAX_RESPONSE_LENGTH} characters.`;
  if (diligence.reliedOnDocumentIds.length > MAX_RELIED_ON) return `No more than ${MAX_RELIED_ON} documents relied on.`;
  if (diligence.repLetterStatus === 'SIGNED' && (!diligence.repLetterSignerName || !diligence.repLetterSignedDate)) {
    return 'A signed representation letter needs the signer and the date signed.';
  }
  if (diligence.repLetterSentDate && diligence.repLetterSignedDate && diligence.repLetterSignedDate < diligence.repLetterSentDate) {
    return 'The letter cannot be signed before it was sent.';
  }
  return null;
}

export type ReliedOnSource = { key: string; label: string; detail: string };

type SnapshotSources = {
  capturedAt?: string;
  asOfMonth?: string;
  months?: Array<{ month: string }>;
  qoe?: { savedTotals: Record<string, number> | null; savedAt: string | null } | null;
  loans?: { instruments: unknown[] } | null;
  taxReturns?: { entries: Record<string, unknown> } | null;
} | null;

/** Corelytics data the valuation relies on, derived from the latest snapshot and the deal record. */
export function automaticReliedOnSources(
  snapshot: SnapshotSources,
  extras: { appraisalCount: number; dealDocumentName: string | null; formatMonth: (month: string) => string; formatDate: (iso: string) => string },
): ReliedOnSource[] {
  if (!snapshot) return [];
  const sources: ReliedOnSource[] = [];
  const months = (snapshot.months || []).map((row) => row.month).filter(Boolean).sort();
  if (months.length > 0) {
    sources.push({
      key: 'financials',
      label: 'Monthly financial statements from the accounting system',
      detail: `${extras.formatMonth(months[0])} through ${extras.formatMonth(months[months.length - 1])} (${months.length} months), frozen ${extras.formatDate(snapshot.capturedAt || '')}`,
    });
  }
  if (snapshot.qoe?.savedTotals) {
    sources.push({ key: 'qoe', label: 'Corelytics Quality of Earnings analysis', detail: snapshot.qoe.savedAt ? `Saved ${extras.formatDate(snapshot.qoe.savedAt)}` : 'Saved totals' });
  }
  const loanCount = snapshot.loans?.instruments?.length || 0;
  if (loanCount > 0) sources.push({ key: 'loans', label: 'Debt schedule', detail: `${loanCount} loan${loanCount === 1 ? '' : 's'}` });
  const taxYears = Object.keys(snapshot.taxReturns?.entries || {});
  if (taxYears.length > 0) sources.push({ key: 'tax', label: 'Federal income tax returns', detail: taxYears.sort().join(', ') });
  if (extras.appraisalCount > 0) sources.push({ key: 'appraisals', label: 'Outside appraisals', detail: `${extras.appraisalCount} recorded on the Deal Terms tab` });
  if (extras.dealDocumentName) sources.push({ key: 'deal', label: 'Deal document', detail: extras.dealDocumentName });
  return sources;
}

/** Plain-text draft of the management representation letter for the appraiser to edit and send. */
export function representationLetterDraft(input: {
  companyName: string;
  valuationDate: string | null;
  appraiserFirm: string;
  signerName: string | null;
  signerTitle: string | null;
  documents: string[];
}) {
  const date = input.valuationDate || '[valuation date]';
  const lines = [
    `${input.appraiserFirm}`,
    '',
    `Re: Valuation of ${input.companyName} as of ${date}`,
    '',
    `In connection with your valuation of ${input.companyName} (the "Company"), we confirm, to the best of our knowledge and belief, the following representations made to you:`,
    '',
    '1. The financial statements, tax returns, and other financial information provided to you are complete and accurate and fairly present the financial position and results of the Company.',
    '2. We have made available all records and information requested, including all contracts, leases, and agreements that could affect the value of the Company.',
    '3. There are no undisclosed liabilities, guarantees, litigation, claims, or assessments, pending or threatened, that could have a material effect on the Company.',
    '4. There have been no events since the date of the most recent financial statements provided to you that would materially affect the Company or its value, except as disclosed to you in writing.',
    '5. All transactions with owners, family members, and related parties have been disclosed to you, including their terms.',
    '6. The information provided during the management interview and site visit is accurate and complete.',
    '7. The Company has not entered into any agreement to sell its assets or ownership other than as disclosed to you.',
  ];
  if (input.documents.length > 0) {
    lines.push('', 'The information we provided includes:', ...input.documents.map((doc) => `- ${doc}`));
  }
  lines.push(
    '',
    'Signed:',
    '',
    '______________________________',
    input.signerName || '[Name]',
    input.signerTitle || '[Title]',
    input.companyName,
    'Date: ____________________',
  );
  return lines.join('\n');
}

/** Missing diligence items, in the order a reviewer would ask about them. */
export function diligenceGaps(diligence: Diligence): string[] {
  const gaps: string[] = [];
  if (!diligence.interviewDate) gaps.push('Record the management interview date.');
  const answered = INTERVIEW_TOPICS.filter((topic) => diligence.responses[topic.key]).length;
  if (answered < INTERVIEW_TOPICS.length) gaps.push(`${INTERVIEW_TOPICS.length - answered} of ${INTERVIEW_TOPICS.length} interview topics have no notes.`);
  if (!diligence.siteVisitDate) gaps.push('Record the site visit, or note why one was not performed.');
  if (diligence.repLetterStatus !== 'SIGNED') gaps.push('The management representation letter is not signed.');
  else if (!diligence.repLetterDocumentId) gaps.push('Attach the signed representation letter from the data room.');
  return gaps;
}
