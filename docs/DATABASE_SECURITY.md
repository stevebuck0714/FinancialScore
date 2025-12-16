# Database Security & Isolation

## Overview

This application uses two separate databases that must **NEVER** interact with each other:

- **Production**: `orange-poetry` (PRODUCTION database)
- **Staging**: `cold-frost` (STAGING database)

## Critical Rules

1. **Production (orange-poetry)**:
   - ✅ ONLY accessible in `VERCEL_ENV=production` or `NODE_ENV=production`
   - ❌ NEVER accessible in development, preview, or staging environments
   - ❌ NEVER reads from or writes to `cold-frost`

2. **Staging (cold-frost)**:
   - ✅ ONLY accessible in `VERCEL_ENV=preview`, `VERCEL_ENV=staging`, or `NODE_ENV=development`
   - ❌ NEVER accessible in production environment
   - ❌ NEVER reads from or writes to `orange-poetry`

## Security Safeguards

### 1. Server Startup (`server.js`)
- Validates `DATABASE_URL` on server startup
- **ABORTS** if production database detected in non-production environment
- **ABORTS** if staging database detected in production environment

### 2. Prisma Client (`lib/prisma.ts`)
- Validates database connection when Prisma client is created
- Validates on every raw SQL query (`$queryRaw`, `$executeRaw`, `$executeRawUnsafe`)
- **THROWS ERROR** if database connection violates security rules

### 3. Database Security Utility (`lib/db-security.ts`)
- `validateDatabaseConnection()`: Checks current database and environment
- `enforceDatabaseSecurity()`: Throws error if connection is not allowed
- `logDatabaseInfo()`: Safely logs database information

### 4. API Route Validation (`app/api/check-db/route.ts`)
- Validates database connection before any database operations
- Returns 403 (Forbidden) if security violation detected

## Environment Variables

The `DATABASE_URL` environment variable determines which database is used:

- Production: `postgresql://...@ep-orange-poetry-...neon.tech/...`
- Staging: `postgresql://...@ep-cold-frost-...neon.tech/...`

## What Happens on Violation

If a security violation is detected:

1. **Server Startup**: Process exits with code 1 (prevents server from starting)
2. **Runtime**: Error is thrown, preventing database operations
3. **API Routes**: Returns 403 Forbidden status

## Testing

To verify safeguards are working:

1. **Test Production in Dev** (should fail):
   ```bash
   DATABASE_URL="...orange-poetry..." NODE_ENV=development npm run dev
   # Should exit with security error
   ```

2. **Test Staging in Production** (should fail):
   ```bash
   DATABASE_URL="...cold-frost..." VERCEL_ENV=production npm run build
   # Should exit with security error
   ```

## Maintenance

- **NEVER** create scripts that sync data between databases
- **NEVER** create migration scripts that touch both databases
- **ALWAYS** validate database connection before any database operation
- **ALWAYS** use `enforceDatabaseSecurity()` in new database-related code

## Files with Security Checks

- `server.js` - Server startup validation
- `lib/prisma.ts` - Prisma client validation
- `lib/db-security.ts` - Security utility functions
- `app/api/check-db/route.ts` - API route validation

