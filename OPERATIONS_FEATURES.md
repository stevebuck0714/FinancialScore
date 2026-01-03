# Operations Dashboard - Features Summary

## Overview

The Operations Dashboard provides comprehensive views of QuickBooks operational data with interactive charts and detailed tables.

## Features by Tab

### 1. **Overview Tab**
- Summary cards for all 5 data types
- Record counts for each category
- Click-to-navigate cards
- Information section explaining each data type

### 2. **Customer Analytics Tab**

**KPI Cards:**
- Total Customers
- Total Revenue
- Total Invoices

**Charts:**
- **Monthly Revenue Trend** (Line Chart)
  - Shows revenue trends over time
  - Helps identify seasonal patterns

- **Revenue Distribution** (Pie Chart)
  - Visual breakdown of revenue by customer
  - Shows customer concentration

**Table:**
- Top customers ranked by revenue
- Includes total revenue, invoice count, and average invoice size
- Color-coded for easy reading

### 3. **AR Aging Tab**

**KPI Cards:**
- Total AR
- Current % (with trend indicator)
- Over 30 Days %
- Over 90 Days % (highlighted if > 5%)
- DSO (Days Sales Outstanding)

**Charts:**
- **AR Aging Trend** (Stacked Bar Chart)
  - Shows aging buckets over time
  - Color-coded by aging category:
    - Green: Current
    - Yellow: 1-30 days
    - Orange: 31-60 days
    - Red: 61-90 days
    - Dark Red: 90+ days

**Table:**
- Monthly AR aging detail
- All aging buckets displayed
- Highlights problematic 90+ day balances

### 4. **AP Aging Tab**

**KPI Cards:**
- Total AP
- Current %
- Over 30 Days %
- Over 90 Days % (highlighted if > 5%)
- DPO (Days Payable Outstanding)

**Charts:**
- **AP Aging Trend** (Stacked Bar Chart)
  - Same color scheme as AR aging
  - Helps track payment patterns

**Table:**
- Monthly AP aging detail
- All aging buckets displayed
- Easy comparison across months

### 5. **Product Sales Tab**

**KPI Cards:**
- Total Products
- Total Revenue
- Average Margin %

**Charts:**
- **Revenue Trend by Product** (Multi-Line Chart)
  - Each product has its own line
  - Shows performance trends over time
  - Color-coded by product

**Table:**
- Product performance summary
- Ranked by total revenue
- Includes:
  - Total revenue
  - Units sold
  - Gross margin ($)
  - Gross margin %
- Margin % color-coded (green if ≥50%, yellow if <50%)

### 6. **Inventory Tab**

**KPI Cards:**
- Total Items
- Total Value
- Total Units

**Charts:**
- **Inventory Value Trend** (Line Chart)
  - Shows total inventory value over time
  - Helps identify trends

- **Inventory Value Distribution** (Pie Chart)
  - Shows which items represent the most value
  - Helps prioritize inventory management

**Table:**
- Current inventory (latest month)
- Includes:
  - Item name
  - SKU
  - Quantity on hand
  - Average cost
  - Asset value
- Sorted by asset value (highest first)

## Design Features

### Visual Design
- Clean, modern interface matching your existing Corelytics design
- Consistent color scheme:
  - Primary: #667eea (purple-blue)
  - Success: #16a34a (green)
  - Warning: #f59e0b (amber)
  - Danger: #ef4444 (red)
  - Info: #2563eb (blue)

### User Experience
- **Responsive charts** using Recharts library
- **Interactive tooltips** with formatted currency values
- **Hover effects** on cards and interactive elements
- **Color-coded data** for quick insights
- **Smooth transitions** between tabs
- **Loading states** for better UX
- **Error handling** with clear messages

### Data Formatting
- Currency values formatted with $ and commas
- Dates formatted as "MMM YYYY" (e.g., "Jan 2026")
- Percentages shown to 1 decimal place
- Large numbers abbreviated in charts (e.g., "$50k")

## Key Insights Provided

### Customer Analytics
- Identify top revenue-generating customers
- Track customer concentration risk
- Monitor invoice patterns
- Spot revenue trends

### AR/AP Aging
- Monitor collection efficiency
- Track payment patterns
- Identify aging issues early
- Calculate DSO/DPO metrics
- Optimize cash flow

### Product Performance
- Identify best/worst performers
- Track margin trends
- Analyze sales velocity
- Make data-driven product decisions

### Inventory Management
- Monitor inventory levels
- Track inventory value
- Identify high-value items
- Optimize stock levels

## Technical Implementation

### Components
- Single component: `app/components/operations/OperationsTab.tsx`
- Uses Recharts for all visualizations
- Fetches data from `/api/operational-data` endpoint
- Includes authentication and authorization

### API Integration
- GET `/api/operational-data?companyId={id}&type={type}`
- Types: `customers`, `ar-aging`, `ap-aging`, `products`, `inventory`
- Returns both raw records and calculated summaries
- Includes error handling and loading states

### Data Flow
1. User selects company
2. Overview loads summary counts
3. User clicks tab
4. Component fetches specific data type
5. Data is processed for charts and tables
6. Results displayed with formatting

## Future Enhancements

Potential additions:
- Export to Excel functionality
- Date range filters
- Drill-down capabilities
- Alerts for aging thresholds
- Comparison views (month-over-month, year-over-year)
- Integration with financial data for comprehensive analysis
- Real-time QuickBooks sync status
- Automated insights and recommendations

## Usage

1. Log in to Corelytics
2. Select a company
3. Click "OPERATIONS" in the navigation
4. Explore the different tabs
5. Use charts and tables to gain insights

All data is automatically filtered by the selected company and requires proper authentication.

