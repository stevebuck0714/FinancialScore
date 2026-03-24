import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { seedQuickBooksDesktopAccountMappings } from '@/lib/quickbooks-desktop/account-mapping-seed';
import { seedInforAccountMappings } from '@/lib/infor-m3/account-mapping-seed';

type ConnectorConfig = {
  enabled: boolean;
  platform: 'QUICKBOOKS' | 'INFOR_M3' | 'SAGE_INTACCT' | 'DYNAMICS365' | 'ACUMATICA';
  source: string;
  payloadMetadataKey: string;
  lastPushAtMetadataKey: string;
  lastPushFrequencyMetadataKey: string;
  seedLastRunAtMetadataKey?: string;
  seedSummaryMetadataKey?: string;
  seedSnapshotMetadataKey?: string;
  seedActiveIdsMetadataKey?: string;
};

const ERP_COA_CONNECTORS: Record<string, ConnectorConfig> = {
  QUICKBOOKS_DESKTOP: {
    enabled: true,
    platform: 'QUICKBOOKS',
    source: 'quickbooks-desktop',
    payloadMetadataKey: 'quickbooksDesktopFinancialPayload',
    lastPushAtMetadataKey: 'quickbooksDesktopFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'quickbooksDesktopFinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'quickbooksDesktopAccountSeedLastRunAt',
    seedSummaryMetadataKey: 'quickbooksDesktopAccountSeedSummary',
    seedSnapshotMetadataKey: 'quickbooksDesktopAccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'quickbooksDesktopActiveAccountIds',
  },
  INFOR_M3: {
    enabled: true,
    platform: 'INFOR_M3',
    source: 'infor-m3',
    payloadMetadataKey: 'inforM3FinancialPayload',
    lastPushAtMetadataKey: 'inforM3FinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'inforM3FinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'inforM3AccountSeedLastRunAt',
    seedSummaryMetadataKey: 'inforM3AccountSeedSummary',
    seedSnapshotMetadataKey: 'inforM3AccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'inforM3ActiveAccountIds',
  },
  INFOR_CSI: {
    enabled: true,
    platform: 'INFOR_M3',
    source: 'infor-csi',
    payloadMetadataKey: 'inforCsiFinancialPayload',
    lastPushAtMetadataKey: 'inforCsiFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'inforCsiFinancialLastPushFrequency',
    seedLastRunAtMetadataKey: 'inforCsiAccountSeedLastRunAt',
    seedSummaryMetadataKey: 'inforCsiAccountSeedSummary',
    seedSnapshotMetadataKey: 'inforCsiAccountSeedSnapshot',
    seedActiveIdsMetadataKey: 'inforCsiActiveAccountIds',
  },
  ACUMATICA: {
    enabled: false,
    platform: 'ACUMATICA',
    source: 'acumatica',
    payloadMetadataKey: 'acumaticaFinancialPayload',
    lastPushAtMetadataKey: 'acumaticaFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'acumaticaFinancialLastPushFrequency',
  },
  DYNAMICS: {
    enabled: false,
    platform: 'DYNAMICS365',
    source: 'dynamics-365',
    payloadMetadataKey: 'dynamicsFinancialPayload',
    lastPushAtMetadataKey: 'dynamicsFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'dynamicsFinancialLastPushFrequency',
  },
  DYNAMICS365: {
    enabled: false,
    platform: 'DYNAMICS365',
    source: 'dynamics-365',
    payloadMetadataKey: 'dynamicsFinancialPayload',
    lastPushAtMetadataKey: 'dynamicsFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'dynamicsFinancialLastPushFrequency',
  },
  SAGE: {
    enabled: false,
    platform: 'SAGE_INTACCT',
    source: 'sage-intacct',
    payloadMetadataKey: 'sageIntacctFinancialPayload',
    lastPushAtMetadataKey: 'sageIntacctFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'sageIntacctFinancialLastPushFrequency',
  },
  SAGE_INTACCT: {
    enabled: false,
    platform: 'SAGE_INTACCT',
    source: 'sage-intacct',
    payloadMetadataKey: 'sageIntacctFinancialPayload',
    lastPushAtMetadataKey: 'sageIntacctFinancialLastPushAt',
    lastPushFrequencyMetadataKey: 'sageIntacctFinancialLastPushFrequency',
  },
};

function normalizeThroughMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) {
    return raw.payload as Record<string, unknown>;
  }
  return raw;
}

function hasMonthlyDataRows(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const rows = payload.monthlyData;
  return Array.isArray(rows) && rows.length > 0;
}

