Corelytics User Manual
Updated: January 2026


This manual explains how to use Corelytics as a consultant or business user. It focuses on core workflows: onboarding, connecting data, mapping accounts, processing data, and analyzing results.

A.  Who This Is For
* Consultants who manage multiple client companies
* Business users who manage their own company data

B.  Roles at a Glance
* Consultant (Primary Contact): Can add companies, manage team members, and manage billing.
* Consultant (Team Member): Can work on assigned companies; limited billing and administrative access.
* Business User: Can manage their own company; cannot manage other companies.
* Company Users: Client users added by a consultant for a specific company.

C. Sign In Page 
This document explains the fields and actions on the Corelytics sign-in page, including password requirements, forgot-password flow, and affiliate codes.

 Sign In Form
* Email: The account email address. 
* Password: The account password. A show/hide toggle is available. Passwords are case sensitive
* Forgot Password?: Opens the reset flow to request a password reset email.
* Sign In: Submits the login form.
* Register as Consultant: Switches to the consultant registration form.
* Register Your Business: Opens the business registration page.

 Password Requirements
Password rules are enforced during registration and password changes:

* At least 8 characters
* At least one uppercase letter (A�Z)
* At least one lowercase letter (a�z)
* At least one number (0�9)
* At least one special character (`!@$%^&`)

 Forgot Password Flow

1. Click Forgot Password?
2. Enter the email address used for the account.
3. Submit the form to receive reset instructions.
4. Follow the link in the email to set a new password.

 Affiliate Codes (Business Registration)
Affiliate codes are used during business registration (not standard sign-in).

* Purpose: Apply partner pricing or tracking for referred accounts.
* Source: Provided by an approved affiliate or partner.
* Validation: The code is checked against the selected affiliate before registration is submitted.

Multi-Factor Authentication (Required)
MFA is mandatory for all accounts.

1. Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or any TOTP app).
2. Scan the QR code during setup.
3. Enter the 6-digit code to confirm.
4. Save the backup codes.

Trusted Devices: You can remember a device for 100 days, up to 5 devices total.

D. Consultant Dashboard

Consultants see two main tabs:

* Company List: Select a company or add a new one.
* Team Management: Add or remove consultant team members (primary contact only).

 Add a Company (Consultant)

1. Go to Company List.
2. Click Add Company.
3. Enter the company name.
4. Open the company to complete details.

 Manage Team Members

1. Go to Team Management.
2. Click Add Team Member.
3. Provide name, email, phone, title, and password.
4. Save.

E. Company Management
Once a company is selected, you can manage:

* Company profile (address, industry, accounting system, company size).
* Users associated with the company.
* Set User admin rights
* Assessment users (if enabled in your workflow).

F.  Connect Accounting Data
Corelytics can connect to any API-based accounting system you authorize or accept file uploads.

 A) Accounting API Connection
1. Open the company.
2. Go to Accounting API Connections (or the import area).
3. Select your accounting system and connect.
4. Authorize access.
5. Confirm connection status.

 B) Excel Trial Balance Import
1. Go to Excel Import.
2. Upload an `.xlsx` or `.xls` file.
3. Ensure the file includes:
a. Account name/description
b. (Optional) account number
c. Monthly balances (36 months recommended)
5. Upload and review the preview.

G.  Data Mapping
Mapping is required before analysis. Corelytics standardizes your chart of accounts (COA) so all reports, benchmarks, and analytics use consistent categories.

 Account Mapping
1. Open Account Mapping.
2. Review AI suggestions (if available).
3. Assign each account to the correct target category.
4. Save mappings.

Tip: Mappings are saved per company and reused on future imports.

H.  LOB (Line of Business) Mapping

If your company tracks multiple service lines or product lines, use LOB mapping to split accounts by business line.

1. Open LOB Allocation within Account Mapping.
2. Define your Lines of Business (for example, Services, Hardware, Subscription).
3. Allocate each account across LOBs using percentages that total 100%.
4. Save the LOB allocations.

Why this matters: LOB mapping enables profitability, margin, and trend reporting by line of business instead of only company-wide totals.

I. Data Review
After mapping, Corelytics runs data checks before processing.

1. Open Data Review.
2. Validate that all required accounts are mapped.
3. Check for missing months, outliers, or obvious misclassifications.
4. Fix any issues by returning to Account Mapping.

Process Monthly Data

After the review:

1. Go to Account Mapping.
2. Click Process & Save Monthly Data.
3. Wait for the confirmation message.


J.  Dashboard (Customizable)

The dashboard is a customizable workspace. Users can choose which widgets appear, show or hide tiles, and save their personal layout for each company.

* Customize the view to highlight KPIs, scorecards, and trends that matter most.
* Save preferences so your dashboard layout persists across sessions.
* Use it as a launch point before drilling into detailed reports.

K.  Analysis (AI-Enabled)
 What Analysis Includes

The Analysis section contains one context view plus four AI-enabled workspaces:

1. Overview (context and controls)
2. Focus Board (AI-enabled)
3. Trend Explorer (AI-enabled)
4. Anomaly Inbox (AI-enabled)
5. Opportunity Workspace (AI-enabled)

