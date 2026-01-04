# Xero Data Sync Strategy - Two-Phase Approach

## Overview

This document outlines our strategy for syncing financial data from Xero to support both **monthly financial mapping** (for scoring/analysis) and **daily operational reports** (for AR/AP aging, cash flow, etc.).

---

## Phase 1: Monthly Account-Level Data (CURRENT)

### Purpose
- Enable detailed account mapping to target fields (revenue, cogsPayroll, marketing, etc.)
- Support monthly financial analysis and scoring
- Provide data for Income Statement and Balance Sheet views

### What We Sync
- **33 months** of historical P&L data (3 chunks of 11 months due to Xero API limits)
- **Chart of Accounts** for account mappings
- **Balance Sheet** snapshots (end of each period)

### How It Works

#### 1. Initial Sync (`/api/xero/sync`)
```
GET Xero P&L Report (11 periods, monthly breakdown)
→ Returns SUMMARY totals for each month (Total Revenue, Total Expenses, etc.)
→ Stores in MonthlyFinancial table
```

**Limitations:** 
- Only gets summary totals, not account-level detail
- This is fine for initial import but not sufficient for mapping

#### 2. Reprocess with Mappings (`/api/xero/reprocess-mappings`)
```
For each month:
  GET Xero P&L Report (single month, standardLayout: false)
  → Returns DETAILED account-level data (Account A: $5,000, Account B: $3,000)
  → Parse each account and apply saved mappings
  → Update MonthlyFinancial with detailed breakdowns
```

**Benefits:**
- Account-level detail for each month
- Maps accounts to target fields using user-defined or AI-suggested mappings
- Supports Line of Business (LOB) allocations

### API Endpoints

- `POST /api/xero/sync` - Initial sync (33 months of summary data)
- `POST /api/xero/reprocess-mappings` - Fetch account-level detail and apply mappings
- `GET /api/xero/status` - Check connection status

### Current Status
✅ Initial sync working (33 months of summary data)  
✅ Chart of Accounts sync working (69 accounts mapped)  
✅ Account mappings with AI assistance working  
⚠️ Reprocess endpoint created, parsing logic being refined  

---

## Phase 2: Daily Transaction Data (PLANNED)

### Purpose
- Support operational reports (AR aging, AP aging, cash flow)
- Enable drill-down into daily transaction details
- Track invoice payment status and aging
- Monitor bank account activity

### What We Sync
- **Invoices** (AR/Revenue) - Last 90 days by default
- **Bills** (AP/Expenses) - Last 90 days by default
- **Bank Transactions** - Last 90 days by default
- **Payments** - Last 90 days by default

### How It Works

#### Transaction Sync (`/api/xero/sync-transactions`)
```
GET Xero Invoices (last 90 days)
→ Individual invoices with line items
→ Store in XeroTransaction table

GET Xero Bills (last 90 days)
→ Individual bills with line items
→ Store in XeroTransaction table

GET Xero Bank Transactions (last 90 days)
→ Bank deposits/withdrawals
→ Store in XeroTransaction table
```

### Database Schema

```prisma
model XeroTransaction {
  id              String   @id @default(cuid())
  companyId       String
  transactionId   String   // Xero's ID
  transactionType String   // INVOICE, BILL, BANK_TRANSACTION, PAYMENT
  date            DateTime
  dueDate         DateTime?
  contact         String?  // Customer/Supplier name
  reference       String?  // Invoice/Bill number
  total           Float
  amountPaid      Float
  amountDue       Float
  status          String?  // DRAFT, AUTHORISED, PAID, etc.
  lineItems       Json?    // Detailed line items
  rawData         Json?    // Full Xero object
  createdAt       DateTime
  updatedAt       DateTime
  
  company         Company  @relation(fields: [companyId], references: [id])
  
  @@unique([companyId, transactionId])
  @@index([companyId, date])
  @@index([transactionType])
}
```

### API Endpoints

- `POST /api/xero/sync-transactions` - Sync daily transactions (invoices, bills, bank)
- `GET /api/xero/setup-transactions-table` - One-time setup to create table
- `GET /api/xero/transactions` - Query transactions (planned)

### Use Cases

1. **AR Aging Report**
   ```sql
   SELECT * FROM XeroTransaction 
   WHERE transactionType = 'INVOICE' 
   AND status != 'PAID'
   ORDER BY dueDate
   ```

2. **AP Aging Report**
   ```sql
   SELECT * FROM XeroTransaction 
   WHERE transactionType = 'BILL' 
   AND amountDue > 0
   ORDER BY dueDate
   ```

