import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Find Xero connection for this company
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'XERO',
        },
      },
    });

    if (!connection) {
      return NextResponse.json({
        connected: false,
        status: 'NOT_CONNECTED',
      });
    }

    return NextResponse.json({
      connected: true,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      errorMessage: connection.errorMessage,
      tenantName: connection.connectionMetadata?.tenantName || null,
      autoSync: connection.autoSync,
      syncFrequency: connection.syncFrequency,
    });
  } catch (error) {
    console.error('Error checking Xero status:', error);
    return NextResponse.json(
      { error: 'Failed to check Xero status' },
      { status: 500 }
    );
  }
}




