export const BUILDOUT_CRE_SOURCE_CODE = 'BUILDOUT_CRE';
export const BUILDOUT_CRE_LABEL = 'Buildout - CRE';

export type BuildoutCreDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

export const DEFAULT_BUILDOUT_CRE_DATA_DOMAINS: BuildoutCreDataDomain[] = [
  { dataDomain: 'Properties', sourceObject: 'Commercial property records, addresses, asset types, market, submarket, and ownership metadata', enabled: true },
  { dataDomain: 'Listings', sourceObject: 'Active, draft, archived, and syndicated listing inventory with status, pricing, and broker assignments', enabled: true },
  { dataDomain: 'Buildings', sourceObject: 'Building profiles, size, class, amenities, floors, year built, and building-level attributes', enabled: true },
  { dataDomain: 'Spaces / Suites', sourceObject: 'Available suites, lease spaces, unit attributes, square footage, rates, and availability dates', enabled: true },
  { dataDomain: 'Brokers', sourceObject: 'Broker roster, listing assignments, teams, offices, roles, and production attribution', enabled: true },
  { dataDomain: 'Contacts', sourceObject: 'Prospects, tenants, investors, buyers, CRM contacts, and relationship metadata', enabled: true },
  { dataDomain: 'Owners', sourceObject: 'Property owners, ownership entities, owner contacts, and related company records', enabled: true },
  { dataDomain: 'Deals / Transactions', sourceObject: 'Deal pipeline, lease and sale transactions, stages, expected close dates, values, and outcomes', enabled: true },
  { dataDomain: 'Marketing Materials', sourceObject: 'Flyers, brochures, email campaigns, listing pages, media assets, and publication status', enabled: true },
  { dataDomain: 'Proposals', sourceObject: 'Proposal records, proposal status, recipients, listing packages, and presentation activity', enabled: true },
  { dataDomain: 'Documents', sourceObject: 'Listing documents, offering memoranda, agreements, attachments, and document metadata', enabled: true },
  { dataDomain: 'Activities', sourceObject: 'Marketing activity, inquiries, showings, tasks, calls, emails, and engagement events', enabled: true },
  { dataDomain: 'Commissions', sourceObject: 'Commission forecasts, expected fees, broker splits, office revenue, and deal economics', enabled: true },
  { dataDomain: 'Syndication', sourceObject: 'Listing syndication channels, publication destinations, external listing IDs, and feed status', enabled: true },
];
