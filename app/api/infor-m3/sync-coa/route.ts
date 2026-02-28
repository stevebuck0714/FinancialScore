import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';

export const dynamic = 'force-dynamic';

type ProgramRow = {
  module: string;
  miProgram: string;
};

function parsePrograms(value: unknown): ProgramRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      module: typeof row?.module === 'string' ? row.module.trim() : '',
      miProgram: typeof row?.miProgram === 'string' ? row.miProgram.trim() : '',
    }))
    .filter((row) => row.module.length > 0 && row.miProgram.length > 0);
}

function selectAccountsProgram(programRows: ProgramRow[]): string | null {
  const accountsRow = programRows.find((row) => row.module.toLowerCase() === 'accounts');
  if (!accountsRow) return null;
  const programs = accountsRow.miProgram
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return programs[0] || null;
}

function safeRecordCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const data = body as Record<string, unknown>;
  if (Array.isArray(data.results)) return data.results.length;
  if (Array.isArray(data.records)) return data.records.length;
  if (Array.isArray(data.items)) return data.items.length;
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
  let selectedProgram: string | null = null;
  let pulledByEmail: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const context = await requireCompanyAccess(companyId);
    pulledByEmail = context.email;

    const credentials = await getInforM3CredentialsForCompany(companyId);
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
    selectedProgram = selectAccountsProgram(programs);

    if (!selectedProgram) {
      return NextResponse.json(
        {
          error:
            'Accounts MI Program is not configured. Set the Accounts row in Site Administration > Businesses > Accounting Programs.',
        },
        { status: 400 }
      );
    }

    const endpointPath = `/${credentials.tenantId}/M3/m3api-rest/execute/${selectedProgram}`;
    const result = await callInforIonApi(credentials, endpointPath, { timeoutMs: 20000 });

    const statusText = result.ok ? 'success' : 'error';
    const imported = result.ok ? safeRecordCount(result.body) : 0;

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'monthly_coa_pull',
        status: statusText,
        recordsImported: imported,
        errorCount: result.ok ? 0 : 1,
        errorDetails: result.ok
          ? { pulledByEmail: context.email, program: selectedProgram }
          : {
              pulledByEmail: context.email,
              program: selectedProgram,
              endpointPath,
              response: result.body,
            },
      },
    });

    await prisma.accountingConnection.updateMany({
      where: {
        companyId,
        platform: 'INFOR_M3',
      },
      data: {
        lastSyncAt: new Date(),
        status: result.ok ? 'ACTIVE' : 'ERROR',
        errorMessage: result.ok ? null : 'Monthly COA pull failed. Check API sync log details.',
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        companyId,
        syncType: 'monthly_coa_pull',
        accountsProgram: selectedProgram,
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
            errorDetails: { message, program: selectedProgram, pulledByEmail },
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
