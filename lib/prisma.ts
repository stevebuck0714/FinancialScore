import { PrismaClient } from '@prisma/client'
import { enforceDatabaseSecurity, logDatabaseInfo } from './db-security'

// Helper to check if we're in build phase
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' || 
         process.env.NEXT_PHASE === 'phase-development-build' ||
         process.env.NEXT_PHASE === 'phase-export' ||
         process.env.NEXT_PHASE === 'phase-production-server' ||
         // Also check for Vercel build environment
         (process.env.VERCEL === '1' && !process.env.VERCEL_ENV);
}

// CRITICAL: Validate database connection before creating Prisma client
// This prevents cross-database contamination
// Skip during build phase - security check will run at runtime
if (!isBuildPhase()) {
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
  // Validate again when creating the client (defense in depth)
  // Skip during build phase
  if (!isBuildPhase()) {
    try {
      enforceDatabaseSecurity()
    } catch (error) {
      console.error('🚨 Database security check failed during Prisma client creation');
      throw error
    }
  }
  
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Export a helper function to validate before critical operations
// Call this in API routes before sensitive database operations
export function validateDatabaseBeforeOperation() {
  try {
    enforceDatabaseSecurity()
  } catch (error) {
    console.error('🚨 Database security violation detected during operation');
    throw error
  }
}

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma


