import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateRevenueBasedAllocations } from '@/lib/lob-allocator';

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    console.log(`Calculating revenue-based allocations for company ${companyId}`);

    // Calculate the revenue allocations
    const allocations = await calculateRevenueBasedAllocations(companyId);

    // Store the allocations in the company record
    await prisma.company.update({
      where: { id: companyId },
      data: {
        revenueAllocations: allocations
      }
    });

    console.log(`Stored revenue allocations for company ${companyId}:`, allocations);

    return NextResponse.json({
      success: true,
      allocations,
      message: `Calculated revenue allocations using 12-month historical data`
    });

  } catch (error: any) {
    console.error('Error calculating revenue allocations:', error);
    return NextResponse.json(
      { error: 'Failed to calculate revenue allocations', details: error.message },
      { status: 500 }
    );
  }
}
