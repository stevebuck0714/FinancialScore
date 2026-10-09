import {
  fetchHubSpotPages,
  hubSpotOwnerName,
  HUBSPOT_SOURCE_CODE,
  searchHubSpotObjectsInRange,
  type HubSpotDeal,
  type HubSpotOwner,
} from '@/lib/hubspot';
import { addEstCalendarDays, addEstCalendarMonths, estMidnightUtc, listEstDateRange, nextEstMidnightUtc } from '@/lib/time/eastern';
import { toDateKey } from '../payload';
import type {
  OperationalDatasetSchema,
  OperationalRecordInput,
  OperationalSourceAdapter,
  OperationalSourceOutput,
  OperationalSyncWindow,
} from '../types';
import { FULL_WINDOW, readConnectionMetadata, seededRandom } from './common';

const DEAL_PROPERTIES = 'dealname,pipeline,amount,dealstage,hubspot_owner_id,closedate,createdate,hs_is_closed_won,hs_is_closed_lost';
const COMPANY_PROPERTIES = 'name,industry,type,lifecyclestage,createdate,hs_last_sales_activity_timestamp';
const CONTACT_PROPERTIES = 'jobtitle,state,country,lifecyclestage,hs_analytics_source,createdate,hs_last_sales_activity_timestamp';
const ACTIVITY_PROPERTIES = {
  calls: 'hs_call_title,hs_call_disposition,hs_call_status,hs_call_duration,hs_timestamp,hubspot_owner_id',
  meetings: 'hs_meeting_title,hs_meeting_outcome,hs_meeting_start_time,hs_timestamp,hubspot_owner_id',
  tasks: 'hs_task_subject,hs_task_status,hs_task_priority,hs_timestamp,hubspot_owner_id',
} as const;

const DATASETS: OperationalDatasetSchema[] = [
  {
    key: 'hubspot.deals',
    label: 'HubSpot deals',
    description:
      'Current HubSpot deal list (point in time, refreshed each sync). One row per deal with stage, owner (sales rep), amount and status. Sum amount where isOpen = "true" for open pipeline; filter isWon = "true" and closeDate for won revenue in a period.',
    grain: 'point_in_time',
    dimensions: [
      { name: 'dealId' }, { name: 'dealName' }, { name: 'pipeline' }, { name: 'stage' },
      { name: 'owner', description: 'Sales rep who owns the deal' },
      { name: 'status', description: 'open, won or lost' },
      { name: 'isOpen' }, { name: 'isWon' }, { name: 'isLost' },
      { name: 'closeDate', description: 'YYYY-MM-DD' }, { name: 'createDate', description: 'YYYY-MM-DD' },
      { name: 'closeMonth', description: 'YYYY-MM' },
    ],
    measures: [{ name: 'amount' }, { name: 'dealCount', description: 'Always 1; sum to count deals' }],
  },
  {
    key: 'hubspot.companies',
    label: 'HubSpot companies',
    description: 'Current HubSpot company (account) records, point in time. One row per account.',
    grain: 'point_in_time',
    dimensions: [
      { name: 'companyRecordId' }, { name: 'name' }, { name: 'industry' }, { name: 'type' }, { name: 'lifecycleStage' },
      { name: 'createDate' }, { name: 'lastSalesActivityDate' }, { name: 'hasRecentActivity' },
    ],
    measures: [{ name: 'companyCount', description: 'Always 1; sum to count accounts' }],
  },
  {
    key: 'hubspot.contacts',
    label: 'HubSpot contacts',
    description:
      'Current HubSpot contacts, point in time, without names or contact details. One row per contact with job title, location (state/country), lifecycle stage and lead source.',
    grain: 'point_in_time',
    dimensions: [
      { name: 'contactRecordId' }, { name: 'jobTitle' }, { name: 'state' }, { name: 'country' }, { name: 'lifecycleStage' },
      { name: 'leadSource' }, { name: 'createDate' }, { name: 'lastSalesActivityDate' }, { name: 'hasEmployer' },
    ],
    measures: [{ name: 'contactCount', description: 'Always 1; sum to count contacts' }],
  },
  {
    key: 'hubspot.activities',
    label: 'HubSpot sales activities',
    description: 'Sales activities (calls, meetings, tasks) dated by activity date. One row per activity with type, status and owner (sales rep).',
    grain: 'flow',
    dimensions: [{ name: 'activityId' }, { name: 'activityType' }, { name: 'subject' }, { name: 'status' }, { name: 'owner' }],
    measures: [{ name: 'activityCount', description: 'Always 1' }, { name: 'durationMinutes' }],
  },
];

