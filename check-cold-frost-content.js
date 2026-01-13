const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

console.log('Checking cold-frost.db content...\n');

// Check if database has any content at all
db.get('SELECT COUNT(*) as count FROM sqlite_master', (err, result) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('Database has', result.count, 'objects (tables, indexes, etc.)');

  if (result.count === 0) {
    console.log('Database is completely empty');
    db.close();
    return;
  }

  // Check tables
  db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, tables) => {
    if (err) {
      console.error('Error getting tables:', err);
      db.close();
      return;
    }

    console.log('\nTables:');
    tables.forEach(table => console.log(`- ${table.name}`));

    // Check if Company table exists and has data
    if (tables.some(t => t.name === 'Company')) {
      db.get('SELECT COUNT(*) as count FROM Company', (err, result) => {
        if (err) {
          console.error('Error counting companies:', err);
        } else {
          console.log(`\nCompany table has ${result.count} records`);

          if (result.count > 0) {
            db.all('SELECT id, name FROM Company LIMIT 10', (err, companies) => {
              if (err) {
                console.error('Error getting companies:', err);
              } else {
                console.log('\nFirst 10 companies:');
                companies.forEach(c => console.log(`- ${c.id}: ${c.name}`));
              }
              db.close();
            });
          } else {
            console.log('No company records found');
            db.close();
          }
        }
      });
    } else {
      console.log('Company table does not exist');
      db.close();
    }
  });
});



