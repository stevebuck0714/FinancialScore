import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import { seedInforAccountMappings } from '@/lib/infor-m3/account-mapping-seed';

export const dynamic = 'force-dynamic';

type ProgramRow = {
  module: string;
  miProgram: string;
  endpointPath?: string;
  mongooseConfig?: string;
  enabled?: boolean;
};

function parsePrograms(value: unknown): ProgramRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      module: typeof row?.module === 'string' ? row.module.trim() : '',
      miProgram: typeof row?.miProgram === 'string' ? row.miProgram.trim() : '',
      endpointPath: typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '',
      mongooseConfig: typeof row?.mongooseConfig === 'string' ? row.mongooseConfig.trim() : '',
      enabled: row?.enabled !== false,
    }))
    .filter((row) => row.enabled && (row.module.length > 0 || row.miProgram.length > 0 || (row.endpointPath || '').length > 0));
}

function resolveProgramsForSystem(
  metadata: Record<string, unknown>,
  inforSystem: 'INFOR_M3' | 'INFOR_CSI'
): ProgramRow[] {
  const bySystemRaw = metadata.accountingProgramsBySystem;
  if (bySystemRaw && typeof bySystemRaw === 'object' && !Array.isArray(bySystemRaw)) {
    const bySystem = bySystemRaw as Record<string, unknown>;
    const preferred = parsePrograms(bySystem[inforSystem]);
    if (preferred.length > 0) return preferred;
    const fallbackM3 = parsePrograms(bySystem.INFOR_M3);
    if (fallbackM3.length > 0) return fallbackM3;
    const fallbackCsi = parsePrograms(bySystem.INFOR_CSI);
    if (fallbackCsi.length > 0) return fallbackCsi;
  }
  return parsePrograms(metadata.accountingPrograms);
}

function selectAccountsSource(
  programRows: ProgramRow[]
): { type: 'endpoint' | 'mi'; value: string; sourceModule: string; mongooseConfig?: string } | null {
  // Preferred for CSI: explicit Accounts endpoint path.
  const accountsEndpoint = programRows.find((row) => {
    const module = String(row.module || '').toLowerCase();
    const endpoint = String(row.endpointPath || '').trim();
    return endpoint.length > 0 && (module === 'accounts' || module.includes('account'));
  });
  if (accountsEndpoint?.endpointPath) {
    return {
      type: 'endpoint',
      value: accountsEndpoint.endpointPath,
      sourceModule: 'Accounts',
      mongooseConfig: accountsEndpoint.mongooseConfig || undefined,
    };
  }

  // Legacy path: Accounts MI program.
  const accountsMi = programRows.find((row) => {
    const module = String(row.module || '').toLowerCase();
    return row.miProgram.length > 0 && (module === 'accounts' || module.includes('account'));
  });
  if (accountsMi) {
    const programs = accountsMi.miProgram
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (programs[0]) {
      return {
        type: 'mi',
        value: programs[0],
        sourceModule: 'Accounts',
        mongooseConfig: accountsMi.mongooseConfig || undefined,
      };
    }
  }

  // CSI fallback: use GL endpoint row that points at SLCharts.
  const glChartsEndpoint = programRows.find((row) => {
    const module = String(row.module || '').toLowerCase();
    const endpoint = String(row.endpointPath || '').toLowerCase();
    if (endpoint.includes('/slcharts')) return true;
    if (module === 'gl' && endpoint.length > 0) return false;
    return false;
  });
  if (glChartsEndpoint?.endpointPath) {
    return {
      type: 'endpoint',
      value: glChartsEndpoint.endpointPath,
      sourceModule: 'GL',
      mongooseConfig: glChartsEndpoint.mongooseConfig || undefined,
    };
  }

  // Last-resort fallback: if any configured endpoint clearly points to SLCharts, use it.
  const anySlChartsEndpoint = programRows.find((row) =>
    String(row.endpointPath || '').toLowerCase().includes('/slcharts')
  );
  if (anySlChartsEndpoint?.endpointPath) {
    return {
      type: 'endpoint',
      value: anySlChartsEndpoint.endpointPath,
      sourceModule: anySlChartsEndpoint.module || 'GL',
      mongooseConfig: anySlChartsEndpoint.mongooseConfig || undefined,
    };
  }

  return null;
}

function safeRecordCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const data = body as Record<string, unknown>;

  const directArrayKeys = [
    'results',
    'records',
    'items',
    'Results',
    'Records',
    'Items',
    'Item',
    'IDOItems',
    'Data',
    'data',
  ];
  for (const key of directArrayKeys) {
    if (Array.isArray(data[key])) return (data[key] as unknown[]).length;
  }

  const nestedKeys = ['response', 'Response', 'result', 'Result', 'data', 'Data'];
  for (const key of nestedKeys) {
    const nested = data[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedCount = safeRecordCount(nested);
      if (nestedCount > 0) return nestedCount;
    }
  }

  return 0;
}

function isPayloadSuccess(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return true;
  const data = body as Record<string, unknown>;
  if (typeof data.Success === 'boolean') return data.Success;
  if (data.response && typeof data.response === 'object' && !Array.isArray(data.response)) {
    const nested = data.response as Record<string, unknown>;
    if (typeof nested.Success === 'boolean') return nested.Success;
  }
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('companyId')?.trim() || '';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    await requireCompanyAccess(companyId);

    const lastPull = await prisma.apiSyncLog.findFirst({
      where: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'monthly_coa_pull',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        status: true,
        recordsImported: true,
        errorDetails: true,
      },
    });

    if (!lastPull) {
      return NextResponse.json({
        ok: true,
        hasData: false,
      });
    }

    const details =
      lastPull.errorDetails && typeof lastPull.errorDetails === 'object'
        ? (lastPull.errorDetails as Record<string, unknown>)
        : {};

    return NextResponse.json({
      ok: true,
      hasData: true,
      lastPullAt: lastPull.createdAt,
      status: lastPull.status,
      recordsImported: lastPull.recordsImported,
      pulledByEmail:
        typeof details.pulledByEmail === 'string' && details.pulledByEmail.trim().length > 0
          ? details.pulledByEmail
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to load last COA pull details',
        details: message,
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  let companyId = '';
  let selectedSource: { type: 'endpoint' | 'mi'; value: string; sourceModule: string } | null = null;
  let pulledByEmail: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const context = await requireCompanyAccess(companyId);
    pulledByEmail = context.email;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    const credentials = await getInforM3CredentialsForCompany(companyId, inforSystem);
    if (!credentials) {
      return NextResponse.json(
        { error: 'Infor M3 credentials are not configured for this company.' },
        { status: 404 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const programs = resolveProgramsForSystem(metadata, inforSystem);
    selectedSource = selectAccountsSource(programs);

    if (!selectedSource) {
      return NextResponse.json(
        {
          error:
            'Accounts source is not configured. Set an Accounts endpoint path (preferred for CSI), Accounts MI Program, or GL SLCharts endpoint in Site Administration > Businesses > Accounting Programs.',
        },
        { status: 400 }
      );
    }

    const endpointPath =
      selectedSource.type === 'endpoint'
        ? selectedSource.value
        : `/${credentials.tenantId}/M3/m3api-rest/execute/${selectedSource.value}`;
    const headers =
      selectedSource.mongooseConfig
        ? { 'X-Infor-MongooseConfig': selectedSource.mongooseConfig }
        : undefined;
    const result = await callInforIonApi(credentials, endpointPath, { timeoutMs: 20000, headers });

    const effectiveOk = result.ok && isPayloadSuccess(result.body);
    const statusText = effectiveOk ? 'success' : 'error';
    const imported = effectiveOk ? safeRecordCount(result.body) : 0;
    const pulledAtIso = new Date().toISOString();
    const payloadMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
    const seedLastRunAtMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiAccountSeedLastRunAt' : 'inforM3AccountSeedLastRunAt';
    const seedSummaryMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiAccountSeedSummary' : 'inforM3AccountSeedSummary';
    const seedSnapshotMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiAccountSeedSnapshot' : 'inforM3AccountSeedSnapshot';
    const seedActiveIdsMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiActiveAccountIds' : 'inforM3ActiveAccountIds';

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
    };
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
    let seedWarning: string | null = null;
    if (effectiveOk) {
      const normalizedPayload: Record<string, unknown> = {
        source: 'monthly_coa_pull',
        pulledAt: pulledAtIso,
        coaResponse: result.body,
        metadata: {
          sourceType: selectedSource.type,
          sourceModule: selectedSource.sourceModule,
          endpointPath,
        },
      };
      const endpointLower = endpointPath.toLowerCase();
      if (selectedSource.sourceModule === 'GL' && endpointLower.includes('/slcharts')) {
        normalizedPayload.glResponses = [
          {
            module: 'GL',
            miProgram: 'SLCHARTS',
            response: result.body,
            createdAt: pulledAtIso,
          },
        ];
      }
      nextMetadata[payloadMetadataKey] = normalizedPayload;
      try {
        // Keep CSI/M3 load deterministic: COA pull immediately updates mapping seed snapshot.
        seedSummary = await seedInforAccountMappings(companyId, normalizedPayload);
        nextMetadata[seedLastRunAtMetadataKey] = pulledAtIso;
        nextMetadata[seedSummaryMetadataKey] = {
          extracted: seedSummary.extracted,
          created: seedSummary.created,
          updated: seedSummary.updated,
          unchanged: seedSummary.unchanged,
          inactive: seedSummary.inactive,
        };
        nextMetadata[seedSnapshotMetadataKey] = seedSummary.accountSnapshot;
        nextMetadata[seedActiveIdsMetadataKey] = seedSummary.activeAccountIds;
      } catch (seedError) {
        seedWarning =
          seedError instanceof Error
            ? `Account mapping seed failed: ${seedError.message}`
            : 'Account mapping seed failed with unknown error';
      }
    }

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'monthly_coa_pull',
        status: statusText,
        recordsImported: imported,
        errorCount: effectiveOk ? 0 : 1,
        errorDetails: effectiveOk
          ? {
              pulledByEmail: context.email,
              program: selectedSource.type === 'mi' ? selectedSource.value : null,
              sourceType: selectedSource.type,
              sourceModule: selectedSource.sourceModule,
              endpointPath,
              response: result.body,
            }
          : {
              pulledByEmail: context.email,
              program: selectedSource.type === 'mi' ? selectedSource.value : null,
              sourceType: selectedSource.type,
              sourceModule: selectedSource.sourceModule,
              endpointPath,
              response: result.body,
            },
      },
    });
    if (seedWarning) {
      await prisma.apiSyncLog
        .create({
          data: {
            companyId,
            platform: 'INFOR_M3',
            syncType: 'infor_account_mapping_seed',
            status: 'error',
            recordsImported: 0,
            errorCount: 1,
            errorDetails: {
              warning: seedWarning,
              sourceType: selectedSource?.type || null,
              sourceModule: selectedSource?.sourceModule || null,
              endpointPath,
              pulledByEmail,
            },
          },
        })
        .catch(() => undefined);
    } else if (seedSummary) {
      await prisma.apiSyncLog
        .create({
          data: {
            companyId,
            platform: 'INFOR_M3',
            syncType: 'infor_account_mapping_seed',
            status: 'success',
            recordsImported: seedSummary.created + seedSummary.updated,
            errorCount: 0,
            errorDetails: {
              extracted: seedSummary.extracted,
              created: seedSummary.created,
              updated: seedSummary.updated,
              unchanged: seedSummary.unchanged,
              inactive: seedSummary.inactive,
              newAccounts: seedSummary.newAccounts,
              changedAccounts: seedSummary.changedAccounts,
              inactiveAccounts: seedSummary.inactiveAccounts,
            },
          },
        })
        .catch(() => undefined);
    }

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      update: {
        connectionMetadata: nextMetadata as any,
        lastSyncAt: new Date(),
        status: effectiveOk ? 'ACTIVE' : 'ERROR',
        errorMessage: effectiveOk ? null : 'Monthly COA pull failed. Check API sync log details.',
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: effectiveOk ? 'ACTIVE' : 'ERROR',
        platformVersion: 'ionapi-1.0',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: nextMetadata as any,
        lastSyncAt: new Date(),
        errorMessage: effectiveOk ? null : 'Monthly COA pull failed. Check API sync log details.',
      },
    });

    return NextResponse.json(
      {
        ok: effectiveOk,
        companyId,
        syncType: 'monthly_coa_pull',
        accountsProgram: selectedSource.type === 'mi' ? selectedSource.value : null,
        sourceType: selectedSource.type,
        sourceModule: selectedSource.sourceModule,
        endpointPath,
        status: result.status,
        recordsImported: imported,
        accountMappingSeed: seedSummary,
        accountMappingSeedWarning: seedWarning,
        data: result.body,
      },
      { status: effectiveOk ? 200 : (result.ok ? 502 : result.status) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;

    if (companyId) {
      await prisma.apiSyncLog
        .create({
          data: {
            companyId,
            platform: 'INFOR_M3',
            syncType: 'monthly_coa_pull',
            status: 'error',
            recordsImported: 0,
            errorCount: 1,
            errorDetails: {
              message,
              program: selectedSource?.type === 'mi' ? selectedSource.value : null,
              sourceType: selectedSource?.type || null,
              sourceModule: selectedSource?.sourceModule || null,
              pulledByEmail,
            },
          },
        })
        .catch(() => undefined);
    }

    return NextResponse.json(
      {
        error: 'Failed to pull monthly COA data',
        details: message,
      },
      { status }
    );
  }
}