const prop = (record: HubSpotDeal, key: string) => String(record.properties?.[key] ?? '').trim();
const flag = (value: boolean) => (value ? 'true' : 'false');

function output(
  window: OperationalSyncWindow,
  deals: OperationalRecordInput[],
  companies: OperationalRecordInput[],
  contacts: OperationalRecordInput[],
  activities: OperationalRecordInput[],
): OperationalSourceOutput {
  return {
    'hubspot.deals': { rows: deals, replaceWindow: true, window: FULL_WINDOW },
    'hubspot.companies': { rows: companies, replaceWindow: true, window: FULL_WINDOW },
    'hubspot.contacts': { rows: contacts, replaceWindow: true, window: FULL_WINDOW },
    'hubspot.activities': { rows: activities.filter((row) => row.date >= window.startDate && row.date <= window.endDate), replaceWindow: true, window },
  };
}

/** Activities of one type with hs_timestamp inside the EST window, split so no search exceeds HubSpot's cap. */
async function fetchActivitiesInWindow(token: string, type: keyof typeof ACTIVITY_PROPERTIES, window: OperationalSyncWindow): Promise<HubSpotDeal[]> {
  const properties = ACTIVITY_PROPERTIES[type].split(',');
  const fetchRange = async (startDate: string, endDate: string): Promise<HubSpotDeal[]> => {
    const { results, truncated } = await searchHubSpotObjectsInRange<HubSpotDeal>(token, type, {
      property: 'hs_timestamp',
      startMs: estMidnightUtc(startDate).getTime(),
      endMs: nextEstMidnightUtc(endDate).getTime(),
      properties,
    });
    if (!truncated || startDate === endDate) return results;
    const days = listEstDateRange(startDate, endDate);
    const middle = days[Math.floor(days.length / 2) - 1];
    return [...(await fetchRange(startDate, middle)), ...(await fetchRange(addEstCalendarDays(middle, 1), endDate))];
  };
  const records: HubSpotDeal[] = [];
  for (let chunkStart = window.startDate; chunkStart <= window.endDate; chunkStart = addEstCalendarMonths(chunkStart, 1)) {
    const chunkEnd = addEstCalendarDays(addEstCalendarMonths(chunkStart, 1), -1);
    records.push(...(await fetchRange(chunkStart, chunkEnd < window.endDate ? chunkEnd : window.endDate)));
  }
  return records;
}

function dealRow(asOf: string, values: { id: string; name: string; pipeline: string; stage: string; owner: string; amount: number; won: boolean; lost: boolean; closeDate: string | null; createDate: string | null }): OperationalRecordInput {
  const status = values.won ? 'won' : values.lost ? 'lost' : 'open';
  return {
    date: asOf,
    externalId: `deal|${values.id}`,
    dimensions: {
      dealId: values.id, dealName: values.name, pipeline: values.pipeline, stage: values.stage, owner: values.owner, status,
      isOpen: flag(status === 'open'), isWon: flag(values.won), isLost: flag(values.lost),
      closeDate: values.closeDate, createDate: values.createDate, closeMonth: values.closeDate ? values.closeDate.slice(0, 7) : null,
    },
    measures: { amount: values.amount, dealCount: 1 },
  };
}

