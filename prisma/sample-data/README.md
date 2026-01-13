# Operational Data - Mock Data Setup

This directory contains sample data files and scripts to populate your database with realistic operational data for UI development and testing.

## 🎯 Multi-Frequency Data Generation

The seed script now generates data at **THREE frequencies** for comprehensive chart support:

- **📅 Daily**: Last 90 days of data (fine-grained analysis)
- **📊 Weekly**: Last 16 weeks of data (trend analysis)
- **📈 Monthly**: Last 12 months of data (long-term patterns)

This enables your Operations page to display:
- **Daily charts** for short-term operational monitoring
- **Weekly charts** for mid-range trend analysis
- **Monthly charts** for strategic planning

## 📁 Sample Data Files

- **`customer-sales.json`** - 20 customers with revenue, invoice counts, and average invoice sizes
- **`ar-aging.json`** - Accounts Receivable aging buckets (0-30, 31-60, 61-90, 90+ days)
- **`ap-aging.json`** - Accounts Payable aging buckets
- **`product-sales.json`** - 12 products/services with sales, COGS, and margins
- **`inventory.json`** - 12 inventory items with quantities, values, and costs
- **Cash accounts** - 4 bank accounts generated automatically (Operating, Payroll, Savings, Credit Line)

## 🚀 Quick Start

### Step 1: Update Database Schema

First, push the new operational data models to your database:

```bash
npx prisma db push
```

This will create the new tables:
- `CustomerSalesSnapshot`
- `ARAgingSnapshot`
- `APAgingSnapshot`
- `ProductSalesSnapshot`
- `InventorySnapshot`

### Step 2: Run the Seed Script

```bash
npx ts-node prisma/seed-operational-data.ts
```

This will:
- ✅ Find your first company in the database
- ✅ Generate data at 3 frequencies: daily (90 days), weekly (16 weeks), monthly (12 months)
- ✅ Populate all 6 operational tables with sample data
- ✅ Create **5,000+ records** total across all frequencies

### Step 3: Verify Data

Check that data was created:

```bash
# Open Prisma Studio to browse the data
npx prisma studio
```

Or query directly:

```sql
-- Check customer sales
SELECT * FROM "CustomerSalesSnapshot" LIMIT 10;

-- Check AR aging
SELECT * FROM "ARAgingSnapshot" ORDER BY month DESC;

-- Check product sales
SELECT * FROM "ProductSalesSnapshot" LIMIT 10;
```

## 📊 What Data Gets Created

### Customer Sales (~2,360 records across all frequencies)
- **20 customers** tracked across daily, weekly, and monthly periods
- Top customer: **Tech Innovations Inc** (~$125k/month, ~$4k/day)
- Revenue range: $50 - $125,000 depending on frequency
- Total monthly revenue: ~$617,000 across all customers
- Invoice counts: Adjusted by frequency (1-15 per customer per period)

### AR Aging (~118 snapshots across all frequencies)
- Total AR: ~$120,000
- Distribution maintained across all frequencies:
  - Current (0-30 days): ~46% ($55k)
  - 31-60 days: ~29% ($35k)
  - 61-90 days: ~15% ($18k)
  - 90+ days: ~10% ($12k)
- Slight variance between periods for realistic trend analysis

### AP Aging (~118 snapshots across all frequencies)
- Total AP: ~$65,000
- Distribution:
  - Current (0-30 days): ~54% ($35k)
  - 31-60 days: ~28% ($18k)
  - 61-90 days: ~12% ($8k)
  - 90+ days: ~6% ($4k)

### Product Sales (~1,416 records across all frequencies)
- **12 products/services** tracked across all periods
- Top product: **Professional Services** (~$180k/month, ~$6k/day)
- Margin range: 20% - 80%
- Mix includes: Services, software licenses, hardware, materials
- Revenue scaled appropriately by frequency

### Inventory (~1,416 records across all frequencies)
- **12 inventory items** with gradual changes over time
- Total inventory value: ~$514,700
- Includes: Widgets, hardware devices, components, materials
- Quantities range: 120 - 8,000 units per item
- Lower variance than other metrics (inventory changes slowly)

