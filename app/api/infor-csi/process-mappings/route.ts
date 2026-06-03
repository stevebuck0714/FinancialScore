import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StageResult = {
  ok: boolean;
  status: number;
  requestId: string | null;
  payload: Record<string, any>;
};

function normalizeMode(value: unknown): 'through' | 'only' {
  return String(value || '').trim().toLowerCase() === 'only' ? 'only' : 'through';
}

function normalizeTargetMonth(value: unknown): string | null {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function formatStageError(value: unknown, fallback = 'Unknown error') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts = [
      record.message,
      record.error,
      record.code ? `code: ${record.code}` : null,
      record.id ? `id: ${record.id}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.map((part) => String(part)).join(' | ');
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

async function parseJsonResponse(response: Response): Promise<StageResult> {
  const requestId = response.headers.get('x-vercel-id');
  const text = await response.text();
  let payload: Record<string, any> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: `Non-JSON response: ${text.slice(0, 200)}` };
  }
  return {
    ok: response.ok,
    status: response.status,
    requestId,
    payload,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];
    const linesOfBusiness = Array.isArray(body.linesOfBusiness) ? body.linesOfBusiness : [];
    const mode = normalizeMode(body.mode);
    const targetMonth = normalizeTargetMonth(body.targetMonth);

    if (!companyId) {
      return NextResponse.json({ success: false, stage: 'validate', error: 'companyId is required' }, { status: 400 });
    }
    if (!mappings.length) {
      return NextResponse.json({ success: false, stage: 'validate', error: 'mappings is required' }, { status: 400 });
    }
    if (!targetMonth) {
      return NextResponse.json({ success: false, stage: 'validate', error: 'targetMonth (YYYY-MM) is required' }, { status: 400 });
    }

    await requireCompanyAccess(companyId);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();
    if (accountingSystem !== 'INFOR_CSI') {
      return NextResponse.json(
        {
          success: false,
          stage: 'validate',
          error: `CSI orchestration endpoint only supports INFOR_CSI (found ${accountingSystem || 'UNKNOWN'})`,
        },
        { status: 409 },
      );
    }

    const origin = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') || '';

    const saveResponse = await fetch(`${origin}/api/account-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        companyId,
        mappings,
        linesOfBusiness,
      }),
      cache: 'no-store',
    });
    const saveStage = await parseJsonResponse(saveResponse);
    if (!saveStage.ok || saveStage.payload?.success === false) {
      return NextResponse.json(
        {
          success: false,
          stage: 'save_mappings',
          error: formatStageError(saveStage.payload?.error, 'Failed to save account mappings'),
          details: saveStage.payload?.details == null ? null : formatStageError(saveStage.payload.details, ''),
          saveStage,
        },
        { status: saveStage.status || 500 },
      );
    }

    const reprocessResponse = await fetch(`${origin}/api/financials/reprocess-mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        companyId,
        targetMonth,
        mode,
        useHistoricalSlLedgers: true,
        persistRebuiltPayload: true,
      }),
      cache: 'no-store',
    });
    const reprocessStage = await parseJsonResponse(reprocessResponse);
    if (!reprocessStage.ok || reprocessStage.payload?.success === false) {
      return NextResponse.json(
        {
          success: false,
          stage: 'reprocess',
          error: formatStageError(reprocessStage.payload?.error || reprocessStage.payload?.message, 'Failed to reprocess financial mappings'),
          details: reprocessStage.payload?.details == null ? null : formatStageError(reprocessStage.payload.details, ''),
          diagnostics: reprocessStage.payload?.diagnostics || null,
          saveStage,
          reprocessStage,
        },
        { status: reprocessStage.status || 500 },
      );
    }

    const latestValuesResponse = await fetch(
      `${origin}/api/account-review/latest-values?companyId=${encodeURIComponent(companyId)}&targetMonth=${encodeURIComponent(targetMonth)}&forceRefresh=1`,
      {
        headers: { cookie },
        cache: 'no-store',
      },
    );
    const latestValuesStage = await parseJsonResponse(latestValuesResponse);
    const latestValues =
      latestValuesStage.payload?.values &&
      typeof latestValuesStage.payload.values === 'object' &&
      !Array.isArray(latestValuesStage.payload.values)
        ? (latestValuesStage.payload.values as Record<string, number>)
        : {};

    return NextResponse.json({
      success: true,
      message: `CSI mappings processed for ${targetMonth}.`,
      stage: 'complete',
      targetMonth,
      mode,
      valuesCount: Object.keys(latestValues).length,
      stages: {
        save: {
          status: saveStage.status,
          requestId: saveStage.requestId,
          created: saveStage.payload?.created ?? null,
          updated: saveStage.payload?.updated ?? null,
          invalidCount: saveStage.payload?.invalidCount ?? null,
        },
        reprocess: {
          status: reprocessStage.status,
          requestId: reprocessStage.requestId,
          message: reprocessStage.payload?.message || null,
          diagnostics: reprocessStage.payload?.diagnostics || null,
        },
        latestValues: {
          status: latestValuesStage.status,
          requestId: latestValuesStage.requestId,
          count: Object.keys(latestValues).length,
        },
      },
      values: latestValues,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        stage: 'exception',
        error: error?.message || 'Failed to process CSI mappings',
      },
      { status: 500 },
    );
  }
}

