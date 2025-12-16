import { PrismaClient } from '@prisma/client'
import { enforceDatabaseSecurity, logDatabaseInfo } from './db-security'

// CRITICAL: Validate database connection before creating Prisma client
// This prevents cross-database contamination
try {
  enforceDatabaseSecurity()
  logDatabaseInfo()
} catch (error) {
  // If security check fails, log and re-throw to prevent server startup
  console.error('🚨 Database security check failed during Prisma client initialization');
  throw error
}

const prismaClientSingleton = () => {
  // Validate again when creating the client (defense in depth)
  try {
    enforceDatabaseSecurity()
  } catch (error) {
    console.error('🚨 Database security check failed during Prisma client creation');
    throw error
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


