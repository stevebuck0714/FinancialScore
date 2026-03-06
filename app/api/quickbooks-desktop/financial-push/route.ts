import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';

type Frequency = 'daily' | 'weekly' | 'monthly';

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
    if (String(company.accountingSystem || '').toUpperCase() !== 'QUICKBOOKS_DESKTOP') {
      return NextResponse.json(
        { ok: false, error: 'Financial push is only supported for QUICKBOOKS_DESKTOP companies.' },
        { status: 400 },
      );
    }

    const frequency = normalizeFrequency(body.frequency);
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null;
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'payload object is required' }, { status: 400 });
    }

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

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || 'qb-desktop-1.0',
        connectionMetadata: {
          ...existingMetadata,
          quickbooksDesktopFinancialPayload: payload,
          quickbooksDesktopFinancialLastPushAt: new Date().toISOString(),
          quickbooksDesktopFinancialLastPushFrequency: frequency,
        } as any,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'ACTIVE',
        platformVersion: 'qb-desktop-1.0',
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: {
          quickbooksDesktopFinancialPayload: payload,
          quickbooksDesktopFinancialLastPushAt: new Date().toISOString(),
          quickbooksDesktopFinancialLastPushFrequency: frequency,
        } as any,
      },
    });

    const result = await ingestFinancialPayload({
      companyId,
      platform: 'QUICKBOOKS',
      source: 'quickbooks-desktop',
      payload,
      syncType: 'financial_push',
    });

    return NextResponse.json(
      {
        ok: result.ok,
        companyId,
        companyName: company.name,
        frequency,
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
