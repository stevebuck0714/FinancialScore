const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/dev.db');

console.log('Searching for companies with variations of "EVER", "TEST", or "AGAIN"...\n');

db.all("SELECT id, name FROM Company WHERE name LIKE ? OR name LIKE ? OR name LIKE ?", ['%EVER%', '%TEST%', '%AGAIN%'], (err, companies) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('Companies found:');
  if (companies.length === 0) {
    console.log('No companies found with those keywords');
  } else {
    companies.forEach(company => {
      console.log(`- ${company.id}: "${company.name}"`);
    });
  }

  console.log('\nAll companies in database:');
  db.all('SELECT id, name FROM Company ORDER BY name', (err, allCompanies) => {
    if (err) {
      console.error('Error getting all companies:', err);
    } else {
      allCompanies.forEach(company => {
        console.log(`- ${company.id}: "${company.name}"`);
      });
    }
    db.close();
  });
});


