// Add sidebarAccess column to production
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
});

async function addColumn() {
  try {
    await client.connect();
    
    console.log('➕ Adding sidebarAccess column to User table...');
    
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "sidebarAccess" JSONB;
    `);
    
    console.log('✅ sidebarAccess column added successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addColumn();

