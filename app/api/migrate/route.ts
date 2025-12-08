import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Check if column already exists
    const checkResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name = 'userDefinedAllocations'
    `);

    if (checkResult.rows.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'userDefinedAllocations column already exists'
      });
    }

    // Add the column
    await client.query('ALTER TABLE "Company" ADD COLUMN "userDefinedAllocations" JSONB');

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully! userDefinedAllocations column added.'
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  } finally {
    await client.end();
  }
}
