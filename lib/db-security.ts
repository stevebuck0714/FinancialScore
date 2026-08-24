/**
 * Database Security Utilities
 *
 * CRITICAL: These functions prevent cross-database contamination between:
 * - Production: configured via PRODUCTION_DB_PROJECTS (default: aged-snow,orange-poetry)
 * - Staging: configured via STAGING_DB_PROJECTS (default: cold-frost)
 * - Dev: configured via DEV_DB_PROJECTS (default: cool-dream)
 *
 * These safeguards ensure:
 * 1. Production databases NEVER connect to staging databases
 * 2. Staging databases NEVER connect to production databases
 * 3. No data sync/replication between databases
 */

export interface DatabaseInfo {
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  databaseName: string;
  label: string;
  isAllowed: boolean;
  productionProjects: string[];
  stagingProjects: string[];
  developmentProjects: string[];
}

function getProjectList(envValue: string | undefined, fallback: string[]): string[] {
  const raw = ((envValue && envValue.trim()) || fallback.join(',')).split(',');
  return raw.map((value) => value.trim()).filter(Boolean);
}

function findProject(databaseUrl: string, projects: string[]): string | null {
  return projects.find((project) => databaseUrl.includes(project)) ?? null;
}

function getDatabaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).host;
  } catch (error) {
    return 'unknown';
  }
}

function isVercelProductionRuntime(): boolean {
  // Vercel sets VERCEL=1 and VERCEL_ENV=production|preview|development
  // CRITICAL: We ONLY allow production databases when running on
  // Vercel production runtime. Local/dev should NEVER connect to production.
  return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';
}

function isRenderProductionRuntime(): boolean {
  // Render automatically sets RENDER=true and RENDER_SERVICE_ID on every
  // managed service (web, worker, cron). Both must be present, and the
  // operator must explicitly opt-in via RENDER_ALLOW_PRODUCTION_DB=true so
  // that an accidental `RENDER=true` in a local shell can never reach prod.
  return (
    process.env.RENDER === 'true' &&
    !!process.env.RENDER_SERVICE_ID &&
    process.env.RENDER_ALLOW_PRODUCTION_DB === 'true'
  );
}

function isAllowedProductionRuntime(): boolean {
  return isVercelProductionRuntime() || isRenderProductionRuntime();
}

/**
 * Validates the current DATABASE_URL and returns database information
 * This should be called before any database operations
 */
export function validateDatabaseConnection(): DatabaseInfo {
  const databaseUrl = process.env.DATABASE_URL || '';

  const productionProjects = getProjectList(process.env.PRODUCTION_DB_PROJECTS, ['orange-poetry', 'aged-snow']);
  const stagingProjects = getProjectList(process.env.STAGING_DB_PROJECTS, ['cold-frost']);
  const developmentProjects = getProjectList(process.env.DEV_DB_PROJECTS, ['cool-dream']);

  const productionMatch = findProject(databaseUrl, productionProjects);
  const stagingMatch = findProject(databaseUrl, stagingProjects);
  const developmentMatch = findProject(databaseUrl, developmentProjects);

  const isProduction = !!productionMatch;
  const isStaging = !!stagingMatch;
  const isDevelopment = !!developmentMatch;

  let databaseName = 'unknown';
  let label = 'UNKNOWN';
  let isAllowed = false;

  if (isProduction) {
    databaseName = productionMatch || 'production';
    label = `PRODUCTION (${databaseName})`;
    // Production DBs are ONLY allowed on approved production runtimes
    // (Vercel production or an opted-in Render service).
    // Local dev should NEVER be able to connect to production databases.
    isAllowed = isAllowedProductionRuntime();
  } else if (isDevelopment) {
    databaseName = developmentMatch || 'development';
    label = `DEV (${databaseName})`;
    isAllowed = true;
  } else if (isStaging) {
    databaseName = stagingMatch || 'staging';
    label = `STAGING (${databaseName})`;
    // Staging DB is allowed in local dev and Vercel preview/development environments.
    // We also allow it on Vercel production runtime for non-prod projects that deploy with --prod.
    // The critical invariant is: production databases must never be reachable from local/dev.
    isAllowed = true;
  } else if (databaseUrl.includes('file:') || databaseUrl.includes('sqlite')) {
    databaseName = 'sqlite';
    label = 'SQLITE (local file)';
    isAllowed = true; // SQLite is always allowed for local development
  } else if (databaseUrl.includes('neon.tech')) {
    // Non-production Neon projects (cool-dream, and any other non-prod host)
    // are valid local/dev databases. Production Neon is already classified
    // and blocked above via PRODUCTION_DB_PROJECTS.
    const host = getDatabaseHost(databaseUrl);
    databaseName = host;
    label = `NEON (${host})`;
    isAllowed = true;
  }

  return {
    isProduction,
    isStaging,
    isDevelopment,
    databaseName,
    label,
    isAllowed,
    productionProjects,
    stagingProjects,
    developmentProjects,
  };
}

