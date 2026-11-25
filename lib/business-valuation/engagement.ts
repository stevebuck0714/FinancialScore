export const BUSINESS_VALUATION_ALLOCATION_KEY = 'businessValuation';

/** Off unless a site admin turns it on for the company. */
export function isBusinessValuationEnabled(userDefinedAllocations: unknown): boolean {
  if (!userDefinedAllocations || typeof userDefinedAllocations !== 'object') return false;
  const entry = (userDefinedAllocations as Record<string, unknown>)[BUSINESS_VALUATION_ALLOCATION_KEY];
  return Boolean(entry && typeof entry === 'object' && (entry as { enabledByAdmin?: unknown }).enabledByAdmin === true);
}

export const ENGAGEMENT_OPTIONS = {
  purpose: [
    { value: 'SBA_CHANGE_OF_OWNERSHIP', label: 'SBA change of ownership' },
    { value: 'SBA_PARTNER_BUYOUT', label: 'SBA partner buyout' },
    { value: 'LENDER_UNDERWRITING', label: 'Lender underwriting (non-SBA)' },
    { value: 'OWNER_PLANNING', label: 'Owner planning' },
  ],
  standardOfValue: [
    { value: 'FAIR_MARKET_VALUE', label: 'Fair market value' },
    { value: 'INVESTMENT_VALUE', label: 'Investment value' },
  ],
  premiseOfValue: [
    { value: 'GOING_CONCERN', label: 'Going concern' },
    { value: 'ORDERLY_LIQUIDATION', label: 'Orderly liquidation' },
  ],
  ownershipBasis: [
    { value: 'CONTROL', label: 'Controlling interest' },
    { value: 'MINORITY', label: 'Minority interest' },
  ],
  transactionStructure: [
    { value: 'ASSET', label: 'Asset sale' },
    { value: 'STOCK', label: 'Stock sale' },
  ],
  reportType: [
    { value: 'CONCLUSION_OF_VALUE', label: 'Conclusion of value' },
    { value: 'CALCULATION_OF_VALUE', label: 'Calculation of value' },
  ],
} as const;

export const ENGAGEMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  FINAL: 'Final',
};

export const INDEPENDENCE_FIELDS = ['feeNotContingent', 'noInterestInDeal', 'notActingAsBroker', 'priorServicesDisclosed'] as const;

export const INDEPENDENCE_STATEMENTS: Record<(typeof INDEPENDENCE_FIELDS)[number], string> = {
  feeNotContingent: 'Our fee is not contingent on the value concluded or on the loan closing.',
  noInterestInDeal: 'Neither the appraiser nor the reviewer has a financial interest in the business, the buyer, the seller, or the lender.',
  notActingAsBroker: 'Corelytics is not acting as the broker or intermediary on this transaction.',
  priorServicesDisclosed: 'All prior or current Corelytics services for this company are disclosed below.',
};
