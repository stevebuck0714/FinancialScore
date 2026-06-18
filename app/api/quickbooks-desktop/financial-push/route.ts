import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { seedQuickBooksDesktopAccountMappings } from '@/lib/quickbooks-desktop/account-mapping-seed';
import { loadQuickBooksDesktopBackfillPayloads } from '@/lib/quickbooks-desktop/backfill-payloads';
import { getQuickBooksDesktopVariant, isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

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
    const expectedSecret = process.env.QB_DESKTOP_FINANCIAL_PUSH_SECRET || process.env.QB_DESKTOP_PUSH_SECRET || '';
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: 'QB_DESKTOP_FINANCIAL_PUSH_SECRET (or QB_DESKTOP_PUSH_SECRET) is not configured.' },
        { status: 500 },
      );
    }

    const token = getBearerToken(request);
    if (!token || token !== expectedSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Financial push is only supported for QuickBooks Desktop-family companies.' },
        { status: 400 },
      );
    }
    const variant = getQuickBooksDesktopVariant(company.accountingSystem);

    const frequency = normalizeFrequency(body.frequency);
    const targetMonth = normalizeTargetMonth(body.targetMonth);
    const mode = normalizeFinancialImportMode(body.mode);

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
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
    const platformVersion = existingConnection?.platformVersion || (variant === 'ENTERPRISE' ? 'qb-enterprise-1.0' : 'qb-desktop-1.0');

    const bodyPayload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    const storedPayload =
      existingMetadata.quickbooksDesktopFinancialPayload &&
      typeof existingMetadata.quickbooksDesktopFinancialPayload === 'object' &&
      !Array.isArray(existingMetadata.quickbooksDesktopFinancialPayload)
        ? (existingMetadata.quickbooksDesktopFinancialPayload as Record<string, unknown>)
        : null;
    const rebuiltPayload =
      bodyPayload || storedPayload
        ? null
        : (await loadQuickBooksDesktopBackfillPayloads(companyId, existingMetadata))?.financialPayload || null;
    const payload = bodyPayload || storedPayload || rebuiltPayload;
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: 'payload object is required, or a saved payload/completed backfill pages must exist' },
        { status: 400 }
      );
    }
    const payloadToStore = bodyPayload || storedPayload;

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
      seedSummary = await seedQuickBooksDesktopAccountMappings(companyId, payload);
      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'QUICKBOOKS',
          syncType: 'qbd_account_mapping_seed',
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
            platform: 'QUICKBOOKS',
            syncType: 'qbd_account_mapping_seed',
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
          platform: 'QUICKBOOKS',
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion,
        connectionMetadata: {
          ...existingMetadata,
          quickbooksDesktopVariant: variant,
          ...(payloadToStore ? { quickbooksDesktopFinancialPayload: payloadToStore } : {}),
          quickbooksDesktopFinancialLastPushAt: new Date().toISOString(),
          quickbooksDesktopFinancialLastPushFrequency: frequency,
          quickbooksDesktopAccountSeedLastRunAt: new Date().toISOString(),
          quickbooksDesktopAccountSeedSummary: {
            extracted: seedSummary.extracted,
            created: seedSummary.created,
            updated: seedSummary.updated,
            unchanged: seedSummary.unchanged,
            inactive: seedSummary.inactive,
          },
          quickbooksDesktopAccountSeedSnapshot: seedSummary.accountSnapshot,
          quickbooksDesktopActiveAccountIds: seedSummary.activeAccountIds,
        } as any,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'ACTIVE',
        platformVersion,
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: {
          quickbooksDesktopVariant: variant,
          ...(payloadToStore ? { quickbooksDesktopFinancialPayload: payloadToStore } : {}),
          quickbooksDesktopFinancialLastPushAt: new Date().toISOString(),
          quickbooksDesktopFinancialLastPushFrequency: frequency,
          quickbooksDesktopAccountSeedLastRunAt: new Date().toISOString(),
          quickbooksDesktopAccountSeedSummary: {
            extracted: seedSummary.extracted,
            created: seedSummary.created,
            updated: seedSummary.updated,
            unchanged: seedSummary.unchanged,
            inactive: seedSummary.inactive,
          },
          quickbooksDesktopAccountSeedSnapshot: seedSummary.accountSnapshot,
          quickbooksDesktopActiveAccountIds: seedSummary.activeAccountIds,
        } as any,
      },
    });

    const result = await ingestFinancialPayload({
      companyId,
      platform: 'QUICKBOOKS',
      source: variant === 'ENTERPRISE' ? 'quickbooks-enterprise' : 'quickbooks-desktop',
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
      { ok: false, error: 'Failed to process QuickBooks Desktop financial push', details: message },
      { status: 500 },
    );
  }
}
