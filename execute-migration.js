const sqlite3 = require('sqlite3');
const fs = require('fs');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

// Read the migration SQL
const migrationSQL = fs.readFileSync('./prisma/migrations/20251214173036_init/migration.sql', 'utf8');

console.log('Executing migration SQL...\n');

// Split SQL into individual statements and execute them
const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);

let completed = 0;
const total = statements.length;

statements.forEach((statement, index) => {
  db.run(statement.trim() + ';', (err) => {
    if (err) {
      console.error(`❌ Error executing statement ${index + 1}:`, err);
      console.error('Statement:', statement.trim());
    } else {
      completed++;
      console.log(`✅ Executed statement ${index + 1}/${total}`);
    }

    if (completed === total) {
      console.log('\n🎉 Migration completed!');
      db.close();
    }
  });
});



