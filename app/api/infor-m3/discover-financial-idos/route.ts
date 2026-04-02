import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

export const dynamic = 'force-dynamic';

type DiscoveryCandidate = {
  ido: string;
  role: 'glTransactions' | 'accountMaster' | 'periodBalances';
};

const DISCOVERY_CANDIDATES: DiscoveryCandidate[] = [
  { ido: 'SLGlTrans', role: 'glTransactions' },
  { ido: 'SLGLTRANS', role: 'glTransactions' },
  { ido: 'SLChartOfAccounts', role: 'accountMaster' },
  { ido: 'SLChartAccts', role: 'accountMaster' },
  { ido: 'SLGLAccounts', role: 'accountMaster' },
  { ido: 'SLAcct', role: 'accountMaster' },
  { ido: 'GLAcctPeriodBalances', role: 'periodBalances' },
];

function normalizeServicePrefix(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '/APR_PRD/CSI/IDORequestService';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, '');
}

function extractLoadCount(body: unknown): number {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 0;
  const payload = body as Record<string, unknown>;
  const directCandidates = ['results', 'records', 'items', 'Items', 'Item', 'IDOItems', 'Data', 'data'];
  for (const key of directCandidates) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).length;
  }
  const nested = ['response', 'Response', 'result', 'Result', 'data', 'Data'];
  for (const key of nested) {
    const child = payload[key];
    const nestedCount = extractLoadCount(child);
    if (nestedCount > 0) return nestedCount;
  }
  return 0;
}

function inferServicePrefixFromPrograms(programRows: unknown): string | null {
  if (!Array.isArray(programRows)) return null;
  for (const row of programRows) {
    const endpointPath = typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '';
    if (!endpointPath) continue;
    const marker = endpointPath.toLowerCase().indexOf('/ido/load/');
    if (marker === -1) continue;
    return endpointPath.slice(0, marker);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const site = String(body.site || '').trim();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (inforSystem !== 'INFOR_CSI') {
      return NextResponse.json(
        { ok: false, error: 'IDO financial discovery is currently enabled for INFOR_CSI companies only.' },
        { status: 409 }
      );
    }
    if (!site) {
      return NextResponse.json({ ok: false, error: 'site is required for CSI IDO discovery.' }, { status: 400 });
    }

    const { credentials, source } = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI');
    if (!credentials) {
      return NextResponse.json(
        { ok: false, error: 'Infor CSI credentials not configured for this company.' },
        { status: 404 }
      );
    }

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
      select: { connectionMetadata: true },
    });
    const existingMetadata =
      existingConnection?.connectionMetadata &&
      typeof existingConnection.connectionMetadata === 'object' &&
      !Array.isArray(existingConnection.connectionMetadata)
        ? (existingConnection.connectionMetadata as Record<string, unknown>)
        : {};
    const programsBySystem =
      existingMetadata.accountingProgramsBySystem &&
      typeof existingMetadata.accountingProgramsBySystem === 'object' &&
      !Array.isArray(existingMetadata.accountingProgramsBySystem)
        ? (existingMetadata.accountingProgramsBySystem as Record<string, unknown>)
        : {};
    const configuredPrograms = programsBySystem.INFOR_CSI || existingMetadata.accountingPrograms || [];
    const inferredPrefix = inferServicePrefixFromPrograms(configuredPrograms);
    const servicePrefix = normalizeServicePrefix(body.servicePrefix || inferredPrefix || '/APR_PRD/CSI/IDORequestService');
    const headers = { 'X-Infor-Site': site };

    const probes: Array<{
      ido: string;
      role: DiscoveryCandidate['role'];
      infoOk: boolean;
      infoStatus: number;
      loadOk: boolean;
      loadStatus: number;
      loadCount: number;
      infoPath: string;
      loadPath: string;
      error?: string;
    }> = [];

    for (const candidate of DISCOVERY_CANDIDATES) {
      const infoPath = `${servicePrefix}/ido/info/${candidate.ido}`;
      const loadPath = `${servicePrefix}/ido/load/${candidate.ido}?properties=*&recordCap=20`;
      try {
        const [infoResult, loadResult] = await Promise.all([
          callInforIonApi(credentials, infoPath, { timeoutMs: 15000, headers }),
          callInforIonApi(credentials, loadPath, { timeoutMs: 15000, headers }),
        ]);
        probes.push({
          ido: candidate.ido,
          role: candidate.role,
          infoOk: infoResult.ok,
          infoStatus: infoResult.status,
          loadOk: loadResult.ok,
          loadStatus: loadResult.status,
          loadCount: extractLoadCount(loadResult.body),
          infoPath,
          loadPath,
        });
      } catch (error) {
        probes.push({
          ido: candidate.ido,
          role: candidate.role,
          infoOk: false,
          infoStatus: 0,
          loadOk: false,
          loadStatus: 0,
          loadCount: 0,
          infoPath,
          loadPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const chooseBest = (role: DiscoveryCandidate['role']): string | null => {
      const matches = probes.filter((probe) => probe.role === role && probe.infoOk && probe.loadOk);
      if (matches.length === 0) return null;
      matches.sort((a, b) => b.loadCount - a.loadCount);
      return matches[0].ido;
    };

    const contract = {
      source: 'csi_ido_discovery',
      discoveredAt: new Date().toISOString(),
      site,
      servicePrefix,
      glTransactionIdo: chooseBest('glTransactions'),
      accountMasterIdo: chooseBest('accountMaster'),
      periodBalanceIdo: chooseBest('periodBalances'),
      probes,
    };

    await prisma.accountingConnection.upsert({
      where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
      update: {
        connectionMetadata: {
          ...existingMetadata,
          inforCsiFinancialIdoContract: contract,
        } as any,
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: 'ACTIVE',
        platformVersion: 'infor-m3-1.0',
        autoSync: true,
        syncFrequency: 'daily',
        connectionMetadata: {
          inforCsiFinancialIdoContract: contract,
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      source,
      contract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to discover CSI financial IDOs',
        details: message,
      },
      { status }
    );
  }
}
