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

    // Get connection from database
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      select: {
        id: true,
        status: true,
        lastSyncAt: true,
        tokenExpiresAt: true,
        autoSync: true,
        syncFrequency: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ 
        connected: false,
        status: 'NOT_CONNECTED'
      });
    }

    return NextResponse.json({
      connected: true,
      ...connection,
    });
  } catch (error) {
    console.error('QuickBooks status error:', error);
    return NextResponse.json(
      { error: 'Failed to check QuickBooks status' },
      { status: 500 }
    );
  }
}


