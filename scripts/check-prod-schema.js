// Check what columns exist in production User table
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
});

async function checkSchema() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📊 User table columns in production:\n');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    const hasCompanyRole = result.rows.some(col => col.column_name === 'companyRole');
    console.log('\n' + (hasCompanyRole ? '✅' : '❌') + ' companyRole column exists:', hasCompanyRole);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkSchema();

