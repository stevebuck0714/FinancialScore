/**
 * BGAH Operating Agreement Article VIII distribution waterfall for Net Cash Available for Distribution.
 *
 * Tier order (§8.1 / §8.2): member loans (§7.2(c)) → Land Contributor Preferred Return → Land Contributor
 * Even-Up Amount (Investor Group = every Owner other than the Land Contributors) → residual by Ownership Percentage.
 * The preferred return is 6% per annum (365-day year) on each Land Contributor's Deemed Capital Contribution,
 * accruing from the Stabilization Date, cumulative and non-compounding. Each Investor Group owner's even-up accrues
 * at its Ownership Percentage × the Land Contributor Preferred Return ÷ the Land Contributors' Ownership Percentage.
 */

export type WaterfallInvestor = {
  id: string;
  legalName: string;
  memberGroup: string | null;
  ownershipPercentage: number;
};

export type WaterfallEntry = {
  investorId: string;
  entryType: string;
  effectiveDate: string;
  amount: number;
};

export type WaterfallSettings = {
  stabilizationDate: string | null;
  preferredReturnRate: number;
};

export type MemberAllocation = {
  investorId: string;
  memberLoan: number;
  preferredReturn: number;
  evenUp: number;
  residual: number;
  expected: number;
  actual: number;
  variance: number;
};

export type DistributionEvent = {
  effectiveDate: string;
  total: number;
  preferredReturnAccrued: number;
  evenUpAccrued: number;
  memberLoan: number;
  preferredReturn: number;
  evenUp: number;
  residual: number;
  members: MemberAllocation[];
};

export type MemberWaterfallBalance = {
  investorId: string;
  isLandContributor: boolean;
  preferredReturnBase: number;
  preferredReturnAccrued: number;
  preferredReturnPaid: number;
  preferredReturnUnpaid: number;
  evenUpAccrued: number;
  evenUpPaid: number;
  evenUpUnpaid: number;
  residualPaid: number;
  distributions: number;
};

export type WaterfallResult = {
  asOfDate: string;
  ready: boolean;
  issues: string[];
  landOwnershipPercentage: number;
  annualPreferredReturn: number;
  annualEvenUp: number;
  events: DistributionEvent[];
  balances: MemberWaterfallBalance[];
};

const DAY_MS = 86_400_000;
const round2 = (value: number) => Math.round(value * 100) / 100;
const dayNumber = (ymd: string) => Math.floor(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / DAY_MS);

export const isLandContributor = (investor: Pick<WaterfallInvestor, 'memberGroup'>) => /land/i.test(String(investor.memberGroup || ''));

/** Splits `amount` across keys in proportion to `weights`, rounded to cents with the remainder on the largest weight. */
function prorate(amount: number, weights: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (amount <= 0 || total <= 0) return result;
  let assigned = 0;
  let largestKey = '';
  let largestWeight = -Infinity;
  weights.forEach((weight, key) => {
    const share = round2((amount * weight) / total);
    result.set(key, share);
    assigned += share;
    if (weight > largestWeight) { largestWeight = weight; largestKey = key; }
  });
  if (largestKey) result.set(largestKey, round2((result.get(largestKey) || 0) + amount - assigned));
  return result;
}

/**
 * Allocates a distribution of `total` on `effectiveDate` through the tiers, given unpaid balances.
 * Does not mutate inputs; callers apply the returned payments.
 */
