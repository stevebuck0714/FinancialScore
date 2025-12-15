const Database = require('better-sqlite3');

// Open the database
const db = new Database('./prisma/dev.db', { readonly: true });

try {
  // Find the company
  const company = db.prepare('SELECT id, name FROM Company WHERE name LIKE ?').get('%Test%ever%');

  if (!company) {
    console.log('Company not found with name containing "Test" and "ever"');
    // Try broader search
    const allCompanies = db.prepare('SELECT id, name FROM Company LIMIT 10').all();
    console.log('\nFirst 10 companies in database:');
    allCompanies.forEach(c => console.log(`- ${c.id}: ${c.name}`));
    return;
  }

  console.log('Found company:', company.id, '-', company.name);

  // Check for financial records
  const records = db.prepare('SELECT id, fileName, createdAt FROM FinancialRecord WHERE companyId = ?').all(company.id);

  console.log(`\nFound ${records.length} uploaded files for this company:`);
  records.forEach(record => {
    console.log(`- ${record.fileName} (ID: ${record.id}, uploaded: ${record.createdAt})`);
  });

} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}


