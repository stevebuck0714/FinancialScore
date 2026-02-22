#!/usr/bin/env node

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
}

// Continue with build
console.log('✅ Deploy check passed - proceeding with build...');

