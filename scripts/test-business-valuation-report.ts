import assert from 'node:assert/strict';
import { DEFAULT_DILIGENCE } from '../lib/business-valuation/diligence';
import { DEFAULT_OUTLOOK } from '../lib/business-valuation/outlook';
import { DEFAULT_RECONCILIATION, type ReconciliationResult } from '../lib/business-valuation/reconciliation';
import { DEFINITIONS, certificationStatements, optionLabel, reportReadiness } from '../lib/business-valuation/report';

assert.equal(optionLabel('purpose', 'SBA_CHANGE_OF_OWNERSHIP'), 'SBA change of ownership');
assert.equal(optionLabel('purpose', 'BOGUS'), '—');

// Definitions follow the standard and premise of value.
const terms = (engagement: { standardOfValue?: string; premiseOfValue?: string }) => DEFINITIONS.filter((item) => !item.when || item.when(engagement)).map((item) => item.term);
assert.ok(terms({ standardOfValue: 'FAIR_MARKET_VALUE', premiseOfValue: 'GOING_CONCERN' }).includes('Fair market value'));
assert.ok(!terms({ standardOfValue: 'FAIR_MARKET_VALUE' }).includes('Investment value'));
assert.ok(terms({ standardOfValue: 'INVESTMENT_VALUE', premiseOfValue: 'ORDERLY_LIQUIDATION' }).includes('Orderly liquidation'));

const certification = certificationStatements({ siteVisitDate: 'November 1, 2026', reviewerName: 'Pat Reviewer' });
assert.ok(certification.includes('A site visit of the business was made on November 1, 2026.'));
assert.ok(certification.some((item) => item.startsWith('Pat Reviewer reviewed this report.')));
assert.ok(certificationStatements({ siteVisitDate: null, reviewerName: null }).includes('No site visit of the business was made.'));

const result = { stale: false } as ReconciliationResult;
const base = {
  hasSnapshot: true,
  independenceConfirmed: true,
  appraiserName: 'Alex Appraiser',
  reviewerName: 'Pat Reviewer',
  lenderName: 'First Bank',
  status: 'FINAL',
  reconciliation: { ...DEFAULT_RECONCILIATION, concludedAt: '2026-11-01T00:00:00Z', concludedValue: 900000 },
  result,
  outlook: { ...DEFAULT_OUTLOOK, approvedAt: '2026-11-01T00:00:00Z' },
  diligence: {
    ...DEFAULT_DILIGENCE,
    interviewDate: '2026-10-01',
    siteVisitDate: '2026-10-02',
    responses: { history: 'a', customers: 'a', employees: 'a', suppliers: 'a', competition: 'a', facilities: 'a', litigation: 'a', transition: 'a', outlook: 'a' },
    repLetterStatus: 'SIGNED' as const,
    repLetterDocumentId: 'doc',
  },
};
assert.deepEqual(reportReadiness(base), []);
const draft = reportReadiness({ ...base, status: 'DRAFT', reviewerName: null, result: { stale: true } as ReconciliationResult });
assert.ok(draft.includes('No reviewer is assigned.'));
assert.ok(draft.some((item) => item.includes('conclude again')));
assert.ok(draft.some((item) => item.includes('marked DRAFT')));
assert.ok(reportReadiness({ ...base, reconciliation: DEFAULT_RECONCILIATION }).includes('The value is not concluded on the Reconciliation tab.'));

console.log('business valuation report tests passed');
