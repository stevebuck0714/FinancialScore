// Reset password for production user
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require',
});

async function resetPassword() {
  try {
    await client.connect();
    
    const email = 'corelyticstest5@yahoo.com';
    const newPassword = 'Corelytics11$';
    
    console.log('🔑 Resetting password for:', email);
    console.log('📝 New password:', newPassword);
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the password
    const result = await client.query(
      'UPDATE "User" SET "passwordHash" = $1 WHERE email = $2 RETURNING email, name',
      [hashedPassword, email]
    );
    
    if (result.rows.length > 0) {
      console.log('\n✅ Password reset successfully!');
      console.log('User:', result.rows[0].name);
      console.log('Email:', result.rows[0].email);
      console.log('\nYou can now login with:');
      console.log('  Email:', email);
      console.log('  Password:', newPassword);
    } else {
      console.log('❌ User not found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

resetPassword();

