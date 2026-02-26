import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncDynamicsOperationalPayload, type DynamicsOperationalPayload } from '@/lib/dynamics-365/operational-sync';

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
    const expectedSecret = process.env.DYNAMICS_PUSH_SECRET || '';
    if (!expectedSecret) {
      return NextResponse.json({ ok: false, error: 'DYNAMICS_PUSH_SECRET is not configured.' }, { status: 500 });
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
    const accountingSystem = String(company.accountingSystem || '').toUpperCase();
    if (accountingSystem !== 'DYNAMICS' && accountingSystem !== 'DYNAMICS365') {
      return NextResponse.json(
        { ok: false, error: 'Operational push is only supported for DYNAMICS companies.' },
        { status: 400 }
      );
    }

    const frequency = normalizeFrequency(body.frequency);
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as DynamicsOperationalPayload)
        : null;
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'payload object is required' }, { status: 400 });
    }

    const existingConnection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'DYNAMICS365',
        },
      },
      select: {
        id: true,
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

    const mergedMetadata = {
      ...existingMetadata,
      dynamicsOperationalPayload: payload,
      dynamicsLastPushAt: new Date().toISOString(),
      dynamicsLastPushFrequency: frequency,
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'DYNAMICS365',
        },
      },
      update: {
        status: existingConnection?.status || 'ACTIVE',
        platformVersion: existingConnection?.platformVersion || 'dynamics-1.0',
        connectionMetadata: mergedMetadata,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'DYNAMICS365',
        status: 'ACTIVE',
        platformVersion: 'dynamics-1.0',
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: mergedMetadata,
      },
    });

    const result = await syncDynamicsOperationalPayload(companyId, frequency, payload);

    await prisma.accountingConnection.updateMany({
      where: {
        companyId,
        platform: 'DYNAMICS365',
      },
      data: {
        lastSyncAt: new Date(),
        errorMessage: result.success ? null : result.errors.join(' | ').slice(0, 900),
      },
    });

    return NextResponse.json({
      ok: result.success,
      companyId,
      companyName: company.name,
      frequency,
      recordsCreated: result.recordsCreated,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Failed to process Dynamics operational push', details: message },
      { status: 500 }
    );
  }
}
