# 🚀 Quick Start Guide - Financial Score Calculator

## ✅ Project Status: READY

Your **Corelytics Financial Score Calculator** is now running!

### 🌐 Access Your Application

**URL:** [http://localhost:3000](http://localhost:3000)

The development server is running in the background.

---

## 📊 What This App Does

**Venturis Financial Score Calculator** analyzes your company's financial health by:

1. **Uploading monthly financial data** (CSV or Excel)
2. **Calculating Revenue Growth Score (RGS)** from 24-month trends
3. **Applying 6-month adjustments** for recent performance
4. **Adding spread bonus** (+30 if revenue growth beats expense growth by 10pp)
5. **Showing balance sheet metrics** (Current Ratio, Quick Ratio, Net Working Capital, Net Debt)
6. **Generating a final score** (0-130 scale)

---

## 🎯 How to Use

### Step 1: Prepare Your Data
Create a CSV or Excel file with:
- **One row per month** (at least 24 months)
- **Column headers** in first row
- **Date column** (any format: YYYY-MM, MM/YYYY, etc.)
- **Financial data columns** (see below)

### Step 2: Upload File
1. Open [http://localhost:3000](http://localhost:3000)
2. Click "Choose File" or drag and drop
3. Select your CSV or Excel file

### Step 3: Map Columns
The app will auto-detect common column names, but you can:
- Verify the Date column is correct
- Map Revenue, Expense, and Balance Sheet columns
- Leave optional columns blank (they'll default to 0)

### Step 4: View Results
Instantly see:
- ✅ **Income Statement Metrics** (LTM revenue/expense growth)
- ✅ **Revenue Growth Score** with 6-month adjustment
- ✅ **Balance Sheet Snapshot** (most recent month)
- ✅ **Key Financial Ratios** (Current Ratio, Quick Ratio, etc.)
- ✅ **Final Score** (large display)

---

## 📋 Sample Data Structure

### Minimum (P&L Only)
```csv
Date,Revenue,Expense
2023-01,100000,75000
2023-02,105000,76000
2023-03,110000,77000
... (24 months total)
```

### Complete (P&L + Balance Sheet)
```csv
Date,Revenue,Expense,Cash,AR,Inventory,AP,Long Term Debt
2023-01,100000,75000,50000,25000,15000,20000,100000
2023-02,105000,76000,52000,26000,16000,21000,100000
... (24 months total)
```

---

## 🎨 Features

### ✨ Professional UI
- Corelytics branding
- Modern, clean design
- Responsive layout
- Color-coded metrics (green = good, red = warning)

### 📈 Smart Calculations
- **RGS Bands:** Scores from 10-100 based on 24-month growth
- **6-Month Curve:** Adjusts for recent trends
- **Spread Bonus:** Rewards revenue growing faster than expenses
- **Auto-Derived Totals:** Calculates TCA/TCL if not provided

### 🔍 Balance Sheet Analysis
- **Current Ratio:** Should be ≥ 1.5 (healthy liquidity)
- **Quick Ratio:** Should be ≥ 1.0 (strong short-term position)
- **Net Working Capital:** Positive = good operational efficiency
- **Balance Check:** Highlights any Assets ≠ Liabilities & Equity

---

## 📊 Understanding Your Score

| Score Range | Meaning |
|-------------|---------|
| **100-130** | 🟢 Excellent - Strong growth with efficiency |
| **80-99** | 🟢 Very Good - Solid growth trajectory |
| **60-79** | 🟡 Good - Stable with moderate growth |
| **40-59** | 🟡 Fair - Flat or slight decline |
| **0-39** | 🔴 Needs Improvement - Significant decline |

### Bonus Points
- **Spread Bonus (+30):** Earned when (Revenue Growth% - Expense Growth%) > 10 percentage points
- **Max Score:** 130 points

---

## 🛠️ Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

---

## 📁 Project Structure

```
FinancialScore/
├── app/
│   ├── page.tsx         # Main application (all logic here)
│   ├── layout.tsx       # Root layout with metadata
│   └── globals.css      # Global styles
├── public/
│   └── corelytics-logo.jpg  # Corelytics branding
├── package.json
├── tsconfig.json
├── next.config.js
├── README.md           # Full documentation
└── QUICK_START.md      # This file
```

---

## 🐛 Troubleshooting

### Server Not Starting?
```bash
cd C:\Users\steve\FinancialScore
npm run dev
```

### Port Already in Use?
The app will automatically use the next available port (3001, 3002, etc.)

### File Upload Not Working?
- Ensure your file is CSV or Excel (.xlsx, .xls)
- Check that you have column headers in the first row
- Verify Date column is in a recognizable format

### No Score Showing?
- Need at least **24 months** of data for score calculation
- Ensure Date and Revenue columns are mapped correctly
- Check that revenue values are numeric (not text)

---

## 🎓 Tips for Best Results

1. **Clean Data:** Remove any summary rows, totals, or formatting
2. **Consistent Dates:** Use same format throughout (YYYY-MM recommended)
3. **24+ Months:** More data = more accurate trends
4. **Complete Balance Sheet:** Provides comprehensive financial picture
5. **Monthly Frequency:** One row per month (no gaps)

---

## 📞 Support

Questions or issues? Contact your Corelytics administrator.

---

**Enjoy analyzing your financial health with Corelytics!** 🎉

© 2025 Corelytics. All rights reserved.


