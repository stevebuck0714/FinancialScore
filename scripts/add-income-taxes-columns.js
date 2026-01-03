const { Client } = require('pg');

/**
 * Migration script to add stateIncomeTaxes and federalIncomeTaxes columns
 * to the MonthlyFinancial table.
 * 
 * SAFE: Checks if columns exist before adding them.
 * Safe to run multiple times.
 */

async function runMigration() {
  // Get DATABASE_URL from environment
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('   Please set DATABASE_URL before running this migration.');
    process.exit(1);
  }

  // Check if this is production database
  const isProduction = databaseUrl.includes('orange-poetry');
  const isStaging = databaseUrl.includes('cold-frost');
  
  if (isProduction) {
    console.log('⚠️  WARNING: You are about to modify the PRODUCTION database (orange-poetry)');
    console.log('   Make sure this is what you intend to do!');
  } else if (isStaging) {
    console.log('ℹ️  Running migration on STAGING database (cold-frost)');
  } else {
    console.log('ℹ️  Running migration on database:', databaseUrl.substring(0, 50) + '...');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for Neon
  });

  try {
    console.log('\n🔗 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Check if stateIncomeTaxes column exists
    console.log('Checking for stateIncomeTaxes column...');
    const checkStateTax = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name = 'stateIncomeTaxes'
    `);

    if (checkStateTax.rows.length > 0) {
      console.log('✅ stateIncomeTaxes column already exists. Skipping.');
    } else {
      console.log('➕ Adding stateIncomeTaxes column...');
      await client.query(`
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "stateIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0
      `);
      console.log('✅ stateIncomeTaxes column added successfully!');
    }

    // Check if federalIncomeTaxes column exists
    console.log('\nChecking for federalIncomeTaxes column...');
    const checkFederalTax = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name = 'federalIncomeTaxes'
    `);

    if (checkFederalTax.rows.length > 0) {
      console.log('✅ federalIncomeTaxes column already exists. Skipping.');
    } else {
      console.log('➕ Adding federalIncomeTaxes column...');
      await client.query(`
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "federalIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0
      `);
      console.log('✅ federalIncomeTaxes column added successfully!');
    }

    // Verify both columns exist
    console.log('\n🔍 Verifying columns...');
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'MonthlyFinancial' 
      AND column_name IN ('stateIncomeTaxes', 'federalIncomeTaxes')
      ORDER BY column_name
    `);

    if (verifyResult.rows.length === 2) {
      console.log('✅ Verification successful! Both columns exist:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
      });
      console.log('\n✅ Migration complete!');
    } else {
      console.warn('⚠️  Warning: Expected 2 columns, but found:', verifyResult.rows.length);
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed.');
  }
}

// Run the migration
console.log('🚀 Starting income taxes columns migration...\n');
runMigration().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});




