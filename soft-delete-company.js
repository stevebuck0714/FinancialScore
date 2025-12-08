// SOFT DELETE COMPANY SCRIPT
// Run with: node soft-delete-company.js <company-id>
// Example: node soft-delete-company.js cmix6s26x0001l504l0dooegk

const { Client } = require('pg');
const companyId = process.argv[2];

if (!companyId) {
  console.log('Usage: node soft-delete-company.js <company-id>');
  process.exit(1);
}

async function softDeleteCompany() {
  const client = new Client({
    // Add your database connection details here
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`Soft deleting company ${companyId}...`);

    const result = await client.query(`
      UPDATE "Company"
      SET "name" = CONCAT("name", ' (DELETED)'),
          "consultantId" = NULL
      WHERE "id" = $1
    `, [companyId]);

    if (result.rowCount > 0) {
      console.log(`✅ Successfully soft-deleted company ${companyId}`);
      console.log('The company will no longer appear in the consultant dashboard.');
    } else {
      console.log(`❌ Company ${companyId} not found`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

softDeleteCompany();
