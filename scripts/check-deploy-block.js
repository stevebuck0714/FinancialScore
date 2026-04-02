#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function sleepSync(ms) {
  const durationMs = Number(ms);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, durationMs);
}

function runPrismaCommand(args) {
  return spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      encoding: 'utf8',
    }
  );
}

function printCommandOutput(result) {
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
}

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

const isVercel = process.env.VERCEL === '1';
const isProduction = isVercel
  ? process.env.VERCEL_ENV === 'production'
  : process.env.NODE_ENV === 'production';

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

  console.log('🧹 Cleaning duplicate AccountMapping identities before migration...');
  const dedupeSql = `
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "qbAccountId"
      ORDER BY COALESCE("updatedAt", "createdAt") DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "AccountMapping"
  WHERE "qbAccountId" IS NOT NULL
    AND NULLIF(TRIM("qbAccountId"), '') IS NOT NULL
)
DELETE FROM "AccountMapping" m
USING ranked r
WHERE m."id" = r."id"
  AND r.rn > 1;
`;
  const dedupeMappings = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
    {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env,
      input: dedupeSql,
    }
  );

  if (dedupeMappings.status !== 0) {
    printCommandOutput(dedupeMappings);
    console.error('');
    console.error('🛑 ACCOUNT MAPPING DEDUPE FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Could not remove duplicate AccountMapping rows before migration.');
    console.error('Fix duplicates for ("companyId","qbAccountId") and re-run deploy.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(dedupeMappings.status || 1);
  }

  console.log('🔎 Applying Prisma migrations (deploy)...');
  const maxDeployAttempts = Math.max(
    1,
    Number.parseInt(process.env.PRISMA_MIGRATE_DEPLOY_RETRIES || '4', 10) || 4
  );
  let migrationDeploy = null;
  for (let attempt = 1; attempt <= maxDeployAttempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`🔁 Retrying Prisma migrate deploy (attempt ${attempt}/${maxDeployAttempts})...`);
    }
    migrationDeploy = runPrismaCommand(['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    printCommandOutput(migrationDeploy);
    if (migrationDeploy.status === 0) break;

    const combinedOutput = `${migrationDeploy.stdout || ''}\n${migrationDeploy.stderr || ''}`;
    const advisoryLockTimeout = /pg_advisory_lock|migrate-advisory-locking|Timed out trying to acquire a postgres advisory lock/i.test(
      combinedOutput
    );
    if (!advisoryLockTimeout || attempt >= maxDeployAttempts) {
      break;
    }
    const waitMs = Math.min(30000, attempt * 5000);
    console.warn(`⚠️  Advisory lock contention detected, waiting ${waitMs}ms before retry...`);
    sleepSync(waitMs);
  }

  if (!migrationDeploy || migrationDeploy.status !== 0) {
    const postFailureStatus = runPrismaCommand(['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma']);
    printCommandOutput(postFailureStatus);
    if (postFailureStatus.status === 0) {
      console.warn('');
      console.warn('⚠️  PRISMA MIGRATION DEPLOY WARNING');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('');
      console.warn('Migration deploy command did not complete cleanly, but migration status is now up to date.');
      console.warn('This commonly happens during concurrent deploy lock contention; continuing build.');
      console.warn('');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('');
    } else {
    console.error('');
    console.error('🛑 PRISMA MIGRATION DEPLOY FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Could not apply Prisma migrations in production build environment.');
    console.error('Verify DATABASE_URL for this environment and re-run deploy.');
    console.error('If this keeps failing, ensure only one deploy runs migrations at a time.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(migrationDeploy?.status || 1);
    }
  }

  console.log('🔎 Validating Prisma migration status...');
  const migrationStatus = runPrismaCommand(['prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma']);
  printCommandOutput(migrationStatus);

  if (migrationStatus.status !== 0) {
    const strictMigrationStatusCheck = process.env.STRICT_PRISMA_MIGRATION_STATUS === 'true';
    if (!strictMigrationStatusCheck) {
      console.warn('');
      console.warn('⚠️  PRISMA MIGRATION STATUS CHECK WARNING');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('');
      console.warn('Migration deploy succeeded, but migrate status returned non-zero.');
      console.warn('Continuing build because STRICT_PRISMA_MIGRATION_STATUS is not set to "true".');
      console.warn('Set STRICT_PRISMA_MIGRATION_STATUS=true to enforce hard failure.');
      console.warn('');
      console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.warn('');
    } else {
    console.error('');
    console.error('🛑 PRISMA MIGRATION STATUS CHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Production database is not aligned with Prisma migrations.');
    console.error('Run this before deploying: npm run db:migrate:deploy');
    console.error('If this is a false positive in your build environment, unset STRICT_PRISMA_MIGRATION_STATUS.');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(migrationStatus.status || 1);
    }
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

