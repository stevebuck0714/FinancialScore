# QuickBooks Operational Data

## Overview

Added 5 new tables to track operational metrics from QuickBooks data:

### Tables Created

1. **CustomerSalesSnapshot** - Track customer sales performance over time
   - Monthly revenue per customer
   - Invoice counts and average invoice size
   - Customer concentration analysis

2. **ARAgingSnapshot** - Accounts Receivable aging reports
   - Total AR broken down by aging buckets
   - Track collection trends over time
   - Calculate Days Sales Outstanding (DSO)

3. **APAgingSnapshot** - Accounts Payable aging reports
   - Total AP broken down by aging buckets
   - Track payment patterns
   - Calculate Days Payable Outstanding (DPO)

4. **ProductSalesSnapshot** - Product/service sales tracking
   - Revenue and quantity by product/service
   - COGS and gross margin analysis
   - Product performance trends

5. **InventorySnapshot** - Inventory levels and values
   - Quantity on hand by item
   - Asset value and average cost
   - Inventory turnover tracking

## Mock Data

The seed script (`prisma/seed-operational.ts`) creates 6 months of mock data:
- 5 customers with varying monthly sales patterns
- Monthly AR and AP aging snapshots
- 5 products with sales and margin data
- 5 inventory items with quantity and value tracking

**Total records created:** 102 records across all tables

## API Endpoint

### GET `/api/operational-data`

Query parameters:
- `companyId` (required): Company ID to fetch data for
- `type` (optional): Data type to fetch
  - `customers` - Customer sales data
  - `ar-aging` - AR aging data
  - `ap-aging` - AP aging data
  - `products` - Product sales data
  - `inventory` - Inventory data
  - (omit for summary of all types)
- `startDate` (optional): Filter by start date (ISO format)
- `endDate` (optional): Filter by end date (ISO format)

### Example Requests

```bash
# Get summary of all operational data
GET /api/operational-data?companyId=cmiy2ilgv0000ie045f5qiag1

# Get customer sales data
GET /api/operational-data?companyId=cmiy2ilgv0000ie045f5qiag1&type=customers

# Get AR aging with date filter
GET /api/operational-data?companyId=cmiy2ilgv0000ie045f5qiag1&type=ar-aging&startDate=2025-01-01

# Get top products by revenue
GET /api/operational-data?companyId=cmiy2ilgv0000ie045f5qiag1&type=products
```

### Example Response - Customer Sales

```json
{
  "records": [
    {
      "id": "...",
      "companyId": "cmiy2ilgv0000ie045f5qiag1",
      "month": "2026-01-01T00:00:00.000Z",
      "customerId": "CUST001",
      "customerName": "Acme Corporation",
      "revenue": 45230.50,
      "invoiceCount": 8,
      "avgInvoiceSize": 5653.81
    }
  ],
  "summary": {
    "topCustomers": [
      {
        "name": "Acme Corporation",
        "totalRevenue": 280450.25,
        "totalInvoices": 45
      }
    ]
  }
}
```

### Example Response - AR Aging

```json
{
  "records": [
    {
      "id": "...",
      "companyId": "cmiy2ilgv0000ie045f5qiag1",
      "month": "2026-01-01T00:00:00.000Z",
      "totalAR": 125000.00,
      "current": 87500.00,
      "days1to30": 25000.00,
      "days31to60": 8750.00,
      "days61to90": 2500.00,
      "days90plus": 1250.00
    }
  ],
  "summary": {
    "totalAR": 125000.00,
    "currentPct": 70.0,
    "over30Pct": 30.0,
    "over90Pct": 1.0,
    "dso": 42.5
  }
}
```

## Direct Prisma Queries

You can also query the data directly using Prisma Client:

```typescript
import { prisma } from '@/lib/prisma';

// Get latest AR aging
const latestAR = await prisma.aRAgingSnapshot.findFirst({
  where: { companyId: 'your-company-id' },
  orderBy: { month: 'desc' },
});

// Get top customers by revenue
const topCustomers = await prisma.customerSalesSnapshot.groupBy({
  by: ['customerName'],
  where: { companyId: 'your-company-id' },
  _sum: { revenue: true },
  _count: { invoiceCount: true },
  orderBy: { _sum: { revenue: 'desc' } },
  take: 10,
});

// Get product performance over time
const productTrends = await prisma.productSalesSnapshot.findMany({
  where: {
    companyId: 'your-company-id',
    itemId: 'PROD001',
  },
  orderBy: { month: 'asc' },
  select: {
    month: true,
    revenue: true,
    quantitySold: true,
    grossMarginPct: true,
  },
});

// Get current inventory value
const inventoryValue = await prisma.inventorySnapshot.aggregate({
  where: {
    companyId: 'your-company-id',
    month: new Date('2026-01-01'),
  },
  _sum: { assetValue: true },
});
```

## Use Cases

### 1. Customer Concentration Analysis
- Identify top customers and revenue concentration risk
- Track customer growth/decline over time
- Monitor invoice patterns

### 2. Cash Flow Management
- AR aging trends for collection efficiency
- DSO tracking to monitor payment cycles
- AP aging for payment planning
- DPO tracking for cash management

### 3. Product Performance
- Identify best/worst performing products
- Track margin trends by product
- Analyze sales velocity

### 4. Inventory Management
- Monitor inventory levels and value
- Calculate inventory turnover
- Identify slow-moving items

### 5. KPI Dashboard
Combine operational data with financial data for comprehensive insights:
- Working capital trends (AR + Inventory - AP)
- Cash conversion cycle (DSO + DIO - DPO)
- Revenue concentration and diversification
- Margin analysis by product/customer

## Next Steps

1. **Create Dashboard Components** - Build UI components to visualize this data
2. **Add Sync Logic** - Implement QuickBooks API sync to populate real data
3. **Trend Analysis** - Add endpoints for trend analysis and comparisons
4. **Alerts** - Set up alerts for aging thresholds or concentration risks
5. **Export** - Add CSV/Excel export functionality

