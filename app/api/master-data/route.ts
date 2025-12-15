import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Load Master data for a company from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId parameter' },
        { status: 400 }
      );
    }

    // Fetch the latest financial record for this company
    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestRecord || !latestRecord.monthlyData || latestRecord.monthlyData.length === 0) {
      return NextResponse.json(
        { error: 'Master data not found for this company' },
        { status: 404 }
      );
    }

    // Format monthly data to match expected structure
    const monthlyData = latestRecord.monthlyData.map((month: any) => ({
      date: month.monthDate,
      month: month.monthDate,
      revenue: month.revenue || 0,
      expense: month.expense || 0,
      cogsPayroll: month.cogsPayroll || 0,
      cogsOwnerPay: month.cogsOwnerPay || 0,
      cogsContractors: month.cogsContractors || 0,
      cogsMaterials: month.cogsMaterials || 0,
      cogsCommissions: month.cogsCommissions || 0,
      cogsOther: month.cogsOther || 0,
      cogsTotal: month.cogsTotal || 0,
      payroll: month.payroll || 0,
      ownerBasePay: month.ownerBasePay || 0,
      benefits: month.benefits || 0,
      insurance: month.insurance || 0,
      professionalFees: month.professionalFees || 0,
      subcontractors: month.subcontractors || 0,
      rent: month.rent || 0,
      taxLicense: month.taxLicense || 0,
      phoneComm: month.phoneComm || 0,
      infrastructure: month.infrastructure || 0,
      autoTravel: month.autoTravel || 0,
      salesExpense: month.salesExpense || 0,
      marketing: month.marketing || 0,
      trainingCert: month.trainingCert || 0,
      mealsEntertainment: month.mealsEntertainment || 0,
      interestExpense: month.interestExpense || 0,
      depreciationAmortization: month.depreciationAmortization || 0,
      otherExpense: month.otherExpense || 0,
      cash: month.cash || 0,
      ar: month.ar || 0,
      inventory: month.inventory || 0,
      otherCA: month.otherCA || 0,
      fixedAssets: month.fixedAssets || 0,
      otherAssets: month.otherAssets || 0,
      totalAssets: month.totalAssets || 0,
      ap: month.ap || 0,
      otherCL: month.otherCL || 0,
      ltd: month.ltd || 0,
      totalLiab: month.totalLiab || 0,
      ownersCapital: month.ownersCapital || 0,
      ownersDraw: month.ownersDraw || 0,
      commonStock: month.commonStock || 0,
      preferredStock: month.preferredStock || 0,
      retainedEarnings: month.retainedEarnings || 0,
      totalEquity: month.totalEquity || 0,
      revenueBreakdown: month.revenueBreakdown,
      expenseBreakdown: month.expenseBreakdown,
      cogsBreakdown: month.cogsBreakdown
    }));

    console.log(`✅ Master data loaded from database for company: ${companyId}`);
    console.log(`📊 Loaded ${monthlyData.length} months of Master data`);

    return NextResponse.json({
      success: true,
      monthlyData,
      expenseCategories: latestRecord.expenseCategories || [],
      _source: 'database',
      months: monthlyData.length
    });
  } catch (error: any) {
    console.error('Error loading master data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save/update expense categories for a company
export async function POST(request: NextRequest) {
  try {
    const { companyId, expenseCategories } = await request.json();
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      );
    }
    
    // Update the latest financial record with expense categories
    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestRecord) {
      return NextResponse.json(
        { error: 'No financial record found for this company' },
        { status: 404 }
      );
    }

    // Update expense categories
    await prisma.financialRecord.update({
      where: { id: latestRecord.id },
      data: {
        expenseCategories: expenseCategories || []
      }
    });
    
    console.log(`✅ Master data updated in database for company: ${companyId}`);
    console.log(`📊 Updated expense categories: ${expenseCategories?.length || 0} categories`);
    
    return NextResponse.json({ 
      success: true,
      companyId,
      expenseCategories: expenseCategories?.length || 0
    });
  } catch (error: any) {
    console.error('Error saving master data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