async function syncHubSpot({ companyId, window }: { companyId: string; window: { startDate: string; endDate: string } }): Promise<OperationalSourceOutput> {
  const { connection } = await readConnectionMetadata(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
  if (!connection?.accessToken || connection.status !== 'ACTIVE') throw new Error('HubSpot is not connected for this company.');
  const token = connection.accessToken;
  const asOf = window.endDate;

  const [deals, owners, companies, contacts] = await Promise.all([
    fetchHubSpotPages<HubSpotDeal>(token, '/crm/v3/objects/deals', { limit: '100', properties: DEAL_PROPERTIES }, 50),
    fetchHubSpotPages<HubSpotOwner>(token, '/crm/v3/owners', { limit: '100' }),
    fetchHubSpotPages<HubSpotDeal>(token, '/crm/v3/objects/companies', { limit: '100', properties: COMPANY_PROPERTIES }, 50),
    fetchHubSpotPages<HubSpotDeal & { associations?: any }>(token, '/crm/v3/objects/contacts', { limit: '100', properties: CONTACT_PROPERTIES, associations: 'companies' }, 50),
  ]);
  const activityGroups: Array<{ type: keyof typeof ACTIVITY_PROPERTIES; records: HubSpotDeal[] }> = [];
  for (const type of Object.keys(ACTIVITY_PROPERTIES) as Array<keyof typeof ACTIVITY_PROPERTIES>) {
    activityGroups.push({ type, records: await fetchActivitiesInWindow(token, type, window) });
  }
  const ownerName = new Map(owners.map((owner) => [String(owner.id), hubSpotOwnerName(owner)]));
  const ownerOf = (record: HubSpotDeal) => ownerName.get(prop(record, 'hubspot_owner_id')) || 'Unassigned';

  const dealRows = deals.map((deal) =>
    dealRow(asOf, {
      id: deal.id,
      name: prop(deal, 'dealname') || deal.id,
      pipeline: prop(deal, 'pipeline') || 'default',
      stage: prop(deal, 'dealstage') || 'Unspecified',
      owner: ownerOf(deal),
      amount: Number(prop(deal, 'amount')) || 0,
      won: prop(deal, 'hs_is_closed_won').toLowerCase() === 'true',
      lost: prop(deal, 'hs_is_closed_lost').toLowerCase() === 'true',
      closeDate: toDateKey(prop(deal, 'closedate')),
      createDate: toDateKey(prop(deal, 'createdate')),
    }),
  );
  const recentCutoff = addEstCalendarDays(asOf, -90);
  const companyRows = (companies as HubSpotDeal[]).map((record) => {
    const lastActivity = toDateKey(prop(record, 'hs_last_sales_activity_timestamp'));
    return {
      date: asOf,
      externalId: `company|${record.id}`,
      dimensions: {
        companyRecordId: record.id, name: prop(record, 'name') || record.id, industry: prop(record, 'industry') || null,
        type: prop(record, 'type') || null, lifecycleStage: prop(record, 'lifecyclestage') || null,
        createDate: toDateKey(prop(record, 'createdate')), lastSalesActivityDate: lastActivity,
        hasRecentActivity: flag(Boolean(lastActivity && lastActivity >= recentCutoff)),
      },
      measures: { companyCount: 1 },
    };
  });
  const contactRows = contacts.map((record) => ({
    date: asOf,
    externalId: `contact|${record.id}`,
    dimensions: {
      contactRecordId: record.id, jobTitle: prop(record, 'jobtitle') || null, state: prop(record, 'state') || null,
      country: prop(record, 'country') || null, lifecycleStage: prop(record, 'lifecyclestage') || null,
      leadSource: prop(record, 'hs_analytics_source') || null, createDate: toDateKey(prop(record, 'createdate')),
      lastSalesActivityDate: toDateKey(prop(record, 'hs_last_sales_activity_timestamp')),
      hasEmployer: flag(Array.isArray(record.associations?.companies?.results) && record.associations.companies.results.length > 0),
    },
    measures: { contactCount: 1 },
  }));
  const activityRows = activityGroups.flatMap(({ type, records }) =>
    records.flatMap((record) => {
      const date = toDateKey(prop(record, type === 'meetings' ? 'hs_meeting_start_time' : 'hs_timestamp') || prop(record, 'hs_timestamp'));
      if (!date) return [];
      const subject = type === 'calls' ? prop(record, 'hs_call_title') : type === 'meetings' ? prop(record, 'hs_meeting_title') : prop(record, 'hs_task_subject');
      const status = type === 'calls'
        ? prop(record, 'hs_call_disposition') || prop(record, 'hs_call_status')
        : type === 'meetings' ? prop(record, 'hs_meeting_outcome') : prop(record, 'hs_task_status');
      const durationMs = Number(prop(record, 'hs_call_duration')) || 0;
      return [{
        date,
        externalId: `${type}|${record.id}`,
        dimensions: { activityId: record.id, activityType: type.slice(0, -1), subject: subject || null, status: status || null, owner: ownerOf(record) },
        measures: { activityCount: 1, durationMinutes: durationMs ? Math.round(durationMs / 600) / 100 : null },
      }];
    }),
  );
  return output(window, dealRows, companyRows, contactRows, activityRows);
}

const MOCK_STAGES = ['appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled', 'decisionmakerboughtin', 'contractsent'];
const MOCK_OWNERS = ['Sales Rep A', 'Sales Rep B', 'Sales Rep C', 'Sales Rep D'];
const MOCK_INDUSTRIES = ['Manufacturing', 'Healthcare', 'Construction', 'Retail', 'Professional Services', 'Logistics'];

async function mockHubSpot({ companyId, window }: { companyId: string; window: { startDate: string; endDate: string } }): Promise<OperationalSourceOutput> {
  const random = seededRandom(`hubspot::${companyId}`);
  const asOf = window.endDate;
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const deals = Array.from({ length: 80 }, (_, index) => {
    const createDate = addEstCalendarDays(asOf, -Math.floor(random() * 365));
    const roll = random();
    const won = roll < 0.3;
    const lost = !won && roll < 0.5;
    const closeDate = won || lost ? addEstCalendarDays(createDate, 15 + Math.floor(random() * 75)) : addEstCalendarDays(asOf, Math.floor(random() * 90));
    return dealRow(asOf, {
      id: `mock-deal-${index + 1}`,
      name: `Opportunity ${index + 1}`,
      pipeline: 'default',
      stage: won ? 'closedwon' : lost ? 'closedlost' : pick(MOCK_STAGES),
      owner: pick(MOCK_OWNERS),
      amount: Math.round((5000 + random() * 95000) / 100) * 100,
      won,
      lost,
      closeDate: closeDate > asOf && (won || lost) ? asOf : closeDate,
      createDate,
    });
  });
  const companies = Array.from({ length: 40 }, (_, index) => {
    const lastActivity = addEstCalendarDays(asOf, -Math.floor(random() * 200));
    return {
      date: asOf,
      externalId: `company|mock-${index + 1}`,
      dimensions: {
        companyRecordId: `mock-${index + 1}`, name: `Account ${index + 1}`, industry: pick(MOCK_INDUSTRIES), type: random() < 0.6 ? 'CUSTOMER' : 'PROSPECT',
        lifecycleStage: random() < 0.6 ? 'customer' : 'lead', createDate: addEstCalendarDays(asOf, -Math.floor(random() * 900)),
        lastSalesActivityDate: lastActivity, hasRecentActivity: flag(lastActivity >= addEstCalendarDays(asOf, -90)),
      },
      measures: { companyCount: 1 },
    };
  });
  const contacts = Array.from({ length: 120 }, (_, index) => ({
    date: asOf,
    externalId: `contact|mock-${index + 1}`,
    dimensions: {
      contactRecordId: `mock-${index + 1}`, jobTitle: pick(['Operations Manager', 'Controller', 'Owner', 'HR Director', 'Buyer']),
      state: pick(['OH', 'PA', 'NY', 'FL', 'TX']), country: 'US', lifecycleStage: pick(['lead', 'marketingqualifiedlead', 'opportunity', 'customer']),
      leadSource: pick(['ORGANIC_SEARCH', 'REFERRALS', 'DIRECT_TRAFFIC', 'EMAIL_MARKETING']), createDate: addEstCalendarDays(asOf, -Math.floor(random() * 700)),
      lastSalesActivityDate: addEstCalendarDays(asOf, -Math.floor(random() * 120)), hasEmployer: flag(random() < 0.7),
    },
    measures: { contactCount: 1 },
  }));
  const activities = Array.from({ length: 300 }, (_, index) => {
    const type = pick(['call', 'meeting', 'task']);
    return {
      date: addEstCalendarDays(asOf, -Math.floor(random() * 180)),
      externalId: `activity|mock-${index + 1}`,
      dimensions: {
        activityId: `mock-${index + 1}`, activityType: type, subject: `${type} ${index + 1}`,
        status: type === 'call' ? pick(['Connected', 'Left voicemail', 'No answer']) : type === 'meeting' ? pick(['COMPLETED', 'SCHEDULED']) : pick(['COMPLETED', 'NOT_STARTED']),
        owner: pick(MOCK_OWNERS),
      },
      measures: { activityCount: 1, durationMinutes: type === 'call' ? Math.round(random() * 30 * 100) / 100 : null },
    };
  });
  return output(window, deals, companies, contacts, activities);
}

export const HUBSPOT_ADAPTER: OperationalSourceAdapter = {
  sourceCode: HUBSPOT_SOURCE_CODE,
  provider: 'HUBSPOT',
  label: 'HubSpot',
  datasetPrefix: 'hubspot',
  history: 'range',
  historyNote:
    'Calls, meetings and tasks are pulled for the full date range. Deals, companies and contacts are the current list (with their create and close dates); HubSpot does not expose past pipeline snapshots.',
  defaultHistoryDays: 365 * 3,
  datasets: DATASETS,
  sync: syncHubSpot,
  mock: mockHubSpot,
};
