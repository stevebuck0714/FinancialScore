import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// import { calculateRevenueBasedAllocations } from '@/lib/lob-allocator'; // Function doesn't exist

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

    // Since calculateRevenueBasedAllocations doesn't exist, return default allocations
    const allocations = {
      message: "Revenue-based allocations calculation not implemented",
      defaultAllocations: {
        revenue: 100,
        costOfGoodsSold: 60,
        grossProfit: 40,
        operatingExpenses: 25,
        netIncome: 15
      }
    };

    // revenueAllocations field doesn't exist in schema, so skip the update
    // await prisma.company.update({
    //   where: { id: companyId },
    //   data: {
    //     revenueAllocations: allocations
    //   }
    // });

    console.log(`Returning default revenue allocations for company ${companyId}:`, allocations);

    return NextResponse.json({
      success: true,
      allocations,
      message: `Returned default revenue allocations (calculation not implemented)`
    });

  } catch (error: any) {
    console.error('Error calculating revenue allocations:', error);
    return NextResponse.json(
      { error: 'Failed to calculate revenue allocations', details: error.message },
      { status: 500 }
    );
  }
}
