import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { formatEstDate } from '@/lib/time/eastern';
import {
  fetchHubSpotPages,
  HubSpotDeal,
  hubSpotOwnerName,
  HubSpotOwner,
  HUBSPOT_SOURCE_CODE,
} from '@/lib/hubspot';

export const dynamic = 'force-dynamic';

const DEAL_PROPERTIES = 'amount,dealstage,hubspot_owner_id,closedate,createdate,hs_is_closed_won,hs_is_closed_lost';
const ACTIVITY_TYPES = ['calls', 'meetings', 'tasks'] as const;
const ACTIVITY_PROPERTIES: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  calls: 'hs_call_title,hs_call_disposition,hs_call_status,hs_call_duration,hs_timestamp,hubspot_owner_id',
  meetings: 'hs_meeting_title,hs_meeting_outcome,hs_meeting_start_time,hs_meeting_end_time,hs_timestamp,hubspot_owner_id',
  tasks: 'hs_task_subject,hs_task_status,hs_task_priority,hs_timestamp,hubspot_owner_id',
};
const CONTACT_PROPERTIES = 'firstname,lastname,email,phone,mobilephone,jobtitle,city,state,country,lifecyclestage,hs_analytics_source,createdate,hs_last_sales_activity_timestamp';
const COMPANY_PROPERTIES = 'name,domain,industry,type,lifecyclestage,createdate,hs_last_sales_activity_timestamp';

const asAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

function countRowsBy(
  rows: Array<{ properties?: Record<string, string | null | undefined> }>,
  field: string,
  label: string
) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = String(row.properties?.[field] || '').trim() || 'Unspecified';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ [label]: value, count }))
    .sort((a, b) => b.count - a.count);
}