The four AI-enabled functions are Focus Board, Trend Explorer, Anomaly Inbox, and Opportunity Workspace.

Overview (Context + Controls)
Use Overview to confirm inputs, scope, and data readiness before running AI agents.

* Industry group context used for benchmarks.
* Operational profile and suggested goal areas.
* Data range coverage for financial and operational datasets.
* Window selector to choose the analysis horizon (12/24/36 months).
* Run Performance Agents button to generate findings used across the AI views.

Focus Board (AI-Enabled)
Focus Board is the executive triage view. It groups AI findings into action buckets:

* Fix Now
* Investigate
* Monitor
* Opportunities

Each card summarizes the metric, signal, and severity/priority so you can decide what to address first. It is designed for leadership review and weekly operating cadence.

Trend Explorer (AI-Enabled)
Trend Explorer connects AI findings to the underlying financial time series.

* Displays key metric trends (revenue, margins, operating expenses, cash, AR, inventory).
* Includes benchmarks and goals where available.
* Provides narrative drivers that explain what is moving the trend and why.
* Helps validate AI findings with the raw data patterns.

Anomaly Inbox (AI-Enabled)
Anomaly Inbox collects outlier signals for fast investigation.

* Filter by severity (high, medium, low).
* Each anomaly includes supporting evidence and a likely cause.
* Use Run Performance Agents to refresh anomalies as new data arrives.

Opportunity Workspace (AI-Enabled)
Opportunity Workspace turns AI findings into an execution pipeline.

* Filter by objective (cash, margin, growth, risk).
* Filter by time to impact and owner.
* Track opportunity status from Discover ? Validate ? Plan ? Execute ? Realized.
* Evidence strength and impact ranges help prioritize the queue.

L. Ask Corelytics
This section explains how Ask Corelytics works, how to use the default questions, and how to create and save your own questions.

 What Ask Corelytics Does
Ask Corelytics provides AI-assisted Q&A against your company data. It supports:

* AI Search with citations.
* Period Review for a selected period (daily operations + monthly COA).

 Default Questions
When you open Ask Corelytics, the system loads a set of default questions. These questions are grouped by category and tailored to the selected company name.

Default categories include:

* Company
* Daily Operations
* Monthly COA
* Peers / Market
* Opportunities

These presets are designed to give you a fast starting point for common analysis needs.

 Running a Default Question

1. Select a category.
2. Click a default question.
3. The response is generated and shown below the input area.

 Creating New Questions

1. Open question editing mode.
2. Choose a category.
3. Enter your custom question.
4. Click Add to insert it into the category list.

 Saving Your Questions
Custom questions are saved per company.

* When you click Save, your changes are stored in the browser for the selected company.
* The saved questions load automatically the next time you open Ask Corelytics for that company.

 Resetting to Defaults

If you want to remove customizations, use Reset to restore the default question set.

 Notes
* If saved questions cannot be loaded, the system falls back to the default list.
* Ask Corelytics only runs a question when it has non-empty text.

M. Ratios and Trends
This section explains the Ratios and Trend Analysis pages, including their sub-tabs and what each one does.

Ratios Page
The Ratios page provides KPI ratios derived from monthly COA data, with optional industry benchmarks. It has three sub-tabs:

Ratio Graphs
This tab is a visual dashboard of ratio trends. It groups charts by category and plots each ratio over time:

* Liquidity: Current Ratio, Quick Ratio
* Activity: Inventory Turnover, Receivables Turnover, Payables Turnover, Days� Inventory, Days� Receivables, Days� Payables, Sales/Working Capital
* Coverage: Interest Coverage, Debt Service Coverage, Cash Flow to Debt
* Leverage: Debt/Net Worth, Fixed Assets/Net Worth, Leverage Ratio
* Operating: Total Asset Turnover, ROE, ROA, EBITDA Margin, EBIT Margin

Features:

* Each chart includes a benchmark line when available.
* Each chart includes a Formula button to view the calculation.
* Color-coded charts make category scanning easier.

Priority Ratios
This tab lets users build a custom KPI list for a company.

What it does:

* Select up to 10 ratios from a categorized dropdown.
* Save selections per company (persisted in the browser).
* Remove ratios directly from the grid.
* Print the custom selection.

Best use: executive dashboards or board-level reporting.

Monthly Ratios by Category
This tab shows a table-style view of ratios by month:

* Displays the last 12 months of values.
* Organized by the same ratio categories (Liquidity, Activity, Coverage, Leverage, Operating).
* Includes Export to Excel for offline analysis.

Best use: detailed review, month-over-month variance checks, and audit prep.

Trend Analysis Page
Trend Analysis provides deeper time-series views outside of ratios. It has two sub-tabs:

Item Trends
This tab allows you to select financial metrics and chart them over time.

Selectable metrics include:
* Revenue
* Gross Profit
* Total Operating Expenses
* EBIT / EBITDA / Net Income
* Cash
* Current Assets / Fixed Assets / Total Assets
* Accounts Payable / Long Term Debt / Total Equity

