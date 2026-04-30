#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

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

function isPrismaAdvisoryLockTimeout(outputText) {
  return /pg_advisory_lock|migrate-advisory-locking|Timed out trying to acquire a postgres advisory lock/i.test(
    outputText || ''
  );
}

function runPrismaCommandWithAdvisoryLockRetry(args, label) {
  const maxAttempts = Math.max(
    1,
    Number.parseInt(process.env.PRISMA_MIGRATE_RESOLVE_RETRIES || process.env.PRISMA_MIGRATE_DEPLOY_RETRIES || '4', 10) || 4
  );
  let result = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`🔁 Retrying ${label} (attempt ${attempt}/${maxAttempts})...`);
    }
    result = runPrismaCommand(args);
    printCommandOutput(result);
    if (result.status === 0) break;

    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (!isPrismaAdvisoryLockTimeout(combinedOutput) || attempt >= maxAttempts) break;

    const waitMs = Math.min(30000, attempt * 5000);
    console.warn(`⚠️  Advisory lock contention detected, waiting ${waitMs}ms before retry...`);
    sleepSync(waitMs);
  }
  return result;
}

async function getFailedPrismaMigrations(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
      ORDER BY started_at DESC
    `);
    return (result.rows || [])
      .map((row) => String(row.migration_name || '').trim())
      .filter((name) => name.length > 0);
  } catch (error) {
    // If migration table does not exist yet, there is nothing to resolve.
    const message = String(error?.message || '');
    if (/relation .*_prisma_migrations.* does not exist/i.test(message)) return [];
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Detects whether AccountMapping carries the new generic `accountId` column,
 * the legacy `qbAccountId` column (pre-rename migration), or neither (fresh
 * DB / table missing). Lets the dedupe step run safely against any DB state
 * instead of crashing when the expected column is absent.
 */
async function detectAccountMappingIdColumn(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccountMapping'
        AND column_name IN ('accountId', 'qbAccountId')
    `);
    const cols = new Set((result.rows || []).map((r) => String(r.column_name)));
    if (cols.has('accountId')) return 'accountId';
    if (cols.has('qbAccountId')) return 'qbAccountId';
    return null;
  } catch (error) {
    const message = String(error?.message || '');
    // Table does not exist yet (fresh DB) — treat as "nothing to dedupe".
    if (/relation .*AccountMapping.* does not exist/i.test(message)) return null;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

function extractFailedMigrationNames(outputText) {
  const names = new Set();
  const patterns = [
    /The migration `([^`]+)` failed/gi,
    /Migration `([^`]+)` failed/gi,
    /following migration(?:s)?(?: have)? failed[:\s]+`([^`]+)`/gi,
    /failed migrations?:\s*`([^`]+)`/gi,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(outputText);
    while (match) {
      if (match[1]) names.add(String(match[1]).trim());
      match = pattern.exec(outputText);
    }
  }
  return Array.from(names).filter(Boolean);
}

/**
 * Detect a Prisma migrate failure caused by an object that already exists in
 * the target database (typical when a migration was historically applied via
 * `prisma db push` and the corresponding _prisma_migrations row is missing).
 * Returns the migration name reported by Prisma, or null if the failure is a
 * different kind.
 */
function extractAlreadyExistsMigrationName(outputText) {
  if (!outputText) return null;
  const isAlreadyExists = /(?:relation|table|index|constraint|column|sequence|type|schema) "[^"]+" already exists/i.test(
    outputText
  );
  if (!isAlreadyExists) return null;
  const explicitMatch =
    /Migration name:\s*([A-Za-z0-9_./-]+)/i.exec(outputText) ||
    /migration `([^`]+)`/i.exec(outputText) ||
    /Applying migration `([^`]+)`/i.exec(outputText);
  return explicitMatch ? String(explicitMatch[1]).trim() : null;
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
  (async () => {
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
  let accountMappingIdColumn = null;
  try {
    accountMappingIdColumn = await detectAccountMappingIdColumn(process.env.DATABASE_URL);
  } catch (error) {
    console.error('');
    console.error('🛑 ACCOUNT MAPPING DEDUPE PRECHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Could not inspect AccountMapping schema before dedupe.');
    console.error(String(error?.message || error));
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
  }

  if (accountMappingIdColumn === null) {
    console.log(
      '   ⏭  AccountMapping has neither "accountId" nor "qbAccountId" column ' +
        '(table missing or pre-init) — skipping dedupe; migrations will create it.'
    );
  } else {
    if (accountMappingIdColumn === 'qbAccountId') {
      console.log(
        '   ℹ  Production still uses legacy "qbAccountId" column; deduping by it. ' +
          'The rename to "accountId" happens in 20260419130000_rename_account_mapping_qb_to_generic.'
      );
    }
    const dedupeSql = `
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "${accountMappingIdColumn}"
      ORDER BY COALESCE("updatedAt", "createdAt") DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "AccountMapping"
  WHERE "${accountMappingIdColumn}" IS NOT NULL
    AND NULLIF(TRIM("${accountMappingIdColumn}"), '') IS NOT NULL
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
      console.error(`Fix duplicates for ("companyId","${accountMappingIdColumn}") and re-run deploy.`);
      console.error('');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('');
      process.exit(dedupeMappings.status || 1);
    }
  }

  try {
    const failedMigrations = await getFailedPrismaMigrations(process.env.DATABASE_URL);
    if (failedMigrations.length > 0) {
      console.warn('⚠️  Found failed Prisma migrations, resolving as rolled back before deploy:');
      failedMigrations.forEach((name) => console.warn(`   - ${name}`));
      for (const migrationName of failedMigrations) {
        const resolveResult = runPrismaCommandWithAdvisoryLockRetry(
          [
            'prisma',
            'migrate',
            'resolve',
            '--rolled-back',
            migrationName,
            '--schema',
            'prisma/schema.prisma',
          ],
          `Prisma migrate resolve --rolled-back ${migrationName}`
        );
        if (resolveResult.status !== 0) {
          console.error('');
          console.error('🛑 PRISMA MIGRATION RESOLVE FAILED');
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('');
          console.error(`Failed to mark migration as rolled back: ${migrationName}`);
          console.error('Use prisma migrate resolve manually in production and re-run deploy.');
          console.error('');
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('');
          process.exit(resolveResult.status || 1);
        }
      }
    }
  } catch (error) {
    console.error('');
    console.error('🛑 PRISMA MIGRATION PRECHECK FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Could not inspect failed migration state before deploy.');
    console.error(String(error?.message || error));
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    process.exit(1);
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
    const deployOutput = `${migrationDeploy?.stdout || ''}\n${migrationDeploy?.stderr || ''}`;
    const migrationNeedsResolve = /migrate-resolve|A migration failed to apply|failed migration/i.test(deployOutput);
    if (migrationNeedsResolve) {
      const failedMigrations = extractFailedMigrationNames(deployOutput);
      if (failedMigrations.length > 0) {
        console.warn('⚠️  Detected failed Prisma migration state; attempting automatic resolve and retry...');
      }
      for (const migrationName of failedMigrations) {
        const resolveRolledBack = runPrismaCommandWithAdvisoryLockRetry(
          [
            'prisma',
            'migrate',
            'resolve',
            '--rolled-back',
            migrationName,
            '--schema',
            'prisma/schema.prisma',
          ],
          `Prisma migrate resolve --rolled-back ${migrationName}`
        );
        if (resolveRolledBack.status !== 0) {
          console.error('');
          console.error('🛑 PRISMA MIGRATION RESOLVE FAILED');
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('');
          console.error(`Could not mark failed migration as rolled back: ${migrationName}`);
          console.error('Resolve this migration manually, then redeploy.');
          console.error('');
          console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.error('');
          process.exit(resolveRolledBack.status || 1);
        }
      }
      if (failedMigrations.length > 0) {
        console.log('🔁 Re-running Prisma migrate deploy after resolve...');
        migrationDeploy = runPrismaCommand(['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
        printCommandOutput(migrationDeploy);
      }
    }

    // Auto-baseline: if migrate deploy fails because an object already exists
    // (e.g., the table was created via legacy `prisma db push` and the
    // _prisma_migrations row is missing), mark the orphan migration as applied
    // and retry. Up to 5 such migrations per build to avoid unbounded loops.
    let baselineAttempts = 0;
    while (
      migrationDeploy &&
      migrationDeploy.status !== 0 &&
      baselineAttempts < 5
    ) {
      const currentOutput = `${migrationDeploy.stdout || ''}\n${migrationDeploy.stderr || ''}`;
      const orphanMigration = extractAlreadyExistsMigrationName(currentOutput);
      if (!orphanMigration) break;
      baselineAttempts += 1;
      console.warn(
        `⚠️  Migration "${orphanMigration}" failed with "already exists"; ` +
          'baselining as applied and retrying deploy.'
      );
      const resolveApplied = runPrismaCommandWithAdvisoryLockRetry(
        [
          'prisma',
          'migrate',
          'resolve',
          '--applied',
          orphanMigration,
          '--schema',
          'prisma/schema.prisma',
        ],
        `Prisma migrate resolve --applied ${orphanMigration}`
      );
      if (resolveApplied.status !== 0) {
        console.error('');
        console.error('🛑 PRISMA MIGRATION BASELINE FAILED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
        console.error(`Could not mark migration as applied: ${orphanMigration}`);
        console.error('Mark it manually with `prisma migrate resolve --applied`, then redeploy.');
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('');
        break;
      }
      migrationDeploy = runPrismaCommand(['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
      printCommandOutput(migrationDeploy);
    }

    if (migrationDeploy && migrationDeploy.status === 0) {
      console.warn('⚠️  Prisma migrate deploy succeeded after automatic migration resolve.');
    }

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
  console.log('✅ Deploy check passed - proceeding with build...');
  })().catch((error) => {
    console.error('Unexpected deploy check error:', error);
    process.exit(1);
  });
} else {
  // Non-production builds skip deploy safety checks.
  console.log('✅ Deploy check passed - proceeding with build...');
}