### Cash (~472 records across all frequencies) **NEW!**
- **4 bank accounts** tracked:
  - Operating Account: ~$250k
  - Payroll Account: ~$150k
  - Savings Account: ~$500k
  - Credit Line: ~($50k) (negative balance)
- Total cash position: ~$850k
- Daily fluctuations for realistic cash flow tracking

## 🎨 Use Cases for UI Development

With this mock data, you can now build:

### 1. **Customer Concentration Dashboard**
```typescript
// Query top 10 customers by revenue
const topCustomers = await prisma.customerSalesSnapshot.groupBy({
  by: ['customerName'],
  where: { 
    companyId: companyId,
    month: { gte: startDate, lte: endDate }
  },
  _sum: { revenue: true },
  orderBy: { _sum: { revenue: 'desc' } },
  take: 10
});

// Calculate concentration risk
const totalRevenue = topCustomers.reduce((sum, c) => sum + (c._sum.revenue || 0), 0);
const top10Pct = (top10Revenue / totalRevenue) * 100;
```

### 2. **AR Aging Trend Chart**
```typescript
// Get 12 months of AR aging data
const arAging = await prisma.aRAgingSnapshot.findMany({
  where: { companyId: companyId },
  orderBy: { month: 'asc' },
  take: 12
});

// Chart shows trend of aging buckets over time
```

### 3. **Product Mix Analysis**
```typescript
// Get product sales for current month
const productSales = await prisma.productSalesSnapshot.findMany({
  where: { 
    companyId: companyId,
    month: currentMonth
  },
  orderBy: { revenue: 'desc' }
});

// Show pie chart of revenue by product
// Show top performers by margin %
```

### 4. **Inventory Tracking**
```typescript
// Get current inventory levels
const inventory = await prisma.inventorySnapshot.findMany({
  where: { 
    companyId: companyId,
    month: currentMonth
  },
  orderBy: { assetValue: 'desc' }
});

// Calculate inventory turnover
// Show which items are moving vs stagnant
```

### 5. **DSO/DPO Calculations**
```typescript
// Calculate Days Sales Outstanding from AR Aging
const latestAR = await prisma.aRAgingSnapshot.findFirst({
  where: { companyId: companyId },
  orderBy: { month: 'desc' }
});

const weightedDSO = (
  (latestAR.current * 15) +      // avg 15 days
  (latestAR.days1to30 * 45) +    // avg 45 days
  (latestAR.days31to60 * 75) +   // avg 75 days
  (latestAR.days61to90 * 105) +  // avg 105 days
  (latestAR.days90plus * 135)    // avg 135 days
) / latestAR.totalAR;
```

## 🔄 Re-running the Seed

If you need to regenerate data:

```bash
# Clear and reseed
npx ts-node prisma/seed-operational-data.ts
```

The script automatically:
- ✅ Clears existing operational data for the company
- ✅ Regenerates 12 months of fresh data
- ✅ Adds random variance so each run is slightly different

## 🎯 Next Steps

1. ✅ **Build UI components** with this mock data
2. ✅ **Create API routes** to fetch the data
3. ✅ **Add charts and visualizations**
4. 🔄 **Later**: Connect to real QuickBooks API

## 📝 Notes

- Data has **realistic variance** month-to-month (±20% for sales, ±10% for inventory)
- All numbers are **self-consistent**:
  - Customer sales totals match expected revenue
  - AR aging buckets sum to total AR
  - Inventory values = quantity × avg cost
- Data is for **one company** only - update the script if you need multi-company test data

## 🐛 Troubleshooting

### Error: "No companies found"
```bash
# Create a test company first
npx prisma studio
# Add a company via the UI
```

### Error: "Table does not exist"
```bash
# Run schema update first
npx prisma db push
```

### Want different data?
- Edit the JSON files in `prisma/sample-data/`
- Adjust the variance factors in `seed-operational-data.ts`
- Run the seed script again

---

**Ready to build!** 🎉

You now have 12 months of realistic operational data to develop your dashboards and reports.









