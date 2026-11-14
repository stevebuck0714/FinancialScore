import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { FOODREADY_SOURCE_CODE, foodReadyApiRequest, foodReadyCredentialsFromConnection, normalizeFoodReadyOverlapDays } from '@/lib/foodready';
import { configuredFoodReadyDomains, syncFoodReady } from '@/lib/operational-data/sources/foodready';
import { asRecord } from '@/lib/operational-data/sources/common';
import { addEstCalendarDays, formatEstDate } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';

type Action = 'validate' | 'probe' | 'sync_test';

function firstRecord(payload: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(payload) ? payload : asRecord(payload).data;
  const first = Array.isArray(rows) ? rows[0] : null;
  return first && typeof first === 'object' ? first as Record<string, unknown> : null;
}

/** Read-only checks behind the FoodReady Connect, Probe Domains and Run Sync Test buttons; nothing is stored. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const action = String(body.action || '') as Action;
    if (!['validate', 'probe', 'sync_test'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'action must be validate, probe or sync_test.' }, { status: 400 });
    }
    const connection = await getOperationalSystemConnection(companyId, 'FOODREADY', FOODREADY_SOURCE_CODE);
    const credentials = connection?.status === 'ACTIVE' ? foodReadyCredentialsFromConnection(connection) : null;
    if (!credentials) return NextResponse.json({ ok: false, error: 'Save the FoodReady Organization ID and API Key first.' }, { status: 400 });
    const metadata = asRecord(connection?.connectionMetadata);
    const domains = configuredFoodReadyDomains(metadata);
    if (!domains.length) return NextResponse.json({ ok: false, error: 'No FoodReady data domains are enabled.' }, { status: 400 });

    if (action === 'validate') {
      await foodReadyApiRequest<unknown>(credentials, domains[0].sourceObject, { from: 0, size: 1 });
      return NextResponse.json({ ok: true, endpoint: domains[0].sourceObject });
    }

    if (action === 'probe') {
      const results = await Promise.all(domains.map(async (domain) => {
        try {
          const record = firstRecord(await foodReadyApiRequest<unknown>(credentials, domain.sourceObject, { from: 0, size: 1 }));
          return { dataDomain: domain.dataDomain, endpoint: domain.sourceObject, ok: true, fieldCount: record ? Object.keys(record).length : 0 };
        } catch (error: any) {
          return { dataDomain: domain.dataDomain, endpoint: domain.sourceObject, ok: false, error: error?.message || 'Request failed' };
        }
      }));
      return NextResponse.json({ ok: true, results });
    }

    const overlapDays = normalizeFoodReadyOverlapDays(asRecord(metadata.foodReadySettings).overlapDays);
    const endDate = formatEstDate();
    const window = { startDate: addEstCalendarDays(endDate, -overlapDays), endDate };
    const output = await syncFoodReady({ companyId, window });
    const datasets = Object.values(output).map((dataset) => ({ label: dataset.schema?.label || '', rows: dataset.rows.length }));
    return NextResponse.json({ ok: true, window, datasets });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'FoodReady check failed.' }, { status: 400 });
  }
}
