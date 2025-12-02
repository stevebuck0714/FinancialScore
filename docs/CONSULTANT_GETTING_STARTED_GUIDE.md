# Corelytics Consultant Getting Started Guide

Welcome to Corelytics! This guide will walk you through everything you need to know to get started as a consultant, from registration to analyzing your first client's financial data.

---

## Table of Contents

1. [Registration](#1-registration)
2. [Initial Login & Dashboard Overview](#2-initial-login--dashboard-overview)
3. [Setting Up Your Profile](#3-setting-up-your-profile)
4. [Adding Your First Client Company](#4-adding-your-first-client-company)
5. [Connecting QuickBooks](#5-connecting-quickbooks)
6. [Importing Financial Data](#6-importing-financial-data)
7. [Mapping Accounts](#7-mapping-accounts)
8. [Processing Monthly Data](#8-processing-monthly-data)
9. [Analyzing Financial Reports](#9-analyzing-financial-reports)
10. [Managing Your Team](#10-managing-your-team)
11. [Tips & Best Practices](#11-tips--best-practices)

---

## 1. Registration

### Step 1: Navigate to Registration
1. Go to the Corelytics website
2. Click **"Register"** or **"Get Started"**
3. Select **"Consultant"** as your account type

### Step 2: Complete Registration Form
Fill in the required information:

| Field | Description |
|-------|-------------|
| **Full Name** | Your full legal name |
| **Email** | Your business email address (this will be your login) |
| **Phone** | Your contact phone number |
| **Password** | Create a strong password (min 8 characters, uppercase, lowercase, number, special character) |
| **Company Name** | Your consulting firm's name |
| **Company Address** | Your business address |
| **Website** | Your company website (optional) |

### Step 3: Affiliate Code (Optional)
If you have an affiliate code from a partner, enter it during registration to receive special pricing.

### Step 4: Submit & Verify
Click **"Register"** to create your account. You'll be automatically logged in and directed to your dashboard.

---

## 2. Initial Login & Dashboard Overview

### Your Dashboard
After logging in, you'll see your main Consultant Dashboard with the following sections:

**Left Sidebar Navigation:**
- 📊 **Dashboard** - Your main overview
- 📈 **Financial Ratios** - Industry benchmark comparisons
- 💰 **Working Capital** - Cash flow analysis
- 📋 **M&A Due Diligence** - Merger & acquisition tools
- 🎯 **Financial Score** - Overall financial health score
- ⚙️ **Settings** - Account settings

**Main Dashboard Tabs:**
- **Company List** - View all your client companies
- **Company Management** - Add/edit company details
- **Team Management** - Manage your team members
- **Payments** - Subscription and billing information

---

## 3. Setting Up Your Profile

Before adding clients, ensure your consultant profile is complete:

1. Navigate to **Settings** or click your profile icon
2. Update your:
   - Contact information
   - Company details
   - Business address
3. Save your changes

---

## 4. Adding Your First Client Company

### Step 1: Go to Company Management
1. From your dashboard, click the **"Company Management"** tab
2. Click **"+ Add Company"**

### Step 2: Enter Company Details
Fill in the client company information:

| Field | Description |
|-------|-------------|
| **Company Name** | Client's business name |
| **Industry Sector** | Select from the dropdown (important for benchmarking!) |
| **Address** | Company street address |
| **City, State, ZIP** | Location details |

### Step 3: Set Up Primary Contact
Create a login for your client's primary contact:

| Field | Description |
|-------|-------------|
| **Contact Name** | Primary user's full name |
| **Email** | Their email (will be their login) |
| **Phone** | Contact phone number |
| **Password** | Create their initial password |

### Step 4: Select Subscription Plan
Choose a billing plan for the company:
- **Monthly** - Billed monthly
- **Quarterly** - Billed every 3 months (discounted)
- **Annual** - Billed yearly (best value)

### Step 5: Affiliate Code (Optional)
If you have an affiliate code for special pricing, enter it here.

### Step 6: Save
Click **"Create Company"** to add the client. They will now appear in your Company List.

---

## 5. Connecting QuickBooks

Corelytics integrates directly with QuickBooks Online for seamless data import.

### Step 1: Select the Company
1. From your **Company List**, click on the company you want to connect
2. Navigate to the **"Accounting API Connections"** tab

### Step 2: Connect QuickBooks
1. Click **"Connect to QuickBooks"**
2. You'll be redirected to Intuit's secure login page
3. Log in with the QuickBooks credentials for that company
4. Authorize Corelytics to access the accounting data
5. You'll be redirected back to Corelytics

### Step 3: Verify Connection
Once connected, you'll see:
- ✅ **Status: Connected**
- Company name from QuickBooks
- Last sync date

> **Note:** QuickBooks connection requires the client to have QuickBooks Online. Desktop versions require manual Excel import.

---

## 6. Importing Financial Data

You have two options for importing financial data:

### Option A: QuickBooks Import (Recommended)
If QuickBooks is connected:
1. Go to the **"Excel Import"** tab (it handles both Excel and QB imports)
2. Click **"Import from QuickBooks"**
3. Select the date range for import
4. Click **"Import"**
5. Data will be automatically pulled and ready for mapping

### Option B: Excel Import
For clients without QuickBooks Online or with other accounting systems:

1. Go to the **"Excel Import"** tab
2. Click **"Choose File"** or drag and drop your Excel file
3. Supported formats: `.xlsx`, `.xls`

#### Excel File Requirements:
- **Trial Balance format** with account names and monthly balances
- **Columns should include:**
  - Account Name or Description
  - Account Number (optional but helpful)
  - Monthly balance columns (e.g., Jan, Feb, Mar...)
- **36 months of data** is ideal for comprehensive analysis

4. Click **"Upload"** to process the file
5. You'll see a preview of the imported data

---

## 7. Mapping Accounts

This is the most important step! Mapping tells Corelytics how to categorize each account for financial analysis.

### Step 1: Go to Data Mapping
Navigate to the **"Data Mapping"** tab after importing data.

### Step 2: Understanding the Mapping Interface

You'll see a list of all accounts from the import with:
- **Source Account Name** - The account name from QuickBooks/Excel
- **Suggested Mapping** - AI-suggested category (if available)
- **Target Category** - Dropdown to select the correct category

### Step 3: Map Each Account

For each account, select the appropriate target category:

**Asset Categories:**
- Cash & Cash Equivalents
- Accounts Receivable
- Inventory
- Prepaid Expenses
- Fixed Assets
- Other Assets

**Liability Categories:**
- Accounts Payable
- Accrued Expenses
- Short-term Debt
- Long-term Debt
- Other Liabilities

**Equity Categories:**
- Common Stock
- Retained Earnings
- Owner's Equity/Draws

**Revenue Categories:**
- Sales Revenue
- Service Revenue
- Other Income

**Expense Categories:**
- Cost of Goods Sold
- Payroll & Benefits
- Rent & Utilities
- Auto & Travel
- Professional Services
- Marketing & Advertising
- Office Expenses
- Depreciation
- Interest Expense
- Other Expenses

### Step 4: Using AI-Assisted Mapping
Corelytics includes AI-powered mapping suggestions:

1. Click **"AI Assist"** to get suggestions for unmapped accounts
2. The system learns from your corrections over time
3. Common accounts like "Checking", "Accounts Receivable", "Sales" are often auto-mapped

### Step 5: Save Mappings
1. Review all mappings for accuracy
2. Click **"💾 Save Mappings"** to store your work
3. Mappings are saved per company and will be remembered for future imports

### Step 6: Download Mapped Data (Optional)
Click **"📥 Download Mapped Data (CSV)"** to export a copy of the mapped data.

---

## 8. Processing Monthly Data

After mapping is complete, process the data for analysis:

### Step 1: Review Data
1. Go to the **"Data Review"** tab
2. Verify the data looks correct
3. Check for any obvious errors or missing periods

### Step 2: Process Data
1. Return to **"Data Mapping"** tab
2. Click **"⚙️ Process & Save Monthly Data"**
3. Wait for processing to complete
4. You'll see a success message when done

### Step 3: Verify Processing
Navigate to any analysis section (Financial Ratios, Working Capital, etc.) to verify data is displaying correctly.

---

## 9. Analyzing Financial Reports

Now the fun part! Explore the financial analysis tools:

### Financial Ratios
- **Liquidity Ratios** - Current ratio, quick ratio
- **Profitability Ratios** - Gross margin, net margin, ROA, ROE
- **Efficiency Ratios** - Asset turnover, inventory turnover
- **Leverage Ratios** - Debt-to-equity, interest coverage

Each ratio shows:
- Current value
- Trend over time
- Industry benchmark comparison
- Color-coded status (green = good, yellow = caution, red = concern)

### Working Capital Analysis
- Cash conversion cycle
- Days sales outstanding (DSO)
- Days inventory outstanding (DIO)
- Days payables outstanding (DPO)
- Working capital trends

### M&A Due Diligence
- Quality of earnings analysis
- Normalized EBITDA
- Customer concentration
- Vendor concentration
- Key risk indicators

### Financial Score
- Overall financial health score (0-100)
- Breakdown by category
- Historical trend
- Peer comparison

---

## 10. Managing Your Team

As your practice grows, add team members to help manage clients:

### Adding Team Members
1. Go to **"Team Management"** tab
2. Click **"+ Add Team Member"**
3. Enter their details:
   - Name
   - Email
   - Phone
   - Password
4. Click **"Add"**

### Team Member Access
Team members can:
- View all companies you've assigned to them
- Import and map data
- Generate reports
- Cannot delete companies or manage billing

---

## 11. Tips & Best Practices

### Data Quality
- ✅ Ensure 36 months of data for best trend analysis
- ✅ Verify account mappings are accurate
- ✅ Re-import data monthly to keep analysis current

### Industry Benchmarks
- ✅ Select the correct industry sector for accurate benchmarking
- ✅ Use the 6-digit NAICS code if available
- ✅ Consider sub-industry selection for more precise comparisons

### Client Collaboration
- ✅ Create company user accounts for clients to view their own data
- ✅ Use the PDF export feature to share reports
- ✅ Schedule regular review meetings to discuss findings

### Efficiency Tips
- ✅ Save mappings - they persist for future imports
- ✅ Use AI-assisted mapping to speed up the process
- ✅ Import data in bulk when possible
- ✅ Use QuickBooks integration for automatic updates

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Data not showing in reports | Verify data was processed after mapping |
| Wrong benchmark comparisons | Check industry sector selection |
| QuickBooks won't connect | Ensure using QuickBooks Online (not Desktop) |
| Missing months in analysis | Check Excel file has all months populated |
| Ratios look incorrect | Review account mappings for accuracy |

---

## Need Help?

If you encounter any issues or have questions:

- 📧 **Email:** support@corelytics.com
- 📖 **Documentation:** Available in the Help section
- 💬 **In-App Support:** Click the help icon in the bottom right

---

## Quick Reference Checklist

Use this checklist for each new client:

- [ ] Create company in Corelytics
- [ ] Set industry sector correctly
- [ ] Create primary contact login
- [ ] Connect QuickBooks OR import Excel data
- [ ] Map all accounts to correct categories
- [ ] Process monthly data
- [ ] Review Financial Ratios
- [ ] Check Working Capital analysis
- [ ] Generate Financial Score
- [ ] Share reports with client

---

**Welcome to Corelytics!** We're excited to help you deliver better financial insights to your clients. If you have any feedback on this guide or the platform, we'd love to hear from you.

*Last Updated: December 2024*

