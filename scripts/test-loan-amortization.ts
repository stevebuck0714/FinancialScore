import assert from 'node:assert/strict';
import {
  attachActualsToSchedule,
  buildAmortizationSchedule,
  missingAmortizationTerms,
  parsePaymentFrequency,
  sumScheduledPrincipalByWeek,
} from '../lib/loans/amortization';

function close(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

// Textbook 30/360: $100,000 at 6% over 360 months pays $599.55.
const textbook = buildAmortizationSchedule({
  loanAmount: 100_000,
  annualRatePct: 6,
  amortizationTermMonths: 360,
  firstPaymentDate: '2026-02-01',
  loanOriginationDate: '2026-01-01',
  dayCountConvention: '30/360',
});
assert.ok(textbook);
close(textbook.scheduledPayment, 599.55);
assert.equal(textbook.rows.length, 360);
close(textbook.rows[0].interest, 500);
close(textbook.rows[0].principal, 99.55);
assert.equal(textbook.rows.at(-1)!.balance, 0);
assert.equal(textbook.rows[1].date, '2026-03-01');

// Maturity before the end of amortization makes a balloon.
const balloon = buildAmortizationSchedule({
  loanAmount: 100_000,
  annualRatePct: 6,
  amortizationTermMonths: 360,
  firstPaymentDate: '2026-02-01',
  maturityDate: '2031-01-01',
  dayCountConvention: '30/360',
});
assert.ok(balloon);
const last = balloon.rows.at(-1)!;
assert.equal(last.date, '2031-01-01');
assert.equal(last.isBalloon, true);
assert.equal(last.balance, 0);
assert.ok(last.principal > 90_000);

// Actual/365 interest follows the days in each month.
const actual365 = buildAmortizationSchedule({
  loanAmount: 100_000,
  annualRatePct: 6,
  amortizationTermMonths: 360,
  firstPaymentDate: '2026-02-01',
  loanOriginationDate: '2026-01-01',
  dayCountConvention: 'actual/365',
});
assert.ok(actual365);
close(actual365.rows[0].interest, (100_000 * 0.06 * 31) / 365);
assert.ok(actual365.rows[1].interest < actual365.rows[0].interest);

// Month-end anchors clamp instead of skipping a month.
const monthEnd = buildAmortizationSchedule({
  loanAmount: 10_000,
  annualRatePct: 5,
  amortizationTermMonths: 12,
  firstPaymentDate: '2026-01-31',
});
assert.equal(monthEnd!.rows[1].date, '2026-02-28');
assert.equal(monthEnd!.rows[2].date, '2026-03-31');

assert.equal(parsePaymentFrequency('').key, 'monthly');
assert.equal(parsePaymentFrequency('Quarterly').key, 'quarterly');
assert.equal(parsePaymentFrequency('bi-weekly').key, 'bi-weekly');
assert.deepEqual(missingAmortizationTerms({ originalBalance: 5, interestRatePct: 0, amortizationTermMonths: 12 }), [
  'First Payment Date',
]);
assert.deepEqual(
  sumScheduledPrincipalByWeek(textbook.rows.slice(0, 3), ['2026-01-31', '2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28']),
  [99.55, 0, 0, 0, 100.05],
);

// A payment posted 4 days late still lands on its due-date row; balances walk back from today.
const withActuals = attachActualsToSchedule({
  rows: textbook.rows.slice(0, 4),
  postings: [
    { date: '2026-02-05', kind: 'interest', amount: 500 },
    { date: '2026-02-05', kind: 'principal', amount: 99.55 },
    { date: '2026-03-02', kind: 'interest', amount: 499.5 },
    { date: '2026-03-02', kind: 'principal', amount: 100.05 },
  ],
  currentBalance: 99_800.4,
  today: '2026-03-20',
});
assert.equal(withActuals[0].status, 'paid');
close(withActuals[0].actualPrincipal!, 99.55);
close(withActuals[0].actualBalance!, 99_900.45);
close(withActuals[0].balanceDifference!, 0);
assert.equal(withActuals[1].status, 'paid');
close(withActuals[1].actualInterest!, 499.5);
close(withActuals[1].actualBalance!, 99_800.4);
assert.equal(withActuals[2].status, 'current');
close(withActuals[2].actualPrincipal!, 0);
assert.equal(withActuals[3].status, 'future');
assert.equal(withActuals[3].actualBalance, null);

console.log('loan amortization tests passed');
