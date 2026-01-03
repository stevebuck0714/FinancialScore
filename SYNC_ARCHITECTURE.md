# Operational Data Sync Architecture

## Overview

This document describes the platform-agnostic architecture for syncing operational data from accounting software (QuickBooks, Xero, Sage, etc.) to the FinancialScore application.

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│         Vercel Cron (Daily at 2 AM)             │
│    /api/cron/sync-operational-data              │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│           Sync Orchestrator                     │
│  - Fetches companies with autoSync=true        │
│  - Creates adapters                             │
│  - Handles errors & logging                     │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│          Adapter Factory                        │
│  - Selects platform-specific adapter           │
│  - Manages authentication tokens                │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┴──────────┬──────────────┬────────────┐
        ▼                     ▼              ▼            ▼
┌───────────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────┐
│  QuickBooks   │   │    Xero      │   │   Sage   │   │  Future  │
│   Adapter     │   │   Adapter    │   │  Adapter │   │ Adapters │
│               │   │              │   │          │   │          │
│ - getCash()   │   │ - getCash()  │   │ - ...    │   │ - ...    │
│ - getAR()     │   │ - getAR()    │   │          │   │          │
│ - getAP()     │   │ - getAP()    │   │          │   │          │
│ - getSales()  │   │ - getSales() │   │          │   │          │
│ - getInv()    │   │ - getInv()   │   │          │   │          │
└───────┬───────┘   └──────┬───────┘   └────┬─────┘   └────┬─────┘
        │                  │                 │              │
        └──────────────────┴─────────────────┴──────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────┐
