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
          create: monthlyData.map((month: any) => {
            // Handle date from monthDate or date field
            const dateValue = month.monthDate || month.date;
            const parsedDate = new Date(dateValue);
            
            // Validate the date is valid
            if (isNaN(parsedDate.getTime())) {
              console.error(`Invalid date for month record: ${dateValue}`, month);
              throw new Error(`Invalid date: ${dateValue}`);
            }
            
            return {
            companyId: companyId,
            monthDate: parsedDate,
            revenue: month.revenue || 0,
            revenueBreakdown: month.revenueBreakdown || null,
            expense: month.expense || 0,
            expenseBreakdown: month.expenseBreakdown || null,
            cogsPayroll: month.cogsPayroll || 0,
            cogsOwnerPay: month.cogsOwnerPay || 0,
            cogsContractors: month.cogsContractors || 0,
            cogsMaterials: month.cogsMaterials || 0,
            cogsCommissions: month.cogsCommissions || 0,
            cogsOther: month.cogsOther || 0,
            cogsTotal: month.cogsTotal || 0,
            cogsBreakdown: month.cogsBreakdown || null,
            payroll: month.payroll || 0,
            ownerBasePay: month.ownerBasePay || 0,
            benefits: month.benefits || 0,
            insurance: month.insurance || 0,
            professionalFees: month.professionalFees || 0,
            subcontractors: month.subcontractors || 0,
            rent: month.rent || 0,
            taxLicense: month.taxLicense || 0,
            stateIncomeTaxes: month.stateIncomeTaxes || 0,
            federalIncomeTaxes: month.federalIncomeTaxes || 0,
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
            ownersCapital: month.ownersCapital || 0,
            ownersDraw: month.ownersDraw || 0,
            commonStock: month.commonStock || 0,
            preferredStock: month.preferredStock || 0,
            retainedEarnings: month.retainedEarnings || 0,
            additionalPaidInCapital: month.additionalPaidInCapital || 0,
            treasuryStock: month.treasuryStock || 0,
            totalEquity: month.totalEquity || 0,
            totalLAndE: month.totalLAndE || 0,
            lobBreakdowns: month.lobBreakdowns || null
};})
        }
      },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' }
        }
      }
    });

    // Master data is now stored in the database via monthlyData relationship
    // No need for filesystem-based master data files in Vercel serverless environment
    console.log(`✅ Financial record created with ${financialRecord.monthlyData.length} months of data`);

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

