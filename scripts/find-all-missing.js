// Find ALL missing User columns at once
const { Client } = require('pg');
const fs = require('fs');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
});

async function findMissing() {
  try {
    await client.connect();
    
    // Get existing columns
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
    
    const existingColumns = result.rows.map(r => r.column_name);
    
    // Read schema file to get expected columns
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    const userModelMatch = schema.match(/model User \{([\s\S]*?)\n\}/);
    
    if (!userModelMatch) {
      console.log('Could not parse User model from schema');
      return;
    }
    
    const userModelContent = userModelMatch[1];
    const lines = userModelContent.split('\n');
    const schemaColumns = [];
    
    lines.forEach(line => {
      const match = line.trim().match(/^(\w+)\s+/);
      if (match && !line.includes('@@') && !line.includes('//') && match[1] !== 'consultant' && match[1] !== 'company' && match[1] !== 'primaryConsultant' && match[1] !== 'consultantFirm') {
        schemaColumns.push(match[1]);
      }
    });
    
    console.log('🔍 Checking User table columns...\n');
    
    const missing = schemaColumns.filter(col => !existingColumns.includes(col));
    
    if (missing.length === 0) {
      console.log('✅ All columns exist!');
    } else {
      console.log('❌ Missing columns:');
      missing.forEach(col => console.log(`   - ${col}`));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

findMissing();

