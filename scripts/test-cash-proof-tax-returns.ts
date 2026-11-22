import assert from 'node:assert/strict';
import { parseTaxReturn, taxReturnPeriodKey } from '../lib/cash-proof/tax-return-parser';
import { computeTaxReturnComparison } from '../lib/cash-proof/tax-return';
import type { RevenueReconciliationPeriod } from '../lib/cash-proof/revenue-reconciliation';

const sCorp = `
Form 1120-S U.S. Income Tax Return for an S Corporation OMB No. 1545-0123 2024
For calendar year 2024 or tax year beginning , 2024, ending , 20
Name ACME HEATING LLC  EIN 12-3456789  123 Main St Columbus OH 43215
Income 1a Gross receipts or sales . . . . . . . . . . . . . . 1a 2,456,789
b Returns and allowances . . . . . . . . . . . . . . . 1b 12,345
c Balance. Subtract line 1b from line 1a . . . . . . . . . 1c 2,444,444
2 Cost of goods sold (attach Form 1125-A) . . . 2 1,234,567
`;
const s = parseTaxReturn(sCorp, 'Acme 2024 1120S.pdf');
assert.equal(s.form, '1120S');
assert.equal(s.taxYear, 2024);
assert.equal(s.grossReceipts, 2456789);
assert.equal(s.returnsAllowances, 12345);
assert.equal(s.netReceipts, 2444444);
assert.equal(s.ambiguity, null);
assert.equal(taxReturnPeriodKey(s, 12), 'FY2024');
assert.equal(taxReturnPeriodKey(s, 6), 'FY2025');

// Blank returns line: derived from the balance line.
const partnership = `
Form 1065 U.S. Return of Partnership Income 2023
For calendar year 2023, or tax year beginning 07/01/2023, ending 06/30/2024
1a Gross receipts or sales 1a 980,000 b Returns and allowances 1b c Balance. Subtract line 1b from line 1a 1c 975,500 2 Cost of goods sold
`;
const p = parseTaxReturn(partnership);
assert.equal(p.form, '1065');
assert.equal(p.grossReceipts, 980000);
assert.equal(p.returnsAllowances, 4500);
assert.equal(p.endingMonth, 6);
assert.equal(taxReturnPeriodKey(p, 6), 'FY2024');

const scheduleC = `
SCHEDULE C (Form 1040) 2024 Profit or Loss From Business (Sole Proprietorship)
1 Gross receipts or sales. See instructions for line 1 and check the box if this income was reported to you on
Form W-2 and the "Statutory employee" box on that form was checked . . . . . . 1 312,450
2 Returns and allowances . . . . . 2 3 Subtract line 2 from line 1 . . . 3 312,450 4 Cost of goods sold
`;
const c = parseTaxReturn(scheduleC);
assert.equal(c.form, 'SCHEDULE_C');
assert.equal(c.taxYear, 2024);
assert.equal(c.grossReceipts, 312450);
assert.equal(c.returnsAllowances, null);

const corp = 'Form 1120 U.S. Corporation Income Tax Return For calendar year 2023 1a Gross receipts or sales 1a 5,000,000';
assert.equal(parseTaxReturn(corp).form, '1120');

const twoBusinesses = `${scheduleC}\n${scheduleC.replace('312,450', '88,000').replace('312,450', '88,000')}`;
assert.match(String(parseTaxReturn(twoBusinesses).ambiguity), /2 different gross receipts/);

assert.equal(parseTaxReturn('Form 941 Employer’s QUARTERLY Federal Tax Return 2024 wages 125,000').form, null);

