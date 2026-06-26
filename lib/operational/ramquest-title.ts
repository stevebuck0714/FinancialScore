export const RAMQUEST_TITLE_SOURCE_CODE = 'RAMQUEST_TITLE';
export const RAMQUEST_TITLE_LABEL = 'RamQuest - Title';

export type RamQuestTitleDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

export const DEFAULT_RAMQUEST_TITLE_DATA_DOMAINS: RamQuestTitleDataDomain[] = [
  { dataDomain: 'Orders / Title Files', sourceObject: 'Title orders, escrow files, file numbers, status, and open / close dates', enabled: true },
  { dataDomain: 'Transactions', sourceObject: 'Purchase, refinance, commercial, and other transaction classifications', enabled: true },
  { dataDomain: 'Parties', sourceObject: 'Buyer, seller, lender, realtor, closer, escrow officer, and related contacts', enabled: true },
  { dataDomain: 'Property', sourceObject: 'Property address, parcel, county, legal description, and transaction geography', enabled: true },
  { dataDomain: 'Escrow', sourceObject: 'Escrow deposits, balances, disbursements, funding status, and account activity', enabled: true },
  { dataDomain: 'Settlement', sourceObject: 'Closing Disclosure, HUD, settlement statement, closing dates, and closing status', enabled: true },
  { dataDomain: 'Financials / Fees / Premiums', sourceObject: 'Title premiums, settlement fees, escrow fees, recording fees, and revenue fields', enabled: true },
  { dataDomain: 'Documents', sourceObject: 'Commitments, policies, scanned documents, disclosures, and attachment metadata', enabled: true },
  { dataDomain: 'Notes / Workflow', sourceObject: 'File notes, workflow comments, milestones, assignments, and task status', enabled: true },
  { dataDomain: 'Vendors', sourceObject: 'Appraisers, surveyors, lien search providers, HOA providers, underwriters, and other vendors', enabled: true },
  { dataDomain: 'Underwriting', sourceObject: 'Policy information, underwriter, endorsements, exceptions, and curative items', enabled: true },
  { dataDomain: 'Reporting / Production Metrics', sourceObject: 'Files opened, files closed, pipeline, closing volume, cycle time, and office production', enabled: true },
];
