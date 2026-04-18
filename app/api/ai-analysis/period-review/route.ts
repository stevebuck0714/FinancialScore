import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAiClient } from '@/lib/ai-gateway';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { createModelText } from '@/lib/openai-helpers';

type Source = { url: string; title?: string; publishedDate?: string | null };

type NegativeTrendAlert = {
  metric: string;
  signal: string;
  whyItMatters: string;
  evidence: string;
};

function monthKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parsePeriodLabel(periodLabel: string): { start: Date; end: Date; label: string } {
  const trimmed = periodLabel.trim();

  // Preferred format: YYYY-MM
  const m = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]); // 1-12
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59)); // last day of month
    return { start, end, label: trimmed };
  }

  // Try Date.parse fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0));
    const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 23, 59, 59));
    return { start, end, label: monthKeyFromDate(parsed) };
  }

  // If unknown, treat as "most recent month" label and let downstream use latest
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { start, end, label: trimmed || monthKeyFromDate(now) };
}

async function loadGoalJson(table: 'ExpenseGoal' | 'OperationalGoal', companyId: string): Promise<any> {
  try {
    // IMPORTANT: Identifiers (table names) cannot be parameterized safely with $queryRaw.
    // Use static queries for each supported table to avoid silent failures.
    const result =
      table === 'ExpenseGoal'
        ? await prisma.$queryRaw<Array<{ goals: any }>>`
            SELECT goals FROM "ExpenseGoal" WHERE "companyId" = ${companyId}
          `
        : await prisma.$queryRaw<Array<{ goals: any }>>`
            SELECT goals FROM "OperationalGoal" WHERE "companyId" = ${companyId}
          `;

    return result.length > 0 ? result[0].goals : {};
  } catch (e: any) {
    console.error('AI Analysis period-review: failed to load goals', {
      table,
      companyId,
      message: e?.message,
    });
    return {};
  }
}

type SerpApiOrganicResult = { title?: string; link?: string; date?: string };

async function serpApiSearch(query: string): Promise<SerpApiOrganicResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '6');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { method: 'GET' });

  if (!res.ok) return [];

  const data: any = await res.json().catch(() => ({}));
  const organic = Array.isArray(data?.organic_results) ? (data.organic_results as any[]) : [];
  return organic
    .filter((r) => r?.link)
    .slice(0, 6)
    .map((r) => ({ title: r.title, link: r.link, date: r.date }));
}

