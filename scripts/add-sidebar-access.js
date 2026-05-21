// Add sidebarAccess column to production
const { Client } = require('pg');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
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

