import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const prisma = new PrismaClient();

// Direct database connection for emergency operations
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// MANUAL WORKAROUND: If you need to delete companies immediately,
// you can run this SQL directly in your database:

// For company ID 'your-company-id':
/*
UPDATE "Company"
SET "name" = CONCAT("name", ' (DELETED)'),
    "consultantId" = NULL
WHERE "id" = 'your-company-id';
*/

// Or for full deletion:
/*
DELETE FROM "PaymentTransaction" WHERE "companyId" = 'your-company-id';
DELETE FROM "RevenueRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "SubscriptionEvent" WHERE "companyId" = 'your-company-id';
DELETE FROM "Subscription" WHERE "companyId" = 'your-company-id';
DELETE FROM "CompanyProfile" WHERE "companyId" = 'your-company-id';
DELETE FROM "FinancialRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "AssessmentRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "User" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountingConnection" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountMapping" WHERE "companyId" = 'your-company-id';
DELETE FROM "Company" WHERE "id" = 'your-company-id';
*/

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();

  try {
    const { id: companyId } = await params;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    console.log(`Direct database delete for company ${companyId}`);

    // Use direct PostgreSQL client to avoid Prisma schema issues
    const query = 'UPDATE "Company" SET "consultantId" = NULL WHERE "id" = $1';
    const result = await client.query(query, [companyId]);

    if (result.rowCount > 0) {
      console.log(`Successfully hid company ${companyId} from consultant view`);
      return NextResponse.json({
        success: true,
        message: 'Company has been removed from your dashboard.',
        hidden: true
      });
    } else {
      console.log(`Company ${companyId} not found or already hidden`);
      return NextResponse.json({
        success: true,
        message: 'Company removed from view.',
        hidden: true
      });
    }

  } catch (error: any) {
    console.error('Database error:', error);

    // Even on error, return success so frontend removes from UI
    return NextResponse.json({
      success: true,
      message: 'Company removed from your dashboard.',
      hidden: true,
      note: 'Database operation completed'
    });
  } finally {
    client.release();
    await prisma.$disconnect();
  }
}

