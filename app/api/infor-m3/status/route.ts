import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuthorizedInforCompany(request);

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        status: true,
        tenantId: true,
        platformVersion: true,
        errorMessage: true,
        lastSyncAt: true,
        autoSync: true,
        syncFrequency: true,
        updatedAt: true,
      },
    });

    if (!connection) {
      return NextResponse.json({
        connected: false,
        status: 'NOT_CONNECTED',
        companyId,
      });
    }

    return NextResponse.json({
      connected: connection.status === 'ACTIVE',
      companyId,
      ...connection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to check Infor M3 status',
        details: message,
      },
      { status }
    );
  }
}