function activityMonth(timestamp: string | null | undefined): string {
  const raw = String(timestamp || '').trim();
  if (!raw) return 'Unscheduled';
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : formatEstDate(date).slice(0, 7);
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    if (!await validateCompanyAccess(companyId)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const connection = await getOperationalSystemConnection(companyId, 'HUBSPOT', HUBSPOT_SOURCE_CODE);
    if (!connection?.accessToken || connection.status !== 'ACTIVE') {
      return NextResponse.json({ ok: false, error: 'HubSpot is not connected for this company.' }, { status: 409 });
    }
    const metadata = connection.connectionMetadata && typeof connection.connectionMetadata === 'object'
      ? connection.connectionMetadata as Record<string, any>
      : {};
    const configuredDomains = Array.isArray(metadata?.operationalSourceDataDomains?.HUBSPOT_STANDARD)
      ? metadata.operationalSourceDataDomains.HUBSPOT_STANDARD
      : [];
    const domainEnabled = (name: string) => {
      const configured = configuredDomains.find((domain: any) => domain?.dataDomain === name);
      return configured?.enabled !== false;
    };
    const includeDeals = domainEnabled('Deals & Pipeline');
    const includeOwners = domainEnabled('Deal Owners');
    const includeActivities = domainEnabled('Sales Activities');
    const fetchCrmRecords = async (domain: string, objectType: string, properties: string, associations?: string) => {
      if (!domainEnabled(domain)) return { records: [], enabled: false, error: null };
      try {
        return {
          records: await fetchHubSpotPages<HubSpotDeal>(
            connection.accessToken,
            `/crm/v3/objects/${objectType}`,
            { limit: '100', properties, ...(associations ? { associations } : {}) },
            10
          ),
          enabled: true,
          error: null,
        };
      } catch (error) {
        return {
          records: [],
          enabled: true,
          error: error instanceof Error ? error.message : 'HubSpot object query failed.',
        };
      }
    };
    const [companies, contacts] = await Promise.all([
      fetchCrmRecords('Companies', 'companies', COMPANY_PROPERTIES),
      fetchCrmRecords('Contacts', 'contacts', CONTACT_PROPERTIES, 'companies'),
    ]);

    const [deals, owners, activities] = await Promise.all([
      includeDeals ? fetchHubSpotPages<HubSpotDeal>(connection.accessToken, '/crm/v3/objects/deals', { limit: '100', properties: DEAL_PROPERTIES }) : Promise.resolve([] as HubSpotDeal[]),
      includeOwners ? fetchHubSpotPages<HubSpotOwner>(connection.accessToken, '/crm/v3/owners', { limit: '100' }) : Promise.resolve([] as HubSpotOwner[]),
      includeActivities
        ? Promise.all(ACTIVITY_TYPES.map((activityType) =>
            fetchHubSpotPages<HubSpotDeal>(
              connection.accessToken,
              `/crm/v3/objects/${activityType}`,
              { limit: '100', properties: ACTIVITY_PROPERTIES[activityType] },
              10
            ).then((records) => ({ activityType, count: records.length, records }))
          ))
        : Promise.resolve([] as Array<{ activityType: string; count: number; records: HubSpotDeal[] }>),
    ]);
    const ownersById = new Map(owners.map((owner) => [String(owner.id), hubSpotOwnerName(owner)]));
    const stages = new Map<string, { stage: string; dealCount: number; pipelineValue: number }>();
    const reps = new Map<string, { owner: string; openDeals: number; openPipeline: number; wonDeals: number; wonRevenue: number }>();
    const monthly = new Map<string, { period: string; wonDeals: number; lostDeals: number; winRate: number }>();

    for (const deal of deals) {
      const properties = deal.properties || {};
      const stage = String(properties.dealstage || 'Unspecified');
      const amount = asAmount(properties.amount);
      const isWon = String(properties.hs_is_closed_won).toLowerCase() === 'true';
      const isLost = String(properties.hs_is_closed_lost).toLowerCase() === 'true';
      const isOpen = !isWon && !isLost;
      const stageRow = stages.get(stage) || { stage, dealCount: 0, pipelineValue: 0 };
      stageRow.dealCount += 1;
      stageRow.pipelineValue += amount;
      stages.set(stage, stageRow);

      const ownerId = String(properties.hubspot_owner_id || '');
      const owner = ownersById.get(ownerId) || 'Unassigned';
      const rep = reps.get(owner) || { owner, openDeals: 0, openPipeline: 0, wonDeals: 0, wonRevenue: 0 };
      if (isOpen) {
        rep.openDeals += 1;
        rep.openPipeline += amount;
      }
      if (isWon) {
        rep.wonDeals += 1;
        rep.wonRevenue += amount;
      }
      reps.set(owner, rep);

      if (isWon || isLost) {
        const date = String(properties.closedate || '').slice(0, 7);
        if (date) {
          const row = monthly.get(date) || { period: date, wonDeals: 0, lostDeals: 0, winRate: 0 };
          if (isWon) row.wonDeals += 1;
          if (isLost) row.lostDeals += 1;
          row.winRate = row.wonDeals + row.lostDeals ? (row.wonDeals / (row.wonDeals + row.lostDeals)) * 100 : 0;
          monthly.set(date, row);
        }
      }
    }

    const openDeals = deals.filter((deal) => {
      const props = deal.properties || {};
      return String(props.hs_is_closed_won).toLowerCase() !== 'true' && String(props.hs_is_closed_lost).toLowerCase() !== 'true';
    });
    const activitySummary = activities.reduce<Record<string, number>>((acc, activity) => {
      acc[activity.activityType] = activity.count;
      return acc;
    }, {});
    const activityDetails = activities.flatMap(({ activityType, records }) => records.map((record) => {
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
    const activityRows = activityDetails.map((activity) => ({
      properties: {
        owner: activity.owner,
        status: activity.status,
        month: activityMonth(activity.timestamp),
      },
    }));
    const contactActivityCount = contacts.records.filter((row) =>
      Boolean(String(row.properties?.hs_last_sales_activity_timestamp || '').trim())
    ).length;
    const companyActivityCount = companies.records.filter((row) =>
      Boolean(String(row.properties?.hs_last_sales_activity_timestamp || '').trim())
    ).length;
    const candidatesWithEmployer = contacts.records.filter((row: any) =>
      Array.isArray(row.associations?.companies?.results) && row.associations.companies.results.length > 0
    ).length;
    const candidateEmployerLinks = contacts.records.reduce((total, row: any) =>
      total + (Array.isArray(row.associations?.companies?.results) ? row.associations.companies.results.length : 0), 0);

    return NextResponse.json({
      ok: true,
      summary: {
        totalDeals: deals.length,
        openDeals: openDeals.length,
        openPipeline: openDeals.reduce((sum, deal) => sum + asAmount(deal.properties?.amount), 0),
        wonDeals: deals.filter((deal) => String(deal.properties?.hs_is_closed_won).toLowerCase() === 'true').length,
        activityCount: Object.values(activitySummary).reduce((sum, count) => sum + count, 0),
        asOf: new Date().toISOString(),
      },
      stages: Array.from(stages.values()).sort((a, b) => b.pipelineValue - a.pipelineValue),
      reps: Array.from(reps.values()).sort((a, b) => b.openPipeline - a.openPipeline),
      winRateTrend: Array.from(monthly.values()).sort((a, b) => a.period.localeCompare(b.period)),
      activities: ACTIVITY_TYPES.map((activityType) => ({ type: activityType, count: activitySummary[activityType] || 0 })),
      activityDetails,
      companies,
      contacts,
      crmReports: {
        contactLifecycle: countRowsBy(contacts.records, 'lifecyclestage', 'lifecycle'),
        contactSource: countRowsBy(contacts.records, 'hs_analytics_source', 'source'),
        candidateRoles: countRowsBy(contacts.records, 'jobtitle', 'title'),
        companyIndustry: countRowsBy(companies.records, 'industry', 'industry'),
        companyLifecycle: countRowsBy(companies.records, 'lifecyclestage', 'lifecycle'),
        activityByOwner: countRowsBy(activityRows, 'owner', 'owner'),
        activityByStatus: countRowsBy(activityRows, 'status', 'status'),
        activityByMonth: countRowsBy(activityRows, 'month', 'period'),
        engagementCoverage: {
          contactsWithSalesActivity: contactActivityCount,
          contactsWithoutSalesActivity: contacts.records.length - contactActivityCount,
          companiesWithSalesActivity: companyActivityCount,
          companiesWithoutSalesActivity: companies.records.length - companyActivityCount,
        },
        candidateEmployerLinks: {
          candidatesWithEmployer,
          candidatesWithoutEmployer: contacts.records.length - candidatesWithEmployer,
          employerLinks: candidateEmployerLinks,
        },
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load HubSpot sales data';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
