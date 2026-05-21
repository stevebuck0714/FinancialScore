function requireDatabaseUrl(envNames = ['PROD_DATABASE_URL', 'DATABASE_URL']) {
  const names = Array.isArray(envNames) ? envNames : [envNames];
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }

  console.error(`Database URL is required. Set one of: ${names.join(', ')}`);
  process.exit(1);
}

module.exports = { requireDatabaseUrl };