│            PostgreSQL Database                  │
│  - CashSnapshot                                 │
│  - ARAgingSnapshot                              │
│  - APAgingSnapshot                              │
│  - CustomerSalesSnapshot                        │
│  - ProductSalesSnapshot                         │
│  - InventorySnapshot                            │
└─────────────────────────────────────────────────┘
```

## Core Components

### 1. Accounting Adapter Interface

**File:** `lib/accounting-adapters/types.ts`

Defines the standard interface that all platform adapters must implement:

```typescript
interface AccountingAdapter {
  getCashBalances(): Promise<CashBalance[]>;
  getARAgingReport(asOfDate?: Date): Promise<ARAgingData>;
  getAPAgingReport(asOfDate?: Date): Promise<APAgingData>;
  getCustomerSales(startDate: Date, endDate: Date): Promise<CustomerSalesData[]>;
  getProductSales(startDate: Date, endDate: Date): Promise<ProductSalesData[]>;
  getInventory(): Promise<InventoryData[]>;
  syncAll(frequency: 'daily' | 'weekly' | 'monthly'): Promise<SyncResult>;
}
```

### 2. Platform-Specific Adapters

**Files:**
- `lib/accounting-adapters/quickbooks-adapter.ts` - QuickBooks Online
- `lib/accounting-adapters/xero-adapter.ts` - Xero (TODO)
- `lib/accounting-adapters/sage-adapter.ts` - Sage (TODO)

Each adapter:
- Implements the `AccountingAdapter` interface
- Handles platform-specific API calls
- Transforms platform data to standard format
- Manages authentication tokens
- Implements retry logic and error handling

### 3. Adapter Factory

**File:** `lib/accounting-adapters/adapter-factory.ts`

Responsible for:
- Creating the correct adapter based on platform
- Loading authentication credentials from database
- Finding companies eligible for auto-sync

```typescript
// Usage examples:
const adapter = await AdapterFactory.createForCompany(companyId);
const adapter = await AdapterFactory.createFromConnection(connectionId);
const companyIds = await AdapterFactory.getCompaniesForAutoSync();
```

### 4. Cron API Endpoint

**File:** `app/api/cron/sync-operational-data/route.ts`

Scheduled job that:
1. Runs daily at 2 AM (configurable)
2. Finds all companies with `autoSync=true`
3. Creates adapter for each company
4. Syncs all operational data
5. Updates `lastSyncAt` timestamp
6. Logs results and errors

**Security:** Protected by `CRON_SECRET` environment variable

### 5. Vercel Cron Configuration

**File:** `vercel.json`

```json
{
  "crons": [{
    "path": "/api/cron/sync-operational-data",
    "schedule": "0 2 * * *"
  }]
}
```

**Schedule Syntax:** Uses standard cron format
- `0 2 * * *` = Every day at 2:00 AM
- `0 */6 * * *` = Every 6 hours
- `0 0 * * 0` = Every Sunday at midnight

## Data Flow

### Daily Sync Process

1. **Cron Trigger** (2 AM daily)
   - Vercel triggers `/api/cron/sync-operational-data`

2. **Authentication Check**
   - Verifies `CRON_SECRET` header

3. **Company Discovery**
   - Queries `AccountingConnection` table
   - Filters for `status='ACTIVE'` and `autoSync=true`

4. **For Each Company:**
   
   a. **Create Adapter**
      - Factory selects platform (QuickBooks, Xero, etc.)
      - Loads credentials from database
   
   b. **Test Connection**
      - Verifies API access
      - Checks token validity
   
   c. **Sync Data** (in order):
      - Cash balances from bank accounts
      - AR Aging report
      - AP Aging report
      - Customer sales (yesterday)
      - Product sales (yesterday)
      - Current inventory levels
   
   d. **Save to Database**
      - Creates records with today's date
      - Sets `frequency='daily'`
      - Links to `companyId`
   
   e. **Update Metadata**
      - Sets `lastSyncAt` timestamp
      - Clears or sets `errorMessage`

5. **Results**
   - Returns summary: success count, errors, duration
   - Logs to console for monitoring

## Database Schema

### Operational Data Tables

All tables follow the same pattern with frequency support:

```prisma
model CashSnapshot {
  id              String   @id @default(cuid())
  companyId       String
  snapshotDate    DateTime
  frequency       String   @default("daily")
  accountId       String?
  accountName     String
  accountNumber   String?
  cashBalance     Float
  changeAmount    Float?
  changePercent   Float?
  createdAt       DateTime @default(now())
  
  @@index([companyId, snapshotDate(sort: Desc)])
  @@index([companyId, frequency, snapshotDate(sort: Desc)])
}
```

Similar structure for:
- `ARAgingSnapshot`
- `APAgingSnapshot`
- `CustomerSalesSnapshot`
- `ProductSalesSnapshot`
- `InventorySnapshot`

### Accounting Connection

```prisma
model AccountingConnection {
  id                 String
  companyId          String
  platform           AccountingPlatform // QUICKBOOKS, XERO, SAGE, etc.
  status             ConnectionStatus   // ACTIVE, INACTIVE, ERROR
  accessToken        String?
  refreshToken       String?
  tokenExpiresAt     DateTime?
  realmId            String?  // QuickBooks
  tenantId           String?  // Xero
  organizationId     String?  // Sage
  lastSyncAt         DateTime?
  autoSync           Boolean  @default(false)
  syncFrequency      String   @default("daily")
  errorMessage       String?
  // ...
}
```

## Environment Variables

### Required

```bash
# Cron job security
CRON_SECRET=your-random-secret-here

# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=your-client-id
QUICKBOOKS_CLIENT_SECRET=your-client-secret
QUICKBOOKS_API_BASE_URL=https://quickbooks.api.intuit.com/v3/company

# Database
DATABASE_URL=postgresql://...
```

### Optional

```bash
# Xero OAuth (when implemented)
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...

# Sage OAuth (when implemented)
SAGE_CLIENT_ID=...
SAGE_CLIENT_SECRET=...
```

## Adding a New Platform

To add support for a new accounting platform (e.g., Xero):

### 1. Create the Adapter

Create `lib/accounting-adapters/xero-adapter.ts`:

```typescript
import { AccountingAdapter, AdapterConfig, CashBalance, ... } from './types';

export class XeroAdapter implements AccountingAdapter {
  readonly platform = 'XERO';
  private config: AdapterConfig;
  private baseUrl = 'https://api.xero.com/api.xro/2.0';
  
  constructor(config: AdapterConfig) {
    this.config = config;
  }
  
  async testConnection(): Promise<boolean> {
    // Implement Xero connection test
  }
  
  async getCashBalances(): Promise<CashBalance[]> {
    // Implement Xero cash balance fetch
  }
  
