import { optionalNumber, optionalText, type Appraisal, type DealTerms } from './deal-terms';
import { completeFiscalYears, type EarningsBaseResult, type SnapshotEarningsInput } from './earnings-base';

export const DEFAULT_REQUIRED_DSCR = 1.25;
export const SBA_7A_MAX_LOAN = 5000000;
export const SBA_MIN_EQUITY_PCT = 10;

export type ExistingLoanChoice = { stays: boolean | null; annualPayment: number | null };

export type DebtService = {
  downPaymentPct: number | null;
  sbaRatePct: number | null;
  sbaTermMonths: number | null;
  /** Blank uses the SBA loan rate. */
  realEstateRatePct: number | null;
  realEstateTermMonths: number | null;
  guaranteeFeePct: number | null;
  financeGuaranteeFee: boolean;
  closingCosts: number | null;
  workingCapitalFinanced: number | null;
  requiredDscr: number | null;
  existingLoans: Record<string, ExistingLoanChoice>;
  notes: string | null;
};

export const DEFAULT_DEBT_SERVICE: DebtService = {
  downPaymentPct: 10,
  sbaRatePct: null,
  sbaTermMonths: 120,
  realEstateRatePct: null,
  realEstateTermMonths: 300,
  guaranteeFeePct: null,
  financeGuaranteeFee: true,
  closingCosts: null,
  workingCapitalFinanced: null,
  requiredDscr: DEFAULT_REQUIRED_DSCR,
  existingLoans: {},
  notes: null,
};

const NUMBER_FIELDS = [
  'downPaymentPct', 'sbaRatePct', 'sbaTermMonths', 'realEstateRatePct', 'realEstateTermMonths',
  'guaranteeFeePct', 'closingCosts', 'workingCapitalFinanced', 'requiredDscr',
] as const;

export function normalizeDebtService(raw: unknown): DebtService {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result: DebtService = { ...DEFAULT_DEBT_SERVICE, existingLoans: {} };
  for (const field of NUMBER_FIELDS) {
    if (field in source) result[field] = optionalNumber(source[field]);
  }
  if (typeof source.financeGuaranteeFee === 'boolean') result.financeGuaranteeFee = source.financeGuaranteeFee;
  result.notes = optionalText(source.notes);
  const loans = source.existingLoans && typeof source.existingLoans === 'object' ? (source.existingLoans as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(loans)) {
    if (!key || !value || typeof value !== 'object') continue;
    const choice = value as Record<string, unknown>;
    const normalized = { stays: typeof choice.stays === 'boolean' ? choice.stays : null, annualPayment: optionalNumber(choice.annualPayment) };
    if (normalized.stays !== null || normalized.annualPayment !== null) result.existingLoans[key] = normalized;
  }
  return result;
}

export function validateDebtService(debt: DebtService): string | null {
  if (debt.downPaymentPct !== null && (debt.downPaymentPct < 0 || debt.downPaymentPct > 100)) return 'Down payment must be between 0% and 100%.';
  for (const field of ['sbaRatePct', 'realEstateRatePct', 'guaranteeFeePct'] as const) {
    const value = debt[field];
    if (value !== null && (value < 0 || value > 30)) return 'Rates and fees must be between 0% and 30%.';
  }
  for (const field of ['sbaTermMonths', 'realEstateTermMonths'] as const) {
    const value = debt[field];
    if (value !== null && (!Number.isInteger(value) || value <= 0 || value > 360)) return 'Loan terms must be whole months up to 360.';
  }
  for (const field of ['closingCosts', 'workingCapitalFinanced'] as const) {
    if ((debt[field] ?? 0) < 0) return 'Amounts cannot be negative.';
  }
  if (debt.requiredDscr !== null && (debt.requiredDscr <= 0 || debt.requiredDscr > 5)) return 'Required coverage must be between 0 and 5.';
  if (Object.values(debt.existingLoans).some((loan) => (loan.annualPayment ?? 0) < 0)) return 'Annual payments cannot be negative.';
  return null;
}

