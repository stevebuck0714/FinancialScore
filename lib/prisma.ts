import { PrismaClient } from '@prisma/client'
import { enforceDatabaseSecurity, logDatabaseInfo } from './db-security'

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined'
}

function readDatabaseUrl(): string {
  return String(process.env['DATABASE_URL'] || '').trim()
}

// Helper to check if we're in build phase
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' ||
         process.env.NEXT_PHASE === 'phase-development-build' ||
         process.env.NEXT_PHASE === 'phase-export' ||
         process.env.NEXT_PHASE === 'phase-production-server' ||
         // Also check for Vercel build environment
         (process.env.VERCEL === '1' && !process.env.VERCEL_ENV);
}

function ensureNodePrismaRuntime() {
  if (typeof process === 'undefined' || process.release?.name !== 'node') return
  // Prisma 6 treats an object EdgeRuntime as Accelerate/edge-light and then
  // requires prisma:// URLs (P6001). The Node server must stay on the query engine.
  if (typeof (globalThis as any).EdgeRuntime === 'object') {
    try {
      delete (globalThis as any).EdgeRuntime
    } catch {
      (globalThis as any).EdgeRuntime = undefined
    }
  }
}

function shouldValidateDatabase(): boolean {
  return !isBuildPhase() && !isBrowserRuntime() && Boolean(readDatabaseUrl())
}

// CRITICAL: Validate database connection before creating Prisma client
// This prevents cross-database contamination
// Skip during build phase, in the browser, and when env is not loaded yet
if (shouldValidateDatabase()) {
  try {
    enforceDatabaseSecurity()
    logDatabaseInfo()
  } catch (error) {
    // If security check fails, log and re-throw to prevent server startup
    console.error('🚨 Database security check failed during Prisma client initialization');
    throw error
  }
}

const prismaClientSingleton = () => {
  ensureNodePrismaRuntime()

  if (shouldValidateDatabase()) {
    try {
      enforceDatabaseSecurity()
    } catch (error) {
      console.error('🚨 Database security check failed during Prisma client creation');
      throw error
    }
  }

  const url = readDatabaseUrl()
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Export a helper function to validate before critical operations
// Call this in API routes before sensitive database operations
export function validateDatabaseBeforeOperation() {
  if (!shouldValidateDatabase()) return
  try {
    enforceDatabaseSecurity()
  } catch (error) {
    console.error('🚨 Database security violation detected during operation');
    throw error
  }
}

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
