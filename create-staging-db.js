const { execSync } = require('child_process');

console.log('Creating staging database schema...\n');

// Set the DATABASE_URL environment variable and run prisma db push
try {
  const result = execSync('set DATABASE_URL=file:./prisma/prisma/cold-frost.db && npx prisma db push --schema=prisma/schema.prisma --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./prisma/prisma/cold-frost.db' }
  });

  console.log('✅ Database schema applied successfully');
} catch (error) {
  console.error('❌ Failed to apply schema:', error.message);
}



