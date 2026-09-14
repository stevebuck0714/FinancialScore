import { NextRequest, NextResponse } from 'next/server';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asItems(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const items = (body as { Items?: unknown }).Items;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const ido = String(request.nextUrl.searchParams.get('ido') || '').trim();
    const { credentials } = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI');
    if (!credentials) return NextResponse.json({ error: 'Infor CSI credentials are unavailable.' }, { status: 409 });

    const endpointPath = ido
      ? `/APR_PRD/CSI/IDORequestService/ido/info/${encodeURIComponent(ido)}`
      : '/APR_PRD/CSI/IDORequestService/ido/load/IDOs?properties=Name,Description&recordCap=1000';
    const result = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 30_000,
      meta: { programId: ido || 'IDOs', sourcePath: 'site-admin-ido-discovery' },
    });
    if (!result.ok) {
      return NextResponse.json({ error: `Infor returned HTTP ${result.status}`, details: result.body }, { status: 502 });
    }
    if (ido) {
      const body = result.body as { Properties?: unknown };
      return NextResponse.json({
        ido,
        properties: Array.isArray(body?.Properties) ? body.Properties : [],
      });
    }
    const idos = asItems(result.body)
      .map((item) => ({
        name: String(item.Name || item.name || '').trim(),
        description: String(item.Description || item.description || '').trim(),
      }))
      .filter((item) => /inv|invoice/i.test(`${item.name} ${item.description}`))
      .sort((left, right) => left.name.localeCompare(right.name));
    return NextResponse.json({ idos });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IDO discovery failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
