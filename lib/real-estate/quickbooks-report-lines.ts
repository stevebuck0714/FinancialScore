import { matchMember } from '@/lib/real-estate/cash-flow-report';

/**
 * Pure helpers for real-estate reports built from account-level lines
 * (QuickBooks Desktop copies and imported entity workbooks).
 */

export type ReportLine = {
  sourceEntity: string;
  reportType: string;
  periodEnd: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  amount: number;
};

export function toReportLines(raw: unknown[]): ReportLine[] {
  return (Array.isArray(raw) ? raw : []).map((value) => {
    const line = (value || {}) as Record<string, unknown>;
    return {
      sourceEntity: String(line.sourceEntity || ''),
      reportType: String(line.reportType || '').toUpperCase(),
      periodEnd: String(line.periodEnd || '').slice(0, 10),
      accountCode: String(line.accountCode || ''),
      accountName: String(line.accountName || ''),
      accountType: String(line.accountType || ''),
      amount: Number(line.amount || 0),
    };
  });
}

const normalizeType = (type: string) => type.toLowerCase().replace(/[^a-z]/g, '');
const ASSET_TYPES = new Set(['bank', 'accountsreceivable', 'othercurrentasset', 'fixedasset', 'otherasset']);
export const isAssetType = (type: string) => ASSET_TYPES.has(normalizeType(type));
export const isEquityType = (type: string) => normalizeType(type) === 'equity';
export const accountTypeIs = (line: ReportLine, ...types: string[]) => types.includes(normalizeType(line.accountType));

/** The last balance period in each calendar year (December, or the latest month for the current year). */
export function yearEndPeriods(lines: ReportLine[]) {
  const byYear = new Map<number, string>();
  for (const line of lines) {
    if (line.reportType !== 'BALANCE') continue;
    const year = Number(line.periodEnd.slice(0, 4));
    if (!byYear.has(year) || line.periodEnd > byYear.get(year)!) byYear.set(year, line.periodEnd);
  }
  return new Map([...byYear.entries()].sort((a, b) => a[0] - b[0]));
}

export function balanceAt(lines: ReportLine[], periodEnd: string, predicate: (line: ReportLine) => boolean) {
  return lines.reduce((total, line) => (line.reportType === 'BALANCE' && line.periodEnd === periodEnd && predicate(line) ? total + line.amount : total), 0);
}

export function activityByYear(lines: ReportLine[], predicate: (line: ReportLine) => boolean) {
  const byYear = new Map<number, number>();
  for (const line of lines) {
    if (line.reportType !== 'ACTIVITY' || !predicate(line)) continue;
    const year = Number(line.periodEnd.slice(0, 4));
    byYear.set(year, (byYear.get(year) || 0) + line.amount);
  }
  return byYear;
}

export const isInterestExpense = (line: ReportLine) => accountTypeIs(line, 'expense', 'otherexpense') && /interest/i.test(line.accountName) && !/late fee/i.test(line.accountName);
export const isDepreciationExpense = (line: ReportLine) => accountTypeIs(line, 'expense', 'otherexpense') && /depreciation/i.test(line.accountName);
export const isAmortizationExpense = (line: ReportLine) => accountTypeIs(line, 'expense', 'otherexpense') && /amortization/i.test(line.accountName);
export const isConstructionLoan = (line: ReportLine) => !isAssetType(line.accountType) && !isEquityType(line.accountType) && /\bloan\b/i.test(line.accountName) && !/\bfee/i.test(line.accountName);

export type FixedAssetClass = 'land' | 'land_improvements' | 'building' | 'equipment' | 'construction_in_progress' | 'accumulated_depreciation';
export const FIXED_ASSET_CLASS_LABEL: Record<FixedAssetClass, string> = {
  land: 'Land',
  land_improvements: 'Land improvements',
  building: 'Building',
  equipment: 'Equipment, furnishings & FF&E',
  construction_in_progress: 'Construction in progress',
  accumulated_depreciation: 'Accumulated depreciation',
};

/** Classifies a fixed-asset account by name. Intercompany balances QuickBooks types as fixed assets are excluded. */
export function classifyFixedAssetAccount(accountName: string): FixedAssetClass | null {
  const name = accountName.toLowerCase();
  if (/due to|due from/.test(name)) return null;
  if (/accumulated depreciation|accum\.? depr/.test(name)) return 'accumulated_depreciation';
  if (/construction in progress|\bcip\b/.test(name)) return 'construction_in_progress';
  if (/land improvement/.test(name)) return 'land_improvements';
  if (/\bland\b/.test(name)) return 'land';
  if (/building|capital improvement/.test(name)) return 'building';
  if (/furniture|fixture|equipment|ff&e|furnishing/.test(name)) return 'equipment';
  return null;
}

export type BalanceCheckRow = { source: string; periodEnd: string; assets: number; liabilitiesAndEquity: number; difference: number; status: 'Balanced' | 'Partial' | 'Out of balance' };