// TurboTax prints every label first and the page's values in one block below them.
const turboTaxScheduleC = (business: string, values: string[]) => `
SCHEDULE C (Form 1040) 2025 Profit or Loss From Business (Sole Proprietorship)
C Business name. If no separate business name, leave blank. D Employer ID number (EIN) (see instr.)
Part I Income
1 Gross receipts or sales. See instructions for line 1 and check the box if this income was reported to you on
Form W-2 and the “Statutory employee” box on that form was checked . . . . . . . . . 1
2 Returns and allowances . . . . . . . . . . . . 2
3 Subtract line 2 from line 1 . . . . . . . . . . 3
4 Cost of goods sold (from line 42) . . . . . . . 4
5 Gross profit. Subtract line 4 from line 3 . . . 5
28 Total expenses before expenses for business use of home. Add lines 8 through 27b . . 28
31 Net profit or (loss). Subtract line 30 from line 29. 31
Schedule C (Form 1040) 2025 Created 4/3/25
Used merchandise retailers 4 5 9 5 1 0
${business} 1 2 3 4 5 6 7 8 9
100 Main St
Springfield, WA 99216
${values.join('\n')}
`;
const personalReturn = `
Form 1040 U.S. Individual Income Tax Return 2025
Schedule K-1 (Form 1120-S), box 17, code V. Form 1120-S, Schedule K, line 9.
${turboTaxScheduleC('Wiseware Exchange DBA Plato\'s Closet, Spokane Valley', ['18,814.', '6,670.', '211,029.', '847,821.', '345,816.', '502,005.', '502,005.', '478,150.', '23,855.', '23,855.', '847,821.'])}
${turboTaxScheduleC('Lakeside Consulting', ['18,175.', '106,771.', '106,771.', '106,771.', '32,197.', '74,574.', '73,674.'])}
`;
const turbo = parseTaxReturn(personalReturn, '2025TurboTaxReturn.pdf', 'PlatosCloset_80957');
assert.equal(turbo.form, 'SCHEDULE_C');
assert.equal(turbo.taxYear, 2025);
assert.equal(turbo.grossReceipts, 847821);
assert.equal(turbo.returnsAllowances, null);
assert.equal(turbo.ambiguity, null);
assert.equal(parseTaxReturn(personalReturn, '2025TurboTaxReturn.pdf', 'Lakeside Consulting').grossReceipts, 106771);
assert.match(String(parseTaxReturn(personalReturn, '2025TurboTaxReturn.pdf').ambiguity), /\$847,821, \$106,771/);

// Embedded fonts can leave a page's labels unreadable; the values follow the business name.
const garbledLabels = `
Form 1040 U.S. Individual Income Tax Return 2024
Schedule K-1 (Form 1120-S), box 17. Income or Loss From Partnerships and S Corporations
D7;9J:; 6<<M%u'"&j"&e A6:F7Aw@=7\`G67
Retail
458110
Wiseware Exchange, LLC DBA Plato's Closet
332069101
18,566.
9,920.
9,920.
-5,699.
-5,699.
15,619.
6,389.
8,646.8,646.
18,566.
REV 03/20/25 Intuit.cg.cfp.sp
Wiseware Exchange, LLC DBA Plato's Closet33-2069101
-5,699.
REV 03/20/25 Intuit.cg.cfp.sp
`;
const garbled = parseTaxReturn(garbledLabels, '2024_TaxReturn (1).pdf', 'PlatosCloset_80957');
assert.equal(garbled.form, 'SCHEDULE_C');
assert.equal(garbled.grossReceipts, 18566);
assert.equal(garbled.ambiguity, null);

// Comparison.
const period = (key: string, adjustedDeposits: number, reportedRevenue: number | null): RevenueReconciliationPeriod => ({
  key,
  label: key,
  startMonth: '',
  endMonth: '',
  monthCount: 12,
  complete: true,
  status: 'RECONCILED',
  note: null,
  bankDeposits: adjustedDeposits,
  missingDeposits: 0,
  nonRevenueDeposits: 0,
  addBacks: 0,
  adjustedDeposits,
  receivablesChange: 0,
  contractAssetsChange: 0,
  contractLiabilitiesChange: 0,
  impliedRevenue: adjustedDeposits,
  reportedRevenue,
  difference: null,
  variancePct: null,
  byCategory: {},
});
const entry = (grossReceipts: number, basis: 'CASH' | 'ACCRUAL', note: string | null = null) => ({
  form: '1120S' as const,
  basis,
  grossReceipts,
  returnsAllowances: 0,
  dataRoomDocumentId: null,
  source: 'entered' as const,
  note,
  updatedAt: '',
});
const result = computeTaxReturnComparison(
  [
    period('FY2022', 1_000_000, 1_010_000),
    period('FY2023', 1_000_000, 1_200_000),
    period('FY2024', 1_000_000, 1_200_000),
    period('FY2025', 900_000, 950_000),
    { ...period('FY2026', 0, 0), complete: false },
  ],
  {
    FY2022: entry(1_000_000, 'ACCRUAL'),
    FY2023: entry(1_005_000, 'CASH'),
    FY2024: entry(1_000_000, 'ACCRUAL', 'Year-end accruals booked after filing.'),
  },
  2,
);
assert.deepEqual(
  result.map((r) => [r.key, r.comparedTo, r.status]),
  [
    ['FY2022', 'BOOKS', 'RECONCILED'],
    ['FY2023', 'DEPOSITS', 'RECONCILED'],
    ['FY2024', 'BOOKS', 'EXPLAINED'],
    ['FY2025', 'BOOKS', 'NOT_PROVIDED'],
  ],
);
assert.equal(result[1].bookDifference, 195000);
assert.equal(computeTaxReturnComparison([period('FY2023', 1_000_000, 1_200_000)], { FY2023: entry(1_000_000, 'ACCRUAL') }, 2)[0].status, 'VARIANCE');

console.log('cash proof tax return tests passed');