3. **Daily Cash Flow**
   ```sql
   SELECT date, SUM(total) 
   FROM XeroTransaction 
   WHERE transactionType = 'BANK_TRANSACTION'
   GROUP BY date
   ORDER BY date
   ```

### Current Status
✅ API endpoint created (`/api/xero/sync-transactions`)  
✅ Database schema defined (`XeroTransaction`)  
✅ Setup endpoint created (`/api/xero/setup-transactions-table`)  
❌ UI integration not yet implemented  
❌ Report views not yet created  

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         XERO API                             │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼────────┐      ┌──────▼─────────┐
        │  Monthly P&L   │      │ Transactions   │
        │  (33 months)   │      │  (90 days)     │
        └───────┬────────┘      └──────┬─────────┘
                │                       │
     ┌──────────▼──────────┐    ┌──────▼──────────────┐
     │ MonthlyFinancial    │    │ XeroTransaction     │
     │                     │    │                     │
     │ • Summary totals    │    │ • Invoices (AR)     │
     │ • Account breakdown │    │ • Bills (AP)        │
     │ • LOB allocations   │    │ • Bank transactions │
     └──────────┬──────────┘    └──────┬──────────────┘
                │                       │
     ┌──────────▼──────────┐    ┌──────▼──────────────┐
     │ Financial Analysis  │    │ Operational Reports │
     │                     │    │                     │
     │ • Scoring           │    │ • AR Aging          │
     │ • Income Statement  │    │ • AP Aging          │
     │ • Balance Sheet     │    │ • Cash Flow         │
     │ • LOB Reporting     │    │ • Invoice Tracking  │
     └─────────────────────┘    └─────────────────────┘
```

---

## Implementation Steps

### Phase 1 (Current Priority)
- [x] Initial monthly sync working
- [x] Chart of Accounts sync
- [x] Account mapping UI
- [x] AI-assisted mapping
- [ ] **Fix reprocessing parser** ← CURRENT TASK
- [ ] Test with real Xero data
- [ ] Verify Data Review shows correct account breakdowns

### Phase 2 (Future)
- [x] Create database schema for transactions
- [x] Create sync endpoint
- [x] Create setup endpoint
- [ ] Call setup endpoint to create table
- [ ] Test transaction sync
- [ ] Create AR Aging report UI
- [ ] Create AP Aging report UI
- [ ] Create Cash Flow report UI
- [ ] Add scheduled sync (daily/hourly)

---

## API Rate Limits

**Xero API Limits:**
- 60 calls per minute
- 5,000 calls per day per organization

**Our Strategy:**
- Phase 1: ~10 API calls per sync (P&L chunks + Balance Sheet + Accounts)
- Phase 2: ~3-10 API calls per sync (Invoices + Bills + Bank Transactions, paginated)
- Stay well under limits with scheduled syncs

---

## Next Steps

1. **Test Reprocessing Endpoint**
   - Click "Apply Mappings to Data" button
   - Check server logs for P&L structure
   - Fix parser based on actual Xero response

2. **Set Up Transaction Table**
   - Call `GET /api/xero/setup-transactions-table`
   - Verify table created

3. **Test Transaction Sync**
   - Call `POST /api/xero/sync-transactions`
   - Verify transactions stored

4. **Build Report UIs**
   - AR Aging
   - AP Aging
   - Cash Flow

---

## Testing Instructions

### Test Phase 1 (Monthly Data)
```bash
# 1. Initial sync
POST /api/xero/sync
{
  "companyId": "...",
  "userId": "..."
}

# 2. Generate AI mappings
POST /api/ai-mapping/enhanced
{
  "companyId": "...",
  "accounts": [...]
}

# 3. Save mappings
POST /api/account-mappings
{
  "companyId": "...",
  "mappings": [...]
}

# 4. Reprocess with mappings (creates detailed breakdowns)
POST /api/xero/reprocess-mappings
{
  "companyId": "..."
}

# 5. Check Data Review tab - should show account-level details
```

### Test Phase 2 (Daily Transactions)
```bash
# 1. Setup table (one-time)
GET /api/xero/setup-transactions-table

# 2. Sync transactions
POST /api/xero/sync-transactions
{
  "companyId": "...",
  "userId": "...",
  "startDate": "2025-01-01",
  "endDate": "2025-01-04"
}

# 3. Query transactions (future endpoint)
GET /api/xero/transactions?companyId=...&type=INVOICE&status=UNPAID
```

---

## Notes

- Phase 1 focuses on **monthly aggregates** for financial analysis
- Phase 2 focuses on **daily details** for operational management
- Both use the same Xero connection and token management
- Token refresh logic is shared across all endpoints
- All data is company-scoped for multi-tenant security

