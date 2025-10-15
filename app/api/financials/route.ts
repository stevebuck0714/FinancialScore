import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET financial records for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const records = await prisma.financialRecord.findMany({
      where: { companyId },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching financial records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create/upload new financial record
export async function POST(request: NextRequest) {
  try {
    const { companyId, uploadedByUserId, fileName, rawData, columnMapping, monthlyData } = await request.json();

    if (!companyId || !uploadedByUserId || !fileName || !rawData || !columnMapping) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Delete previous financial records for this company
    await prisma.financialRecord.deleteMany({
      where: { companyId }
    });

    // Create new financial record with monthly data
    const financialRecord = await prisma.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId,
        fileName,
        rawData,
        columnMapping,
        monthlyData: {
          create: monthlyData.map((month: any) => ({
            companyId: companyId,
            monthDate: new Date(month.monthDate),
            revenue: month.revenue || 0,
            expense: month.expense || 0,
            cogsPayroll: month.cogsPayroll || 0,
            cogsOwnerPay: month.cogsOwnerPay || 0,
            cogsContractors: month.cogsContractors || 0,
            cogsMaterials: month.cogsMaterials || 0,
            cogsCommissions: month.cogsCommissions || 0,
            cogsOther: month.cogsOther || 0,
            cogsTotal: month.cogsTotal || 0,
            payroll: month.opexPayroll || month.payroll || 0,
            ownerBasePay: month.ownersBasePay || month.ownerBasePay || 0,
            benefits: month.benefits || 0,
            insurance: month.insurance || 0,
            professionalFees: month.professionalServices || month.professionalFees || 0,
            subcontractors: month.contractorsDistribution || month.subcontractors || 0,
            rent: month.rentLease || month.rent || 0,
            taxLicense: month.taxLicense || 0,
            phoneComm: month.phoneComm || 0,
            infrastructure: month.equipment || month.infrastructure || 0,
            autoTravel: month.travel || month.autoTravel || 0,
            salesExpense: month.opexSalesMarketing || month.salesExpense || 0,
            marketing: month.opexOther || month.marketing || 0,
            trainingCert: month.trainingCert || 0,
            mealsEntertainment: month.mealsEntertainment || 0,
            interestExpense: month.interestExpense || 0,
            depreciationAmortization: month.depreciationExpense || month.depreciationAmortization || 0,
            otherExpense: month.otherExpense || 0,
            nonOperatingIncome: month.nonOperatingIncome || 0,
            extraordinaryItems: month.extraordinaryItems || 0,
            cash: month.cash || 0,
            ar: month.ar || 0,
            inventory: month.inventory || 0,
            otherCA: month.otherCA || 0,
            tca: month.tca || 0,
            fixedAssets: month.fixedAssets || 0,
            otherAssets: month.otherAssets || 0,
            totalAssets: month.totalAssets || 0,
            ap: month.ap || 0,
            otherCL: month.otherCL || 0,
            tcl: month.tcl || 0,
            ltd: month.ltd || 0,
            totalLiab: month.totalLiab || 0,
            totalEquity: month.totalEquity || 0,
            totalLAndE: month.totalLAndE || 0
          }))
        }
      },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' }
        }
      }
    });

    return NextResponse.json({ record: financialRecord }, { status: 201 });
  } catch (error) {
    console.error('Error creating financial record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE financial record
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Record ID required' },
        { status: 400 }
      );
    }

    await prisma.financialRecord.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting financial record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

