const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./prisma/prisma/cold-frost.db');

console.log('Verifying admin password...\n');

db.get('SELECT email, passwordHash FROM User WHERE email = ?', ['admin@dev.local'], async (err, user) => {
  if (err) {
    console.error('Database error:', err);
    db.close();
    return;
  }

  if (!user) {
    console.log('❌ User not found');
    db.close();
    return;
  }

  console.log('✅ User found:', user.email);

  // Test the correct password
  const correctPassword = 'DevAdmin123!';
  const typedPassword = 'DevAdmin123!'; // This should be what they typed

  console.log('\nTesting password verification...');

  try {
    const isCorrectValid = await bcrypt.compare(correctPassword, user.passwordHash);
    console.log(`Correct password "${correctPassword}": ${isCorrectValid ? '✅ VALID' : '❌ INVALID'}`);

    if (typedPassword !== correctPassword) {
      const isTypedValid = await bcrypt.compare(typedPassword, user.passwordHash);
      console.log(`Typed password "${typedPassword}": ${isTypedValid ? '✅ VALID' : '❌ INVALID'}`);
    }
  } catch (error) {
    console.error('Error during password verification:', error);
  }

  db.close();
});