export function isProductionSite(): boolean {
  try {
    return validateDatabaseConnection().isProduction;
  } catch {
    return false;
  }
}

/**
 * Throws an error if the database connection is not allowed
 * Call this before any database operation
 */
export function enforceDatabaseSecurity(): void {
  // Skip security check during Next.js build phase
  // During build, Next.js executes code to collect page data, but we don't want
  // to block the build process. The security check will run at runtime.
  if (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-development-build' ||
    process.env.NEXT_PHASE === 'phase-export'
  ) {
    // During build, only block production database connections
    // Staging database is allowed during build
    const databaseUrl = process.env.DATABASE_URL || '';
    const productionProjects = getProjectList(process.env.PRODUCTION_DB_PROJECTS, ['orange-poetry', 'aged-snow']);
    if (findProject(databaseUrl, productionProjects) && !isAllowedProductionRuntime()) {
      const error = new Error(
        `🚨 SECURITY VIOLATION: Production database detected during build in non-production environment!\n` +
          `   NODE_ENV: ${process.env.NODE_ENV}\n` +
          `   VERCEL_ENV: ${process.env.VERCEL_ENV}\n` +
          `   VERCEL: ${process.env.VERCEL}\n` +
          `   RENDER: ${process.env.RENDER}\n` +
          `   RENDER_SERVICE_ID: ${process.env.RENDER_SERVICE_ID}\n` +
          `   Production databases must ONLY be used on approved production runtimes (Vercel or opted-in Render).`,
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
        `   Database host: ${getDatabaseHost(process.env.DATABASE_URL || '')}\n` +
        `   NODE_ENV: ${process.env.NODE_ENV}\n` +
        `   VERCEL_ENV: ${process.env.VERCEL_ENV}\n` +
        `   VERCEL: ${process.env.VERCEL}\n` +
        `   RENDER: ${process.env.RENDER}\n` +
        `   RENDER_SERVICE_ID: ${process.env.RENDER_SERVICE_ID}\n` +
        `   RENDER_ALLOW_PRODUCTION_DB: ${process.env.RENDER_ALLOW_PRODUCTION_DB}\n` +
        `   Allowed production projects: ${dbInfo.productionProjects.join(', ') || '(none)'}\n` +
        `   Allowed staging projects: ${dbInfo.stagingProjects.join(', ') || '(none)'}\n` +
        `   Allowed development projects: ${dbInfo.developmentProjects.join(', ') || '(none)'}\n` +
        `   This connection violates database isolation rules.\n` +
        `   Production databases must ONLY be used on approved production runtimes (Vercel or opted-in Render).\n` +
        `   Local/dev/preview must NEVER connect to production databases.`,
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL host:', getDatabaseHost(process.env.DATABASE_URL || ''));
    throw error;
  }

  // Additional cross-contamination checks
  if (dbInfo.isProduction && !isAllowedProductionRuntime()) {
    const error = new Error(
      `🚨 CRITICAL SECURITY ERROR: Production database detected in non-production environment!\n` +
        `   This would allow staging code to modify production data!\n` +
        `   Aborting to prevent data corruption.`,
    );
    console.error(error.message);
    console.error('🚨 DATABASE_URL host:', getDatabaseHost(process.env.DATABASE_URL || ''));
    throw error;
  }

  // NOTE: We intentionally do NOT forbid staging databases when VERCEL_ENV=production here,
  // because Vercel "production" is per-project and some non-prod projects may deploy
  // with --prod while still correctly pointing at staging databases.
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
