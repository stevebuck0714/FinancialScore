import { fetchHubSpotPages, HubSpotDeal, hubSpotOwnerName, HubSpotOwner, HUBSPOT_SOURCE_CODE } from '@/lib/hubspot';
import { asAmount, buildCrmReports, crmEstDate, summarizeOpportunities, type CrmActivityDetail, type CrmOpportunity } from './sales-data';

const DEAL_PROPERTIES = 'dealname,pipeline,amount,dealstage,hubspot_owner_id,closedate,createdate,hs_is_closed_won,hs_is_closed_lost,hs_date_entered_dealstage';
const ACTIVITY_TYPES = ['calls', 'meetings', 'tasks'] as const;
const ACTIVITY_PROPERTIES: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  calls: 'hs_call_title,hs_call_disposition,hs_call_status,hs_call_duration,hs_timestamp,hubspot_owner_id',
  meetings: 'hs_meeting_title,hs_meeting_outcome,hs_meeting_start_time,hs_meeting_end_time,hs_timestamp,hubspot_owner_id',
  tasks: 'hs_task_subject,hs_task_status,hs_task_priority,hs_timestamp,hubspot_owner_id',
};
const CONTACT_PROPERTIES = 'firstname,lastname,email,phone,mobilephone,jobtitle,city,state,country,lifecyclestage,hs_analytics_source,createdate,hs_last_sales_activity_timestamp';
const COMPANY_PROPERTIES = 'name,domain,industry,type,lifecyclestage,createdate,hs_last_sales_activity_timestamp';

type HubSpotConnection = { accessToken: string; connectionMetadata?: unknown };

/** HubSpot CRM read for the Sales tab, in the shared CRM sales payload shape. */
export async function loadHubSpotSalesData(connection: HubSpotConnection) {
  const token = connection.accessToken;
  const metadata = connection.connectionMetadata && typeof connection.connectionMetadata === 'object'
    ? connection.connectionMetadata as Record<string, any>
    : {};
  const configuredDomains = Array.isArray(metadata?.operationalSourceDataDomains?.[HUBSPOT_SOURCE_CODE])
    ? metadata.operationalSourceDataDomains[HUBSPOT_SOURCE_CODE]
    : [];
  const domainEnabled = (name: string) => {
    const configured = configuredDomains.find((domain: any) => domain?.dataDomain === name);
    return configured?.enabled !== false;
  };
  const includeDeals = domainEnabled('Deals & Pipeline');
  const includeOwners = domainEnabled('Deal Owners');
  const includeActivities = domainEnabled('Sales Activities');
  const fetchCrmRecords = async (domain: string, objectType: string, properties: string, associations?: string) => {
    if (!domainEnabled(domain)) return { records: [] as HubSpotDeal[], enabled: false, error: null as string | null };
    try {
      return {
        records: await fetchHubSpotPages<HubSpotDeal>(token, `/crm/v3/objects/${objectType}`, { limit: '100', properties, ...(associations ? { associations } : {}) }, 10),
        enabled: true,
        error: null as string | null,
      };
    } catch (error) {
      return { records: [] as HubSpotDeal[], enabled: true, error: error instanceof Error ? error.message : 'HubSpot object query failed.' };
    }
  };
  const [companies, contacts] = await Promise.all([
    fetchCrmRecords('Companies', 'companies', COMPANY_PROPERTIES),
    fetchCrmRecords('Contacts', 'contacts', CONTACT_PROPERTIES, 'companies'),
  ]);

  const [deals, owners, activities] = await Promise.all([
    includeDeals ? fetchHubSpotPages<HubSpotDeal>(token, '/crm/v3/objects/deals', { limit: '100', properties: DEAL_PROPERTIES }) : Promise.resolve([] as HubSpotDeal[]),
    includeOwners ? fetchHubSpotPages<HubSpotOwner>(token, '/crm/v3/owners', { limit: '100' }) : Promise.resolve([] as HubSpotOwner[]),
    includeActivities
      ? Promise.all(ACTIVITY_TYPES.map((activityType) =>
          fetchHubSpotPages<HubSpotDeal>(token, `/crm/v3/objects/${activityType}`, { limit: '100', properties: ACTIVITY_PROPERTIES[activityType] }, 10)
            .then((records) => ({ activityType, count: records.length, records }))
        ))
      : Promise.resolve([] as Array<{ activityType: string; count: number; records: HubSpotDeal[] }>),
  ]);
  const ownersById = new Map(owners.map((owner) => [String(owner.id), hubSpotOwnerName(owner)]));

  const opportunities: CrmOpportunity[] = deals.map((deal) => {
    const properties = deal.properties || {};
    const won = String(properties.hs_is_closed_won).toLowerCase() === 'true';
    const lost = String(properties.hs_is_closed_lost).toLowerCase() === 'true';
    return {
      id: deal.id,
      name: String(properties.dealname || deal.id),
      pipeline: String(properties.pipeline || 'default'),
      stage: String(properties.dealstage || 'Unspecified'),
      owner: ownersById.get(String(properties.hubspot_owner_id || '')) || 'Unassigned',
      value: asAmount(properties.amount),
      status: won ? 'won' : lost ? 'lost' : 'open',
      source: 'Unspecified',
      companyName: '',
      createdDate: crmEstDate(properties.createdate),
      closedDate: won || lost ? crmEstDate(properties.closedate) : null,
      lastStageChangeDate: crmEstDate(properties.hs_date_entered_dealstage) || crmEstDate(deal.updatedAt),
    };
  });

  const activitySummary = activities.reduce<Record<string, number>>((acc, activity) => {
    acc[activity.activityType] = activity.count;
    return acc;
  }, {});
  const activityDetails: CrmActivityDetail[] = activities.flatMap(({ activityType, records }) => records.map((record) => {
    const properties = record.properties || {};
    const owner = ownersById.get(String(properties.hubspot_owner_id || '')) || 'Unassigned';
    if (activityType === 'calls') {
      return {
        id: record.id,
        type: 'Call',
        subject: String(properties.hs_call_title || '—'),
        status: String(properties.hs_call_disposition || properties.hs_call_status || '—'),
        owner,
        timestamp: properties.hs_timestamp || null,
        durationSeconds: asAmount(properties.hs_call_duration) || null,
      };
    }
    if (activityType === 'meetings') {
      return {
        id: record.id,
        type: 'Meeting',
        subject: String(properties.hs_meeting_title || '—'),
        status: String(properties.hs_meeting_outcome || '—'),
        owner,
        timestamp: properties.hs_meeting_start_time || properties.hs_timestamp || null,
        durationSeconds: null,
      };
    }
    return {
      id: record.id,
      type: 'Task',
      subject: String(properties.hs_task_subject || '—'),
      status: String(properties.hs_task_status || '—'),
      owner,
      timestamp: properties.hs_timestamp || null,
      durationSeconds: null,
    };
  }));
  const rollups = summarizeOpportunities(opportunities);

  return {
    ok: true,
    provider: 'HUBSPOT' as const,
    providerLabel: 'HubSpot',
    summary: {
      ...rollups.summary,
      activityCount: Object.values(activitySummary).reduce((sum, count) => sum + count, 0),
      asOf: new Date().toISOString(),
    },
    stages: rollups.stages,
    reps: rollups.reps,
    winRateTrend: rollups.winRateTrend,
    activities: ACTIVITY_TYPES.map((activityType) => ({ type: activityType, count: activitySummary[activityType] || 0 })),
    activityDetails,
    opportunities,
    companies,
    contacts,
    crmReports: buildCrmReports(companies.records, contacts.records, activityDetails),
  };
}
