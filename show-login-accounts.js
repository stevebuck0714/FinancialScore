const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/dev.db');

console.log('Login accounts in staging-exact environment:\n');

// Get all users with their company/consultant associations
db.all(`
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.userType,
    c.name as companyName,
    cons.name as consultantName
  FROM User u
  LEFT JOIN Company c ON u.companyId = c.id
  LEFT JOIN Consultant cons ON u.consultantId = cons.id
  ORDER BY u.email
`, (err, users) => {
  if (err) {
    console.error('Error getting users:', err);
    db.close();
    return;
  }

  console.log('Found', users.length, 'user accounts:\n');

  users.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.name || 'N/A'}`);
    console.log(`Role: ${user.role}`);
    console.log(`Type: ${user.userType || 'N/A'}`);
    console.log(`Company: ${user.companyName || 'N/A'}`);
    console.log(`Consultant: ${user.consultantName || 'N/A'}`);
    console.log('---');
  });

  db.close();
});



