const sqlite3 = require('sqlite3');

console.log('Testing database connection...\n');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

db.run('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)', (err) => {
  if (err) {
    console.error('❌ Failed to create table:', err);
  } else {
    console.log('✅ Successfully created test table');

    // Insert a test record
    db.run('INSERT INTO test_table (name) VALUES (?)', ['test record'], function(err) {
      if (err) {
        console.error('❌ Failed to insert record:', err);
      } else {
        console.log('✅ Successfully inserted test record');

        // Query the record
        db.get('SELECT * FROM test_table WHERE id = ?', [this.lastID], (err, row) => {
          if (err) {
            console.error('❌ Failed to query record:', err);
          } else {
            console.log('✅ Successfully queried record:', row);
          }

          db.close();
        });
      }
    });
  }
});


