import { crmEstDate, type CrmRecord } from './sales-data';

/** One CRM company with the account-planning fields the Sales management reports read. */
export type AccountRow = {
  id: string;
  name: string;
  tier: string;
  tierRank: number;
  focus: boolean;
  icpScore: number | null;
  contacts: number | null;
  decisionMakers: number | null;
  lastContacted: string | null;
  daysSinceContact: number | null;
  lastMeeting: string | null;
  employees: number | null;
  city: string;
  state: string;
  owner: string;
  industry: string;
  reviewStatus: string;
  teamOpportunity: string;
  discoveryLab: string;
};

export type ContactBucket = 'within30' | 'within90' | 'older' | 'never';

export const CONTACT_BUCKET_LABELS: Record<ContactBucket, string> = {
  within30: 'Contacted ≤ 30 Days',
  within90: '31–90 Days',
  older: '90+ Days',
  never: 'Never Contacted',
};

export const NO_TIER = 'No Tier';
export const FOCUS_ACCOUNTS = 'Focus Accounts';
const PRIORITY_MIN_DAYS = 30;
const RECENT_MEETING_DAYS = 90;

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberOrNull(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "MA" and "Massachusetts" are the same state in HubSpot data entered by hand. */
export function normalizeState(value: unknown): string {
  const raw = text(value);
  return US_STATES[raw.toLowerCase()] || raw.toUpperCase();
}

/** "Tier 2: Develop Now" sorts as 2; anything without a tier number sorts last. */
function tierRank(tier: string): number {
  const match = tier.match(/tier\s*(\d+)/i);
  if (match) return Number(match[1]);
  return tier === NO_TIER ? 1000 : 999;
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

export function toAccountRows(records: CrmRecord[], today: string): AccountRow[] {
  return records.map((record) => {
    const properties = record.properties || {};
    const tier = text(properties.cogent_pursuit_tiers) || NO_TIER;
    const lastContacted = crmEstDate(properties.notes_last_contacted);
    return {
      id: String(record.id),
      name: text(properties.name) || 'Unnamed company',
      tier,
      tierRank: tierRank(tier),
      focus: text(properties.focus_account).toLowerCase() === 'yes' || text(properties.focus_account).toLowerCase() === 'true',
      icpScore: numberOrNull(properties.cogent_company_icp_fit_score_v1),
      contacts: numberOrNull(properties.num_associated_contacts),
      decisionMakers: numberOrNull(properties.hs_num_decision_makers),
      lastContacted,
      daysSinceContact: lastContacted ? daysBetween(lastContacted, today) : null,
      lastMeeting: crmEstDate(properties.hs_last_booked_meeting_date),
      employees: numberOrNull(properties.numberofemployees),
      city: text(properties.city),
      state: normalizeState(properties.state),
      owner: text(properties.hubspot_owner_name) || (text(properties.hubspot_owner_id) ? 'Assigned' : 'Unassigned'),
      industry: text(properties.industry),
      reviewStatus: text(properties.icp_review_status),
      teamOpportunity: text(properties.icp_estimated_team_opportunity),
      discoveryLab: text(properties.icp_inhouse_discovery_lab),
    };
  });
}

/** True once any company carries a tier or focus flag, so tenants without them never see these reports. */
export function hasAccountPlanningData(accounts: AccountRow[]): boolean {
  return accounts.some((account) => account.tier !== NO_TIER || account.focus);
}

export function contactBucket(account: AccountRow): ContactBucket {
  const days = account.daysSinceContact;
  if (days == null) return 'never';
  if (days <= 30) return 'within30';
  if (days <= 90) return 'within90';
  return 'older';
}

export type CoverageRow = {
  key: string;
  label: string;
  accounts: AccountRow[];
  buckets: Record<ContactBucket, AccountRow[]>;
  noContacts: AccountRow[];
  meetingsBooked: AccountRow[];
  avgContacts: number | null;
};

function coverageRow(key: string, label: string, accounts: AccountRow[], today: string): CoverageRow {
  const buckets: Record<ContactBucket, AccountRow[]> = { within30: [], within90: [], older: [], never: [] };
  for (const account of accounts) buckets[contactBucket(account)].push(account);
  const withContactCount = accounts.filter((account) => account.contacts != null);
  return {
    key,
    label,
    accounts,
    buckets,
    noContacts: accounts.filter((account) => account.contacts === 0),
    meetingsBooked: accounts.filter((account) => account.lastMeeting && daysBetween(account.lastMeeting, today) <= RECENT_MEETING_DAYS),
    avgContacts: withContactCount.length
      ? withContactCount.reduce((sum, account) => sum + (account.contacts || 0), 0) / withContactCount.length
      : null,
  };
}

/** One row per tier in tier order, then Focus Accounts and the total. */
export function buildCoverageRows(accounts: AccountRow[], today: string): CoverageRow[] {
  const byTier = new Map<string, AccountRow[]>();
  for (const account of accounts) byTier.set(account.tier, [...(byTier.get(account.tier) || []), account]);
  const tierRows = Array.from(byTier, ([tier, rows]) => coverageRow(tier, tier, rows, today))
    .sort((a, b) => tierRank(a.label) - tierRank(b.label) || a.label.localeCompare(b.label));
  const focus = accounts.filter((account) => account.focus);
  return [
    ...tierRows,
    ...(focus.length ? [coverageRow(FOCUS_ACCOUNTS, FOCUS_ACCOUNTS, focus, today)] : []),
    coverageRow('__total', 'Total', accounts, today),
  ];
}

/**
 * Accounts management wants worked first: focus accounts and tiers 1–3 that were never
 * contacted or not contacted in over 30 days. Higher tiers (watch lists) are left out.
 */
export function priorityAccounts(accounts: AccountRow[]): AccountRow[] {
  return accounts
    .filter((account) => account.focus || account.tierRank <= 3)
    .filter((account) => account.daysSinceContact == null || account.daysSinceContact > PRIORITY_MIN_DAYS)
    .sort((a, b) =>
      a.tierRank - b.tierRank ||
      Number(b.focus) - Number(a.focus) ||
      (b.icpScore ?? -1) - (a.icpScore ?? -1) ||
      a.name.localeCompare(b.name)
    );
}

export type QualificationRow = {
  key: string;
  label: string;
  accounts: AccountRow[];
  reviewed: AccountRow[];
  qualified: AccountRow[];
  inProgress: AccountRow[];
  notStarted: AccountRow[];
  teamOpportunity: Record<string, AccountRow[]>;
  labConfirmed: AccountRow[];
  labLikely: AccountRow[];
};

/** Team-opportunity sizes in the order they appear in the data, smallest first when they start with a number. */
export function teamOpportunityBands(accounts: AccountRow[]): string[] {
  return Array.from(new Set(accounts.map((account) => account.teamOpportunity).filter(Boolean)))
    .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));
}

