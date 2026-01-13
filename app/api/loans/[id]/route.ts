import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: {
    id: string;
  };
}

// GET individual loan
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    try {
      const loan = await prisma.loan.findUnique({
        where: { id },
      });

      if (!loan) {
        return NextResponse.json(
          { error: "Loan not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ loan });
    } catch (dbError: any) {
      // If table doesn't exist or database not available
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('DATABASE_URL')) {
        console.log("⚠️ Loan table not found or database not configured");
        return NextResponse.json(
          { error: "Loan not found" },
          { status: 404 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error fetching loan:", error);
    return NextResponse.json(
      { error: "Failed to fetch loan", details: error.message },
      { status: 500 }
    );
  }
}

// PUT update loan
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
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

    try {
      // Check if loan exists
      const existingLoan = await prisma.loan.findUnique({
        where: { id },
      });

      if (!existingLoan) {
        return NextResponse.json(
          { error: "Loan not found" },
          { status: 404 }
        );
      }

      const updatedLoan = await prisma.loan.update({
        where: { id },
        data: {
          ...(loanName && { loanName }),
          ...(loanIdNumber && { loanIdNumber }),
          ...(lenderName && { lenderName }),
          ...(loanAmount !== undefined && { loanAmount: parseFloat(loanAmount) }),
          ...(interestRate !== undefined && { interestRate: interestRate ? parseFloat(interestRate) : null }),
          ...(termMonths !== undefined && { termMonths: termMonths ? parseInt(termMonths) : null }),
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
          ...(loanType && { loanType }),
          ...(status && { status }),
          ...(notes !== undefined && { notes }),
          updatedAt: new Date(),
        },
      });

      console.log("✅ Loan updated successfully:", id);
      return NextResponse.json({ loan: updatedLoan });
    } catch (dbError: any) {
      // If table doesn't exist or database not available
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('DATABASE_URL')) {
        console.log("⚠️ Loan table not found or database not configured");
        return NextResponse.json(
          { error: "Loan management not available", details: "Database table not found" },
          { status: 503 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error updating loan:", error);
    return NextResponse.json(
      { error: "Failed to update loan", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE loan
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;

    try {
      // Check if loan exists and get associated covenants
      const loan = await prisma.loan.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              covenants: true,
            },
          },
        },
      });

      if (!loan) {
        return NextResponse.json(
          { error: "Loan not found" },
          { status: 404 }
        );
      }

      // Prevent deletion if loan has active covenants
      if (loan._count.covenants > 0) {
        return NextResponse.json(
          {
            error: "Cannot delete loan with active covenants",
            details: `This loan has ${loan._count.covenants} covenant(s). Please delete covenants first or reassign them to another loan.`
          },
          { status: 400 }
        );
      }

      await prisma.loan.delete({
        where: { id },
      });

      console.log("✅ Loan deleted successfully:", id);
      return NextResponse.json({ message: "Loan deleted successfully" });
    } catch (dbError: any) {
      // If table doesn't exist or database not available
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist') || dbError.message?.includes('DATABASE_URL')) {
        console.log("⚠️ Loan table not found or database not configured");
        return NextResponse.json(
          { error: "Loan management not available", details: "Database table not found" },
          { status: 503 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error deleting loan:", error);
    return NextResponse.json(
      { error: "Failed to delete loan", details: error.message },
      { status: 500 }
    );
  }
}

