const sqlite3 = require('sqlite3');

console.log('Comparing database schemas...\n');

// Check main database (dev.db)
console.log('=== MAIN DATABASE (dev.db) ===');
const mainDb = new sqlite3.Database('./prisma/dev.db');

mainDb.all('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name', (err, mainTables) => {
  if (err) {
    console.error('Error reading main db:', err);
    return;
  }

  console.log('Tables in main database:');
  mainTables.forEach(table => console.log(`- ${table.name}`));

  // Check staging database (cold-frost.db)
  console.log('\n=== STAGING DATABASE (cold-frost.db) ===');
  const stagingDb = new sqlite3.Database('./prisma/prisma/cold-frost.db');

  stagingDb.all('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name', (err, stagingTables) => {
    if (err) {
      console.error('Error reading staging db:', err);
      return;
    }

    console.log('Tables in staging database:');
    if (stagingTables.length === 0) {
      console.log('❌ STAGING DATABASE IS EMPTY');
    } else {
      stagingTables.forEach(table => console.log(`- ${table.name}`));
    }

    // Compare
    console.log('\n=== COMPARISON ===');
    const mainTableNames = mainTables.map(t => t.name);
    const stagingTableNames = stagingTables.map(t => t.name);

    const missingInStaging = mainTableNames.filter(name => !stagingTableNames.includes(name));
    const extraInStaging = stagingTableNames.filter(name => !mainTableNames.includes(name));

    if (missingInStaging.length > 0) {
      console.log('❌ Tables MISSING in staging (cold-frost.db):');
      missingInStaging.forEach(name => console.log(`  - ${name}`));
    } else {
      console.log('✅ All main database tables exist in staging');
    }

    if (extraInStaging.length > 0) {
      console.log('ℹ️ Extra tables in staging:');
      extraInStaging.forEach(name => console.log(`  - ${name}`));
    }

    mainDb.close();
    stagingDb.close();
  });
});



