# Operational Data Enhancements - High-Frequency Support

## ✅ Completed Enhancements

### 1. **Database Schema Updates**
- Renamed `month` field to `snapshotDate` for flexibility
- Added `frequency` field ('daily', 'weekly', 'monthly')
- Added optimized indexes for date range queries
- Added unique constraints to prevent duplicate snapshots

### 2. **API Enhancements**
- **Date Range Filtering**: `startDate` and `endDate` parameters
- **Frequency Selection**: Filter by daily, weekly, or monthly data
- **Default Behavior**: Last 90 days if no dates specified
- **Limit Parameter**: Control max records returned (default: 1000)
- **Backward Compatible**: Works with existing code

### 3. **UI Improvements**
- **Frequency Selector**: Toggle between daily, weekly, monthly views
- **Date Range Picker**: Custom start and end dates
- **Quick Date Buttons**: 
  - Last 30 Days
  - Last 90 Days
  - Last 6 Months
- **Auto-Refresh**: Data reloads when filters change
- **Filter Bar**: Shows on all data tabs (hidden on overview)

### 4. **Enhanced Data Seeding**
Created **566 total records** across multiple frequencies:

**Monthly Data (12 months):**
- 60 Customer Sales records
- 12 AR Aging snapshots
- 12 AP Aging snapshots
- 60 Product Sales records
- 60 Inventory records

**Weekly Data (26 weeks):**
- 130 Customer Sales records
- 26 AR Aging snapshots
- 26 AP Aging snapshots

**Daily Data (90 days):**
- 90 AR Aging snapshots
- 90 AP Aging snapshots

## 🎯 How to Use

### View Different Frequencies

1. **Navigate to Operations Dashboard**
2. **Select any data tab** (Customers, AR, AP, Products, Inventory)
3. **Choose frequency** from dropdown:
   - **Daily**: See day-by-day changes (great for AR/AP tracking)
   - **Weekly**: Weekly aggregations (good for trends)
   - **Monthly**: Monthly summaries (best for high-level analysis)

### Filter by Date Range

1. **Use date pickers** to select custom range
2. **Or click quick buttons**:
   - "Last 30 Days" - Recent activity
   - "Last 90 Days" - Quarter view
   - "Last 6 Months" - Half-year trends

### API Usage

```typescript
// Get daily AR aging for last 30 days
GET /api/operational-data?companyId={id}&type=ar-aging&frequency=daily&startDate=2026-01-01&endDate=2026-01-31

// Get weekly customer sales for last 3 months
GET /api/operational-data?companyId={id}&type=customers&frequency=weekly&startDate=2025-10-01&endDate=2026-01-01

// Get monthly product sales for last year
GET /api/operational-data?companyId={id}&type=products&frequency=monthly&startDate=2025-01-01&endDate=2026-01-01
```

## 📊 Data Retention Strategy

### Current Implementation
- **Daily**: Last 90 days
- **Weekly**: Last 26 weeks (6 months)
- **Monthly**: Last 12 months

### Recommended Production Strategy
1. Keep daily data for 90 days
2. Keep weekly data for 1 year
3. Keep monthly data indefinitely
4. Archive old data to cold storage after 2 years

## 🚀 Performance Optimizations

### Database Indexes
```sql
-- Optimized for date range queries
CREATE INDEX ON "ARAgingSnapshot" (companyId, snapshotDate DESC);
CREATE INDEX ON "ARAgingSnapshot" (companyId, frequency, snapshotDate DESC);

-- Similar indexes on all operational tables
```

### Query Optimization
- Limit results to 1000 records by default
- Use indexed fields in WHERE clauses
- Sort by snapshotDate DESC for recent-first

### Future Enhancements
- **Caching**: Redis cache for frequently accessed data
- **Pagination**: For very large datasets
- **Aggregation**: Pre-computed summaries
- **Materialized Views**: For complex analytics

## 💡 Use Cases

### Daily Frequency
- **AR/AP Monitoring**: Track collections and payments daily
- **Cash Flow Management**: Daily cash position
- **Alerts**: Detect sudden changes
- **Real-time Dashboards**: Today vs yesterday

### Weekly Frequency
- **Trend Analysis**: Week-over-week growth
- **Sales Performance**: Weekly sales targets
- **Inventory Turns**: Weekly stock movement
- **Forecasting**: Better predictions with more data points

### Monthly Frequency
- **Financial Reporting**: Month-end summaries
- **Executive Dashboards**: High-level trends
- **Year-over-year**: Annual comparisons
- **Historical Analysis**: Long-term patterns

## 🔄 Syncing with QuickBooks

### Recommended Sync Schedule
```typescript
// Daily sync job (runs at midnight)
async function dailySync() {
  await syncARaging('daily');
  await syncAPaging('daily');
}

// Weekly sync job (runs Sunday night)
async function weeklySync() {
  await syncCustomerSales('weekly');
  await syncARaging('weekly');
  await syncAPaging('weekly');
}

// Monthly sync job (runs on 1st of month)
async function monthlySync() {
  await syncCustomerSales('monthly');
  await syncARaging('monthly');
  await syncAPaging('monthly');
  await syncProductSales('monthly');
  await syncInventory('monthly');
}
```

## 📈 Benefits

### Business Intelligence
- **Better Insights**: More data points = better analysis
- **Trend Detection**: Spot patterns earlier
- **Anomaly Detection**: Flag unusual activity
- **Forecasting**: Improved predictions

### Cash Flow Management
- **Daily AR Tracking**: Monitor collections closely
- **Payment Patterns**: Understand customer behavior
- **Working Capital**: Optimize cash position
- **DSO/DPO Trends**: Track key metrics

### Operational Efficiency
- **Real-time Visibility**: Know your position anytime
- **Proactive Management**: Act before issues escalate
- **Data-Driven Decisions**: Facts over gut feel
- **Automated Alerts**: Get notified of important changes

## 🛠️ Technical Details

### Schema Changes
```prisma
model ARAgingSnapshot {
  id           String   @id @default(cuid())
  companyId    String
  snapshotDate DateTime // Changed from 'month'
  frequency    String   @default("monthly") // NEW
  totalAR      Float
  // ... other fields
  
  @@index([companyId, snapshotDate(sort: Desc)])
  @@index([companyId, frequency, snapshotDate(sort: Desc)])
  @@unique([companyId, snapshotDate, frequency])
}
```

### API Parameters
- `companyId`: Required
- `type`: customers | ar-aging | ap-aging | products | inventory
- `frequency`: daily | weekly | monthly (default: monthly)
- `startDate`: ISO date (default: 90 days ago)
- `endDate`: ISO date (default: today)
- `limit`: Max records (default: 1000)

### Component State
```typescript
const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
const [startDate, setStartDate] = useState<string>('2025-10-01');
const [endDate, setEndDate] = useState<string>('2026-01-01');
```

## 📝 Migration Notes

### Existing Data
- Old data automatically migrated from `month` to `snapshotDate`
- All existing records marked as `frequency: 'monthly'`
- No data loss during migration

### Backward Compatibility
- API still works without frequency parameter (defaults to monthly)
- Charts and tables updated to use `snapshotDate`
- All existing functionality preserved

## 🎉 Summary

The Operations Dashboard now supports:
- ✅ Daily, weekly, and monthly data frequencies
- ✅ Custom date range filtering
- ✅ Quick date range buttons
- ✅ 566 sample records across all frequencies
- ✅ Optimized database queries
- ✅ Responsive UI with filter controls
- ✅ Backward compatible with existing code

**Ready for production use with real QuickBooks sync!**

