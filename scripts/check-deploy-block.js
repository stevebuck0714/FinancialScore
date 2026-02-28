#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

/**
 * Check if deployment should be blocked
 * Used to prevent auto-deploys to production when BLOCK_AUTO_DEPLOY=true
 */

if (process.env.BLOCK_AUTO_DEPLOY === 'true') {
  console.log('');
  console.log('🛑 DEPLOYMENT BLOCKED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('BLOCK_AUTO_DEPLOY environment variable is set to "true"');
  console.log('');
  console.log('This prevents automatic deployments to production.');
  console.log('To deploy:');
  console.log('  1. Remove BLOCK_AUTO_DEPLOY from environment variables');
  console.log('  2. Manually trigger a deployment from Vercel dashboard');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // Exit with code 1 to stop the build
  // This is intentional - we want to block the deployment
  process.exit(1);
}

const isProduction =
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

if (isProduction) {
  const sharedInforKeys = [
    'INFOR_M3_TENANT_ID',
    'INFOR_M3_CLIENT_NAME',
    'INFOR_M3_CLIENT_ID',
    'INFOR_M3_CLIENT_SECRET',
    'INFOR_M3_IONAPI_BASE_URL',
    'INFOR_M3_SSO_BASE_URL',
    'INFOR_M3_OAUTH_AUTH_PATH',
    'INFOR_M3_OAUTH_TOKEN_PATH',
    'INFOR_M3_OAUTH_REVOKE_PATH',
    'INFOR_M3_SERVICE_ACCOUNT_ACCESS_KEY',
    'INFOR_M3_SERVICE_ACCOUNT_SECRET_KEY',
  ];

  if (process.env.INFOR_M3_ALLOW_ENV_FALLBACK !== 'false') {
    console.error('');
    console.error('🛑 INFOR M3 SECURITY CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('INFOR_M3_ALLOW_ENV_FALLBACK must be explicitly set to "false" in production.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }

  const presentSharedKeys = sharedInforKeys.filter((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (presentSharedKeys.length > 0) {
    console.error('');
    console.error('🛑 INFOR M3 SECURITY CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Shared INFOR_M3_* credential env vars must not be set in production.');
    console.error(`Found: ${presentSharedKeys.join(', ')}`);
    console.error('');
    console.error('Use per-company credentials stored in database via /api/infor-m3/connect.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('');
    console.error('🛑 PRISMA MIGRATION CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('DATABASE_URL is not set in production build environment.');
    console.error('Set DATABASE_URL so migration status can be validated before deploy.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }

  console.log('🔎 Validating Prisma migration status...');
  const migrationStatus = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma'],
    {
      stdio: 'inherit',
      env: process.env,
    }
  );

  if (migrationStatus.status !== 0) {
    console.error('');
    console.error('🛑 PRISMA MIGRATION STATUS CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Production database is not aligned with Prisma migrations.');
    console.error('Run this before deploying: npm run db:migrate:deploy');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(migrationStatus.status || 1);
  }

  const configuredTrustDays = Number.parseInt(process.env.MFA_TRUST_DURATION_DAYS || '', 10);
  if (!Number.isFinite(configuredTrustDays) || configuredTrustDays < 180) {
    console.error('');
    console.error('🛑 MFA TRUST DURATION CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('MFA_TRUST_DURATION_DAYS must be configured to at least 180 in production.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }

  const configuredMfaCookieDomain = (process.env.MFA_COOKIE_DOMAIN || '').trim();
  if (!configuredMfaCookieDomain) {
    console.error('');
    console.error('🛑 MFA COOKIE DOMAIN CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('MFA_COOKIE_DOMAIN must be set in production to ensure trusted-device cookies are stable.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }
}

// Continue with build
console.log('✅ Deploy check passed - proceeding with build...');

