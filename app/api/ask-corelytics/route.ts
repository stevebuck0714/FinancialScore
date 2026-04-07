import { NextRequest, NextResponse } from 'next/server';
import { runAskCorelyticsLegacy } from '@/app/api/ai-analysis/ask/route';
import { classifyQuestion } from '@/lib/ask-corelytics/classifier';
import type {
  AskCorelyticsRequest,
  AskCorelyticsResponse,
  LegacyAskResponse,
} from '@/lib/ask-corelytics/types';

function getSourceName(url: string, fallback?: string): string {
  try {
    return new URL(url).hostname || fallback || 'Source';
  } catch {
    return fallback || 'Source';
  }
}

function mapLegacyToCanonical(params: {
  route: AskCorelyticsResponse['route'];
  legacy: LegacyAskResponse;
}): AskCorelyticsResponse {
  const { route, legacy } = params;
  const internalFindings = (legacy.citedBullets || [])
    .map((b) => String(b?.text || '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const externalFindings = (legacy.sources || [])
    .map((s) => ({
      title: String(s?.title || 'Market source'),
      summary: String(s?.snippet || '').trim() || 'Relevant market context from this source.',
      sourceName: String(s?.title || getSourceName(String(s?.url || ''), 'Source')),
      sourceUrl: String(s?.url || ''),
    }))
    .filter((f) => Boolean(f.sourceUrl))
    .slice(0, 5);

  const usedExternalData = route !== 'internal' && externalFindings.length > 0;
  const usedInternalData = route !== 'external';

  return {
    route,
    usedInternalData,
    usedExternalData,
    internalSection:
      usedInternalData && internalFindings.length > 0
        ? {
            heading: 'What your data shows',
            findings: internalFindings,
          }
        : undefined,
    externalSection:
      usedExternalData && externalFindings.length > 0
        ? {
            heading: 'Market context',
            findings: externalFindings,
          }
        : undefined,
    conclusionSection: {
      heading: 'Corelytics conclusion',
      summary: String(legacy.howThisImpactsUs || legacy.shortAnswer || legacy.longAnswer || '').trim(),
    },
    followUps: [],
    debug: {
      classifierRoute: route,
    },
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AskCorelyticsRequest;
  const companyId = String(body?.companyId || '').trim();
  const question = String(body?.question || '').trim();
  const companyName = String(body?.companyName || '').trim();
  const addMarketContext = Boolean(body?.addMarketContext);
  const sessionId = body?.sessionId ? String(body.sessionId).slice(0, 120) : '';

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const route = classifyQuestion(question, addMarketContext);

  const legacyBody = {
    companyId,
    companyName,
    question,
    useExternalSources: route !== 'internal',
    mode: 'default',
    threadId: sessionId || undefined,
  };

  const forwardedRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(legacyBody),
  });

  const legacyResponse = await runAskCorelyticsLegacy(forwardedRequest);
  const payload = (await legacyResponse.json().catch(() => null)) as LegacyAskResponse | { error?: string } | null;

  if (!legacyResponse.ok) {
    return NextResponse.json(payload || { error: 'Failed to run Ask Corelytics' }, { status: legacyResponse.status });
  }

  const canonical = mapLegacyToCanonical({
    route,
    legacy: payload as LegacyAskResponse,
  });

  return NextResponse.json(canonical);
}
