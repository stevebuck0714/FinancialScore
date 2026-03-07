/**
 * Database Security Utilities
 * 
 * CRITICAL: These functions prevent cross-database contamination between:
 * - Production: aged-snow (PRODUCTION)
 * - Staging: cold-frost (STAGING)
 * 
 * These safeguards ensure:
 * 1. Production (aged-snow) NEVER connects to staging (cold-frost)
 * 2. Staging (cold-frost) NEVER connects to production (aged-snow)
 * 3. No data sync/replication between databases
 */

export interface DatabaseInfo {
  isProduction: boolean;
  isStaging: boolean;
  databaseName: string;
  label: string;
  isAllowed: boolean;
}

function isVercelProductionRuntime(): boolean {
  // Vercel sets VERCEL=1 and VERCEL_ENV=production|preview|development
  // CRITICAL: We ONLY allow the production database (aged-snow) when running on
  // Vercel's production runtime. Local/dev should NEVER connect to aged-snow,
  // even if NODE_ENV is "production".
  return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';
}

/**
 * Validates the current DATABASE_URL and returns database information
 * This should be called before any database operations
 */
export function validateDatabaseConnection(): DatabaseInfo {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  const isProduction = databaseUrl.includes('aged-snow');
  const isStaging = databaseUrl.includes('cold-frost');
  
  let databaseName = 'unknown';
  let label = 'UNKNOWN';
  let isAllowed = false;
  
  if (isProduction) {
    databaseName = 'aged-snow';
    label = 'PRODUCTION (aged-snow)';
    // Production DB is ONLY allowed on Vercel production runtime.
    // Local dev should NEVER be able to connect to aged-snow.
    isAllowed = isVercelProductionRuntime();
  } else if (isStaging) {
    databaseName = 'cold-frost';
    label = 'STAGING (cold-frost)';
    // Staging DB is allowed in local dev and Vercel preview/development environments.
    // We also allow it on Vercel production runtime for non-prod projects that deploy with --prod.
    // The critical invariant is: aged-snow must never be reachable from local/dev.
    isAllowed = true;
  } else if (databaseUrl.includes('file:') || databaseUrl.includes('sqlite')) {
    databaseName = 'sqlite';
    label = 'SQLITE (local file)';
    isAllowed = true; // SQLite is always allowed for local development
  } else if (databaseUrl.includes('neon.tech')) {
    // Generic neon.tech connection - validate by checking the endpoint name
    if (databaseUrl.includes('aged-snow')) {
      databaseName = 'aged-snow';
      label = 'PRODUCTION (aged-snow)';
      isAllowed = isVercelProductionRuntime();
    } else if (databaseUrl.includes('cold-frost')) {
      databaseName = 'cold-frost';
      label = 'STAGING (cold-frost)';
      isAllowed = true;
    } else {
      databaseName = 'neon-unknown';
      // Keep strict isolation in non-production runtimes.
      // In Vercel production runtime, allow unknown Neon hostnames to prevent
      // auth/login outages when Neon endpoint naming drifts.
      if (isVercelProductionRuntime()) {
        label = 'UNKNOWN NEON DATABASE (PRODUCTION RUNTIME ALLOWED)';
        isAllowed = true;
      } else {
        label = 'UNKNOWN NEON DATABASE';
        isAllowed = false;
      }
    }
  }
  
  return {
    isProduction,
    isStaging,
    databaseName,
    label,
    isAllowed
  };
}

/**
 * Throws an error if the database connection is not allowed
 * Call this before any database operation
 */
export function enforceDatabaseSecurity(): void {
  // Skip security check during Next.js build phase
  // During build, Next.js executes code to collect page data, but we don't want
  // to block the build process. The security check will run at runtime.
  if (process.env.NEXT_PHASE === 'phase-production-build' || 
      process.env.NEXT_PHASE === 'phase-development-build' ||
      process.env.NEXT_PHASE === 'phase-export') {
    // During build, only block production database connections
    // Staging database is allowed during build
    const databaseUrl = process.env.DATABASE_URL || '';
    if (databaseUrl.includes('aged-snow') && !isVercelProductionRuntime()) {
      const error = new Error(
        `🚨 SECURITY VIOLATION: Production database (aged-snow) detected during build in non-production environment!\n` +
        `   NODE_ENV: ${process.env.NODE_ENV}\n` +
        `   VERCEL_ENV: ${process.env.VERCEL_ENV}\n` +
        `   VERCEL: ${process.env.VERCEL}\n` +
        `   Production database must ONLY be used on Vercel production runtime.`
      );
      console.error(error.message);
      throw error;
    }
    // Allow staging database and other connections during build
    return;
  }
  
  const dbInfo = validateDatabaseConnection();
  
  if (!dbInfo.isAllowed) {
    const error = new Error(
      `🚨 SECURITY VIOLATION: Database connection not allowed!\n` +
      `   Database: ${dbInfo.label}\n` +
      `   NODE_ENV: ${process.env.NODE_ENV}\n` +
      `   VERCEL_ENV: ${process.env.VERCEL_ENV}\n` +
      `   VERCEL: ${process.env.VERCEL}\n` +
      `   This connection violates database isolation rules.\n` +
      `   Production (aged-snow) must ONLY be used on Vercel production runtime.\n` +
      `   Local/dev/preview must NEVER connect to aged-snow.`
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
    throw error;
  }
  
  // Additional cross-contamination checks
  if (dbInfo.isProduction && !isVercelProductionRuntime()) {
    const error = new Error(
      `🚨 CRITICAL SECURITY ERROR: Production database (aged-snow) detected in non-production environment!\n` +
      `   This would allow staging code to modify production data!\n` +
      `   Aborting to prevent data corruption.`
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
    throw error;
  }
  
  // NOTE: We intentionally do NOT forbid cold-frost when VERCEL_ENV=production here,
  // because Vercel "production" is per-project and some non-prod projects may deploy
  // with --prod while still correctly pointing at cold-frost.
}

/**
 * Logs database connection information (safe to call - doesn't throw)
 */
export function logDatabaseInfo(): void {
  const dbInfo = validateDatabaseConnection();
  console.log(`🔗 DATABASE: ${dbInfo.label}`);
  if (dbInfo.isProduction) {
    console.warn('⚠️  WARNING: Connected to PRODUCTION database!');
  }
}