function safeJsonParse(rawContent: string): any {
  const raw = String(rawContent || '');
  if (!raw.trim()) {
    throw new Error('Failed to parse model JSON (empty response)');
  }

  // Strip BOM and common markdown fences
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  function extractFirstJsonValue(text: string): string | null {
    const startObj = text.indexOf('{');
    const startArr = text.indexOf('[');
    const start =
      startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
    if (start < 0) return null;
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) depth += 1;
      if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  try {
    return JSON.parse(s);
  } catch {
    const candidate = extractFirstJsonValue(s);
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through
      }
    }
    throw new Error('Failed to parse model JSON');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const periodLabel = String(body?.periodLabel || '').trim();

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!periodLabel) return NextResponse.json({ error: 'periodLabel is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AIAnalysis', companyId, 'PERIOD_REVIEW');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not set in environment' }, { status: 500 });
    }

    const period = parsePeriodLabel(periodLabel);

    // Company + industry benchmark context (as "peer proxy" for MVP)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, industrySector: true },
    });

    const benchmarks = company?.industrySector
      ? await prisma.industryBenchmark.findMany({
          where: { industryId: String(company.industrySector) },
          select: { metricName: true, fiveYearValue: true, industryName: true, assetSizeCategory: true },
        })
      : [];

    // Monthly COA (MonthlyFinancial) data for this month, prior month, and last 6 months
    const monthRecord = await prisma.monthlyFinancial.findFirst({
      where: { companyId, monthDate: { gte: period.start, lte: period.end } },
      orderBy: { monthDate: 'desc' },
    });

    const prevMonthStart = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() - 1, 1, 0, 0, 0));
    const prevMonthEnd = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), 0, 23, 59, 59));
    const prevMonthRecord = await prisma.monthlyFinancial.findFirst({
      where: { companyId, monthDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      orderBy: { monthDate: 'desc' },
    });

    const sixMonthsAgo = new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() - 5, 1, 0, 0, 0));
    const recentMonths = await prisma.monthlyFinancial.findMany({
      where: { companyId, monthDate: { gte: sixMonthsAgo, lte: period.end } },
      orderBy: { monthDate: 'asc' },
    });

    // Goals
    const expenseGoals = await loadGoalJson('ExpenseGoal', companyId);
    const operationalGoals = await loadGoalJson('OperationalGoal', companyId);

    // Daily operations snapshots (last 90 days)
    const now = new Date();
    const start90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [cashDaily, arDaily, apDaily, customersDaily] = await Promise.all([
      prisma.cashSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start90 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.aRAgingSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start90 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.aPAgingSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start90 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.customerSalesSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start90 } },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);

    // Negative trend detection (lightweight MVP heuristics)
    const alerts: NegativeTrendAlert[] = [];

    // Cash total trend
    if (cashDaily.length >= 2) {
      const byDate = new Map<number, number>();
      for (const r of cashDaily) {
        const day = new Date(r.snapshotDate);
        day.setUTCHours(0, 0, 0, 0);
        byDate.set(day.getTime(), (byDate.get(day.getTime()) || 0) + r.cashBalance);
      }
      const dates = Array.from(byDate.keys()).sort((a, b) => a - b);
      const latest = byDate.get(dates[dates.length - 1]) || 0;
      const prior = byDate.get(dates[Math.max(0, dates.length - 8)]) || byDate.get(dates[0]) || 0; // ~7 days ago
      const pct = prior !== 0 ? ((latest - prior) / prior) * 100 : 0;
      if (pct < -5) {
        alerts.push({
          metric: 'Cash (daily)',
          signal: `Total cash down ${Math.abs(pct).toFixed(1)}% vs ~7 days ago`,
          whyItMatters: 'Sustained cash declines can indicate margin compression, collections issues, or rising operating spend.',
          evidence: `Estimated total cash moved from ${prior.toFixed(0)} to ${latest.toFixed(0)} over ~7 days.`,
        });
      }
    }

    // AR aging deterioration
    if (arDaily.length >= 2) {
      const latest = arDaily[arDaily.length - 1];
      const prior = arDaily[Math.max(0, arDaily.length - 8)];
      const latestOver30 = latest.totalAR > 0 ? ((latest.days1to30 + latest.days31to60 + latest.days61to90 + latest.days90plus) / latest.totalAR) * 100 : 0;
      const priorOver30 = prior.totalAR > 0 ? ((prior.days1to30 + prior.days31to60 + prior.days61to90 + prior.days90plus) / prior.totalAR) * 100 : 0;
      const delta = latestOver30 - priorOver30;
      if (latestOver30 > 25 && delta > 3) {
        alerts.push({
          metric: 'AR aging (daily)',
          signal: `Over-30-days AR is ${latestOver30.toFixed(1)}% (+${delta.toFixed(1)}pp vs ~7 days ago)`,
          whyItMatters: 'Rising delinquency often precedes cash shortfalls and may require tighter collections or credit controls.',
          evidence: `AR over-30-days increased from ${priorOver30.toFixed(1)}% to ${latestOver30.toFixed(1)}%.`,
        });
      }
    }

    // AP aging deterioration
    if (apDaily.length >= 2) {
      const latest = apDaily[apDaily.length - 1];
      const prior = apDaily[Math.max(0, apDaily.length - 8)];
      const latestOver90 = latest.totalAP > 0 ? (latest.days90plus / latest.totalAP) * 100 : 0;
      const priorOver90 = prior.totalAP > 0 ? (prior.days90plus / prior.totalAP) * 100 : 0;
      const delta = latestOver90 - priorOver90;
      if (latestOver90 > 10 && delta > 2) {
        alerts.push({
          metric: 'AP aging (daily)',
          signal: `90+ days AP is ${latestOver90.toFixed(1)}% (+${delta.toFixed(1)}pp vs ~7 days ago)`,
          whyItMatters: 'Increasing aged payables can signal liquidity stress and vendor relationship risk.',
          evidence: `90+ days AP share increased from ${priorOver90.toFixed(1)}% to ${latestOver90.toFixed(1)}%.`,
        });
      }
    }

    // Customer concentration risk (latest snapshot date)
    if (customersDaily.length > 0) {
      const maxDate = Math.max(...customersDaily.map((r) => r.snapshotDate.getTime()));
      const latestRows = customersDaily.filter((r) => r.snapshotDate.getTime() === maxDate);
      const total = latestRows.reduce((s, r) => s + r.revenue, 0);
      const top = latestRows.sort((a, b) => b.revenue - a.revenue)[0];
      if (top && total > 0) {
        const share = (top.revenue / total) * 100;
        if (share > 25) {
          alerts.push({
            metric: 'Customer concentration (daily snapshot)',
            signal: `Top customer ≈ ${share.toFixed(1)}% of revenue on latest snapshot`,
            whyItMatters: 'High concentration increases volatility and creates downside risk if the customer churns or reduces spend.',
            evidence: `Top customer "${top.customerName}" revenue ${top.revenue.toFixed(0)} of total ${total.toFixed(0)}.`,
          });
        }
      }
    }

    // Monthly COA variance flags (MoM)
    if (monthRecord && prevMonthRecord) {
      const fieldsToTrack: Array<{ key: keyof typeof monthRecord; label: string }> = [
        { key: 'payroll', label: 'Payroll' },
        { key: 'rent', label: 'Rent' },
        { key: 'professionalFees', label: 'Professional fees' },
        { key: 'salesExpense', label: 'Sales expense' },
        { key: 'marketing', label: 'Marketing' },
        { key: 'insurance', label: 'Insurance' },
        { key: 'interestExpense', label: 'Interest expense' },
        { key: 'otherExpense', label: 'Other expense' },
        { key: 'cogsTotal', label: 'COGS total' },
        { key: 'expense', label: 'Total operating expense' },
      ];

      const deltas = fieldsToTrack
        .map((f) => {
          const cur = Number((monthRecord as any)[f.key] || 0);
          const prev = Number((prevMonthRecord as any)[f.key] || 0);
          return { ...f, cur, prev, delta: cur - prev, pct: prev !== 0 ? ((cur - prev) / prev) * 100 : 0 };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5);

      const biggest = deltas.find((d) => d.delta > 0 && (d.label.includes('expense') || d.label.includes('COGS') || true));
      if (biggest && biggest.delta > 0) {
        alerts.push({
          metric: `COA variance (monthly): ${biggest.label}`,
          signal: `Up ${biggest.delta.toFixed(0)} MoM (${biggest.pct.toFixed(1)}%)`,
          whyItMatters: 'Large expense/COGS increases can compress margins and indicate run-rate creep.',
          evidence: `Moved from ${biggest.prev.toFixed(0)} to ${biggest.cur.toFixed(0)} month-over-month.`,
        });
      }
    }

    // External peer/market context sources (optional, sourced)
    const marketQueryParts: string[] = [];
    if (benchmarks[0]?.industryName) marketQueryParts.push(String(benchmarks[0].industryName));
    marketQueryParts.push('industry trends');
    marketQueryParts.push(period.label);
    const marketQuery = marketQueryParts.join(' ');
    const external = await serpApiSearch(marketQuery);
    const externalSources: Source[] = external.map((r) => ({
      url: r.link as string,
      title: r.title || undefined,
      publishedDate: r.date || null,
    }));

    const notes: string[] = [];
    if (!monthRecord) notes.push('No MonthlyFinancial record found for the selected period; monthly COA analysis may be limited.');
    if (externalSources.length === 0) notes.push('No external market sources were retrieved (SERPAPI_API_KEY missing or no results).');
    if (alerts.length === 0) notes.push('No negative trend alerts met the default thresholds (or operational data missing).');

    // Ask model to draft full narrative report using internal + external inputs.
    // Routes through Vercel AI Gateway with per-request ZDR when AI_GATEWAY_API_KEY is set.
    const openai = getOpenAiClient();
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const system = [
      'You are an expert financial and operational analyst.',
      'Return VALID JSON only (no markdown).',
      'You must produce an objective period review with emphasis on negative operational trend changes.',
      'If you use external context, cite it by listing the sources in appendix.sources and keep peerAndMarketContext explicitly sourced.',
      'Do not invent numbers or sources. Use only provided internal summaries and provided external sources list.',
      'Focus strictly on financial and operational analysis.',
      'Do NOT reference internal Payments tab data or subscription/billing plan terms.',
    ].join('\n');

    const internalSummary = {
      period: { start: period.start.toISOString(), end: period.end.toISOString(), label: period.label },
      company: { id: companyId, name: company?.name || null, industrySector: company?.industrySector ?? null },
      monthly: {
        current: monthRecord
          ? {
              monthDate: monthRecord.monthDate,
              revenue: monthRecord.revenue,
              expense: monthRecord.expense,
              cogsTotal: monthRecord.cogsTotal,
              cash: monthRecord.cash,
              ar: monthRecord.ar,
              ap: monthRecord.ap,
            }
          : null,
        previous: prevMonthRecord
          ? {
              monthDate: prevMonthRecord.monthDate,
              revenue: prevMonthRecord.revenue,
              expense: prevMonthRecord.expense,
              cogsTotal: prevMonthRecord.cogsTotal,
              cash: prevMonthRecord.cash,
              ar: prevMonthRecord.ar,
              ap: prevMonthRecord.ap,
            }
          : null,
        recentMonthsCount: recentMonths.length,
      },
      goals: { expenseGoals, operationalGoals },
      benchmarks: benchmarks.slice(0, 40),
      operationalSnapshotsAvailable: {
        cashDaily: cashDaily.length,
        arDaily: arDaily.length,
        apDaily: apDaily.length,
        customersDaily: customersDaily.length,
      },
      negativeTrendAlerts: alerts,
    };

    const user = [
      'Create the period review JSON in exactly this shape:',
      JSON.stringify(
        {
          period: { start: 'ISO', end: 'ISO', label: 'YYYY-MM or label' },
          executiveSummary: 'string',
          performanceVsGoals: 'string',
          peerAndMarketContext: 'string (must be grounded in appendix.sources if you reference market/peer claims)',
          operationalTrends: {
            negativeTrendAlerts: [
              { metric: 'string', signal: 'string', whyItMatters: 'string', evidence: 'string' },
            ],
            narrative: 'string',
          },
          driversAndRisks: 'string',
          opportunities: 'string (include acquisitions + capital deployment examples)',
          appendix: { notes: ['string'], sources: [{ url: 'string', title: 'string?', publishedDate: 'string|null' }] },
        },
        null,
        2,
      ),
      '',
      'Internal data summary (use this for numbers/metrics, do NOT invent others):',
      JSON.stringify(internalSummary, null, 2),
      '',
      'External sources you MAY reference for market/peer context (do NOT add new URLs):',
      JSON.stringify(externalSources, null, 2),
      '',
      'Rules:',
      '- Keep operationalTrends.negativeTrendAlerts exactly as provided (you may reorder, but do not delete and do not invent new ones).',
      '- If there are 0 alerts, explain that and still provide a narrative focusing on monitoring and leading indicators.',
      '- Opportunities must include (a) acquisition archetypes and (b) at least one capital deployment scenario with example allocation.',
      '- Exclude internal Payments tab data or subscription/billing plan terms.',
    ].join('\n');

    const resp = await createModelText({
      openai,
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 1400,
    });

    const content = resp.text || '';
    const parsed = safeJsonParse(content);

    const returnedAlerts = Array.isArray(parsed?.operationalTrends?.negativeTrendAlerts)
      ? (parsed.operationalTrends.negativeTrendAlerts as NegativeTrendAlert[])
      : [];

    // Enforce alerts exactly provided (server-truth)
    const response = {
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        label: period.label,
      },
      executiveSummary: String(parsed?.executiveSummary || ''),
      performanceVsGoals: String(parsed?.performanceVsGoals || ''),
      peerAndMarketContext: String(parsed?.peerAndMarketContext || ''),
      operationalTrends: {
        negativeTrendAlerts: alerts.length > 0 ? alerts : returnedAlerts,
        narrative: String(parsed?.operationalTrends?.narrative || ''),
      },
      driversAndRisks: String(parsed?.driversAndRisks || ''),
      opportunities: String(parsed?.opportunities || ''),
      appendix: {
        notes: Array.isArray(parsed?.appendix?.notes) ? parsed.appendix.notes.map((n: any) => String(n)) : notes,
        sources: (Array.isArray(parsed?.appendix?.sources) ? parsed.appendix.sources : externalSources)
          .map((s: any) => ({
            url: String(s?.url || '').trim(),
            title: s?.title || undefined,
            publishedDate: s?.publishedDate ?? null,
          }))
          .filter((s: any) => !!s.url),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('AI Analysis period-review error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to run AI Analysis period review' },
      { status: 500 },
    );
  }
}

