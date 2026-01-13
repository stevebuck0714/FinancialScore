const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

console.log('Detailed check of cold-frost.db...\n');

// Check all sqlite_master entries
db.all('SELECT type, name FROM sqlite_master ORDER BY type, name', (err, entries) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('All database objects:');
  if (entries.length === 0) {
    console.log('❌ Database is empty - no objects found');
  } else {
    const tables = entries.filter(e => e.type === 'table');
    const indexes = entries.filter(e => e.type === 'index');

    console.log(`📊 Tables (${tables.length}):`);
    tables.forEach(t => console.log(`  - ${t.name}`));

    console.log(`\n🔍 Indexes (${indexes.length}):`);
    indexes.forEach(i => console.log(`  - ${i.name}`));
  }

  // Try to query the Company table specifically
  db.get('SELECT COUNT(*) as count FROM Company', (err, result) => {
    if (err) {
      console.log('\n❌ Company table does not exist or is not accessible');
      console.log('Error:', err.message);
    } else {
      console.log(`\n✅ Company table exists with ${result.count} records`);
    }

    db.close();
  });
});



