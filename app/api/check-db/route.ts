import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateDatabaseConnection, enforceDatabaseSecurity } from "@/lib/db-security";

export async function GET() {
  try {
    // CRITICAL: Validate database connection before any operations
    enforceDatabaseSecurity();
    const dbInfo = validateDatabaseConnection();
    // Check if enum types exist
    const enumCheck = await prisma.$queryRaw`
      SELECT typname 
      FROM pg_type 
      WHERE typname IN ('LoanType', 'LoanStatus', 'CovenantType', 'CovenantStatus')
    `;

    // Check if tables exist
    const tableCheck = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('Loan', 'Covenant')
    `;

    // Try to count loans
    let loanCount = null;
    try {
      loanCount = await prisma.loan.count();
    } catch (e: any) {
      loanCount = `Error: ${e.message}`;
    }

    return NextResponse.json({
      database: dbInfo.label,
      databaseName: dbInfo.databaseName,
      isProduction: dbInfo.isProduction,
      isStaging: dbInfo.isStaging,
      isAllowed: dbInfo.isAllowed,
      enums: enumCheck,
      tables: tableCheck,
      loanCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    // If it's a security error, return it with 403 status
    if (error.message?.includes('SECURITY') || error.message?.includes('SECURITY VIOLATION')) {
      const dbInfo = validateDatabaseConnection();
      return NextResponse.json({
        error: error.message,
        database: dbInfo.label,
        securityViolation: true
      }, { status: 403 });
    }
    
    // For other errors, return 500
    const dbInfo = validateDatabaseConnection();
    return NextResponse.json({
      error: error.message,
      database: dbInfo.label,
    }, { status: 500 });
  }
}


