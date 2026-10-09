import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdmin } from '@/lib/tenant-security';
import { runOperationalSource, setOperationalSourceMockEnabled, validateSyncWindow } from '@/lib/operational-data/runner';
import { getOperationalAdapter } from '@/lib/operational-data/registry';
import type { OperationalSyncWindow } from '@/lib/operational-data/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ACTIONS = ['enable_mock', 'disable_mock', 'run_live', 'run_mock'] as const;
type Action = (typeof ACTIONS)[number];

/** History capability and stored date coverage for one company + source (date-range sync controls). */
export async function GET(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const sourceCode = String(request.nextUrl.searchParams.get('sourceCode') || '').trim();
    if (!companyId || !sourceCode) return NextResponse.json({ error: 'companyId and sourceCode are required' }, { status: 400 });
    const adapter = getOperationalAdapter(sourceCode);
    if (!adapter) return NextResponse.json({ error: `No store adapter is registered for ${sourceCode}` }, { status: 404 });
    const [state, coverage] = await Promise.all([
      prisma.operationalSourceState.findUnique({ where: { companyId_sourceCode: { companyId, sourceCode } } }),
      prisma.operationalDataset.aggregate({
        where: { companyId, sourceCode, dataMode: 'LIVE', rowCount: { gt: 0 } },
        _min: { minDate: true },
        _max: { maxDate: true },
      }),
    ]);
    const ymd = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
    return NextResponse.json({
      sourceCode,
      label: adapter.label,
      history: adapter.history,
      historyNote: adapter.historyNote || null,
      supportsLive: Boolean(adapter.sync),
      liveSince: state?.liveSince ? state.liveSince.toISOString() : null,
      lastLiveRunAt: state?.lastLiveRunAt ? state.lastLiveRunAt.toISOString() : null,
      lastRunStatus: state?.lastRunStatus || null,
      lastRunMessage: state?.lastRunMessage || null,
      storedFrom: ymd(coverage._min.minDate),
      storedThrough: ymd(coverage._max.maxDate),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read operational source';
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const sourceCode = String(body.sourceCode || '').trim();
    const action = String(body.action || '') as Action;
    if (!companyId || !sourceCode) return NextResponse.json({ error: 'companyId and sourceCode are required' }, { status: 400 });
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
    if (!getOperationalAdapter(sourceCode)) return NextResponse.json({ error: `No store adapter is registered for ${sourceCode}` }, { status: 400 });

    if (action === 'enable_mock' || action === 'disable_mock') {
      const result = await setOperationalSourceMockEnabled(companyId, sourceCode, action === 'enable_mock');
      return NextResponse.json(result, { status: result.ok ? 200 : 409 });
    }
    let window: OperationalSyncWindow | undefined;
    if (action === 'run_live' && (body.startDate || body.endDate)) {
      if (getOperationalAdapter(sourceCode)?.history !== 'range') {
        return NextResponse.json({ error: `${sourceCode} cannot sync a date range; its system only provides current data or uploaded files.` }, { status: 400 });
      }
      const validated = validateSyncWindow(body.startDate, body.endDate);
      if (!validated.window) return NextResponse.json({ error: validated.error }, { status: 400 });
      window = validated.window;
    }
    const result = await runOperationalSource({ companyId, sourceCode, mode: action === 'run_live' ? 'LIVE' : 'MOCK', window });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operational source action failed';
    const status = message.startsWith('Forbidden') ? 403 : message.startsWith('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
