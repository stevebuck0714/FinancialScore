/**
 * POST /api/accounting-systems/vista-cloud/disconnect
 *
 * Flips the AccountingConnection row to status=INACTIVE and clears the
 * cached environment marker from connectionMetadata. Saved credentials are
 * NOT deleted — the user can simply click Connect again.
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import vistaCloud from '@/lib/accounting-systems/vista-cloud';

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

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      select: { connectionMetadata: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: true, companyId, message: 'Already disconnected.' });
    }

    const metadata = pickMetadata(existing.connectionMetadata);
    delete metadata.session;
    metadata.lastUpdatedAt = new Date().toISOString();

    await prisma.accountingConnection.update({
      where: { companyId_platform: { companyId, platform: vistaCloud.platform } },
      data: {
        status: 'INACTIVE',
        errorMessage: null,
        connectionMetadata: metadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      status: 'INACTIVE',
      message: 'Disconnected from Viewpoint Vista Cloud.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