/** Level monthly payment that repays the principal over the term. */
export function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const rate = annualRatePct / 100 / 12;
  if (rate === 0) return principal / months;
  return (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const monthsUntil = (fromDate: string, toDate: string) => {
  const [fy, fm] = fromDate.split('-').map(Number);
  const [ty, tm] = toDate.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

export type ExistingLoan = {
  key: string;
  name: string;
  lender: string | null;
  type: 'LINE_OF_CREDIT' | 'TERM';
  balance: number;
  ratePct: number | null;
  remainingMonths: number | null;
  computedAnnualPayment: number | null;
  annualPayment: number | null;
  stays: boolean;
};

/** Open loans from the snapshot debt schedule, with the appraiser's choices applied. */
export function existingLoansFromSnapshot(
  instruments: unknown[],
  debt: DebtService,
  options: { transactionStructure: string | null; valuationDate: string | null },
): ExistingLoan[] {
  const staysByDefault = options.transactionStructure === 'STOCK';
  return instruments.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const instrument = raw as Record<string, any>;
    const terms = (instrument.terms || {}) as Record<string, any>;
    if (terms.closed === true) return [];
    const balance = num(terms.currentBalance) ?? num(instrument.derivedCurrentBalance);
    if (balance === null || Math.abs(balance) < 0.5) return [];
    const key = String(instrument.instrumentKey || '');
    if (!key) return [];
    const isLine = instrument.targetField === 'loc' || /line of credit|\bloc\b/i.test(String(terms.loanType || instrument.displayName || ''));
    const ratePct = num(terms.interestRatePct);
    let remainingMonths: number | null = null;
    if (terms.maturityDate && options.valuationDate) remainingMonths = Math.max(1, monthsUntil(options.valuationDate, String(terms.maturityDate).slice(0, 10)));
    else if (num(terms.amortizationTermMonths)) remainingMonths = num(terms.amortizationTermMonths);
    const absBalance = Math.abs(balance);
    let computedAnnualPayment: number | null = null;
    if (ratePct !== null && isLine) computedAnnualPayment = absBalance * (ratePct / 100);
    else if (ratePct !== null && remainingMonths) computedAnnualPayment = monthlyPayment(absBalance, ratePct, remainingMonths) * 12;
    const choice = debt.existingLoans[key];
    return [{
      key,
      name: String(terms.displayName || instrument.displayName || key),
      lender: terms.lender ? String(terms.lender) : null,
      type: isLine ? 'LINE_OF_CREDIT' : 'TERM',
      balance: absBalance,
      ratePct,
      remainingMonths,
      computedAnnualPayment,
      annualPayment: choice?.annualPayment ?? computedAnnualPayment,
      stays: choice?.stays ?? staysByDefault,
    }];
  });
}

export type FinancingScenario = {
  price: number;
  realEstate: number;
  businessPrice: number;
  uses: { businessPrice: number; realEstate: number; workingCapital: number; closingCosts: number; guaranteeFee: number; total: number };
  sources: { buyerEquity: number; sellerNote: number; sbaLoan: number; realEstateLoan: number; total: number };
  debtService: { sbaLoan: number | null; realEstateLoan: number | null; sellerNote: number | null; existing: number; total: number | null };
};

type ScenarioInput = {
  debt: DebtService;
  deal: DealTerms;
  appraisals: Appraisal[];
  existingAnnual: number;
};

function realEstateInDeal(deal: DealTerms, appraisals: Appraisal[]) {
  if (!deal.included.realEstate) return 0;
  return appraisals.filter((item) => item.assetType === 'REAL_ESTATE' && item.includedInDeal).reduce((total, item) => total + (num(item.value) ?? 0), 0);
}

/**
 * SBA 7(a) sources and uses at a price. The down payment percentage applies to the business
 * project (price, working capital, closing costs) and to the real estate separately; the seller
 * note reduces the SBA loan. A financed guarantee fee is added to the SBA business loan.
 */
