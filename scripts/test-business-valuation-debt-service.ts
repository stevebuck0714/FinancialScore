import assert from 'node:assert/strict';
import {
  DEFAULT_DEBT_SERVICE,
  computeDebtService,
  existingLoansFromSnapshot,
  financingScenario,
  monthlyPayment,
  normalizeDebtService,
  validateDebtService,
} from '../lib/business-valuation/debt-service';
import { DEFAULT_DEAL_TERMS, type Appraisal } from '../lib/business-valuation/deal-terms';
import type { EarningsBaseResult } from '../lib/business-valuation/earnings-base';

// Standard amortization: $900,000 at 10.5% over 10 years is about $12,144 a month.
assert.ok(Math.abs(monthlyPayment(900000, 10.5, 120) - 12144) < 5);
assert.equal(monthlyPayment(120000, 0, 120), 1000);
assert.equal(monthlyPayment(0, 10, 120), 0);

// Normalizing keeps defaults for missing fields and drops empty loan choices.
const normalized = normalizeDebtService({ sbaRatePct: '10.5%', downPaymentPct: '', existingLoans: { a: { stays: true }, b: {}, c: { annualPayment: '$12,000' } } });
assert.equal(normalized.sbaRatePct, 10.5);
assert.equal(normalized.downPaymentPct, null);
assert.equal(normalized.sbaTermMonths, 120);
assert.deepEqual(normalized.existingLoans, { a: { stays: true, annualPayment: null }, c: { stays: null, annualPayment: 12000 } });
assert.equal(validateDebtService(DEFAULT_DEBT_SERVICE), null);
assert.match(validateDebtService({ ...DEFAULT_DEBT_SERVICE, sbaTermMonths: 400 }) || '', /360/);
assert.match(validateDebtService({ ...DEFAULT_DEBT_SERVICE, downPaymentPct: 120 }) || '', /Down payment/);

// Existing loans: closed and zero-balance loans drop out; lines of credit are interest only; asset sales pay off by default.
const instruments = [
  { instrumentKey: 'term', displayName: 'Bank term loan', targetField: 'ltd', terms: { currentBalance: 100000, interestRatePct: 6, maturityDate: '2031-10-31', lender: 'First Bank' } },
  { instrumentKey: 'loc', displayName: 'Revolver', targetField: 'loc', derivedCurrentBalance: -50000, terms: { interestRatePct: 8 } },
  { instrumentKey: 'unknown', displayName: 'Equipment note', terms: { currentBalance: 20000 } },
  { instrumentKey: 'closed', terms: { currentBalance: 5000, closed: true } },
  { instrumentKey: 'paid', terms: { currentBalance: 0 } },
];
const assetLoans = existingLoansFromSnapshot(instruments, DEFAULT_DEBT_SERVICE, { transactionStructure: 'ASSET', valuationDate: '2026-10-31' });
assert.deepEqual(assetLoans.map((loan) => loan.key), ['term', 'loc', 'unknown']);
assert.equal(assetLoans[0].remainingMonths, 60);
assert.ok(Math.abs((assetLoans[0].computedAnnualPayment ?? 0) - monthlyPayment(100000, 6, 60) * 12) < 0.01);
assert.equal(assetLoans[1].type, 'LINE_OF_CREDIT');
assert.equal(assetLoans[1].computedAnnualPayment, 4000);
assert.equal(assetLoans[2].computedAnnualPayment, null);
assert.ok(assetLoans.every((loan) => !loan.stays));
assert.ok(existingLoansFromSnapshot(instruments, DEFAULT_DEBT_SERVICE, { transactionStructure: 'STOCK', valuationDate: null }).every((loan) => loan.stays));

