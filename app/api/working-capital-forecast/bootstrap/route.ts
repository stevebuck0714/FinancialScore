import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type BasisMode = 'cash' | 'accrual';
type Frequency = 'daily' | 'weekly' | 'monthly';

function asBasisMode(value: unknown): BasisMode {
  return value === 'accrual' ? 'accrual' : 'cash';
}

function buildOperationalUrl(origin: string, companyId: string, type: string, frequency: Frequency, limit: number) {
  const params = new URLSearchParams({
    companyId,
    type,
    frequency,
    limit: String(limit),
  });
  return `${origin}/api/operational-data?${params.toString()}`;
}

async function safeFetchJson(
  url: string,
  forwardHeaders: HeadersInit,
): Promise<{ ok: boolean; status: number; data: any | null }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: forwardHeaders,
      cache: 'no-store',
    });
    const data = response.ok ? await response.json().catch(() => null) : null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function pickFirstWithRecords(
  order: Frequency[],
  results: Array<{ frequency: Frequency; data: any | null }>
): { frequency: Frequency; data: any } | null {
  for (const frequency of order) {
    const match = results.find((row) => row.frequency === frequency)?.data;
    if (Array.isArray(match?.records) && match.records.length > 0) {
      return { frequency, data: match };
    }
  }
  return null;
}

function pickHistoryPair(
  order: Frequency[],
  inventoryResults: Array<{ frequency: Frequency; data: any | null }>,
  productResults: Array<{ frequency: Frequency; data: any | null }>,
): { inventory: { frequency: Frequency; data: any } | null; products: { frequency: Frequency; data: any } | null } {
  for (const frequency of order) {
    const inv = inventoryResults.find((row) => row.frequency === frequency)?.data;
    const prod = productResults.find((row) => row.frequency === frequency)?.data;
    if (Array.isArray(inv?.records) && inv.records.length > 0 && Array.isArray(prod?.records) && prod.records.length > 0) {
      return { inventory: { frequency, data: inv }, products: { frequency, data: prod } };
    }
  }

  const invFallback = inventoryResults.find((row) => Array.isArray(row.data?.records) && row.data.records.length > 0) || null;
  const prodFallback = productResults.find((row) => Array.isArray(row.data?.records) && row.data.records.length > 0) || null;
  return {
    inventory: invFallback ? { frequency: invFallback.frequency, data: invFallback.data } : null,
    products: prodFallback ? { frequency: prodFallback.frequency, data: prodFallback.data } : null,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = String(searchParams.get('companyId') || '').trim();
  const basisMode = asBasisMode(searchParams.get('basisMode'));
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const origin = request.nextUrl.origin;

  const forwardHeaders: Record<string, string> = {
    accept: 'application/json',
  };
  const cookie = request.headers.get('cookie');
  if (cookie) forwardHeaders.cookie = cookie;
  const authorization = request.headers.get('authorization');
  if (authorization) forwardHeaders.authorization = authorization;

  const [savedSettings, financialForecastInputs, loans, dailyFinancials] = await Promise.all([
    safeFetchJson(
      `${origin}/api/working-capital-forecast/settings?companyId=${encodeURIComponent(companyId)}&basisMode=${basisMode}`,
      forwardHeaders
    ),
    safeFetchJson(
      `${origin}/api/financial-forecast/inputs?companyId=${encodeURIComponent(companyId)}&basisMode=${basisMode}`,
      forwardHeaders
    ),
    safeFetchJson(
      `${origin}/api/loans?companyId=${encodeURIComponent(companyId)}`,
      forwardHeaders
    ),
    safeFetchJson(buildOperationalUrl(origin, companyId, 'daily-financials', 'daily', 140), forwardHeaders),
  ]);

  const latestOrder: Frequency[] = ['daily', 'weekly', 'monthly'];
  const historyOrder: Frequency[] = ['monthly', 'weekly', 'daily'];
  const marginOrder: Frequency[] = ['weekly', 'monthly', 'daily'];

  const latestLimit = 14;
  const historyLimit = 180;

  const [
    cashByFreq,
    arByFreq,
    apByFreq,
    inventoryByFreq,
    productsByFreq,
    productMarginByFreq,
  ] = await Promise.all([
    Promise.all(
      latestOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'cash', frequency, latestLimit), forwardHeaders)).data,
      }))
    ),
    Promise.all(
      latestOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'ar-aging', frequency, latestLimit), forwardHeaders)).data,
      }))
    ),
    Promise.all(
      latestOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'ap-aging', frequency, latestLimit), forwardHeaders)).data,
      }))
    ),
    Promise.all(
      historyOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'inventory', frequency, historyLimit), forwardHeaders)).data,
      }))
    ),
    Promise.all(
      historyOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'products', frequency, historyLimit), forwardHeaders)).data,
      }))
    ),
    Promise.all(
      marginOrder.map(async (frequency) => ({
        frequency,
        data: (await safeFetchJson(buildOperationalUrl(origin, companyId, 'products', frequency, historyLimit), forwardHeaders)).data,
      }))
    ),
  ]);

  const cashResult = pickFirstWithRecords(latestOrder, cashByFreq);
  const arAgingResult = pickFirstWithRecords(latestOrder, arByFreq);
  const apAgingResult = pickFirstWithRecords(latestOrder, apByFreq);
  const historyPair = pickHistoryPair(historyOrder, inventoryByFreq, productsByFreq);
  const productMarginHistory = pickFirstWithRecords(marginOrder, productMarginByFreq);

  return NextResponse.json({
    ok: true,
    companyId,
    basisMode,
    savedSettings: savedSettings.data,
    financialForecastInputs: financialForecastInputs.data,
    loans: loans.data,
    operational: {
      dailyFinancials: dailyFinancials.data,
      cashResult,
      arAgingResult,
      apAgingResult,
      inventoryHistory: historyPair.inventory,
      productHistory: historyPair.products,
      productMarginHistory,
    },
  });
}

