import assert from 'node:assert/strict';
import {
  DEFAULT_DILIGENCE,
  INTERVIEW_TOPICS,
  automaticReliedOnSources,
  diligenceGaps,
  normalizeDiligence,
  representationLetterDraft,
  validateDiligence,
} from '../lib/business-valuation/diligence';

// Normalizing drops unknown topics, blank notes, bad dates, and duplicate document ids.
const normalized = normalizeDiligence({
  interviewDate: '2026-11-20',
  siteVisitDate: 'not a date',
  interviewMethod: 'CARRIER_PIGEON',
  responses: { customers: 'Walk-in retail, no concentration', bogus: 'x', employees: '   ' },
  reliedOnDocumentIds: ['a', 'a', 'b', ''],
  repLetterStatus: 'LOST',
});
assert.equal(normalized.interviewDate, '2026-11-20');
assert.equal(normalized.siteVisitDate, null);
assert.equal(normalized.interviewMethod, null);
assert.deepEqual(normalized.responses, { customers: 'Walk-in retail, no concentration' });
assert.deepEqual(normalized.reliedOnDocumentIds, ['a', 'b']);
assert.equal(normalized.repLetterStatus, 'NOT_SENT');

// Validation.
assert.equal(validateDiligence(DEFAULT_DILIGENCE), null);
assert.match(validateDiligence({ ...DEFAULT_DILIGENCE, repLetterStatus: 'SIGNED' }) || '', /signer and the date signed/);
assert.match(
  validateDiligence({ ...DEFAULT_DILIGENCE, repLetterSentDate: '2026-11-20', repLetterSignedDate: '2026-11-19' }) || '',
  /before it was sent/,
);

// Gaps shrink as the record is completed.
assert.equal(diligenceGaps(DEFAULT_DILIGENCE).length, 4);
const complete = normalizeDiligence({
  interviewDate: '2026-11-20',
  siteVisitDate: '2026-11-21',
  responses: Object.fromEntries(INTERVIEW_TOPICS.map((topic) => [topic.key, 'Discussed'])),
  repLetterStatus: 'SIGNED',
  repLetterSignerName: 'Jane Owner',
  repLetterSignedDate: '2026-11-22',
  repLetterDocumentId: 'doc1',
});
assert.deepEqual(diligenceGaps(complete), []);
assert.deepEqual(diligenceGaps({ ...complete, repLetterDocumentId: null }), ['Attach the signed representation letter from the data room.']);

// Automatic sources come from the snapshot.
const sources = automaticReliedOnSources(
  {
    capturedAt: '2026-11-25T14:00:00Z',
    months: [{ month: '2025-04' }, { month: '2026-03' }, { month: '2025-12' }],
    qoe: { savedTotals: { qualityOfEarnings: 1 }, savedAt: '2026-11-01T12:00:00Z' },
    loans: { instruments: [{}] },
    taxReturns: { entries: { '2024': {}, '2023': {} } },
  },
  { appraisalCount: 1, dealDocumentName: 'LOI.pdf', formatMonth: (m) => m, formatDate: (d) => d.slice(0, 10) },
);
assert.deepEqual(sources.map((s) => s.key), ['financials', 'qoe', 'loans', 'tax', 'appraisals', 'deal']);
assert.equal(sources[0].detail, '2025-04 through 2026-03 (3 months), frozen 2026-11-25');
assert.equal(sources[3].detail, '2023, 2024');
assert.deepEqual(automaticReliedOnSources(null, { appraisalCount: 0, dealDocumentName: null, formatMonth: (m) => m, formatDate: (d) => d }), []);

// Letter draft fills names and lists documents.
const letter = representationLetterDraft({ companyName: 'Acme LLC', valuationDate: 'Nov 25, 2026', appraiserFirm: 'Corelytics', signerName: 'Jane Owner', signerTitle: 'President', documents: ['Bank statements'] });
assert.ok(letter.includes('Valuation of Acme LLC as of Nov 25, 2026'));
assert.ok(letter.includes('- Bank statements'));
assert.ok(letter.includes('Jane Owner\nPresident'));

console.log('business valuation diligence tests passed');