Features:
* Multi-select checkboxes (choose multiple metrics).
* Dynamic chart rendering with distinct colors for each metric.
* Useful for spotting growth, margin pressure, and balance sheet shifts.

Expense Analysis
This tab focuses on expense-category trends from the master data store.

What it does:

* Pulls dynamic expense categories based on the company�s mapped COA.
* Adds Total Operating Expenses as a synthesized category.
* Charts category trends over time for expense management and benchmarking.
Best use: identify structural cost creep, variance drivers, and budget pressure.

N. Working Capital
Working Capital includes summary cards and trend visuals:

* Current Working Capital card shows current assets minus current liabilities and the month-over-month change.
* Working Capital Ratio card displays the liquidity ratio with interpretation guidance.
* Days Working Capital card converts working capital into days of revenue coverage.
* Cash Conversion Cycle card summarizes DIO + DSO - DPO for operational efficiency.
* Working Capital Trend graph shows last 36 months of working capital.
* Cash Trend graph tracks cash levels over time.
* Current Assets vs Liabilities line chart compares liquidity drivers.
* Inventory Trend graph highlights stock and working-capital pressure.

 
O.  Goals and Projections
This document explains the Goals and Projections pages, their sub-tabs, and the methods used for projections.
 Goals Page
The Goals page lets you set targets for both financial (COA) and operational metrics. It has two sub-tabs:
Expense Goals
Uses monthly COA data to set target percentages for:
* COGS categories
* Operating expense categories
How it works:
* The system loads the last 6 months of category percentages.
* It calculates 6?month averages for COGS and operating expense totals.
* You can enter or adjust target percentages per category.
* Goals are saved per company.
Primary use: cost structure management and budget targets.
Operational Goals
Lets you set targets for operational metrics such as:
* AR aging
* AP aging
* Cash
* Inventory
How it works:
* Pulls the last 6 months of operational data for context.
* You can set target values for each operational KPI.
* Goals are saved per company and used across operational dashboards.
Primary use: improve cash cycle, collections, and working?capital discipline.
 Projections Page
The Projections page generates forward-looking scenarios using historical COA data. It requires at least 24 months of history. The projection model utilizes the Holt?Winters model with seasonality.
 Projection Outputs
The page generates 12 months of forecasts for:
* Revenue
* Expense (total operating expenses, excluding income taxes)
* Net Income
* Total Assets
* Total Liabilities
* Total Equity
Each chart includes three scenarios:
* Most Likely
* Best Case
* Worst Case
Projection Method
Projects Revenue, COGS, and Operating Expenses using Holt?Winters triple exponential smoothing with:
* Seasonal period: 12 months
* Alpha: 0.2 (level)
* Beta: 0.1 (trend)
* Gamma: 0.1 (seasonality)
Balance Sheet Items
Total assets and total liabilities use average monthly growth based on the last 12 months vs the prior 12 months.
Other Income/Expense & Taxes
Interest, non?operating income, extraordinary items, and taxes are projected as average ratios to revenue based on the last 12 months.
Scenario Adjustments
The system modifies the base forecast to build scenarios:
* Most Likely: standard Holt?Winters output
* Best Case: higher revenue trend, lower COGS/opex trend, lower interest/taxes, higher non?op income
* Worst Case: lower revenue trend, higher COGS/opex trend, higher interest/taxes, lower non?op income
Fallback Method
If there is insufficient data for Holt?Winters, projections fall back to simple growth using the average growth rate across the available history.
P.  Operations Dashboard
Powered by operational data from connected accounting system:

Overview Tab

* Summary cards for all five data types
* Record counts for each category
* Quick navigation into detailed tabs

Customer Analytics

* KPI cards for total customers, revenue, and invoices
* Revenue trend chart and customer concentration chart
* Table of top customers by revenue and invoice metrics

AR Aging

* KPI cards for total AR, current %, over 30 days %, and over 90 days %
* Aging trend chart with color-coded buckets
* Table of monthly aging detail

AP Aging

* KPI cards for total AP, current %, over 30 days %, and over 90 days %
* Aging trend chart
* Table of monthly AP aging detail

Product Sales

* KPI cards for total products, total revenue, and margin %
* Product revenue trend chart
* Table of product performance with margin indicators

Inventory

* KPI cards for total items, total value, and total units
* Inventory value trend chart and distribution chart
* Table of current inventory with value and quantity

Data Refresh Cadence

* COA financial data is loaded monthly.
* Operational data can be configured to auto-load daily.

Q.  Payments & Subscription (Consultants)
If your plan requires payment:

1. Open the Payments & Subscription tab.
2. Select a plan (monthly, quarterly, annual).
3. Complete checkout.
4. Manage payment methods and view billing history.

R.  Notifications
Corelytics sends email notifications for new registrations. Contact support if you need account or billing assistance.

S.  Troubleshooting
Common issues and fixes:

* Data missing in reports: Confirm mapping is complete, then reprocess data.
* Wrong benchmarks: Verify the industry sector is set correctly.
* Connection issues: Verify your accounting system authorization is still active.
* Missing months: Verify the import file includes all months.

T. Support

For help:

Email: `support@corelytics.com`



