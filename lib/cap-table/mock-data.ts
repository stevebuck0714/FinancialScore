export type CapTableRound = {
  id: string;
  name: string;
  type: 'Founder' | 'Seed' | 'Series A' | 'Series B' | 'SAFE' | 'Convertible Note';
  date: string;
  capitalRaised: number;
  preMoneyValuation: number | null;
  postMoneyValuation: number | null;
  sharePrice: number | null;
  sharesIssued: number;
};

export type CapTableSecurityClass = {
  id: string;
  securityType: 'Common' | 'Preferred' | 'Options' | 'Warrants' | 'Convertible Notes' | 'SAFEs';
  series: string;
  units: number;
  asConvertedShares: number;
  votingRights?: string;
  liquidationPreference?: string;
  conversionRatio?: string;
  participationRights?: string;
  dividendRights?: string;
  strikePrice?: number | null;
  expiration?: string | null;
  valuationCap?: number | null;
  discountPct?: number | null;
  principalAmount?: number | null;
  interestRatePct?: number | null;
  maturityDate?: string | null;
  conversionTrigger?: string | null;
  accruedInterest?: number | null;
};

export type CapTableHolding = {
  holder: string;
  security: string;
  shares: number;
  costBasis: number;
  basicOwnershipPct: number;
  fullyDilutedOwnershipPct: number;
};

export type OwnershipEvolutionRow = {
  holder: string;
  founder: number | null;
  seed: number | null;
  seriesA: number | null;
  seriesB: number | null;
  current: number;
};

export type RoundDilutionRow = {
  round: string;
  newSharesIssued: number;
  dilutionPct: number;
  founderOwnershipBefore: number | null;
  founderOwnershipAfter: number | null;
};

export type ExitWaterfallRow = {
  exitValue: number;
  distributions: Record<string, number>;
};

export type RoundPerformanceRow = {
  round: string;
  revenue: number;
  ebitda: number;
  enterpriseValue: number;
  ownershipPct: number;
  investedCapital: number;
  impliedCurrentValue: number;
};

export type CapTableMockData = {
  asOfDate: string;
  rounds: CapTableRound[];
  securities: CapTableSecurityClass[];
  holdings: CapTableHolding[];
  ownershipEvolution: OwnershipEvolutionRow[];
  dilution: RoundDilutionRow[];
  exitWaterfall: ExitWaterfallRow[];
  performance: RoundPerformanceRow[];
};

