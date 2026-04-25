import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type BankIdoRole =
  | 'bankAccount'
  | 'checkbook'
  | 'bankStatement'
  | 'bankStatementLine'
  | 'bankReconciliation'
  | 'bankReconciliationLine'
  | 'deposit'
  | 'cashReceipt'
  | 'apPayment'
  | 'arPayment'
  | 'glPeriodBalance'
  | 'glRunningBalance';

type BankIdoCandidate = {
  ido: string;
  role: BankIdoRole;
  notes?: string;
};

// Standard SyteLine / Infor CSI bank-related IDO names. Probed in order; we
// keep both the modern (`SLBankAccts`) and legacy short-form (`SLBnkAccts`)
// spellings because tenant-specific personalization can hide either.
const BANK_IDO_CANDIDATES: BankIdoCandidate[] = [
  { ido: 'SLBankHdrs', role: 'bankAccount', notes: 'Bank header (already used)' },
  { ido: 'SLBankAccts', role: 'bankAccount' },
  { ido: 'SLBnkAccts', role: 'bankAccount' },
  { ido: 'SLChkBks', role: 'checkbook' },
  { ido: 'SLCheckBooks', role: 'checkbook' },
  { ido: 'SLBnkSttmts', role: 'bankStatement' },
  { ido: 'SLBankStatements', role: 'bankStatement' },
  { ido: 'SLBnkSttmtTrxs', role: 'bankStatementLine' },
  { ido: 'SLBankStmtTrxs', role: 'bankStatementLine' },
  { ido: 'SLBankStatementTransactions', role: 'bankStatementLine' },
  { ido: 'SLBankRecs', role: 'bankReconciliation' },
  { ido: 'SLBankReconciliations', role: 'bankReconciliation' },
  { ido: 'SLBankRecDtls', role: 'bankReconciliationLine' },
  { ido: 'SLBankReconciliationDetails', role: 'bankReconciliationLine' },
  { ido: 'SLDeposits', role: 'deposit' },
  { ido: 'SLDepositSlips', role: 'deposit' },
  { ido: 'SLCashRcpts', role: 'cashReceipt' },
  { ido: 'SLCashReceipts', role: 'cashReceipt' },
  { ido: 'SLApPmts', role: 'apPayment' },
  { ido: 'SLApPmtSnt', role: 'apPayment' },
  { ido: 'SLArPmts', role: 'arPayment' },
  { ido: 'SLPmtsApRcvd', role: 'arPayment' },
  { ido: 'GLAcctPeriodBalances', role: 'glPeriodBalance' },
  { ido: 'SLGlBalances', role: 'glRunningBalance' },
];

function normalizeServicePrefix(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '/APR_PRD/CSI/IDORequestService';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, '');
}

function inferServicePrefixFromPrograms(programRows: unknown): string | null {
  if (!Array.isArray(programRows)) return null;
  for (const row of programRows) {
    const endpointPath = typeof (row as Record<string, unknown>)?.endpointPath === 'string'
      ? ((row as Record<string, unknown>).endpointPath as string).trim()
      : '';
    if (!endpointPath) continue;
    const marker = endpointPath.toLowerCase().indexOf('/ido/load/');
    if (marker === -1) continue;
    return endpointPath.slice(0, marker);
  }
  return null;
}

function pickFirstRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const candidateKeys = ['Items', 'items', 'IDOItems', 'records', 'results', 'Item', 'Records', 'Data', 'data'];
  const obj = body as Record<string, unknown>;
  for (const key of candidateKeys) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
      return arr[0] as Record<string, unknown>;
    }
  }
  for (const key of ['response', 'Response', 'result', 'Result', 'data', 'Data']) {
    const child = obj[key];
    const nested = pickFirstRecord(child);
    if (nested) return nested;
  }
  return null;
}

function extractLoadCount(body: unknown): number {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 0;
  const payload = body as Record<string, unknown>;
  const directCandidates = ['results', 'records', 'items', 'Items', 'Item', 'IDOItems', 'Data', 'data'];
  for (const key of directCandidates) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).length;
  }
  for (const key of ['response', 'Response', 'result', 'Result', 'data', 'Data']) {
    const child = payload[key];
    const nestedCount = extractLoadCount(child);
    if (nestedCount > 0) return nestedCount;
  }
  return 0;
}

function extractSampleColumns(body: unknown): string[] {
  const sample = pickFirstRecord(body);
  if (!sample) return [];
  return Object.keys(sample).slice(0, 60);
}

type ProbeResult = {
  ido: string;
  role: BankIdoRole;
  notes?: string;
  infoOk: boolean;
  infoStatus: number;
  loadOk: boolean;
  loadStatus: number;
  loadCount: number;
  sampleColumns: string[];
  infoPath: string;
  loadPath: string;
  error?: string;
};

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
        { ok: false, error: 'Bank IDO discovery is currently enabled for INFOR_CSI companies only.' },
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
    const servicePrefix = normalizeServicePrefix(body.servicePrefix || inferredPrefix);
    const recordCap = Math.max(1, Math.min(50, Number(body.recordCap) || 5));
    const headers = { 'X-Infor-Site': site };

    const probes: ProbeResult[] = [];
    // Sequential to avoid token-flood / rate-limit on Atlantic's tenant.
    for (const candidate of BANK_IDO_CANDIDATES) {
      const infoPath = `${servicePrefix}/ido/info/${candidate.ido}`;
      const loadPath = `${servicePrefix}/ido/load/${candidate.ido}?properties=*&recordCap=${recordCap}`;
      try {
        const [infoResult, loadResult] = await Promise.all([
          callInforIonApi(credentials, infoPath, { timeoutMs: 15000, headers }),
          callInforIonApi(credentials, loadPath, { timeoutMs: 15000, headers }),
        ]);
        probes.push({
          ido: candidate.ido,
          role: candidate.role,
          notes: candidate.notes,
          infoOk: infoResult.ok,
          infoStatus: infoResult.status,
          loadOk: loadResult.ok,
          loadStatus: loadResult.status,
          loadCount: extractLoadCount(loadResult.body),
          sampleColumns: loadResult.ok ? extractSampleColumns(loadResult.body) : [],
          infoPath,
          loadPath,
        });
      } catch (error) {
        probes.push({
          ido: candidate.ido,
          role: candidate.role,
          notes: candidate.notes,
          infoOk: false,
          infoStatus: 0,
          loadOk: false,
          loadStatus: 0,
          loadCount: 0,
          sampleColumns: [],
          infoPath,
          loadPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      total: probes.length,
      infoOk: probes.filter((p) => p.infoOk).length,
      loadOk: probes.filter((p) => p.loadOk).length,
      withRows: probes.filter((p) => p.loadCount > 0).length,
    };

    const available = probes
      .filter((p) => p.infoOk || p.loadOk)
      .map((p) => ({
        ido: p.ido,
        role: p.role,
        loadCount: p.loadCount,
        sampleColumns: p.sampleColumns,
      }));

    const contract = {
      source: 'csi_bank_ido_discovery',
      discoveredAt: new Date().toISOString(),
      site,
      servicePrefix,
      recordCap,
      summary,
      available,
      probes,
    };

    if (body.persist !== false) {
      await prisma.accountingConnection.upsert({
        where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
        update: {
          connectionMetadata: {
            ...existingMetadata,
            inforCsiBankIdoContract: contract,
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
            inforCsiBankIdoContract: contract,
          } as any,
        },
      });
    }

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
        error: 'Failed to discover CSI bank IDOs',
        details: message,
      },
      { status }
    );
  }
}
