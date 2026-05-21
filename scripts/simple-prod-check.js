// Simple production user check using direct connection
const { Client } = require('pg');
const { requireDatabaseUrl } = require('./require-database-url');

const client = new Client({
  connectionString: requireDatabaseUrl(),
});

async function checkUser() {
  try {
    await client.connect();
    
    const result = await client.query(
      'SELECT email, name, role, "mfaEnabled" FROM "User" WHERE email = $1',
      ['corelyticstest5@yahoo.com']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User corelyticstest5@yahoo.com does NOT exist in production\n');
      console.log('You need to:');
      console.log('1. Go to https://dashboard.corelytics.com');
      console.log('2. Click "Sign Up"');
      console.log('3. Register with: corelyticstest5@yahoo.com / Corelytics11$');
    } else {
      const user = result.rows[0];
      console.log('✅ User EXISTS in production');
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Role:', user.role);
      console.log('MFA Enabled:', user.mfaEnabled);
      console.log('\n⚠️ Login fails = Wrong password or MFA issue');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkUser();

