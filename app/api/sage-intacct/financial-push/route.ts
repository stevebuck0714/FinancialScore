import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';

type Frequency = 'daily' | 'weekly' | 'monthly';
type FinancialImportMode = 'through' | 'only';

function normalizeFrequency(value: unknown): Frequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
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

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function isSageCompany(system: unknown): boolean {
  const normalized = String(system || '').toUpperCase();
  return normalized === 'SAGE_INTACCT' || normalized === 'SAGE';
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.SAGE_INTACCT_PUSH_SECRET || '';
    if (!expectedSecret) {
      return NextResponse.json({ ok: false, error: 'SAGE_INTACCT_PUSH_SECRET is not configured.' }, { status: 500 });
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
    if (!isSageCompany(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Financial push is only supported for SAGE_INTACCT/SAGE companies.' },
        { status: 400 }
      );
    }

    const frequency = normalizeFrequency(body.frequency);
    const targetMonth = normalizeTargetMonth(body.targetMonth);
    const mode = normalizeFinancialImportMode(body.mode);

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'SAGE_INTACCT',
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
      existingMetadata.sageIntacctFinancialPayload &&
      typeof existingMetadata.sageIntacctFinancialPayload === 'object' &&
      !Array.isArray(existingMetadata.sageIntacctFinancialPayload)
        ? (existingMetadata.sageIntacctFinancialPayload as Record<string, unknown>)
        : null;
    const payload = bodyPayload || storedPayload;
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: 'payload object is required (or previously saved payload must exist)' },
        { status: 400 }
      );
    }

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'SAGE_INTACCT',
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || 'sage-intacct-1.0',
        connectionMetadata: {
          ...existingMetadata,
          sageIntacctFinancialPayload: payload,
          sageIntacctFinancialLastPushAt: new Date().toISOString(),
          sageIntacctFinancialLastPushFrequency: frequency,
        } as any,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'SAGE_INTACCT',
        status: 'ACTIVE',
        platformVersion: 'sage-intacct-1.0',
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: {
          ...existingMetadata,
          sageIntacctFinancialPayload: payload,
          sageIntacctFinancialLastPushAt: new Date().toISOString(),
          sageIntacctFinancialLastPushFrequency: frequency,
        } as any,
      },
    });

    const result = await ingestFinancialPayload({
      companyId,
      platform: 'SAGE_INTACCT',
      source: 'sage-intacct',
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
        ...result,
      },
      { status: result.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Failed to process Sage financial push', details: message },
      { status: 500 }
    );
  }
}
