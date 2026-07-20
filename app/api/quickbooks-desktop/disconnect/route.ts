import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getQuickBooksDesktopFamilyLabel, isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop-family disconnect is only available for QuickBooks Desktop or QuickBooks Enterprise companies.' },
        { status: 400 }
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
      select: { connectionMetadata: true },
    });
    const metadata = asRecord(existing?.connectionMetadata);
    const credentials = asRecord(metadata.quickbooksDesktopCredentials);
    const { webConnectorPasswordEncrypted: _password, webConnectorPasswordUpdatedAt: _passwordUpdatedAt, ...credentialsWithoutPassword } = credentials;

    await prisma.accountingConnection.update({
      where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
      data: {
        status: 'INACTIVE',
        autoSync: false,
        errorMessage: null,
        connectionMetadata: {
          ...metadata,
          quickbooksDesktopCredentials: credentialsWithoutPassword,
          quickbooksDesktopDisconnectedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      status: 'INACTIVE',
      message: `${getQuickBooksDesktopFamilyLabel(company.accountingSystem)} disconnected.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect QuickBooks Desktop';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
