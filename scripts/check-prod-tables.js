// Check which tables exist in production
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
});

async function checkTables() {
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    console.log('📊 Tables in production database:\n');
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    
    const needed = ['CashSnapshot', 'ARAgingSnapshot', 'APAgingSnapshot', 'CustomerSalesSnapshot', 'ProductSalesSnapshot', 'InventorySnapshot'];
    console.log('\n🔍 Checking for operational data tables:\n');
    needed.forEach(table => {
      const exists = result.rows.some(r => r.tablename === table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();

