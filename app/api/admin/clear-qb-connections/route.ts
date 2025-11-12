import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Admin endpoint to clear all QuickBooks connections
export async function POST(request: NextRequest) {
  try {
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
    
    return NextResponse.json(
      { error: 'Failed to clear connections', details: error.message },
      { status: 500 }
    );
  }
}

