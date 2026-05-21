// Check for missing User table columns
const { Client } = require('pg');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
});

async function checkColumns() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
    
    const existingColumns = result.rows.map(r => r.column_name);
    
    // Expected columns from schema
    const expectedColumns = ['sidebarAccess'];
    
    console.log('🔍 Checking for missing columns...\n');
    
    expectedColumns.forEach(col => {
      if (existingColumns.includes(col)) {
        console.log(`✅ ${col} - EXISTS`);
      } else {
        console.log(`❌ ${col} - MISSING`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkColumns();

