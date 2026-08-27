import { NextRequest, NextResponse } from 'next/server';
import { getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

type InsightsPayload = {
  companyId?: string;
  companyName?: string | null;
  current?: Record<string, unknown>;
  history?: Array<Record<string, unknown>>;
  recentMonths?: Array<Record<string, unknown>>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || trimmed).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(jsonText);
  return asRecord(parsed);
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = (await request.json()) as InsightsPayload;
    const companyId = String(body?.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'AI_FINANCIAL_SCORE_INSIGHTS');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const history = Array.isArray(body.history) ? body.history.slice(-24) : [];
    const recentMonths = Array.isArray(body.recentMonths) ? body.recentMonths.slice(-12) : [];
    if (history.length < 2 && recentMonths.length < 6) {
      return NextResponse.json(
        { error: 'Not enough financial history to generate Corelytics Score insights.' },
        { status: 400 },
      );
    }

    const model =
      process.env.OPENAI_MODEL_ASK ||
      process.env.OPENAI_MODEL ||
      'gpt-4o';
    const openai = getOpenAiClient();
    const result = await createModelText({
      openai,
      model,
      temperature: 0.2,
      maxTokens: 1800,
      messages: [
        {
          role: 'system',
          content: [
            'You are a Corelytics financial advisor writing Insights for one company.',
            'Use only the supplied Corelytics Score history and underlying monthly data.',
            'Do not invent peer benchmarks, industry rankings, or facts not in the data.',
            'The score is 0-100 and is the average of Profitability Score and Asset Development Score.',
            'Profitability is driven by 24-month revenue growth, a 6-month growth adjustment, and an expense vs revenue growth adjustment.',
            'Asset Development is driven by the current asset-to-liability ratio (ALR) and ALR growth.',
            'Interpret bands: 70-100 strong / M&A and expansion ready; 50-70 good fundamentals, cut costs as volume grows; 30-50 cost-structure problems, do not grow yet; 0-30 serious problems, restructuring may be needed.',
            'If profitability and asset development diverge, say so plainly and do not average them into a bland conclusion.',
            'Return VALID JSON only with keys: situation, trend, driverInCharge, doNow, dont, scoreSensitivity, evidence.',
            'situation, trend, and driverInCharge are short strings.',
            'doNow, dont, scoreSensitivity, and evidence are arrays of short strings.',
            'Ground every recommendation in a number from the payload.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            companyName: body.companyName || null,
            current: asRecord(body.current),
            history,
            recentMonths,
          }),
        },
      ],
    });

    const parsed = parseJsonObject(result.text);
    return NextResponse.json({
      insights: {
        situation: String(parsed.situation || '').trim(),
        trend: String(parsed.trend || '').trim(),
        driverInCharge: String(parsed.driverInCharge || '').trim(),
        doNow: stringList(parsed.doNow, 5),
        dont: stringList(parsed.dont, 4),
        scoreSensitivity: stringList(parsed.scoreSensitivity, 4),
        evidence: stringList(parsed.evidence, 6),
      },
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to generate insights');
    const status = Number(error?.status) === 401 ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
