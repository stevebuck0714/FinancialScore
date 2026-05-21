// Verify the password hash in production
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
});

async function verifyPassword() {
  try {
    await client.connect();
    
    const email = 'corelyticstest5@yahoo.com';
    const password = 'Corelytics11$';
    
    // Get the current password hash
    const result = await client.query(
      'SELECT email, name, "passwordHash" FROM "User" WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = result.rows[0];
    console.log('✅ User found:', user.name);
    console.log('📧 Email:', user.email);
    console.log('🔑 Password hash exists:', user.passwordHash ? 'YES' : 'NO');
    console.log('🔑 Hash length:', user.passwordHash?.length || 0);
    
    // Verify the password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('\n🔐 Password verification:', isValid ? '✅ VALID' : '❌ INVALID');
    
    if (!isValid) {
      console.log('\n⚠️ Password does NOT match!');
      console.log('This means the app might be using a different verification method.');
    } else {
      console.log('\n✅ Password matches correctly!');
      console.log('The issue is elsewhere (maybe app code or cache).');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

verifyPassword();

