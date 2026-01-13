const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, tables) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('Tables in cold-frost.db:');
  console.log(tables);
  db.close();
});



