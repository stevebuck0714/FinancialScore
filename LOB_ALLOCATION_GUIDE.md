# Line of Business (LOB) Allocation System

## Overview

The LOB Allocation System allows companies to track revenue, expenses, and other financial metrics across multiple Lines of Business (LOBs). This is critical when a single company operates multiple business units or product lines.

## The Problem It Solves

### Example Scenario
A company has two LOBs: "Analytics" and "LP Product"

**Without LOB Tracking:**
- Total Revenue: $18,000

**With LOB Tracking:**
- Analytics Revenue: $8,400 (46.67%)
- LP Product Revenue: $9,600 (53.33%)

### The Challenge
- QuickBooks has many individual accounts that map to our standard database fields
- Multiple QB accounts can map to the SAME standard field (e.g., "revenue")
- Each QB account needs to be split across LOBs with specific percentages
- We need to aggregate all the splits to get total LOB breakdowns

## How It Works

### 1. Data Structure

#### Company Setup
```json
{
  "linesOfBusiness": ["Analytics", "LP Product"]
}
```

#### Account Mappings
Each QuickBooks account has:
```json
{
  "qbAccount": "4400 Income from Custom Development Services",
  "targetField": "revenue",
  "lobAllocations": {
    "Analytics": 20,
    "LP Product": 80
  }
}
```

### 2. Processing Flow

```
QuickBooks Data
    ↓
Extract Individual Account Values
    ↓
Apply Account Mappings
    ↓
Apply LOB Percentage Splits
    ↓
Aggregate by Target Field & LOB
    ↓
Store Breakdowns in Database
```

### 3. Example Calculation

**Month: September 2025**

**QB Account Values:**
- "4400 Income from Custom Development Services": $10,000
  - Mapping: 20% Analytics, 80% LP Product
  - Result: Analytics $2,000, LP Product $8,000

- "4910 Services": $5,000
  - Mapping: 80% Analytics, 20% LP Product
  - Result: Analytics $4,000, LP Product $1,000

- "4920 Sales of Product Income": $3,000
  - Mapping: 80% Analytics, 20% LP Product
  - Result: Analytics $2,400, LP Product $600

**Final Revenue Breakdown:**
- Total Revenue: $18,000
- Analytics: $8,400 (46.67%)
- LP Product: $9,600 (53.33%)

## Implementation

### Database Schema

```prisma
model MonthlyFinancial {
  revenue                  Float
  revenueBreakdown         Json?    // { "Analytics": 8400, "LP Product": 9600 }
  expense                  Float
  expenseBreakdown         Json?    // LOB breakdown for expenses
  cogsTotal                Float
  cogsBreakdown            Json?    // LOB breakdown for COGS
  lobBreakdowns            Json?    // Comprehensive breakdowns for ALL fields
  // ... other fields
}
```

### Key Files

1. **`lib/lob-allocator.ts`**
   - Core allocation logic
   - `applyLOBAllocations()` function
   - Handles percentage calculations
   - Aggregates by LOB and field

2. **`lib/quickbooks-parser.ts`**
   - Extracts account-level data from QB reports
   - Calls LOB allocator for each month
   - Returns parsed data with breakdowns

3. **`app/api/quickbooks/sync/route.ts`**
   - Fetches account mappings from database
   - Passes mappings to parser
   - Saves LOB breakdowns to database

### Data Structures

#### Account Value
```typescript
{
  accountName: "4400 Income from Custom Development Services",
  accountId: "26",
  value: 10000
}
```

#### LOB Breakdown
```typescript
{
  "Analytics": 8400.00,
  "LP Product": 9600.00
}
```

#### Monthly LOB Data
```typescript
{
  totals: {
    revenue: 18000,
    expense: 5000,
    // ... other fields
  },
  breakdowns: {
    revenue: {
      "Analytics": 8400,
      "LP Product": 9600
    },
    expense: {
      "Analytics": 2750,
      "LP Product": 2250
    },
    // ... other fields
  },
  revenueBreakdown: { /* same as breakdowns.revenue */ },
  expenseBreakdown: { /* sum of all expense field breakdowns */ },
  cogsBreakdown: { /* sum of all COGS field breakdowns */ }
}
```

## Usage

### Setting Up LOB Allocations

1. **Define LOBs for the Company**
   - Stored in `Company.linesOfBusiness`
   - Example: `["Analytics", "LP Product"]`

2. **Map QB Accounts**
   - For each QB account, specify:
     - Target field (e.g., "revenue", "payroll", etc.)
     - LOB allocations as percentages
   - Percentages should add up to 100%

3. **Sync QuickBooks Data**
   - QB sync automatically applies LOB allocations
   - Breakdowns are stored in `MonthlyFinancial` records

### Querying LOB Data

```typescript
// Get monthly financials with LOB breakdowns
const monthlyData = await prisma.monthlyFinancial.findMany({
  where: { companyId },
  orderBy: { monthDate: 'desc' }
});

// Access revenue breakdown
const revenueBreakdown = monthlyData[0].revenueBreakdown;
// { "Analytics": 8400, "LP Product": 9600 }

// Access all field breakdowns
const allBreakdowns = monthlyData[0].lobBreakdowns;
// { revenue: {...}, expense: {...}, payroll: {...}, ... }
```

## Special Cases

### Unallocated Accounts

If a QB account has no LOB allocation but has a target field mapping:
- Amount is added to "Unallocated" LOB
- Total still reflects correct amount
- Consider adding LOB allocations or excluding from totals

### Missing Mappings

If a QB account has no mapping at all:
- A warning is logged
- Account value is not included in any totals
- Consider adding a mapping with `targetField: "otherExpense"` or similar

### Percentage Validation

The system warns if percentages don't add up to 100%:
```
LOB allocations for "Account Name" sum to 95% instead of 100%
```
- Calculations still proceed using the provided percentages
- Consider updating to exactly 100% for accuracy

## Benefits

1. **Granular Insights**: See which LOB is driving revenue/costs
2. **Performance Tracking**: Compare LOB performance over time
3. **Resource Allocation**: Identify where to invest resources
4. **Accurate Reporting**: Consolidated view across business units
5. **Flexible**: Works with any number of LOBs
6. **Automatic**: Applied automatically during QB sync

## Testing

To test LOB allocations with existing data:

```bash
npx tsx test-lob-allocations.ts
```

This will:
- Load "live test 11" company data
- Process QB data with LOB allocations
- Display detailed breakdowns
- Show monthly trends

## Future Enhancements

Potential improvements:
- UI for visualizing LOB breakdowns
- LOB-specific financial ratios and KPIs
- LOB comparison dashboards
- Export LOB reports to Excel/PDF
- Historical LOB trend analysis
- Budget vs. actual by LOB

## Technical Notes

- All monetary amounts are stored in absolute values
- Percentages are stored as whole numbers (e.g., 80, not 0.80)
- Breakdowns are rounded to 2 decimal places
- JSON fields allow flexible storage without schema changes
- Processing happens during QB sync (not real-time)

## Example: Real Data from "live test 11"

**September 2025:**
- Total Revenue: $10,000
  - Analytics: $8,000 (80%)
  - LP Product: $2,000 (20%)

**QB Account Breakdown:**
- "4400 Income from Custom Development Services" 
  - Amount: Some $ from this account
  - Split: 20% Analytics, 80% LP Product
  
- "4910 Services"
  - Amount: Some $ from this account  
  - Split: 80% Analytics, 20% LP Product

- "4920 Sales of Product Income"
  - Amount: Some $ from this account
  - Split: 80% Analytics, 20% LP Product

The system automatically aggregates these to produce the final breakdown.


