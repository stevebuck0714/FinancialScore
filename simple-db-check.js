const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/dev.db');

console.log('Checking database for test company...\n');

// Check tables
db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err);
    return;
  }

  console.log('Tables in database:');
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

    // If we found companies, check for financial records
    if (companies.length > 0) {
      const companyId = companies[0].id;
      db.all('SELECT id, fileName, createdAt FROM FinancialRecord WHERE companyId = ?', [companyId], (err, records) => {
        if (err) {
          console.error('Error getting financial records:', err);
        } else {
          console.log(`Financial records for ${companies[0].name}:`);
          if (records.length === 0) {
            console.log('No uploaded files found');
          } else {
            records.forEach(record => {
              console.log(`- ${record.fileName} (ID: ${record.id}, uploaded: ${record.createdAt})`);
            });
          }
        }
        db.close();
      });
    } else {
      db.close();
    }
  });
});


