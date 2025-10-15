# 📈 Financial Score Trends - Feature Guide

## ✅ NEW: Results Page with Line Charts

Your Financial Score Calculator now includes a **Financial Score Trends** page with time-series analysis!

---

## 🆕 What's New

### 1. **Navigation Tabs**
- **Upload & Calculate** - Main calculator page
- **Financial Score Trends** - NEW trend analysis page (appears after uploading data)

### 2. **Rolling Calculations**
The app now calculates scores for **every month** (not just the latest):
- Each month uses a 24-month lookback window
- Creates a time-series of all scores
- Shows how your financial health has evolved

### 3. **Six Interactive Line Charts**

#### Chart 1: **Final Financial Score** (Blue)
- Overall Corelytics Financial Score
- Average of Profitability + ADS
- Range: 10-100

#### Chart 2: **Profitability Score** (Green)
- Combined RGS + adjustments
- Range: 10-100

#### Chart 3: **Revenue Growth Score (RGS)** (Blue)
- Base RGS before adjustments
- Range: 10-100

#### Chart 4: **Adjusted RGS** (Cyan)
- RGS after 6-month growth adjustment
- Range: 10-100

#### Chart 5: **Asset Development Score (ADS)** (Purple)
- Balance sheet health score
- Only shows if balance sheet data provided
- Range: 10-100

#### Chart 6: **Asset-Liability Ratio (ALR-1)** (Light Purple)
- Raw ALR-1 ratio over time
- Only shows if balance sheet data provided
- Dynamic range

---

## 📊 Chart Features

### Visual Elements
✅ **Line graph** with smooth rendering  
✅ **Data points** (hover to see exact values)  
✅ **Grid lines** at 0, 25, 50, 75, 100  
✅ **X-axis labels** (month dates)  
✅ **Y-axis labels** (score values)  

### Statistics Display
Each chart shows:
- **Current** - Most recent month's score
- **Average** - Mean score across all months
- **Min** - Lowest score in the period
- **Max** - Highest score in the period

---

## 📁 Sample Files for Testing

### 24-Month File (Basic)
**File:** `sample_financial_data.csv` (in Downloads)
- Shows current scores only
- No trend analysis

### 36-Month File (Full Trends) ⭐ NEW
**File:** `sample_financial_data_36months.csv` (in Downloads)
- Shows 13+ months of trend data
- Complete ADS calculations with ALR-13
- Full trend visualization

---

## 🚀 How to Use

### Step 1: Upload Data
1. Go to **Upload & Calculate** tab
2. Upload your CSV/Excel file (24-36 months)
3. Map columns as needed

### Step 2: View Trends
1. Click **Financial Score Trends** tab (appears after upload)
2. See all 6 line charts
3. Analyze trends over time
4. Compare scores across months

### Step 3: Analyze
- Look for **upward trends** (improving scores)
- Identify **downward trends** (declining performance)
- Compare **Profitability vs ADS** trends
- Check if scores are **stable or volatile**

---

## 📊 Data Requirements for Trends

### Minimum for Trends
- **24 months** - Basic trends (Profitability Score only)
- **36 months** - Full trends with complete ADS

### Recommended
- **36+ months** - Best trend visibility
- **Complete balance sheet** - See all 6 charts
- **Consistent data** - No gaps in months

---

## 🎯 What Each Trend Tells You

### Final Financial Score Trend
- **Overall health** over time
- Combining profitability and assets
- Target: Steady growth or maintain high score

### Profitability Score Trend
- **Revenue growth** performance
- Impact of **expense management**
- Shows if revenue growth is sustainable

### RGS Trend
- **Pure revenue growth** before adjustments
- Long-term growth trajectory
- Identifies growth acceleration/deceleration

### Adjusted RGS Trend
- How **recent performance** (6-month) affects score
- Shows if momentum is improving or declining
- More reactive than base RGS

### ADS Trend
- **Balance sheet health** over time
- Asset growth vs liability growth
- Leverage and financial stability

### ALR-1 Ratio Trend
- **Raw ratio** without scoring
- Direct view of Assets/Liabilities relationship
- Higher = better financial position

---

## 💡 Insights from Trends

### Good Signs (Green Flags)
✅ Scores trending **upward**  
✅ **Consistent** performance (low volatility)  
✅ Profitability and ADS **moving together**  
✅ ALR-1 ratio **increasing** (assets growing faster)  

### Warning Signs (Red Flags)
⚠️ Scores trending **downward**  
⚠️ **High volatility** (erratic scores)  
⚠️ Profitability and ADS **diverging**  
⚠️ ALR-1 ratio **decreasing** (liabilities growing faster)  

---

## 🔄 Calculation Details

### Rolling Window Approach
For each month starting at month 24:
1. Take that month + previous 23 months (24 total)
2. Calculate RGS from those 24 months
3. Calculate 6-month adjustment
4. Calculate expense adjustment
5. Compute Profitability Score
6. If month ≥ 36: Calculate ALR-13 and ADS
7. Compute Final Score

### Example with 36 Months
- Month 24: First score (uses months 1-24)
- Month 25: Second score (uses months 2-25)
- Month 26: Third score (uses months 3-26)
- ...
- Month 36: Thirteenth score (uses months 13-36) ← First ADS score

Result: **13 data points** for Profitability, **1 data point** for ADS with 36 months

---

## 📝 Technical Notes

### Chart Implementation
- **SVG-based** line charts
- Fully responsive
- Hover tooltips on data points
- Auto-scaling Y-axis (or fixed 0-100)

### Performance
- Calculations run in **useMemo** hooks
- Efficient rolling window algorithm
- Instant chart rendering

---

## 🎨 Color Coding

| Chart | Color | Meaning |
|-------|-------|---------|
| Final Score | Dark Blue | Overall financial health |
| Profitability | Green | Revenue performance |
| RGS | Blue | Base revenue growth |
| Adjusted RGS | Cyan | Recent-adjusted growth |
| ADS | Purple | Balance sheet health |
| ALR-1 Ratio | Light Purple | Asset/liability ratio |

---

## 🚀 Next Steps

### Test with Sample Data
1. Upload **`sample_financial_data_36months.csv`** from Downloads
2. Click **Financial Score Trends** tab
3. See 13 months of trend data
4. Analyze the trajectory!

### Use Your Own Data
- Export 36 months from your accounting system
- Follow the CSV format (Date, Revenue, Expense, Total Assets, Total Liabilities, Total Equity)
- Upload and analyze!

---

## 📞 Support

Questions? Contact your Corelytics administrator.

© 2025 Corelytics. All rights reserved.

---

**Happy analyzing!** 📊📈


