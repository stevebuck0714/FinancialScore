# PostgreSQL Migration Guide
## From SQLite to Neon PostgreSQL

This guide will help you migrate your FinancialScore application from SQLite to Neon PostgreSQL.

---

## Prerequisites

✅ Neon account created at https://neon.tech  
✅ PostgreSQL connection string from Neon

---

## Step-by-Step Migration Process

### Step 1: Export Benchmark Data from SQLite

```bash
node migrate-to-postgresql.js
```

This will create:
- `benchmark-export.json` - JSON backup of all benchmarks
- `benchmark-import.sql` - SQL statements for import (backup)

---

### Step 2: Create `.env` File with Neon Connection

Create a `.env` file in the project root:

```env
# PostgreSQL Database (Neon)
DATABASE_URL="postgresql://username:password@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require"

# Next Auth (keep existing or generate new)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# QuickBooks (keep existing)
QUICKBOOKS_CLIENT_ID="your-existing-id"
QUICKBOOKS_CLIENT_SECRET="your-existing-secret"
QUICKBOOKS_REDIRECT_URI="http://localhost:3000/api/quickbooks/callback"
QUICKBOOKS_ENVIRONMENT="sandbox"

# OpenAI (keep existing)
OPENAI_API_KEY="your-existing-key"
```

**Replace the DATABASE_URL with your Neon connection string!**

---

### Step 3: Update Prisma Schema for PostgreSQL

The schema will be updated automatically. Key changes:
- `provider = "sqlite"` → `provider = "postgresql"`
- `String @id @default(cuid())` remains the same
- `DateTime @default(now())` remains the same
- JSON fields work natively in PostgreSQL

---

### Step 4: Generate Prisma Client for PostgreSQL

```bash
npx prisma generate
```

---

### Step 5: Push Schema to PostgreSQL (Create Tables)

```bash
npx prisma db push
```

This creates all tables in your Neon PostgreSQL database.

---

### Step 6: Import Benchmark Data

```bash
node import-to-postgresql.js
```

This imports all your benchmark data into PostgreSQL.

---

### Step 7: Verify Migration

```bash
node check-benchmark-data.js
```

Should show all your benchmarks are now in PostgreSQL!

---

### Step 8: Test the Application

```bash
npm run dev
```

Visit http://localhost:3000 and test:
- ✅ Login works
- ✅ Company data loads
- ✅ Financial data displays
- ✅ Benchmarks show in comparisons
- ✅ Goals save/load correctly
- ✅ Trend Analysis works

---

### Step 9: Update Git (Optional - Keep SQLite as Backup)

You can keep `prisma/dev.db` in git as a backup, or remove it:

```bash
# Add .env to .gitignore (if not already)
echo ".env" >> .gitignore

# Commit the schema change
git add prisma/schema.prisma
git commit -m "Migrate to PostgreSQL (Neon)"
git push origin master
```

---

## Rollback Plan

If anything goes wrong:

1. **Restore `.env`** - Remove or rename it
2. **Restore Prisma Schema** - Run: `git checkout prisma/schema.prisma`
3. **Regenerate Client** - Run: `npx prisma generate`
4. **Restart Dev Server** - Run: `npm run dev`

Your SQLite database (`prisma/dev.db`) is unchanged and still has all data!

---

## Production Deployment (Vercel)

Once migration is successful locally:

1. Create a **production Neon database** (separate from dev)
2. Get production connection string
3. In Vercel project settings → Environment Variables:
   - Add `DATABASE_URL` with production Neon connection
4. Deploy to Vercel
5. Run migrations: Vercel will auto-run `prisma generate` on deploy
6. Import benchmarks to production:
   - Option A: Run `import-to-postgresql.js` locally with production DATABASE_URL
   - Option B: Use Vercel CLI: `vercel env pull .env.production.local` then run script

---

## Benefits After Migration

✅ **Better Concurrency** - Multiple users, no database locking  
✅ **Vercel Ready** - Perfect for production deployment  
✅ **Better Performance** - Optimized for web applications  
✅ **Backups** - Neon provides automatic backups  
✅ **Scalability** - Easily handle more users and data  

---

## Need Help?

If you encounter any issues:
1. Check the error message carefully
2. Verify your Neon connection string is correct in `.env`
3. Make sure you ran all steps in order
4. You can always rollback to SQLite (see Rollback Plan above)

