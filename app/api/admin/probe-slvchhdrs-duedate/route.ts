import { NextRequest, NextResponse } from 'next/server';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/probe-slvchhdrs-duedate?companyId=...
 *
 * Read-only probe. Makes ONE outbound Infor SLVchHdrs IDO call requesting
 * candidate due-date properties (DueDate, PayDate, DiscDate, NetDueDate)
 * alongside the standard fields. Reports which keys came back and how many
 * were populated.
 *
 * Auth: header `x-cron-secret: $CRON_SECRET` (or ?secret=...).
 *
 * Use when running locally is impossible because the company lives in a
 * production database that the local-dev security guard refuses to open.
 */

function checkSecret(request: NextRequest, querySecret?: string | null): boolean {
  const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  const provided = (querySecret && String(querySecret).trim()) || headerSecret;
  return Boolean(provided && provided === expectedSecret);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const stage = { current: 'init' };
  try {
    return await runProbe(request, stage);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        stage: stage.current,
        error: 'route_threw',
        message: err?.message || String(err),
        stack: err?.stack ? String(err.stack).split('\n').slice(0, 8) : undefined,
      },
      { status: 500 }
    );
  }
}

async function runProbe(request: NextRequest, stage: { current: string }): Promise<NextResponse> {
  stage.current = 'parse_query';
  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || '').trim();
  const secret = url.searchParams.get('secret');
  const lookbackDays = Math.max(1, Math.min(365, Number(url.searchParams.get('lookbackDays') || '60')));
  const candidatesParam = url.searchParams.get('candidates');
  const candidatesList =
    candidatesParam === null
      ? ['DueDate', 'PayDate', 'DiscDate', 'NetDueDate']
      : candidatesParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  stage.current = 'check_secret';
  if (!checkSecret(request, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'companyId required' }, { status: 400 });
  }

  stage.current = 'load_credentials';
  const credentials = await getInforM3CredentialsForCompany(companyId);
  if (!credentials) {
    return NextResponse.json({ ok: false, error: 'no Infor credentials for company' }, { status: 404 });
  }

  stage.current = 'build_request';
  const headers: Record<string, string> = {
    'X-Infor-MongooseConfig': String(url.searchParams.get('mongooseConfig') || 'TMSManager'),
  };
  const siteOverride = String(url.searchParams.get('site') || '').trim();
  if (siteOverride) headers['X-Infor-Site'] = siteOverride;

  const basePath = String(url.searchParams.get('basePath') || '/APR_PRD/CSI/IDORequestService/ido/load/SLVchHdrs');

  const today = new Date();
  const start = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const fmtCsi = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

  // Match the canonical SLVchHdrs request shape we know returns records
  // (taken from a real successful Atlantic sync URL): full SAFE_PROPERTIES
  // + double-paren filter + loadtype=FIRST.
  const safeProps = [
    'VendNum',
    'VadName',
    'Voucher',
    'VouchSeq',
    'InvNum',
    'InvDate',
    'DistDate',
    'RecordDate',
    'Type',
    'InvAmt',
    'DiscPct',
    'TermsCode',
    'ExchRate',
    'PreRegister',
    'InWorkflow',
    'PostFromPo',
    'ApAcct',
  ];
  const candidateProps = [...safeProps, ...candidatesList];

  const properties = candidateProps.join(',');
  const filter = `((RecordDate >= '${fmtCsi(start)}') and (RecordDate <= '${fmtCsi(today)}'))`;
  const orderby = 'RecordDate desc, Voucher desc';
  const endpointPath =
    `${basePath}?filter=${encodeURIComponent(filter)}` +
    `&recordCap=5` +
    `&orderby=${encodeURIComponent(orderby)}` +
    `&properties=${encodeURIComponent(properties)}` +
    `&loadtype=FIRST`;

  stage.current = 'call_infor_ion_api';
  const probedAt = new Date().toISOString();
  let result;
  try {
    result = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 30000,
      headers,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        probedAt,
        endpointPath,
        error: 'request_threw',
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      probedAt,
      httpStatus: result.status,
      url: result.url,
      endpointPath,
      requestedProperties: candidateProps,
      errorBody: result.body,
      hint: 'If the message names a missing property, that field is NOT supported by SLVchHdrs.',
    });
  }

  const body = result.body as Record<string, unknown>;
  const items = ((body?.Items || (body as any)?.items || (body as any)?.records) as unknown[]) || [];

  const allKeys = new Set<string>();
  for (const it of items) {
    if (it && typeof it === 'object') {
      for (const k of Object.keys(it as Record<string, unknown>)) allKeys.add(k);
    }
  }

  const fieldSummary: Array<{ key: string; present: boolean; populated: number; total: number }> = [];
  for (const key of candidatesList) {
    const present = allKeys.has(key);
    let populated = 0;
    let total = 0;
    if (present) {
      for (const it of items) {
        if (it && typeof it === 'object') {
          total += 1;
          const v = (it as Record<string, unknown>)[key];
          if (v != null && String(v).trim() !== '') populated += 1;
        }
      }
    }
    fieldSummary.push({ key, present, populated, total });
  }

  // When 0 items, surface the raw body keys + a small slice so we can tell
  // the difference between "Infor returned an empty Items array" vs
  // "Infor returned an unexpected envelope shape".
  const rawBodyKeys = body && typeof body === 'object' ? Object.keys(body).sort() : [];
  const rawBodyPreview = items.length === 0 ? JSON.stringify(body).slice(0, 2000) : undefined;

  return NextResponse.json({
    ok: true,
    probedAt,
    httpStatus: result.status,
    url: result.url,
    endpointPath,
    candidatesProbed: candidatesList,
    requestedProperties: candidateProps,
    returnedItemCount: items.length,
    keysPresent: Array.from(allKeys).sort(),
    candidateFieldSummary: fieldSummary,
    sampleItems: items.slice(0, 3),
    rawBodyKeys,
    rawBodyPreview,
  });
}
