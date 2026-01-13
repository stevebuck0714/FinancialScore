# Database Security & Isolation

## Overview

This application uses two separate databases that must **NEVER** interact with each other:

- **Production**: `orange-poetry` (PRODUCTION database)
- **Staging**: `cold-frost` (STAGING database)

## Critical Rules

1. **Production (orange-poetry)**:
   - ✅ ONLY accessible on **Vercel production runtime**: `VERCEL=1` and `VERCEL_ENV=production`
   - ❌ NEVER accessible from local dev, preview, or any non-Vercel runtime (even if `NODE_ENV=production`)
   - ❌ NEVER reads from or writes to `cold-frost`

2. **Staging (cold-frost)**:
   - ✅ Accessible in local dev and in Vercel preview/development (and may be used by non-prod projects even on a Vercel production deployment)
   - ❌ NEVER reads from or writes to `orange-poetry`

## Security Safeguards

### 1. Server Startup (`server.js`)
- Validates `DATABASE_URL` on server startup
- **ABORTS** if production database (`orange-poetry`) is detected outside Vercel production runtime

### 2. Prisma Client (`lib/prisma.ts`)
- Validates database connection when Prisma client is created
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
   DATABASE_URL="...orange-poetry..." npm run dev
   # Should exit with security error
   ```

2. **Test Production allowed on Vercel production runtime** (should pass ONLY on Vercel):
   ```bash
   # On Vercel only:
   # VERCEL=1 VERCEL_ENV=production DATABASE_URL="...orange-poetry..." npm run build
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

