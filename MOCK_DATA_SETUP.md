# 🎯 Mock Data Setup - Quick Start Guide

## What Was Created

I've set up everything you need to start building UI with realistic operational data:

### ✅ New Database Tables (5)
- `CustomerSalesSnapshot` - Customer revenue breakdown
- `ARAgingSnapshot` - Accounts Receivable aging
- `APAgingSnapshot` - Accounts Payable aging  
- `ProductSalesSnapshot` - Product/service sales mix
- `InventorySnapshot` - Inventory levels & values

### ✅ Sample Data Files (5)
- `prisma/sample-data/customer-sales.json` - 20 customers
- `prisma/sample-data/ar-aging.json` - AR aging buckets
- `prisma/sample-data/ap-aging.json` - AP aging buckets
- `prisma/sample-data/product-sales.json` - 12 products
- `prisma/sample-data/inventory.json` - 12 inventory items

### ✅ Seed Script
- `prisma/seed-operational-data.ts` - Generates 12 months of data

---

## 🚀 How to Run (3 Simple Steps)

### Step 1: Update Your Database Schema
```bash
npx prisma db push
```
This creates the 5 new tables. Takes ~10 seconds.

### Step 2: Generate Prisma Client
```bash
npx prisma generate
```
This updates TypeScript types for the new tables.

### Step 3: Seed the Data
```bash
npm run db:seed:operational
```
This populates your database with 12 months of realistic test data.

**That's it!** ✅

---

## 📊 What Data You'll Have

After running the seed:

| Data Type | Records Created | Details |
|-----------|----------------|---------|
| Customer Sales | 240 | 20 customers × 12 months |
| AR Aging | 12 | Monthly snapshots |
| AP Aging | 12 | Monthly snapshots |
| Product Sales | 144 | 12 products × 12 months |
| Inventory | 144 | 12 items × 12 months |

**Total: ~552 records of operational data**

### Sample Numbers:
- **Total Monthly Revenue**: ~$617k (across 20 customers)
- **Top Customer**: Tech Innovations Inc (~$125k/month)
- **Customer Concentration**: Top 5 customers = ~66% of revenue
- **Total AR**: ~$120k (46% current, 29% 1-30 days, 25% older)
- **Total AP**: ~$65k (54% current, 28% 1-30 days, 18% older)
- **Inventory Value**: ~$515k

---

## 🎨 What You Can Build Now

### 1. Customer Concentration Dashboard
- Top 10 customers chart
- Revenue concentration risk metric
- Customer trend analysis

### 2. AR Aging Analysis
- Aging bucket breakdown (pie chart)
- Trend over 12 months (line chart)
- DSO calculation (weighted average)
- Late payment alerts

### 3. Product Mix Analysis
- Sales by product/service (bar chart)
- Margin analysis by product
- Top performers vs underperformers
- Revenue diversification score

### 4. Inventory Dashboard
- Current inventory levels
- Inventory value trend
- Turnover calculation (COGS / Avg Inventory)
- DIO calculation

### 5. AP Aging Analysis
- Aging bucket breakdown
- Payment timing analysis
- DPO calculation
- Vendor payment trends

---

## 📝 Example API Usage

### Fetch Customer Sales for Latest Month
```typescript
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  
  const customerSales = await prisma.customerSalesSnapshot.findMany({
    where: { 
      companyId: companyId,
      month: {
        gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
      }
    },
    orderBy: { revenue: 'desc' }
  });
  
  return Response.json(customerSales);
}
```

### Fetch AR Aging Trend (Last 12 Months)
```typescript
const arAging = await prisma.aRAgingSnapshot.findMany({
  where: { companyId: companyId },
  orderBy: { month: 'asc' },
  take: 12
});
```

### Calculate Customer Concentration
```typescript
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

const totalRevenue = topCustomers.reduce((sum, c) => sum + (c._sum.revenue || 0), 0);
```

---

## 🔍 Verify Data Was Created

### Option 1: Prisma Studio (Visual)
```bash
npx prisma studio
```
Opens a browser UI where you can browse all tables.

### Option 2: Direct Query
```typescript
// In your code or via Prisma Studio
const count = await prisma.customerSalesSnapshot.count();
console.log(`Customer sales records: ${count}`); // Should be ~240
```

---

## 🔄 Re-running the Seed

Need to regenerate data? Just run:
```bash
npm run db:seed:operational
```

The script automatically:
- ✅ Clears existing operational data
- ✅ Regenerates 12 months of fresh data
- ✅ Adds random variance (each run is slightly different)

---

## 🎯 Next Steps

1. ✅ **Run the 3 setup commands above**
2. ✅ **Verify data in Prisma Studio**
3. ✅ **Create API routes** to fetch the data
4. ✅ **Build UI components** with charts/visualizations
5. 🔄 **Later**: Connect to real QuickBooks API (we'll help with that)

---

## 📚 Documentation

- **Detailed README**: `prisma/sample-data/README.md`
- **Sample Data**: All JSON files in `prisma/sample-data/`
- **Seed Script**: `prisma/seed-operational-data.ts`

---

## 🐛 Troubleshooting

### ❌ "No companies found"
**Fix**: Create a company first via your app or Prisma Studio

### ❌ "Table does not exist"
**Fix**: Run `npx prisma db push` first

### ❌ TypeScript errors after seeding
**Fix**: Run `npx prisma generate` to update types

---

## 💡 Want Different Data?

You can customize the sample data:

1. **Edit JSON files** in `prisma/sample-data/`
2. **Adjust variance** in `seed-operational-data.ts` (lines with `Math.random()`)
3. **Change date range** (currently 12 months, can make 24+)
4. **Re-run seed** to apply changes

---

**Ready to build some awesome dashboards!** 🎉

All the data you need is now in your database, ready to be queried and visualized.






