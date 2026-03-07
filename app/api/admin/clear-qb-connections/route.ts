import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdmin } from '@/lib/tenant-security';

// Admin endpoint to clear all QuickBooks connections
export async function POST(request: NextRequest) {
  try {
    const context = await requireSiteAdmin();
    console.log(`🛡️ Clear QB connections requested by site admin: ${context.email}`);

    // Delete all QuickBooks connections
    const result = await prisma.accountingConnection.deleteMany({
      where: {
        platform: 'QUICKBOOKS',
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Cleared ${result.count} QuickBooks connection(s)`,
      count: result.count
    });
  } catch (error: any) {
    console.error('Clear QB connections error:', error);
    const status = error?.message?.includes('Unauthorized')
      ? 401
      : error?.message?.includes('Forbidden')
      ? 403
      : 500;
    
    return NextResponse.json(
      { error: 'Failed to clear connections', details: error.message },
      { status }
    );
  }
}


















