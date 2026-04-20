/**
 * POST /api/accounting-systems/vista-cloud/connect
 *
 * Validates the saved Vista Cloud (Trimble Vista Direct API) credentials by
 * issuing a tiny `pageSize=1` probe against GL Chart of Accounts. On success
 * the AccountingConnection row is flipped to status=ACTIVE and the resolved
 * environment (PROD vs TEST) is cached on `connectionMetadata.session`.
 *
 * Body shape:
 *   { companyId: string; environment?: 'PROD' | 'TEST' }
 *
 * Vista's Direct API is keyed (no session token to cache like Intacct), so
 * "session" here just records which key/environment was last validated and
 * when — we don't need to re-authenticate per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import vistaCloud, { type VistaCloudSettings } from '@/lib/accounting-systems/vista-cloud';
import { validateConnection, type VistaEnvironment } from '@/lib/accounting-systems/vista-cloud/client';

export const dynamic = 'force-dynamic';

function pickMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function pickEnvOverride(body: Record<string, unknown>): VistaEnvironment | null {
  const raw = asString(body.environment).toUpperCase();
  if (raw === 'PROD' || raw === 'TEST') return raw;
  return null;
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
    if (String(company.accountingSystem || '').toUpperCase() !== vistaCloud.platform) {
      return NextResponse.json(
        { ok: false, error: `Connect requires the company's accounting system to be ${vistaCloud.platform}.` },
        { status: 400 }
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      select: { connectionMetadata: true, platformVersion: true },
    });

    const metadata = pickMetadata(existing?.connectionMetadata);
    const creds = vistaCloud.sanitizeSettings(metadata.settings ?? vistaCloud.defaultSettings) as VistaCloudSettings;

    const envOverride = pickEnvOverride(body);
    const targetEnv: VistaEnvironment =
      envOverride ??
      (creds.defaultEnvironment === 'TEST'
        ? 'TEST'
        : creds.defaultEnvironment === 'PROD'
        ? 'PROD'
        : creds.applicationKeyProd
        ? 'PROD'
        : 'TEST');

    const missing: string[] = [];
    if (!creds.subscriberCode) missing.push('subscriberCode');
    if (!creds.baseUrl) missing.push('baseUrl');
    if (targetEnv === 'PROD' && !creds.applicationKeyProd) missing.push('applicationKeyProd');
    if (targetEnv === 'TEST' && !creds.applicationKeyTest) missing.push('applicationKeyTest');
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Missing required credential fields: ${missing.join(', ')}. Save the form first.` },
        { status: 400 }
      );
    }

    let validation: Awaited<ReturnType<typeof validateConnection>>;
    try {
      validation = await validateConnection(creds, targetEnv);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      await prisma.accountingConnection.upsert({
        where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
        update: { status: 'ERROR', errorMessage: detail.slice(0, 500) },
        create: {
          companyId,
          platform: vistaCloud.platform,
          status: 'ERROR',
          autoSync: false,
          syncFrequency: 'manual',
          errorMessage: detail.slice(0, 500),
          connectionMetadata: metadata,
        },
      });
      const status = /401|403/.test(detail) ? 401 : 502;
      return NextResponse.json({ ok: false, error: detail }, { status });
    }

    const now = new Date();
    const mergedMetadata = {
      ...metadata,
      session: {
        environment: validation.environment,
        validatedAt: now.toISOString(),
        detail: validation.detail,
      },
      lastUpdatedAt: now.toISOString(),
    };

    const platformVersionTag = existing?.platformVersion || `vista-cloud-1.0`;

    const updated = await prisma.accountingConnection.upsert({
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      update: {
        status: 'ACTIVE',
        errorMessage: null,
        connectionMetadata: mergedMetadata,
        platformVersion: platformVersionTag,
      },
      create: {
        companyId,
        platform: vistaCloud.platform,
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
      environment: validation.environment,
      message: `Connected to Viewpoint Vista Cloud (${validation.environment}).`,
      detail: validation.detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
