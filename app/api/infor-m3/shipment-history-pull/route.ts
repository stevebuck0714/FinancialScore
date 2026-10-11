import { NextRequest, NextResponse } from 'next/server';
import { pullCsiShipmentHistory } from '@/lib/infor-m3/csi-shipment-history';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { estMonthKey } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_FROM_MONTH = '2023-01';
// Leaves room under maxDuration for the month in flight when the budget runs out.
const PULL_BUDGET_MS = 200_000;

/**
 * Site-admin pull of Infor CSI shipment history (SLCoShips) into InforShipmentFact.
 * Read-only against Infor. Resumable: open `nextUrl` until `done` is true.
 */
export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const params = request.nextUrl.searchParams;
    const currentMonth = estMonthKey();
    const fromMonth = String(params.get('from') || DEFAULT_FROM_MONTH).trim();
    const throughMonth = String(params.get('through') || currentMonth).trim();
    if (!MONTH_PATTERN.test(fromMonth) || !MONTH_PATTERN.test(throughMonth)) {
      return NextResponse.json({ error: 'from and through must be YYYY-MM.' }, { status: 400 });
    }
    if (throughMonth > currentMonth || fromMonth > throughMonth) {
      return NextResponse.json({ error: `Months must run forward and end no later than ${currentMonth}.` }, { status: 400 });
    }
    const result = await pullCsiShipmentHistory({ companyId, fromMonth, throughMonth, budgetMs: PULL_BUDGET_MS });
    let nextUrl: string | null = null;
    if (result.nextMonth) {
      const next = new URL(request.nextUrl.toString());
      next.searchParams.set('from', result.nextMonth);
      next.searchParams.set('through', throughMonth);
      nextUrl = next.toString();
    }
    return NextResponse.json(
      {
        done: result.ok && !result.nextMonth,
        error: result.error,
        monthsPulled: result.months,
        shipmentsSaved: result.months.reduce((sum, month) => sum + month.rows, 0),
        nextMonth: result.nextMonth,
        nextUrl,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shipment history pull failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