function qualificationRow(key: string, label: string, accounts: AccountRow[]): QualificationRow {
  const status = (account: AccountRow) => account.reviewStatus.toLowerCase();
  const teamOpportunity: Record<string, AccountRow[]> = {};
  for (const account of accounts) {
    if (account.teamOpportunity) teamOpportunity[account.teamOpportunity] = [...(teamOpportunity[account.teamOpportunity] || []), account];
  }
  return {
    key,
    label,
    accounts,
    reviewed: accounts.filter((account) => status(account).startsWith('reviewed')),
    qualified: accounts.filter((account) => /\bqualified\b/.test(status(account)) && !/\bdisqualified|not qualified\b/.test(status(account))),
    inProgress: accounts.filter((account) => status(account).includes('progress')),
    notStarted: accounts.filter((account) => !account.reviewStatus),
    teamOpportunity,
    labConfirmed: accounts.filter((account) => account.discoveryLab.toLowerCase().startsWith('yes')),
    labLikely: accounts.filter((account) => account.discoveryLab.toLowerCase().startsWith('likely')),
  };
}

export function buildQualificationRows(accounts: AccountRow[]): QualificationRow[] {
  const byTier = new Map<string, AccountRow[]>();
  for (const account of accounts) byTier.set(account.tier, [...(byTier.get(account.tier) || []), account]);
  const tierRows = Array.from(byTier, ([tier, rows]) => qualificationRow(tier, tier, rows))
    .sort((a, b) => tierRank(a.label) - tierRank(b.label) || a.label.localeCompare(b.label));
  return [...tierRows, qualificationRow('__total', 'Total', accounts)];
}

/** Plain-language gaps shown under the reports so management sees how complete the CRM data is. */
export function dataCompleteness(accounts: AccountRow[]): string[] {
  const total = accounts.length;
  if (!total) return [];
  const count = (predicate: (account: AccountRow) => boolean) => accounts.filter(predicate).length;
  return [
    `Tier set on ${count((a) => a.tier !== NO_TIER)} of ${total}`,
    `ICP research on ${count((a) => Boolean(a.reviewStatus || a.teamOpportunity || a.discoveryLab))} of ${total}`,
    `Last contacted on ${count((a) => Boolean(a.lastContacted))} of ${total}`,
    `Industry on ${count((a) => Boolean(a.industry))} of ${total}`,
    `Employees on ${count((a) => a.employees != null)} of ${total}`,
  ];
}