export const capTableMockData: CapTableMockData = {
  asOfDate: '2026-06-30',
  rounds: [
    { id: 'founder', name: 'Founder', type: 'Founder', date: '2020-01-15', capitalRaised: 50_000, preMoneyValuation: null, postMoneyValuation: null, sharePrice: 0.001, sharesIssued: 5_000_000 },
    { id: 'seed', name: 'Seed', type: 'Seed', date: '2021-04-01', capitalRaised: 1_000_000, preMoneyValuation: 4_000_000, postMoneyValuation: 5_000_000, sharePrice: 1, sharesIssued: 1_000_000 },
    { id: 'bridge-note', name: 'Bridge Note', type: 'Convertible Note', date: '2022-03-01', capitalRaised: 750_000, preMoneyValuation: null, postMoneyValuation: null, sharePrice: null, sharesIssued: 0 },
    { id: 'post-money-safe', name: 'Post-money SAFE', type: 'SAFE', date: '2022-06-01', capitalRaised: 500_000, preMoneyValuation: null, postMoneyValuation: null, sharePrice: null, sharesIssued: 0 },
    { id: 'series-a', name: 'Series A', type: 'Series A', date: '2022-09-15', capitalRaised: 5_000_000, preMoneyValuation: 15_000_000, postMoneyValuation: 20_000_000, sharePrice: 2.5, sharesIssued: 2_000_000 },
    { id: 'series-b', name: 'Series B', type: 'Series B', date: '2024-05-20', capitalRaised: 15_000_000, preMoneyValuation: 45_000_000, postMoneyValuation: 60_000_000, sharePrice: 10, sharesIssued: 1_500_000 },
  ],
  securities: [
    { id: 'common', securityType: 'Common', series: 'Common Stock', units: 5_000_000, asConvertedShares: 5_000_000, votingRights: '1 vote/share' },
    { id: 'seed-pref', securityType: 'Preferred', series: 'Preferred Series Seed', units: 1_000_000, asConvertedShares: 1_000_000, liquidationPreference: '1.0x non-participating', conversionRatio: '1:1', participationRights: 'None', dividendRights: 'Non-cumulative' },
    { id: 'series-a-pref', securityType: 'Preferred', series: 'Preferred Series A', units: 2_000_000, asConvertedShares: 2_000_000, liquidationPreference: '1.0x non-participating', conversionRatio: '1:1', participationRights: 'None', dividendRights: 'Non-cumulative' },
    { id: 'series-b-pref', securityType: 'Preferred', series: 'Preferred Series B', units: 1_500_000, asConvertedShares: 1_500_000, liquidationPreference: '1.0x participating cap at 2.0x', conversionRatio: '1:1', participationRights: 'Capped', dividendRights: '8% non-cumulative' },
    { id: 'options', securityType: 'Options', series: 'Options Outstanding', units: 300_000, asConvertedShares: 300_000, strikePrice: 1.25 },
    { id: 'warrants', securityType: 'Warrants', series: 'Warrants', units: 200_000, asConvertedShares: 200_000, strikePrice: 8, expiration: '2029-05-20' },
    { id: 'safe', securityType: 'SAFEs', series: 'Post-money SAFE', units: 500_000, asConvertedShares: 0, valuationCap: 12_000_000, discountPct: 20, conversionTrigger: 'Next equity financing' },
    { id: 'convertible-note', securityType: 'Convertible Notes', series: '2022 Bridge Note', units: 750_000, asConvertedShares: 400_000, valuationCap: 10_000_000, discountPct: 20, principalAmount: 750_000, interestRatePct: 6, maturityDate: '2024-03-01', conversionTrigger: 'Qualified financing over $3.0M', accruedInterest: 90_000 },
  ],
  holdings: [
    { holder: 'Founder A', security: 'Common', shares: 3_000_000, costBasis: 0.001, basicOwnershipPct: 35.3, fullyDilutedOwnershipPct: 30 },
    { holder: 'Founder B', security: 'Common', shares: 2_000_000, costBasis: 0.001, basicOwnershipPct: 23.5, fullyDilutedOwnershipPct: 20 },
    { holder: 'Seed Investors', security: 'Series Seed', shares: 1_000_000, costBasis: 1, basicOwnershipPct: 11.8, fullyDilutedOwnershipPct: 10 },
    { holder: 'VC Fund I', security: 'Series A', shares: 2_000_000, costBasis: 2.5, basicOwnershipPct: 23.5, fullyDilutedOwnershipPct: 20 },
    { holder: 'VC Fund II', security: 'Series B', shares: 1_500_000, costBasis: 10, basicOwnershipPct: 17.6, fullyDilutedOwnershipPct: 15 },
    { holder: 'ESOP Pool', security: 'Options', shares: 300_000, costBasis: 1.25, basicOwnershipPct: 0, fullyDilutedOwnershipPct: 3 },
    { holder: 'Strategic Partner', security: 'Warrants', shares: 200_000, costBasis: 8, basicOwnershipPct: 0, fullyDilutedOwnershipPct: 2 },
    { holder: 'Bridge Note Investors', security: 'Convertible Note', shares: 400_000, costBasis: 1.875, basicOwnershipPct: 0, fullyDilutedOwnershipPct: 4 },
    { holder: 'SAFE Investors', security: 'Post-money SAFE', shares: 0, costBasis: 0, basicOwnershipPct: 0, fullyDilutedOwnershipPct: 0 },
  ],
  ownershipEvolution: [
    { holder: 'Founder A', founder: 60, seed: 48, seriesA: 36, seriesB: 30, current: 30 },
    { holder: 'Founder B', founder: 40, seed: 32, seriesA: 24, seriesB: 20, current: 20 },
    { holder: 'Seed Investors', founder: null, seed: 20, seriesA: 16, seriesB: 13, current: 10 },
    { holder: 'Series A Investors', founder: null, seed: null, seriesA: 25, seriesB: 20, current: 20 },
    { holder: 'Series B Investors', founder: null, seed: null, seriesA: null, seriesB: 15, current: 15 },
    { holder: 'ESOP / Warrants', founder: null, seed: null, seriesA: null, seriesB: 2, current: 5 },
  ],
  dilution: [
    { round: 'Seed', newSharesIssued: 1_000_000, dilutionPct: 20, founderOwnershipBefore: 100, founderOwnershipAfter: 80 },
    { round: 'Series A', newSharesIssued: 2_000_000, dilutionPct: 20, founderOwnershipBefore: 80, founderOwnershipAfter: 60 },
    { round: 'Series B', newSharesIssued: 1_500_000, dilutionPct: 15, founderOwnershipBefore: 60, founderOwnershipAfter: 50 },
  ],
  exitWaterfall: [
    { exitValue: 25_000_000, distributions: { 'Founder A': 5_000_000, 'Founder B': 3_000_000, 'Seed Investors': 2_000_000, 'VC Fund I': 8_000_000, 'VC Fund II': 7_000_000 } },
    { exitValue: 50_000_000, distributions: { 'Founder A': 15_000_000, 'Founder B': 10_000_000, 'Seed Investors': 5_000_000, 'VC Fund I': 10_000_000, 'VC Fund II': 10_000_000 } },
    { exitValue: 100_000_000, distributions: { 'Founder A': 30_000_000, 'Founder B': 20_000_000, 'Seed Investors': 10_000_000, 'VC Fund I': 20_000_000, 'VC Fund II': 20_000_000 } },
  ],
  performance: [
    { round: 'Seed', revenue: 0, ebitda: -500_000, enterpriseValue: 5_000_000, ownershipPct: 20, investedCapital: 1_000_000, impliedCurrentValue: 18_000_000 },
    { round: 'Series A', revenue: 2_000_000, ebitda: -1_000_000, enterpriseValue: 20_000_000, ownershipPct: 16, investedCapital: 5_000_000, impliedCurrentValue: 18_000_000 },
    { round: 'Series B', revenue: 10_000_000, ebitda: 1_000_000, enterpriseValue: 60_000_000, ownershipPct: 13, investedCapital: 15_000_000, impliedCurrentValue: 14_625_000 },
  ],
};

export function getMockCapTableData() {
  return capTableMockData;
}
