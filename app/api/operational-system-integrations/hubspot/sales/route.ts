import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
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

const asAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

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

    const [deals, owners, activities] = await Promise.all([
      includeDeals ? fetchHubSpotPages<HubSpotDeal>(connection.accessToken, '/crm/v3/objects/deals', { limit: '100', properties: DEAL_PROPERTIES }) : Promise.resolve([] as HubSpotDeal[]),
      includeOwners ? fetchHubSpotPages<HubSpotOwner>(connection.accessToken, '/crm/v3/owners', { limit: '100' }) : Promise.resolve([] as HubSpotOwner[]),
      includeActivities
        ? Promise.all(ACTIVITY_TYPES.map((activityType) =>
            fetchHubSpotPages<unknown>(connection.accessToken, `/crm/v3/objects/${activityType}`, { limit: '100' }, 1)
              .then((rows) => ({ activityType, count: rows.length }))
          ))
        : Promise.resolve([] as Array<{ activityType: string; count: number }>),
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
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load HubSpot sales data';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