// Sources and uses: $1,000,000 price with $200,000 real estate, 10% down, $100,000 seller note, 2% fee financed.
const deal = { ...DEFAULT_DEAL_TERMS, purchasePrice: 1000000, included: { ...DEFAULT_DEAL_TERMS.included, realEstate: true }, sellerNoteAmount: 100000, sellerNoteRatePct: 6, sellerNoteTermMonths: 60 };
const appraisals: Appraisal[] = [{ id: 'r', assetType: 'REAL_ESTATE', appraiserFirm: null, effectiveDate: null, value: 200000, includedInDeal: true, documentId: null, notes: null }];
const debt = { ...DEFAULT_DEBT_SERVICE, sbaRatePct: 10, guaranteeFeePct: 2, closingCosts: 20000 };
const scenario = financingScenario(1000000, { debt, deal, appraisals, existingAnnual: 0 });
assert.equal(scenario.businessPrice, 800000);
assert.equal(scenario.realEstate, 200000);
// Business project 820,000: equity 82,000, seller note 100,000, SBA base 638,000. Real estate loan 180,000. Fee 2% of 818,000 = 16,360.
assert.equal(scenario.sources.buyerEquity, 82000 + 20000);
assert.equal(scenario.sources.realEstateLoan, 180000);
assert.ok(Math.abs(scenario.uses.guaranteeFee - 16360) < 0.01);
assert.ok(Math.abs(scenario.sources.sbaLoan - (638000 + 16360)) < 0.01);
assert.ok(Math.abs(scenario.sources.total - scenario.uses.total) < 0.01);
assert.ok(Math.abs((scenario.debtService.sellerNote ?? 0) - monthlyPayment(100000, 6, 60) * 12) < 0.01);
// Standby seller note has no payments; a fee not financed is paid with buyer equity.
const standby = financingScenario(1000000, { debt: { ...debt, financeGuaranteeFee: false }, deal: { ...deal, sellerNoteStandby: true }, appraisals, existingAnnual: 0 });
assert.equal(standby.debtService.sellerNote, 0);
assert.ok(Math.abs(standby.sources.total - standby.uses.total) < 0.01);
// Missing SBA rate leaves debt service unknown.
assert.equal(financingScenario(1000000, { debt: DEFAULT_DEBT_SERVICE, deal, appraisals, existingAnnual: 0 }).debtService.total, null);

// Coverage at both prices, plus the highest supportable price.
const earnings = {
  normalizedEbitda: 260000,
  normalCapex: 10000,
  ebitdaLessCapex: 250000,
  ownerCompAdjustment: -20000,
  normalizationTotal: 5000,
} as unknown as EarningsBaseResult;
const snapshot = {
  periods: [{ key: 'FY2025', label: 'FY2025', fiscalYear: 2025, isYearToDate: false, startMonth: '2025-01', endMonth: '2025-12', months: [], storedMonths: [], missingMonths: [], isComplete: true }],
  periodSummaries: [{ key: 'FY2025', label: 'FY2025', monthCount: 12, income: { ebitda: 240000 }, balanceSheet: null }],
  loans: { instruments, error: null },
} as any;
const result = computeDebtService(debt, { deal, appraisals, snapshot, earnings, value: 800000, valueLabel: 'Concluded value', transactionStructure: 'STOCK', valuationDate: '2026-10-31' });
const atPrice = result.tests.find((test) => test.key === 'price')!;
const atValue = result.tests.find((test) => test.key === 'value')!;
assert.equal(result.cashAvailable.latestYear, 240000 - 20000 + 5000 - 10000);
assert.ok(result.warnings.some((warning) => warning.includes('Equipment note')));
assert.ok(atPrice.scenario && atValue.scenario);
const total = atPrice.scenario!.debtService.total!;
assert.ok(Math.abs((atPrice.coverage[0].dscr ?? 0) - 250000 / total) < 1e-9);
assert.ok((atValue.coverage[0].dscr ?? 0) > (atPrice.coverage[0].dscr ?? 0));
const max = atPrice.maxSupportablePrice!;
assert.ok(max > 0);
const atMax = financingScenario(max, { debt, deal, appraisals, existingAnnual: result.existingAnnual });
const aboveMax = financingScenario(max + 5000, { debt, deal, appraisals, existingAnnual: result.existingAnnual });
assert.ok(250000 / atMax.debtService.total! >= 1.25);
assert.ok(250000 / aboveMax.debtService.total! < 1.25);
assert.ok(computeDebtService(DEFAULT_DEBT_SERVICE, { deal: DEFAULT_DEAL_TERMS, appraisals: [], snapshot: null, earnings: { ...earnings, ebitdaLessCapex: null } as EarningsBaseResult, value: null, valueLabel: 'Income approach value', transactionStructure: null, valuationDate: null })
  .warnings.some((warning) => warning.includes('Enter the SBA loan rate')));

console.log('business valuation debt service tests passed');