export function allocateDistribution(
  total: number,
  investors: WaterfallInvestor[],
  unpaidPreferred: Map<string, number>,
  unpaidEvenUp: Map<string, number>,
) {
  let remaining = round2(total);
  const preferredOwed = [...unpaidPreferred.values()].reduce((sum, value) => sum + value, 0);
  const preferredPool = round2(Math.min(remaining, Math.max(0, preferredOwed)));
  const preferred = prorate(preferredPool, new Map([...unpaidPreferred].filter(([, value]) => value > 0)));
  remaining = round2(remaining - preferredPool);
  const evenUpOwed = [...unpaidEvenUp.values()].reduce((sum, value) => sum + value, 0);
  const evenUpPool = round2(Math.min(remaining, Math.max(0, evenUpOwed)));
  const evenUp = prorate(evenUpPool, new Map([...unpaidEvenUp].filter(([, value]) => value > 0)));
  remaining = round2(remaining - evenUpPool);
  const residual = prorate(remaining, new Map(investors.map((investor) => [investor.id, investor.ownershipPercentage])));
  return { preferred, evenUp, residual, preferredPool, evenUpPool, residualPool: remaining };
}

export function computeWaterfall(
  investors: WaterfallInvestor[],
  entries: WaterfallEntry[],
  settings: WaterfallSettings,
  asOfDate: string,
): WaterfallResult {
  const issues: string[] = [];
  const land = investors.filter(isLandContributor);
  const landOwnershipPercentage = land.reduce((sum, investor) => sum + investor.ownershipPercentage, 0);
  const rate = settings.preferredReturnRate / 100;

  const base = new Map<string, number>();
  land.forEach((investor) => {
    const own = entries.filter((entry) => entry.investorId === investor.id);
    const deemed = own.filter((entry) => entry.entryType === 'DEEMED_CONTRIBUTION').reduce((sum, entry) => sum + entry.amount, 0);
    const cash = own.filter((entry) => entry.entryType === 'CONTRIBUTION').reduce((sum, entry) => sum + entry.amount, 0);
    base.set(investor.id, deemed || cash);
    if (!(deemed || cash)) issues.push(`${investor.legalName} has no Deemed Capital Contribution, so no preferred return accrues for them.`);
  });
  const annualPreferredReturn = [...base.values()].reduce((sum, value) => sum + value * rate, 0);
  const nonLand = investors.filter((investor) => !isLandContributor(investor));
  const annualEvenUp = landOwnershipPercentage > 0
    ? nonLand.reduce((sum, investor) => sum + (investor.ownershipPercentage * annualPreferredReturn) / landOwnershipPercentage, 0)
    : 0;

  if (!land.length) issues.push('No Land Contributors are set up (member group containing "Land").');
  if (landOwnershipPercentage <= 0 && land.length) issues.push('Land Contributor ownership percentages are missing.');
  const ownershipTotal = investors.reduce((sum, investor) => sum + investor.ownershipPercentage, 0);
  if (Math.abs(ownershipTotal - 100) > 0.001) issues.push(`Ownership percentages total ${ownershipTotal.toFixed(4)}%, not 100%.`);
  if (!settings.stabilizationDate) issues.push('Enter the Stabilization Date to start the preferred return and even-up accruals.');

  const balances = new Map<string, MemberWaterfallBalance>(investors.map((investor) => [investor.id, {
    investorId: investor.id,
    isLandContributor: isLandContributor(investor),
    preferredReturnBase: base.get(investor.id) || 0,
    preferredReturnAccrued: 0,
    preferredReturnPaid: 0,
    preferredReturnUnpaid: 0,
    evenUpAccrued: 0,
    evenUpPaid: 0,
    evenUpUnpaid: 0,
    residualPaid: 0,
    distributions: 0,
  }]));

  const ready = Boolean(settings.stabilizationDate) && land.length > 0 && landOwnershipPercentage > 0;
  const stabilizationDay = settings.stabilizationDate ? dayNumber(settings.stabilizationDate) : null;
  let accruedThroughDay = stabilizationDay === null ? null : stabilizationDay - 1;

  const accrueThrough = (ymd: string) => {
    if (accruedThroughDay === null) return { preferred: 0, evenUp: 0 };
    const days = dayNumber(ymd) - accruedThroughDay;
    if (days <= 0) return { preferred: 0, evenUp: 0 };
    accruedThroughDay += days;
    let preferredTotal = 0;
    land.forEach((investor) => {
      const accrual = ((base.get(investor.id) || 0) * rate * days) / 365;
      const balance = balances.get(investor.id)!;
      balance.preferredReturnAccrued += accrual;
      preferredTotal += accrual;
    });
    let evenUpTotal = 0;
    if (landOwnershipPercentage > 0) {
      nonLand.forEach((investor) => {
        const accrual = (investor.ownershipPercentage * preferredTotal) / landOwnershipPercentage;
        balances.get(investor.id)!.evenUpAccrued += accrual;
        evenUpTotal += accrual;
      });
    }
    return { preferred: preferredTotal, evenUp: evenUpTotal };
  };

  const distributionEntries = entries.filter((entry) => entry.entryType === 'DISTRIBUTION');
  const byDate = new Map<string, WaterfallEntry[]>();
  distributionEntries.forEach((entry) => byDate.set(entry.effectiveDate, [...(byDate.get(entry.effectiveDate) || []), entry]));
  const events: DistributionEvent[] = [];

  [...byDate.keys()].sort().forEach((effectiveDate) => {
    const dated = byDate.get(effectiveDate)!;
    const accrued = ready ? accrueThrough(effectiveDate) : { preferred: 0, evenUp: 0 };
    const total = round2(dated.reduce((sum, entry) => sum + entry.amount, 0));
    const unpaidPreferred = new Map([...balances].filter(([, b]) => b.isLandContributor).map(([id, b]) => [id, round2(b.preferredReturnAccrued - b.preferredReturnPaid)]));
    const unpaidEvenUp = new Map([...balances].filter(([, b]) => !b.isLandContributor).map(([id, b]) => [id, round2(b.evenUpAccrued - b.evenUpPaid)]));
    const allocation = ready
      ? allocateDistribution(total, investors, unpaidPreferred, unpaidEvenUp)
      : allocateDistribution(total, investors, new Map(), new Map());
    const members = investors.map((investor) => {
      const preferredReturn = allocation.preferred.get(investor.id) || 0;
      const evenUp = allocation.evenUp.get(investor.id) || 0;
      const residual = allocation.residual.get(investor.id) || 0;
      const actual = round2(dated.filter((entry) => entry.investorId === investor.id).reduce((sum, entry) => sum + entry.amount, 0));
      const balance = balances.get(investor.id)!;
      balance.preferredReturnPaid += preferredReturn;
      balance.evenUpPaid += evenUp;
      balance.residualPaid += residual;
      balance.distributions += actual;
      const expected = round2(preferredReturn + evenUp + residual);
      return { investorId: investor.id, memberLoan: 0, preferredReturn, evenUp, residual, expected, actual, variance: round2(actual - expected) };
    });
    events.push({
      effectiveDate,
      total,
      preferredReturnAccrued: round2(accrued.preferred),
      evenUpAccrued: round2(accrued.evenUp),
      memberLoan: 0,
      preferredReturn: allocation.preferredPool,
      evenUp: allocation.evenUpPool,
      residual: allocation.residualPool,
      members,
    });
  });

  if (ready) accrueThrough(asOfDate);
  balances.forEach((balance) => {
    balance.preferredReturnAccrued = round2(balance.preferredReturnAccrued);
    balance.preferredReturnPaid = round2(balance.preferredReturnPaid);
    balance.preferredReturnUnpaid = round2(balance.preferredReturnAccrued - balance.preferredReturnPaid);
    balance.evenUpAccrued = round2(balance.evenUpAccrued);
    balance.evenUpPaid = round2(balance.evenUpPaid);
    balance.evenUpUnpaid = round2(balance.evenUpAccrued - balance.evenUpPaid);
    balance.residualPaid = round2(balance.residualPaid);
    balance.distributions = round2(balance.distributions);
  });

  return {
    asOfDate,
    ready,
    issues,
    landOwnershipPercentage,
    annualPreferredReturn: round2(annualPreferredReturn),
    annualEvenUp: round2(annualEvenUp),
    events,
    balances: [...balances.values()],
  };
}
