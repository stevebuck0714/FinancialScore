import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { seedInforAccountMappings } from '@/lib/infor-m3/account-mapping-seed';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

type Frequency = 'daily' | 'weekly' | 'monthly';
type FinancialImportMode = 'through' | 'only';

function normalizeFrequency(value: unknown): Frequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function normalizeFinancialImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function normalizeTargetMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const expectedSecret = process.env.INFOR_M3_FINANCIAL_PUSH_SECRET || process.env.INFOR_M3_PUSH_SECRET || '';
    const token = getBearerToken(request);
    const hasValidSecret = Boolean(expectedSecret) && token === expectedSecret;

    let companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    if (!hasValidSecret) {
      // UI-originated calls are authorized via Site Admin session.
      const resolved = await requireSiteAdminAuthorizedInforCompany(request, body);
      companyId = resolved.companyId;
    } else if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!['INFOR_M3', 'INFOR_CSI'].includes(String(company.accountingSystem || '').toUpperCase())) {
      return NextResponse.json(
        { ok: false, error: 'Financial push is only supported for INFOR_M3 / INFOR_CSI companies.' },
        { status: 400 },
      );
    }
    if (String(company.accountingSystem || '').toUpperCase() === 'INFOR_CSI') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Infor CSI uses ledger-based daily/monthly financials. Run operational sync + reprocess mappings/publish month instead of payload push.',
        },
        { status: 409 },
      );
    }

    const frequency = normalizeFrequency(body.frequency);
    const targetMonth = normalizeTargetMonth(body.targetMonth);
    const mode = normalizeFinancialImportMode(body.mode);

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
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

    const bodyPayload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    const storedPayload =
      existingMetadata.inforM3FinancialPayload &&
      typeof existingMetadata.inforM3FinancialPayload === 'object' &&
      !Array.isArray(existingMetadata.inforM3FinancialPayload)
        ? (existingMetadata.inforM3FinancialPayload as Record<string, unknown>)
        : null;
    const payload = bodyPayload || storedPayload;
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: 'payload object is required (or previously saved payload must exist)' },
        { status: 400 }
      );
    }

    let seedSummary = {
      extracted: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      inactive: 0,
      newAccounts: [] as string[],
      changedAccounts: [] as string[],
      inactiveAccounts: [] as string[],
      activeAccountIds: [] as string[],
      accountSnapshot: [] as Array<{
        accountId: string;
        accountName: string;
        accountCode: string | null;
        classification: string | null;
      }>,
    };
    let seedWarning: string | null = null;
    try {
      seedSummary = await seedInforAccountMappings(companyId, payload);
      await prisma.apiSyncLog.create({
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
      });
    } catch (seedError) {
      seedWarning =
        seedError instanceof Error
          ? `Account mapping seed failed: ${seedError.message}`
          : 'Account mapping seed failed with unknown error';
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
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || 'infor-m3-1.0',
        connectionMetadata: {
          ...existingMetadata,
          inforM3FinancialPayload: payload,
          inforM3FinancialLastPushAt: new Date().toISOString(),
          inforM3FinancialLastPushFrequency: frequency,
          inforM3AccountSeedLastRunAt: new Date().toISOString(),
          inforM3AccountSeedSummary: {
            extracted: seedSummary.extracted,
            created: seedSummary.created,
            updated: seedSummary.updated,
            unchanged: seedSummary.unchanged,
            inactive: seedSummary.inactive,
          },
          inforM3AccountSeedSnapshot: seedSummary.accountSnapshot,
          inforM3ActiveAccountIds: seedSummary.activeAccountIds,
        } as any,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: 'ACTIVE',
        platformVersion: 'infor-m3-1.0',
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: {
          inforM3FinancialPayload: payload,
          inforM3FinancialLastPushAt: new Date().toISOString(),
          inforM3FinancialLastPushFrequency: frequency,
          inforM3AccountSeedLastRunAt: new Date().toISOString(),
          inforM3AccountSeedSummary: {
            extracted: seedSummary.extracted,
            created: seedSummary.created,
            updated: seedSummary.updated,
            unchanged: seedSummary.unchanged,
            inactive: seedSummary.inactive,
          },
          inforM3AccountSeedSnapshot: seedSummary.accountSnapshot,
          inforM3ActiveAccountIds: seedSummary.activeAccountIds,
        } as any,
      },
    });

    const result = await ingestFinancialPayload({
      companyId,
      platform: 'INFOR_M3',
      source: 'infor-m3',
      payload,
      syncType: 'financial_push',
      targetMonth: targetMonth || undefined,
      mode,
    });

    return NextResponse.json(
      {
        ok: result.ok,
        companyId,
        companyName: company.name,
        frequency,
        targetMonth,
        mode,
        accountMappingSeed: seedSummary,
        accountMappingSeedWarning: seedWarning,
        ...result,
      },
      { status: result.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Failed to process Infor M3 financial push', details: message },
      { status: 500 },
    );
  }
}
