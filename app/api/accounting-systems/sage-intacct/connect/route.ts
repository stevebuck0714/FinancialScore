/**
 * POST /api/accounting-systems/sage-intacct/connect
 *
 * Validates the saved Sage Intacct credentials by performing a real
 * `getAPISession` call against the Intacct XML endpoint. On success the
 * AccountingConnection row is flipped to status=ACTIVE and the returned
 * sessionId is cached on `connectionMetadata.session` for short-term reuse.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import sageIntacct, { type SageIntacctSettings } from '@/lib/accounting-systems/sage-intacct';
import { getAPISession } from '@/lib/accounting-systems/sage-intacct/client';

export const dynamic = 'force-dynamic';

function pickMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (String(company.accountingSystem || '').toUpperCase() !== sageIntacct.platform) {
      return NextResponse.json(
        { ok: false, error: `Connect requires the company's accounting system to be ${sageIntacct.platform}.` },
        { status: 400 }
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: sageIntacct.platform } },
      select: { connectionMetadata: true, platformVersion: true },
    });

    const metadata = pickMetadata(existing?.connectionMetadata);
    const creds = sageIntacct.sanitizeSettings(metadata.settings ?? sageIntacct.defaultSettings) as SageIntacctSettings;

    const missing: string[] = [];
    if (!creds.senderId) missing.push('senderId');
    if (!creds.senderPassword) missing.push('senderPassword');
    if (!creds.companyId) missing.push('companyId');
    if (!creds.userId) missing.push('userId');
    if (!creds.userPassword) missing.push('userPassword');
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Missing required credential fields: ${missing.join(', ')}. Save the form first.` },
        { status: 400 }
      );
    }

    const session = await getAPISession(creds);
    if (!session.ok) {
      const detail = session.details
        ? `${session.error}${session.details.description2 ? ` — ${session.details.description2}` : ''}${session.details.correction ? ` (${session.details.correction})` : ''}`
        : session.error;

      await prisma.accountingConnection.upsert({
        where: { companyId_platform: { companyId, platform: sageIntacct.platform } },
        update: { status: 'ERROR', errorMessage: detail.slice(0, 500) },
        create: {
          companyId,
          platform: sageIntacct.platform,
          status: 'ERROR',
          autoSync: false,
          syncFrequency: 'manual',
          errorMessage: detail.slice(0, 500),
          connectionMetadata: metadata,
        },
      });

      return NextResponse.json(
        { ok: false, error: detail, status: session.status },
        { status: session.status >= 400 && session.status < 600 ? session.status : 502 }
      );
    }

    const mergedMetadata = {
      ...metadata,
      session: {
        sessionId: session.session.sessionId,
        endpoint: session.session.endpoint,
        cachedAt: new Date().toISOString(),
      },
      lastUpdatedAt: new Date().toISOString(),
    };

    const platformVersionTag = existing?.platformVersion || `sage-intacct-1.0`;

    const updated = await prisma.accountingConnection.upsert({
      where: { companyId_platform: { companyId, platform: sageIntacct.platform } },
      update: {
        status: 'ACTIVE',
        errorMessage: null,
        connectionMetadata: mergedMetadata,
        platformVersion: platformVersionTag,
      },
      create: {
        companyId,
        platform: sageIntacct.platform,
        status: 'ACTIVE',
        autoSync: true,
        syncFrequency: 'manual',
        platformVersion: platformVersionTag,
        connectionMetadata: mergedMetadata,
      },
      select: { status: true, lastSyncAt: true },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      status: updated.status,
      lastSyncAt: updated.lastSyncAt,
      message: 'Connected to Sage Intacct.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
