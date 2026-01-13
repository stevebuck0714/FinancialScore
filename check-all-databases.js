const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const databaseFiles = [
  './prisma/dev.db',
  './prisma/prisma/cold-frost.db',
  './prisma/prisma/dev.db',
  './prisma/prisma/prisma/cold-frost.db'
];

console.log('Checking all database files for users...\n');

async function checkDatabase(dbPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`❌ ${dbPath} - FILE DOES NOT EXIST`);
      resolve();
      return;
    }

    const db = new sqlite3.Database(dbPath);

    db.get('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"', (err, result) => {
      if (err) {
        console.log(`❌ ${dbPath} - CANNOT ACCESS (${err.message})`);
        db.close();
        resolve();
        return;
      }

      if (result.count === 0) {
        console.log(`📄 ${dbPath} - EMPTY DATABASE (no tables)`);
        db.close();
        resolve();
        return;
      }

      // Check for users
      db.all('SELECT email, role FROM User ORDER BY email', (err, users) => {
        if (err) {
          console.log(`❌ ${dbPath} - NO User TABLE (${err.message})`);
        } else {
          console.log(`✅ ${dbPath} - HAS ${users.length} USERS`);
          users.forEach(user => console.log(`   - ${user.email} (${user.role})`));
        }
        db.close();
        resolve();
      });
    });
  });
}

async function checkAllDatabases() {
  for (const dbPath of databaseFiles) {
    await checkDatabase(dbPath);
  }
  console.log('\nDone checking all databases.');
}

checkAllDatabases();



