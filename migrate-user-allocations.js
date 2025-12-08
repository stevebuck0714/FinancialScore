const { Client } = require('pg');

// Migration script to add userDefinedAllocations column
async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Checking if userDefinedAllocations column exists...');
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name = 'userDefinedAllocations'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ userDefinedAllocations column already exists. Migration complete.');
      return;
    }

    console.log('Adding userDefinedAllocations column...');
    await client.query('ALTER TABLE "Company" ADD COLUMN "userDefinedAllocations" JSONB');
    console.log('✅ Migration successful! userDefinedAllocations column added.');

    // Verify the column was added
    const verifyResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Company' AND column_name = 'userDefinedAllocations'
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

console.log('Starting database migration...');
runMigration();