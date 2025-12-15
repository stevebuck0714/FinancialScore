import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET all loans for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    try {
      const loans = await prisma.loan.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ loans });
    } catch (dbError: any) {
      // If table doesn't exist or database not available
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('DATABASE_URL')) {
        console.log("⚠️ Loan table not found or database not configured");
        return NextResponse.json(
          { error: "Database not configured or Loan table does not exist", loans: [] },
          { status: 200 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error fetching loans:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch loans" },
      { status: 500 }
    );
  }
}

// POST - Create a new loan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      loanName,
      loanIdNumber,
      lenderName,
      loanAmount,
      interestRate,
      termMonths,
      startDate,
      endDate,
      loanType,
      status,
      notes,
    } = body;

    // Validation - only loanName and companyId are required
    if (!companyId || !loanName) {
      return NextResponse.json(
        { error: "Missing required fields: companyId and loanName" },
        { status: 400 }
      );
    }

    try {
      console.log('🔧 Creating loan with data:', { companyId, loanName, lenderName });
      
      const loan = await prisma.loan.create({
        data: {
          companyId,
          loanName,
          loanIdNumber: loanIdNumber || null,
          lenderName: lenderName || "Unknown",
          loanAmount: loanAmount ? parseFloat(loanAmount) : 0,
          interestRate: interestRate ? parseFloat(interestRate) : null,
          termMonths: termMonths ? parseInt(termMonths) : null,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          loanType: loanType || "TERM",
          status: status || "ACTIVE",
          notes: notes || null,
        },
      });

      console.log('✅ Loan created successfully:', loan.id);
      return NextResponse.json({ loan }, { status: 201 });
    } catch (dbError: any) {
      console.error('❌ Database error creating loan:', {
        code: dbError.code,
        message: dbError.message,
        meta: dbError.meta,
        name: dbError.name
      });
      
      // If table doesn't exist or database not available
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('DATABASE_URL')) {
        console.log("⚠️ Loan table not found or database not configured");
        return NextResponse.json(
          { error: "Database not configured or Loan table does not exist. Please run database migration." },
          { status: 500 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error creating loan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create loan" },
      { status: 500 }
    );
  }
}