/** Assets against liabilities plus equity for every source and balance month. */
export function balanceChecks(sources: Array<{ label: string; lines: ReportLine[] }>): BalanceCheckRow[] {
  const rows: BalanceCheckRow[] = [];
  for (const { label, lines } of sources) {
    const byPeriod = new Map<string, { assets: number; other: number; hasEquity: boolean }>();
    for (const line of lines) {
      if (line.reportType !== 'BALANCE') continue;
      const row = byPeriod.get(line.periodEnd) || { assets: 0, other: 0, hasEquity: false };
      if (isAssetType(line.accountType)) row.assets += line.amount;
      else row.other += line.amount;
      if (isEquityType(line.accountType)) row.hasEquity = true;
      byPeriod.set(line.periodEnd, row);
    }
    for (const [periodEnd, row] of [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const difference = Math.round((row.assets - row.other) * 100) / 100;
      rows.push({
        source: label,
        periodEnd,
        assets: row.assets,
        liabilitiesAndEquity: row.other,
        difference,
        status: Math.abs(difference) < 1 ? 'Balanced' : row.hasEquity ? 'Out of balance' : 'Partial',
      });
    }
  }
  return rows;
}

export type MemberCapitalYear = { year: number; opening: number; contributions: number; distributions: number; other: number; closing: number; incomeShare: number | null };
export type MemberCapital = {
  member: string;
  investorId: string | null;
  ownershipPct: number | null;
  years: MemberCapitalYear[];
  toDate: { contributions: number; distributions: number; other: number };
  latestPeriod: string | null;
};

/**
 * Member capital by year from QuickBooks member equity accounts
 * ("<Equity parent>:<Member>:Contributions|Distributions:..."). Book income is
 * shared pro rata by ownership as a preliminary allocation.
 */
export function memberCapitalByYear(
  lines: ReportLine[],
  investors: Array<{ id: string; legalName: string; ownershipPercentage?: number | null }>,
  aliases: Array<{ alias: string; investorId: string }>,
): { years: number[]; members: MemberCapital[]; bookIncomeByYear: Map<number, number> } {
  const periods = yearEndPeriods(lines);
  const allPeriods = [...new Set(lines.filter((line) => line.reportType === 'BALANCE').map((line) => line.periodEnd))].sort();
  const openingPeriod = allPeriods[0];
  // The first period is the opening balance before the ledger starts; its year is not a full year.
  const years = [...periods.keys()].filter((year) => !(openingPeriod && periods.get(year) === openingPeriod && allPeriods.filter((period) => period.startsWith(`${year}-`)).length === 1));
  const memberLines = lines.filter((line) => line.reportType === 'BALANCE' && isEquityType(line.accountType) && line.accountName.split(':').length >= 3);
  const kindOf = (accountName: string) => {
    const detail = accountName.split(':').slice(2).join(':');
    if (/distribut|draw/i.test(detail)) return 'distributions' as const;
    if (/contribut|\bcont\b/i.test(detail)) return 'contributions' as const;
    return 'other' as const;
  };
  const balanceFor = (member: string, kind: string, periodEnd: string | undefined) => periodEnd
    ? memberLines.reduce((total, line) => (line.periodEnd === periodEnd && line.accountName.split(':')[1].trim() === member && kindOf(line.accountName) === kind ? total + line.amount : total), 0)
    : 0;
  const bookIncomeByYear = new Map<number, number>();
  for (const year of years) {
    bookIncomeByYear.set(year, balanceAt(lines, periods.get(year)!, (line) => line.accountCode === 'qbd_net_income'));
  }
  const memberNames = [...new Set(memberLines.map((line) => line.accountName.split(':')[1].trim()))].sort((a, b) => a.localeCompare(b));
  const members = memberNames.map((member) => {
    const match = matchMember(member, investors, aliases);
    const investor = investors.find((item) => item.id === match.investorId);
    const ownershipPct = investor?.ownershipPercentage == null ? null : Number(investor.ownershipPercentage);
    const memberYears = years.map((year, index) => {
      const openingAt = index === 0 ? openingPeriod : periods.get(years[index - 1]);
      const closingAt = periods.get(year);
      const delta = (kind: string) => balanceFor(member, kind, closingAt) - balanceFor(member, kind, openingAt);
      const opening = ['contributions', 'distributions', 'other'].reduce((total, kind) => total + balanceFor(member, kind, openingAt), 0);
      const contributions = delta('contributions');
      const distributions = delta('distributions');
      const other = delta('other');
      const income = bookIncomeByYear.get(year) || 0;
      return { year, opening, contributions, distributions, other, closing: opening + contributions + distributions + other, incomeShare: ownershipPct == null ? null : (income * ownershipPct) / 100 };
    });
    const latestPeriod = allPeriods.at(-1);
    const toDate = {
      contributions: balanceFor(member, 'contributions', latestPeriod),
      distributions: balanceFor(member, 'distributions', latestPeriod),
      other: balanceFor(member, 'other', latestPeriod),
    };
    return { member, investorId: investor?.id || null, ownershipPct, years: memberYears, toDate, latestPeriod: latestPeriod || null };
  }).filter((member) => member.years.some((year) => Math.abs(year.opening) >= 0.5 || Math.abs(year.closing) >= 0.5));
  return { years, members, bookIncomeByYear };
}
