# Corelytics Financial Score Calculator

A professional Next.js application for calculating financial health scores based on P&L and Balance Sheet analysis.

## 🎯 Features

### Financial Analysis
- **Revenue Growth Score (RGS)** - Calculated from 24-month revenue trends
- **6-Month Adjustment** - Two-quarter sum analysis for recent performance
- **P&L Metrics** - LTM vs Prior LTM comparison for Revenue and Expenses
- **Spread Bonus** - +30 bonus when Revenue growth exceeds Expense growth by 10pp
- **Final Score** - Comprehensive score from 0-130

### Balance Sheet Analysis
- **Current Ratio** - Total Current Assets / Total Current Liabilities
- **Quick Ratio** - (Cash + AR + Other CA) / Total Current Liabilities  
- **Net Working Capital** - TCA - TCL
- **Net Debt** - (LTD + TCL) - Cash
- **Balance Check** - Validates Total Assets vs Total Liabilities & Equity

### File Upload & Mapping
- **CSV/XLSX Support** - Upload monthly financial data
- **Smart Column Detection** - Auto-maps common column names
- **Flexible Mapping** - Manual override for any column
- **Data Normalization** - Automatically aggregates duplicate months

## 📊 Required Data Format

### Minimum Requirements
- **24 months** of financial data (for accurate growth calculations)
- **One row per month** with Date column
- **Column headers** in first row

### Column Types

#### Income Statement (Required)
- Date (any format: YYYY-MM, MM/YYYY, YYYY-MM-DD)
- Revenue (or Sales)
- Expense (or OpEx, Total Expense)

#### Balance Sheet - Assets (Optional)
- Cash
- Accounts Receivable
- Inventory
- Other Current Assets
- Total Current Assets (auto-calculated if not provided)
- Fixed Assets (PP&E, Property, Plant, Equipment)
- Other Assets
- Total Assets (auto-calculated if not provided)

#### Balance Sheet - Liabilities & Equity (Optional)
- Accounts Payable
- Other Current Liabilities
- Total Current Liabilities (auto-calculated if not provided)
- Long Term Debt (LT Debt, Notes Payable)
- Total Liabilities (auto-calculated if not provided)
- Total Equity (Shareholders' Equity)
- Total Liabilities & Equity (auto-calculated if not provided)

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Build for Production
```bash
npm run build
npm start
```

## 📈 How It Works

### 1. Revenue Growth Score (RGS)
Based on 24-month revenue growth percentage:
- ≥ 25% → 100 points
- 20-25% → 90 points
- 15-20% → 80 points
- 10-15% → 70 points
- 5-10% → 60 points
- 0-5% → 50 points
- -5 to 0% → 40 points
- -10 to -5% → 30 points
- -15 to -10% → 20 points
- < -15% → 10 points

### 2. 6-Month Adjustment
Recent performance (last 6 months vs previous 6 months):
- ≥ 25% → +50 points
- 15-25% → 80% of gap to 100
- 5-15% → 60% of gap to 100
- 0-5% → 40% of gap to 100
- -5 to 0% → 90% of RGS
- -15 to -5% → 70% of RGS
- -25 to -15% → 50% of RGS
- < -25% → 30% of RGS

### 3. Spread Bonus
If (Revenue Growth% - Expense Growth%) > 10 percentage points:
- **+30 bonus points**

### 4. Final Score
```
Final Score = min(130, max(0, Adjusted RGS + Spread Bonus))
```

## 🎨 Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **XLSX** - Excel/CSV file parsing
- **Lucide React** - Modern icons
- **Corelytics Branding** - Professional UI design

## 📝 Example Files

### CSV Format
```csv
Date,Revenue,Expense,Cash,Accounts Receivable,Inventory,Accounts Payable,Long Term Debt
2023-01,100000,75000,50000,25000,15000,20000,100000
2023-02,105000,76000,52000,26000,16000,21000,100000
2023-03,110000,77000,55000,27000,17000,22000,100000
...
```

### Excel Format
Any Excel file (.xlsx, .xls) with:
- First row = column headers
- One row per month
- Date column + financial metrics

## 🔍 Understanding Your Score

### Score Ranges
- **100-130** - Excellent (Strong growth with efficiency)
- **80-99** - Very Good (Solid growth trajectory)
- **60-79** - Good (Stable with moderate growth)
- **40-59** - Fair (Flat or slight decline)
- **0-39** - Needs Improvement (Significant decline)

### Key Indicators
- **Current Ratio ≥ 1.5** - Healthy liquidity
- **Quick Ratio ≥ 1.0** - Strong short-term position
- **Positive Net Working Capital** - Operational efficiency
- **Low Net Debt** - Financial flexibility

## 🛠️ Future Enhancements

- ADS (Average Daily Sales) tracking
- ALR (Accounts/Loans Receivable) metrics
- Covenant ratio monitoring
- Historical score tracking
- Export to PDF/Excel
- Multi-company comparison
- Industry benchmarking

## 📄 License

© 2025 Corelytics. All rights reserved.

## 🤝 Support

For questions or issues, contact your Corelytics administrator.

---

**Built with ❤️ by Corelytics**