async function recoverPayloadFromLatestOperationalGlSync(companyId: string): Promise<Record<string, unknown> | null> {
  const logs = await prisma.apiSyncLog.findMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
      syncType: 'operational_other_CSI_LOAD',
      status: 'success',
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { errorDetails: true, createdAt: true },
  });

  const glResponses: unknown[] = [];
  for (const log of logs) {
    const details =
      log.errorDetails && typeof log.errorDetails === 'object' && !Array.isArray(log.errorDetails)
        ? (log.errorDetails as Record<string, unknown>)
        : null;
    if (!details) continue;
    const moduleName = String(details.module || '').trim().toUpperCase();
    const program = String(details.miProgram || '').trim().toUpperCase();
    if (moduleName !== 'GL' || !['SLCHARTS', 'SLLEDGERS'].includes(program)) continue;
    if (details.response) glResponses.push(details.response);
  }

  if (glResponses.length === 0) return null;
  return {
    source: 'operational_gl_sync_fallback',
    recoveredAt: new Date().toISOString(),
    glResponses,
  };
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const throughMonth = normalizeThroughMonth(body.throughMonth);
    const payloadFromRequest = normalizePayload(body.payload);

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    if (!throughMonth) {
      return NextResponse.json({ ok: false, error: 'throughMonth (YYYY-MM) is required' }, { status: 400 });
    }

    try {
      await requireCompanyAccess(companyId);
    } catch {
      return NextResponse.json({ ok: false, error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }

    const accountingSystem = String(company.accountingSystem || '').toUpperCase();
    const connector = ERP_COA_CONNECTORS[accountingSystem];
    if (!connector) {
      return NextResponse.json(
        { ok: false, error: `ERP COA load is not available for accounting system ${accountingSystem || 'UNKNOWN'}.` },
        { status: 409 }
      );
    }
    if (!connector.enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: `${accountingSystem} ERP COA load wiring is reserved for a future release.`,
          supportedToday: ['QUICKBOOKS_DESKTOP', 'INFOR_M3', 'INFOR_CSI'],
        },
        { status: 501 }
      );
    }

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: connector.platform,
        },
      },
      select: {
        status: true,
        platformVersion: true,
        connectionMetadata: true,
      },
    });

    const existingMetadata =
      existingConnection?.connectionMetadata &&
      typeof existingConnection.connectionMetadata === 'object' &&
      !Array.isArray(existingConnection.connectionMetadata)
        ? (existingConnection.connectionMetadata as Record<string, unknown>)
        : {};

    const payloadFromMetadata = normalizePayload(existingMetadata[connector.payloadMetadataKey]);
    const payloadFromOperationalGlSync =
      (accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI')
        ? await recoverPayloadFromLatestOperationalGlSync(companyId)
        : null;
    const payload = payloadFromRequest || payloadFromMetadata || payloadFromOperationalGlSync;
    if (!payload) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No COA payload found. Upload COA JSON now or ensure an integration payload was previously saved for this company.',
        },
        { status: 400 }
      );
    }

    let seedSummary:
      | {
          extracted: number;
          created: number;
          updated: number;
          unchanged: number;
          inactive: number;
          newAccounts: string[];
          changedAccounts: string[];
          inactiveAccounts: string[];
          activeAccountIds: string[];
          accountSnapshot: Array<{
            accountId: string;
            accountName: string;
            accountCode: string | null;
            classification: string | null;
          }>;
        }
      | null = null;

    if (accountingSystem === 'QUICKBOOKS_DESKTOP') {
      seedSummary = await seedQuickBooksDesktopAccountMappings(companyId, payload);
    } else if (accountingSystem === 'INFOR_M3' || accountingSystem === 'INFOR_CSI') {
      seedSummary = await seedInforAccountMappings(companyId, payload);
    }

    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      [connector.payloadMetadataKey]: payload,
      [connector.lastPushAtMetadataKey]: new Date().toISOString(),
      [connector.lastPushFrequencyMetadataKey]: 'monthly',
    };
    if (seedSummary) {
      if (connector.seedLastRunAtMetadataKey) nextMetadata[connector.seedLastRunAtMetadataKey] = new Date().toISOString();
      if (connector.seedSummaryMetadataKey) {
        nextMetadata[connector.seedSummaryMetadataKey] = {
          extracted: seedSummary.extracted,
          created: seedSummary.created,
          updated: seedSummary.updated,
          unchanged: seedSummary.unchanged,
          inactive: seedSummary.inactive,
        };
      }
      if (connector.seedSnapshotMetadataKey) nextMetadata[connector.seedSnapshotMetadataKey] = seedSummary.accountSnapshot;
      if (connector.seedActiveIdsMetadataKey) nextMetadata[connector.seedActiveIdsMetadataKey] = seedSummary.activeAccountIds;
    }

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: connector.platform,
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || `${connector.source}-1.0`,
        connectionMetadata: nextMetadata as any,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: connector.platform,
        status: 'ACTIVE',
        platformVersion: `${connector.source}-1.0`,
        autoSync: true,
        syncFrequency: 'monthly',
        connectionMetadata: nextMetadata as any,
      },
    });

    const canIngestFinancials = hasMonthlyDataRows(payload);
    const ingestResult = canIngestFinancials
      ? await ingestFinancialPayload({
          companyId,
          platform: connector.platform,
          source: connector.source,
          payload,
          syncType: 'coa_load',
          targetMonth: throughMonth,
          mode: 'through',
          maxMonths: 36,
        })
      : {
          ok: true as const,
          status: 200,
          recordsImported: 0,
          monthsTouched: [] as string[],
          latestMonthWarnings: [] as unknown[],
          ingestionSkipped: true,
          ingestionSkipReason:
            'COA payload loaded for mapping seed, but monthlyData rows were not present for financial snapshot ingestion.',
        };

    return NextResponse.json(
      {
        ok: ingestResult.ok,
        companyId,
        companyName: company.name,
        accountingSystem,
        throughMonth,
        mode: 'through',
        maxMonths: 36,
        accountMappingSeed: seedSummary,
        ...ingestResult,
      },
      { status: ingestResult.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: 'Failed to load ERP COA data', details: message }, { status: 500 });
  }
}