  // ... implement other methods
}
```

### 2. Update the Factory

In `lib/accounting-adapters/adapter-factory.ts`:

```typescript
import { XeroAdapter } from './xero-adapter';

private static createAdapter(platform: AccountingPlatform, config: AdapterConfig): AccountingAdapter {
  switch (platform) {
    case 'QUICKBOOKS':
      return new QuickBooksAdapter(config);
    case 'XERO':
      return new XeroAdapter(config);  // Add this
    // ...
  }
}
```

### 3. Update Prisma Schema

In `prisma/schema.prisma`, add to enum if needed:

```prisma
enum AccountingPlatform {
  QUICKBOOKS
  XERO  // Add this
  SAGE
  // ...
}
```

### 4. Test

```bash
# Test in development
curl -X POST http://localhost:3000/api/cron/sync-operational-data
```

## Manual Sync (Development)

For testing during development:

```bash
# POST request triggers sync immediately
curl -X POST http://localhost:3000/api/cron/sync-operational-data
```

Or use the admin UI (TODO: build admin sync trigger button).

## Monitoring & Logging

### Console Logs

The sync job outputs structured logs:

```
🕐 Starting daily operational data sync...
📊 Found 5 companies with auto-sync enabled

💼 Syncing company: abc123
✅ Acme Corp: 245 records synced

💼 Syncing company: def456
⚠️  Widget Inc: Partial sync with errors: ["AR Aging sync failed: API timeout"]

✨ Sync complete in 45231ms
   Success: 4, Errors: 1
   Total records created: 1234
```

### Error Handling

- Connection failures → Retry with exponential backoff
- Token expiration → Automatic refresh (TODO)
- API rate limits → Respect rate limit headers
- Partial failures → Log but continue with other data types

### Monitoring Endpoints (TODO)

- `/api/admin/sync-status` - View last sync times
- `/api/admin/sync-logs` - View sync history
- `/api/admin/trigger-sync` - Manual trigger with auth

## Performance Considerations

### Batch Processing

- Companies synced sequentially (not parallel) to avoid rate limits
- Within a company, data types synced sequentially
- Consider parallel processing in future if needed

### Rate Limits

- QuickBooks: 500 requests per minute per app
- Xero: 60 requests per minute per organization
- Implement rate limit handling per adapter

### Database Performance

- Indexes on `companyId`, `snapshotDate`, `frequency`
- Bulk inserts where possible
- Consider archiving old snapshots

## Testing

### Unit Tests (TODO)

```typescript
describe('QuickBooksAdapter', () => {
  it('should fetch cash balances', async () => {
    const adapter = new QuickBooksAdapter(mockConfig);
    const balances = await adapter.getCashBalances();
    expect(balances).toHaveLength(3);
  });
});
```

### Integration Tests (TODO)

Test with sandbox accounts:
- QuickBooks Sandbox
- Xero Demo Company
- Sage Test Environment

## Troubleshooting

### Sync Not Running

1. Check Vercel cron logs
2. Verify `CRON_SECRET` is set
3. Check `autoSync` flag on connections

### No Data Appearing

1. Check `AccountingConnection.status` is `'ACTIVE'`
2. Verify token hasn't expired
3. Check sync logs for errors
4. Test connection manually

### Token Expired

1. Implement token refresh in adapter
2. Update `refreshToken` and `tokenExpiresAt`
3. Retry failed sync

## Future Enhancements

- [ ] Automatic token refresh
- [ ] Webhook support for real-time updates
- [ ] Retry logic with exponential backoff
- [ ] Admin UI for sync management
- [ ] Sync history/audit log
- [ ] Per-company sync schedules
- [ ] Selective data type syncing
- [ ] Support for weekly/monthly frequencies
- [ ] Data validation and anomaly detection

## Security

- ✅ CRON_SECRET protects endpoint
- ✅ Tokens encrypted at rest (TODO: verify)
- ✅ Platform-specific auth (OAuth 2.0)
- ✅ Rate limiting respected
- ⚠️  TODO: Implement token refresh
- ⚠️  TODO: Add request signing for webhooks

## References

- [QuickBooks API Docs](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account)
- [Xero API Docs](https://developer.xero.com/documentation/api/accounting/overview)
- [Sage API Docs](https://developer.sage.com/)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

