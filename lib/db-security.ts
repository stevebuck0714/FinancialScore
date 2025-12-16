/**
 * Database Security Utilities
 * 
 * CRITICAL: These functions prevent cross-database contamination between:
 * - Production: orange-poetry (PRODUCTION)
 * - Staging: cold-frost (STAGING)
 * 
 * These safeguards ensure:
 * 1. Production (orange-poetry) NEVER connects to staging (cold-frost)
 * 2. Staging (cold-frost) NEVER connects to production (orange-poetry)
 * 3. No data sync/replication between databases
 */

export interface DatabaseInfo {
  isProduction: boolean;
  isStaging: boolean;
  databaseName: string;
  label: string;
  isAllowed: boolean;
}

/**
 * Validates the current DATABASE_URL and returns database information
 * This should be called before any database operations
 */
export function validateDatabaseConnection(): DatabaseInfo {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  const isProduction = databaseUrl.includes('orange-poetry');
  const isStaging = databaseUrl.includes('cold-frost');
  
  let databaseName = 'unknown';
  let label = 'UNKNOWN';
  let isAllowed = false;
  
  if (isProduction) {
    databaseName = 'orange-poetry';
    label = 'PRODUCTION (orange-poetry)';
    // Production is only allowed in production environment
    isAllowed = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  } else if (isStaging) {
    databaseName = 'cold-frost';
    label = 'STAGING (cold-frost)';
    // Staging is allowed in development, preview, and staging environments
    isAllowed = process.env.NODE_ENV === 'development' || 
                process.env.VERCEL_ENV === 'preview' || 
                process.env.VERCEL_ENV === 'staging' ||
                process.env.VERCEL_ENV === 'development';
  } else if (databaseUrl.includes('file:') || databaseUrl.includes('sqlite')) {
    databaseName = 'sqlite';
    label = 'SQLITE (local file)';
    isAllowed = true; // SQLite is always allowed for local development
  } else if (databaseUrl.includes('neon.tech')) {
    // Generic neon.tech connection - validate by checking the endpoint name
    if (databaseUrl.includes('orange-poetry')) {
      databaseName = 'orange-poetry';
      label = 'PRODUCTION (orange-poetry)';
      isAllowed = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    } else if (databaseUrl.includes('cold-frost')) {
      databaseName = 'cold-frost';
      label = 'STAGING (cold-frost)';
      isAllowed = process.env.NODE_ENV === 'development' || 
                  process.env.VERCEL_ENV === 'preview' || 
                  process.env.VERCEL_ENV === 'staging';
    } else {
      databaseName = 'neon-unknown';
      label = 'UNKNOWN NEON DATABASE';
      isAllowed = false; // Unknown neon database - not allowed
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
  const dbInfo = validateDatabaseConnection();
  
  if (!dbInfo.isAllowed) {
    const error = new Error(
      `🚨 SECURITY VIOLATION: Database connection not allowed!\n` +
      `   Database: ${dbInfo.label}\n` +
      `   NODE_ENV: ${process.env.NODE_ENV}\n` +
      `   VERCEL_ENV: ${process.env.VERCEL_ENV}\n` +
      `   This connection violates database isolation rules.\n` +
      `   Production (orange-poetry) must only be used in production.\n` +
      `   Staging (cold-frost) must only be used in development/preview/staging.`
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
    throw error;
  }
  
  // Additional cross-contamination checks
  if (dbInfo.isProduction && (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview')) {
    const error = new Error(
      `🚨 CRITICAL SECURITY ERROR: Production database (orange-poetry) detected in non-production environment!\n` +
      `   This would allow staging code to modify production data!\n` +
      `   Aborting to prevent data corruption.`
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
    throw error;
  }
  
  if (dbInfo.isStaging && process.env.VERCEL_ENV === 'production') {
    const error = new Error(
      `🚨 CRITICAL SECURITY ERROR: Staging database (cold-frost) detected in production environment!\n` +
      `   Production must use orange-poetry, not cold-frost!\n` +
      `   Aborting to prevent using wrong database.`
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 80) + '...');
    throw error;
  }
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