export function financingScenario(price: number, input: ScenarioInput): FinancingScenario {
  const { debt, deal } = input;
  const downPct = (debt.downPaymentPct ?? 0) / 100;
  const realEstate = Math.min(realEstateInDeal(deal, input.appraisals), Math.max(price, 0));
  const businessPrice = Math.max(price - realEstate, 0);
  const workingCapital = debt.workingCapitalFinanced ?? 0;
  const closingCosts = debt.closingCosts ?? 0;
  const businessProject = businessPrice + workingCapital + closingCosts;
  const sellerNote = Math.min(deal.sellerNoteAmount ?? 0, businessPrice);
  const businessEquity = businessProject * downPct;
  const realEstateEquity = realEstate * downPct;
  const sbaBase = Math.max(businessProject - businessEquity - sellerNote, 0);
  const realEstateLoan = realEstate - realEstateEquity;
  const guaranteeFee = ((debt.guaranteeFeePct ?? 0) / 100) * (sbaBase + realEstateLoan);
  const sbaLoan = sbaBase + (debt.financeGuaranteeFee ? guaranteeFee : 0);
  const buyerEquity = businessEquity + realEstateEquity + (debt.financeGuaranteeFee ? 0 : guaranteeFee);
  const usesTotal = businessPrice + realEstate + workingCapital + closingCosts + guaranteeFee;

  const sbaRate = debt.sbaRatePct;
  const realEstateRate = debt.realEstateRatePct ?? sbaRate;
  const sbaDebt = sbaRate !== null && debt.sbaTermMonths ? monthlyPayment(sbaLoan, sbaRate, debt.sbaTermMonths) * 12 : sbaLoan > 0 ? null : 0;
  const realEstateDebt = realEstateLoan <= 0 ? 0 : realEstateRate !== null && debt.realEstateTermMonths ? monthlyPayment(realEstateLoan, realEstateRate, debt.realEstateTermMonths) * 12 : null;
  let sellerDebt: number | null = 0;
  if (sellerNote > 0 && !deal.sellerNoteStandby) {
    sellerDebt = deal.sellerNoteRatePct !== null && deal.sellerNoteTermMonths ? monthlyPayment(sellerNote, deal.sellerNoteRatePct, deal.sellerNoteTermMonths) * 12 : null;
  }
  const parts = [sbaDebt, realEstateDebt, sellerDebt];
  const total = parts.some((part) => part === null) ? null : (parts as number[]).reduce((sum, part) => sum + part, 0) + input.existingAnnual;
  return {
    price,
    realEstate,
    businessPrice,
    uses: { businessPrice, realEstate, workingCapital, closingCosts, guaranteeFee, total: usesTotal },
    sources: { buyerEquity, sellerNote, sbaLoan, realEstateLoan, total: buyerEquity + sellerNote + sbaLoan + realEstateLoan },
    debtService: { sbaLoan: sbaDebt, realEstateLoan: realEstateDebt, sellerNote: sellerDebt, existing: input.existingAnnual, total },
  };
}

export type CoverageLine = { key: 'earningsBase' | 'latestYear'; label: string; cashAvailable: number | null; dscr: number | null; passes: boolean | null };

export type PriceTest = {
  key: 'value' | 'price';
  label: string;
  scenario: FinancingScenario | null;
  coverage: CoverageLine[];
  maxSupportablePrice: number | null;
};

export type DebtServiceResult = {
  requiredDscr: number;
  existingLoans: ExistingLoan[];
  existingAnnual: number;
  cashAvailable: { earningsBase: number | null; latestYear: number | null; latestYearLabel: string | null };
  tests: PriceTest[];
  warnings: string[];
};

/** Highest price at which coverage on `cash` still meets the requirement. */
function maxSupportablePrice(cash: number | null, required: number, input: ScenarioInput, ceiling: number): number | null {
  if (cash === null || cash <= 0) return null;
  const passes = (price: number) => {
    const total = financingScenario(price, input).debtService.total;
    return total !== null && (total === 0 || cash / total >= required);
  };
  if (!passes(0)) return 0;
  let low = 0;
  let high = Math.max(ceiling, 1);
  if (passes(high)) return null;
  for (let index = 0; index < 60; index++) {
    const mid = (low + high) / 2;
    if (passes(mid)) low = mid;
    else high = mid;
  }
  return Math.floor(low / 1000) * 1000;
}

