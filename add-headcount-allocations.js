const { Client } = require('pg');

// Migration script to add headcountAllocations column
async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Checking if headcountAllocations column exists...');
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name = 'headcountAllocations'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ headcountAllocations column already exists. Migration complete.');
      return;
    }

    console.log('Adding headcountAllocations column...');
    await client.query('ALTER TABLE "Company" ADD COLUMN "headcountAllocations" JSONB');
    console.log('✅ Migration successful! headcountAllocations column added.');

    // Verify the column was added
    const verifyResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name = 'headcountAllocations'
    `);

    console.log('Verification:', verifyResult.rows[0]);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

console.log('Starting headcountAllocations migration...');
runMigration();
