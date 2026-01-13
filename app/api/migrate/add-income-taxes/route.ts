import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

/**
 * One-time migration endpoint to add income tax columns
 * SECURITY: This should be protected or removed after use
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Add a secret token check here if needed
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    const results: string[] = [];

    // Check and add stateIncomeTaxes
    const checkState = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name = 'stateIncomeTaxes'
    `);

    if (checkState.rows.length === 0) {
      await client.query(`
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "stateIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0
      `);
      results.push('Added stateIncomeTaxes column');
    } else {
      results.push('stateIncomeTaxes column already exists');
    }

    // Check and add federalIncomeTaxes
    const checkFederal = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name = 'federalIncomeTaxes'
    `);

    if (checkFederal.rows.length === 0) {
      await client.query(`
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "federalIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0
      `);
      results.push('Added federalIncomeTaxes column');
    } else {
      results.push('federalIncomeTaxes column already exists');
    }

    // Verify
    const verify = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name IN ('stateIncomeTaxes', 'federalIncomeTaxes')
    `);

    await client.end();

    return NextResponse.json({
      success: true,
      message: 'Migration completed',
      results,
      columnsFound: verify.rows.length
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}




