// Manually add companyRole column to production
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
});

async function addColumn() {
  try {
    await client.connect();
    
    console.log('➕ Adding companyRole column to User table...');
    
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "companyRole" TEXT DEFAULT 'user';
    `);
    
    console.log('✅ Column added successfully!');
    
    // Verify
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'companyRole';
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verified: companyRole column now exists');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addColumn();

