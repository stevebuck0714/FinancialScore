import assert from 'node:assert/strict';
import { computeReconcilingItems, matchAccountTransactions, totalsTestExceptions } from '../lib/cash-proof/transaction-match';

const bk = (key: string, date: string, amount: number, num = '', name = '') => ({ key, date, type: amount > 0 ? 'Deposit' : 'Check', num, name, amount });
const bn = (id: string, date: string, amount: number, description = '', checkNumber: string | null = null) => ({ id, externalId: id, date, description, checkNumber, amount });

const result = matchAccountTransactions({
  bankAccountId: 'A',
  accountLabel: 'Checking',
  book: [
    bk('b1', '2025-03-03', 500, '', 'Customer A'),
    bk('b2', '2025-03-03', 250, '', 'Customer B'),
    bk('b3', '2025-03-10', -1200, '1001', 'Landlord'),
    bk('b4', '2025-03-28', -300, '1002', 'Vendor X'),
    bk('b5', '2025-03-15', 900, '', 'Fake deposit'),
    bk('b6', '2025-03-20', -2000, '', 'Payroll'),
    bk('b7', '2025-03-05', -75, '1003', 'Supplies'),
    bk('b8', '2024-12-01', -400, '999', 'Old check'),
    bk('b9', '2025-03-31', 1000, '', 'Late deposit'),
  ],
  bank: [
    bn('k1', '2025-03-04', 750, 'DEPOSIT'),
    bn('k2', '2025-03-12', -1200, 'CHECK 1001', '1001'),
    bn('k3', '2025-04-08', -300, 'CHECK 1002', '1002'),
    bn('k4', '2025-03-21', -1500, 'GUSTO NET PAY'),
    bn('k5', '2025-03-21', -500, 'GUSTO TAX'),
    bn('k6', '2025-03-07', -57, 'CHECK 1003', '1003'),
    bn('k7', '2025-03-18', 5000, 'ZELLE FROM OWNER'),
    bn('k8', '2025-03-31', -15, 'MONTHLY SERVICE FEE'),
    bn('k9', '2025-03-31', 2.1, 'INTEREST PAYMENT'),
    bn('k10', '2025-04-01', 1000, 'DEPOSIT'),
  ],
  periodStart: '2024-04-01',
  periodEnd: '2025-03-31',
  bookCoverageStart: '2024-01-01',
  bankMonths: ['2024-12', '2025-01', '2025-02', '2025-03', '2025-04'],
});

const matchSummary = result.matches.map((m) => `${m.rule}:${m.book.map((b) => b.key).join('+')}=${m.bank.map((b) => b.id).join('+')}`).sort();
assert.deepEqual(matchSummary, [
  'BATCHED_DEPOSIT:b1+b2=k1',
  'CHECK_NUMBER:b3=k2',
  'CHECK_NUMBER:b4=k3',
  'EXACT:b9=k10',
  'SPLIT_WITHDRAWAL:b6=k4+k5',
]);
assert.ok(result.matches.find((m) => m.book[0].key === 'b4')!.isReconcilingItem, 'check clearing next month is a reconciling item');

const exceptionTypes = result.exceptions.map((e) => `${e.type}:${e.amount}`).sort();
assert.deepEqual(exceptionTypes, [
  'AMOUNT_MISMATCH:18',
  'BANK_FEES_INTEREST:-12.9',
  'BANK_ONLY_DEPOSIT:5000',
  'BOOK_ONLY_DEPOSIT:900',
  'STALE_OUTSTANDING_CHECK:-400',
]);
assert.equal(result.outstanding.length, 0);
// Book not yet in bank at 3/31: -300 + 900 - 400 + 1000 - 75; bank not yet in books: -57, +5000, -15, +2.10.
assert.equal(computeReconcilingItems(result, '2025-03'), -3805.1);
assert.equal(computeReconcilingItems(result, '2024-06'), null, 'no bank detail for the month');

// A deposit booked in the last days of the bank data cannot be tested yet: outstanding, not an exception.
const edge = matchAccountTransactions({
  bankAccountId: 'A',
  accountLabel: 'Checking',
  book: [bk('d1', '2025-03-30', 400)],
  bank: [],
  periodStart: '2025-01-01',
  periodEnd: '2025-03-31',
  bookCoverageStart: '2024-01-01',
  bankMonths: ['2025-03'],
});
assert.equal(edge.exceptions.length, 0);
assert.equal(edge.outstanding.length, 1);

// Totals: a January overstatement that reverses in February is timing, not an exception.
assert.deepEqual(
  totalsTestExceptions({
    bankAccountId: 'A',
    months: ['2025-01', '2025-02'],
    book: [bk('x', '2025-01-15', 1000), bk('y', '2025-02-27', 300), bk('z', '2025-01-30', 200)],
    statementTotals: new Map([
      ['2025-01', { deposits: 1000, withdrawals: null }],
      ['2025-02', { deposits: 500, withdrawals: null }],
    ]),
    lineLevelMonths: new Set(),
    bookCoverageStart: '2024-01-01',
    tolerance: 1,
  }),
  [],
);
const totals = totalsTestExceptions({
  bankAccountId: 'A',
  months: ['2025-01', '2025-02'],
  book: [bk('x', '2025-01-15', 1500), bk('y', '2025-02-15', 500)],
  statementTotals: new Map([
    ['2025-01', { deposits: 1000, withdrawals: null }],
    ['2025-02', { deposits: 500, withdrawals: null }],
  ]),
  lineLevelMonths: new Set(),
  bookCoverageStart: '2024-01-01',
  tolerance: 1,
});
assert.deepEqual(totals.map((e) => `${e.month}:${e.amount}`), ['2025-01:500']);

console.log('cash proof matching: all checks passed');
