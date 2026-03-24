import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

export const dynamic = 'force-dynamic';

type ProgramRow = {
  module: string;
  miProgram: string;
  endpointPath?: string;
  enabled?: boolean;
};

function parsePrograms(value: unknown): ProgramRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      module: typeof row?.module === 'string' ? row.module.trim() : '',
      miProgram: typeof row?.miProgram === 'string' ? row.miProgram.trim() : '',
      endpointPath: typeof row?.endpointPath === 'string' ? row.endpointPath.trim() : '',
      enabled: row?.enabled !== false,
    }))
    .filter((row) => row.enabled && row.module.length > 0);
}

function selectAccountsSource(
  programRows: ProgramRow[]
): { type: 'endpoint' | 'mi'; value: string; sourceModule: string } | null {
  // Preferred for CSI: explicit Accounts endpoint path.
  const accountsEndpoint = programRows.find(
    (row) => row.module.toLowerCase() === 'accounts' && typeof row.endpointPath === 'string' && row.endpointPath.trim().length > 0
  );
  if (accountsEndpoint?.endpointPath) {
    return { type: 'endpoint', value: accountsEndpoint.endpointPath, sourceModule: 'Accounts' };
  }

  // Legacy path: Accounts MI program.
  const accountsMi = programRows.find((row) => row.module.toLowerCase() === 'accounts' && row.miProgram.length > 0);
  if (accountsMi) {
    const programs = accountsMi.miProgram
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (programs[0]) {
      return { type: 'mi', value: programs[0], sourceModule: 'Accounts' };
    }
  }

  // CSI fallback: use GL endpoint row that points at SLCharts.
  const glChartsEndpoint = programRows.find((row) => {
    if (row.module.toLowerCase() !== 'gl') return false;
    const endpoint = String(row.endpointPath || '').toLowerCase();
    return endpoint.includes('/slcharts');
  });
  if (glChartsEndpoint?.endpointPath) {
    return { type: 'endpoint', value: glChartsEndpoint.endpointPath, sourceModule: 'GL' };
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
    const programs = parsePrograms(metadata.accountingPrograms);
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
    const result = await callInforIonApi(credentials, endpointPath, { timeoutMs: 20000 });

    const statusText = result.ok ? 'success' : 'error';
    const imported = result.ok ? safeRecordCount(result.body) : 0;
    const pulledAtIso = new Date().toISOString();
    const payloadMetadataKey = inforSystem === 'INFOR_CSI' ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
    };
    if (result.ok) {
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
    }

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'monthly_coa_pull',
        status: statusText,
        recordsImported: imported,
        errorCount: result.ok ? 0 : 1,
        errorDetails: result.ok
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
        status: result.ok ? 'ACTIVE' : 'ERROR',
        errorMessage: result.ok ? null : 'Monthly COA pull failed. Check API sync log details.',
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: result.ok ? 'ACTIVE' : 'ERROR',
        platformVersion: 'ionapi-1.0',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: nextMetadata as any,
        lastSyncAt: new Date(),
        errorMessage: result.ok ? null : 'Monthly COA pull failed. Check API sync log details.',
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        companyId,
        syncType: 'monthly_coa_pull',
        accountsProgram: selectedSource.type === 'mi' ? selectedSource.value : null,
        sourceType: selectedSource.type,
        sourceModule: selectedSource.sourceModule,
        endpointPath,
        status: result.status,
        recordsImported: imported,
        data: result.body,
      },
      { status: result.ok ? 200 : result.status }
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
