import { NextRequest, NextResponse } from 'next/server';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { loadWorkingCsiProgramSettings } from '@/lib/infor-m3/csi-shipment-history';

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
    const sample = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('sample') || '').trim().toLowerCase()
    );
    const matchTerms = String(request.nextUrl.searchParams.get('match') || 'inv')
      .split(',')
      .map((term) => term.trim().replace(/[^a-z0-9]/gi, ''))
      .filter(Boolean);
    const matchPattern = new RegExp(matchTerms.length ? matchTerms.join('|') : 'inv', 'i');
    // IDO requests only exist in CSI; the M3 login is rejected with InvalidCredentials.
    const { credentials } = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI');
    if (!credentials) return NextResponse.json({ error: 'Infor CSI credentials are unavailable.' }, { status: 409 });

    const connection = await loadWorkingCsiProgramSettings(companyId);
    const servicePrefix = connection.servicePrefix || '/APR_PRD/CSI/IDORequestService';
    const endpointPath = ido
      ? sample
        ? `${servicePrefix}/ido/load/${encodeURIComponent(ido)}?properties=*&recordCap=1`
        : `${servicePrefix}/ido/info/${encodeURIComponent(ido)}`
      : `${servicePrefix}/ido/load/IDOs?properties=Name,Description&recordCap=1000`;
    const headers: Record<string, string> = {};
    if (connection.mongooseConfig) headers['X-Infor-MongooseConfig'] = connection.mongooseConfig;
    if (connection.site) headers['X-Infor-Site'] = connection.site;
    const result = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 30_000,
      headers,
      meta: { programId: ido || 'IDOs', sourcePath: 'site-admin-ido-discovery' },
    });
    const usedSettings = {
      copiedFromProgram: connection.programName,
      servicePrefix,
      mongooseConfig: connection.mongooseConfig || null,
      site: connection.site || null,
    };
    if (!result.ok) {
      return NextResponse.json({ error: `Infor returned HTTP ${result.status}`, details: result.body }, { status: 502 });
    }
    const inforMessage =
      result.body && typeof result.body === 'object'
        ? String((result.body as { Message?: unknown }).Message || '').trim() || null
        : null;
    if (ido) {
      const body = result.body as { Properties?: unknown };
      const sampleItems = sample ? asItems(result.body) : [];
      return NextResponse.json({
        ido,
        inforMessage,
        usedSettings,
        sample: sampleItems[0] ?? null,
        properties: sample
          ? Array.from(new Set(sampleItems.flatMap((item) => Object.keys(item)))).sort()
          : Array.isArray(body?.Properties)
            ? body.Properties
            : [],
        recordCount: sampleItems.length,
      });
    }
    const catalogItems = asItems(result.body);
    const idos = catalogItems
      .map((item) => ({
        name: String(item.Name || item.name || item.IDOName || item.idoName || item.CollectionName || '').trim(),
        description: String(item.Description || item.description || item.Caption || '').trim(),
      }))
      .filter((item) => matchPattern.test(`${item.name} ${item.description}`))
      .sort((left, right) => left.name.localeCompare(right.name));
    return NextResponse.json({
      idos,
      inforMessage,
      usedSettings,
      catalogItemCount: catalogItems.length,
      catalogSample: catalogItems.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IDO discovery failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
