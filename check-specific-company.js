const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/dev.db');

console.log('Checking for company "TEST EVERTHING AGAIN"...\n');

// Check for the exact company name
db.get('SELECT id, name FROM Company WHERE name = ?', ['TEST EVERTHING AGAIN'], (err, company) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  if (!company) {
    console.log('Company "TEST EVERTHING AGAIN" not found in database');
    // Show all companies to see what's there
    db.all('SELECT name FROM Company ORDER BY name', (err, allCompanies) => {
      if (err) {
        console.error('Error getting all companies:', err);
      } else {
        console.log('\nAll companies in database:');
        allCompanies.forEach(c => console.log(`- "${c.name}"`));
      }
      db.close();
    });
    return;
  }

  console.log('FOUND company:', company.id, '-', company.name);

  // Check for financial records
  db.all('SELECT id, fileName, createdAt FROM FinancialRecord WHERE companyId = ?', [company.id], (err, records) => {
    if (err) {
      console.error('Error getting financial records:', err);
    } else {
      console.log(`\nUploaded files for "${company.name}":`);
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
});



