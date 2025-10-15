# Benchmark Data Setup

This application requires industry benchmark data to function properly. The benchmark data contains financial ratios and metrics for over 600 industry sectors.

## Files Included

- `benchmark-data.zip` - Compressed SQL script with all 523,180 benchmark records (11MB)
- `scripts/import-benchmarks.ts` - Alternative import script for ZIP files

## Setup Options

### Option 1: ZIP File Import (Recommended)
Extract the ZIP file and run the seed script:

```bash
# Extract the ZIP file first
unzip benchmark-data.zip

# Then run the seed script
npm run db:seed
```

### Option 2: Manual SQL Import
After extracting the ZIP file:

```bash
# For SQLite (development)
sqlite3 prisma/dev.db < benchmark-data.sql

# For PostgreSQL (production)
psql -d your_database -f benchmark-data.sql
```

### Option 3: Original ZIP Files
If you have the original ZIP files from the downloads:

```bash
node scripts/import-benchmarks.ts
```

## Verification

After importing, verify the data:

```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.industryBenchmark.count().then(count => {
  console.log('Benchmark records:', count);
  prisma.\$disconnect();
});
"
```

You should see: `Benchmark records: 523180`

## Data Structure

The benchmark data includes:
- **667 unique industries** (NAICS codes)
- **Financial ratios** like Current Ratio, Quick Ratio, Debt to Equity
- **Performance metrics** like ROE, EBITDA Margin, Inventory Turnover
- **Asset size categories** for different company sizes

## Troubleshooting

If benchmark data is missing:
1. Extract `benchmark-data.zip` to get `benchmark-data.sql`
2. Ensure the database is properly set up with migrations
3. Try running the seed script again
4. Check database permissions

## Production Deployment

For production deployments (Vercel, etc.):
1. The benchmark data will be imported during the build process
2. Ensure your production database can handle 500K+ records
3. Consider using a managed database service for better performance