export function computeDebtService(
  debt: DebtService,
  context: {
    deal: DealTerms;
    appraisals: Appraisal[];
    snapshot: (SnapshotEarningsInput & { loans?: { instruments: unknown[]; error: string | null } | null }) | null;
    earnings: EarningsBaseResult;
    /** Concluded value once reconciled, otherwise the income approach value. */
    value: number | null;
    valueLabel: string;
    transactionStructure: string | null;
    valuationDate: string | null;
  },
): DebtServiceResult {
  const warnings: string[] = [];
  const required = debt.requiredDscr ?? DEFAULT_REQUIRED_DSCR;
  const loans = existingLoansFromSnapshot(context.snapshot?.loans?.instruments || [], debt, {
    transactionStructure: context.transactionStructure,
    valuationDate: context.valuationDate,
  });
  const staying = loans.filter((loan) => loan.stays);
  const existingAnnual = staying.reduce((total, loan) => total + (loan.annualPayment ?? 0), 0);
  for (const loan of staying) {
    if (loan.annualPayment === null) warnings.push(`Enter the annual payment for ${loan.name}; its rate or term is not on file.`);
  }
  if (context.snapshot?.loans?.error) warnings.push(`The debt schedule could not be read when data was frozen: ${context.snapshot.loans.error}`);

  const earnings = context.earnings;
  const capex = earnings.normalCapex ?? 0;
  const latest = completeFiscalYears(context.snapshot)[0];
  const latestYear = latest
    ? latest.summary.income.ebitda + (earnings.ownerCompAdjustment ?? 0) + earnings.normalizationTotal - capex
    : null;
  const cashAvailable = { earningsBase: earnings.ebitdaLessCapex, latestYear, latestYearLabel: latest ? latest.period.label : null };

  const input: ScenarioInput = { debt, deal: context.deal, appraisals: context.appraisals, existingAnnual };
  const prices: Array<{ key: PriceTest['key']; label: string; price: number | null }> = [
    { key: 'value', label: context.valueLabel, price: context.value },
    { key: 'price', label: 'Purchase price', price: context.deal.purchasePrice },
  ];
  const ceiling = Math.max(...prices.map((item) => item.price ?? 0), (cashAvailable.earningsBase ?? 0) * 20);
  const tests: PriceTest[] = prices.map((item) => {
    const scenario = item.price !== null && item.price > 0 ? financingScenario(item.price, input) : null;
    const coverage: CoverageLine[] = (
      [
        { key: 'earningsBase', label: 'Earnings base (EBITDA less normal capital spending)', cash: cashAvailable.earningsBase },
        { key: 'latestYear', label: `${cashAvailable.latestYearLabel || 'Latest fiscal year'}, same adjustments`, cash: cashAvailable.latestYear },
      ] as const
    ).map((line) => {
      const total = scenario?.debtService.total ?? null;
      const dscr = line.cash !== null && total !== null && total > 0 ? line.cash / total : null;
      return { key: line.key, label: line.label, cashAvailable: line.cash, dscr, passes: dscr === null ? null : dscr >= required };
    });
    return { key: item.key, label: item.label, scenario, coverage, maxSupportablePrice: scenario ? maxSupportablePrice(cashAvailable.earningsBase, required, input, ceiling * 2) : null };
  });

  if (context.value === null) warnings.push(`There is no ${context.valueLabel.toLowerCase()} yet, so only the purchase price is tested.`);
  if (context.deal.purchasePrice === null) warnings.push('Enter the purchase price on the Deal Terms tab.');
  if (debt.sbaRatePct === null) warnings.push('Enter the SBA loan rate.');
  if ((context.deal.sellerNoteAmount ?? 0) > 0 && !context.deal.sellerNoteStandby && (context.deal.sellerNoteRatePct === null || !context.deal.sellerNoteTermMonths)) {
    warnings.push('Enter the seller note rate and term on the Deal Terms tab.');
  }
  if ((context.deal.sellerNoteAmount ?? 0) > 0 && context.deal.sellerNoteStandby) warnings.push('The seller note is on full standby, so it has no payments in the coverage test.');
  if ((debt.downPaymentPct ?? 0) < SBA_MIN_EQUITY_PCT) warnings.push(`SBA change-of-ownership loans generally require at least ${SBA_MIN_EQUITY_PCT}% equity injection.`);
  if (tests.some((test) => test.scenario && test.scenario.sources.sbaLoan + test.scenario.sources.realEstateLoan > SBA_7A_MAX_LOAN)) {
    warnings.push(`SBA debt exceeds the $${SBA_7A_MAX_LOAN.toLocaleString('en-US')} 7(a) limit at one of the prices.`);
  }
  if (cashAvailable.earningsBase === null) warnings.push('Complete the Earnings Base tab to measure cash available for debt service.');
  else if (cashAvailable.earningsBase <= 0) warnings.push('Cash available for debt service is zero or negative on the earnings base.');
  if (!latest) warnings.push('No complete fiscal year in the snapshot for the prior-year coverage test.');
  return { requiredDscr: required, existingLoans: loans, existingAnnual, cashAvailable, tests, warnings };
}
