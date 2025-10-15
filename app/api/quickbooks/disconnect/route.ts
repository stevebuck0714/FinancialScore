import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Delete the connection from database
    await prisma.accountingConnection.delete({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
    });

    return NextResponse.json({ success: true, message: 'QuickBooks disconnected successfully' });
  } catch (error: any) {
    console.error('QuickBooks disconnect error:', error);
    
    // If connection doesn't exist, that's OK
    if (error.code === 'P2025') {
      return NextResponse.json({ success: true, message: 'Connection already removed' });
    }
    
    return NextResponse.json(
      { error: 'Failed to disconnect QuickBooks' },
      { status: 500 }
    );
  }
}


