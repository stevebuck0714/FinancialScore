const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

console.log('Checking cold-frost.db database (staging-exact environment)...\n');

// Check tables
db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err);
    return;
  }

  console.log('Tables in cold-frost.db:');
  tables.forEach(table => console.log(`- ${table.name}`));
  console.log('');

  // Check for companies with "test" in name
  db.all('SELECT id, name FROM Company WHERE name LIKE ?', ['%test%'], (err, companies) => {
    if (err) {
      console.error('Error getting companies:', err);
      db.close();
      return;
    }

    console.log('Companies with "test" in name:');
    if (companies.length === 0) {
      console.log('No companies found');
    } else {
      companies.forEach(company => {
        console.log(`- ${company.id}: ${company.name}`);
      });
    }
    console.log('');

    // Check for the specific company
    db.get('SELECT id, name FROM Company WHERE name = ?', ['TEST EVERTHING AGAIN'], (err, company) => {
      if (err) {
        console.error('Error getting specific company:', err);
        db.close();
        return;
      }

      if (!company) {
        console.log('Company "TEST EVERTHING AGAIN" not found');
      } else {
        console.log('FOUND company:', company.id, '-', company.name);
      }
      console.log('');

      // Show all companies
      db.all('SELECT id, name FROM Company ORDER BY name', (err, allCompanies) => {
        if (err) {
          console.error('Error getting all companies:', err);
        } else {
          console.log('All companies in database:');
          allCompanies.forEach(c => console.log(`- ${c.id}: "${c.name}"`));
        }
        db.close();
      });
    });
  });
});


