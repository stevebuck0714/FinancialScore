# FinancialScore / Corelytics Project Description

Updated: November 2026

## Table of Contents

- [Executive Summary](#executive-summary)
- [Product Purpose](#product-purpose)
- [Target Users](#target-users)
- [Core Functional Areas](#core-functional-areas)
  1. [Company and Consultant Management](#1-company-and-consultant-management)
  2. [Authentication, Security, and Access Control](#2-authentication-security-and-access-control)
  3. [Users, Company Admins, and External Users](#3-users-company-admins-and-external-users)
  4. [Accounting Data Ingestion](#4-accounting-data-ingestion)
  5. [Account Mapping and Data Standardization](#5-account-mapping-and-data-standardization)
  6. [Financial Health Score, Dashboards, and Reporting](#6-financial-health-score-dashboards-and-reporting)
  7. [Ratios, Trends, and Benchmarks](#7-ratios-trends-and-benchmarks)
  8. [Working Capital Management](#8-working-capital-management)
  9. [13-Week Cash Forecast](#9-13-week-cash-forecast)
  10. [Goals, Projections, and Forecasting](#10-goals-projections-and-forecasting)
  11. [Operational Hub and Company Pulse](#11-operational-hub-and-company-pulse)
  12. [Loans, Covenants, and Cap Table](#12-loans-covenants-and-cap-table)
  13. [Custom Reports, Custom Charts, and Report Packages](#13-custom-reports-custom-charts-and-report-packages)
  14. [AI-Assisted Analysis](#14-ai-assisted-analysis)
  15. [Ask Corelytics](#15-ask-corelytics)
  16. [Management Assessment and Readiness](#16-management-assessment-and-readiness)
  17. [Valuation, SDE, and Quality of Earnings](#17-valuation-sde-and-quality-of-earnings)
  18. [DataRoom](#18-dataroom)
  19. [Payments, Billing, and AI Usage](#19-payments-billing-and-ai-usage)
- [Data Integration Capabilities](#data-integration-capabilities)
- [Technology Architecture](#technology-architecture)
- [Data Model Highlights](#data-model-highlights)
- [Business Benefits](#business-benefits)
- [Typical End-to-End Workflow](#typical-end-to-end-workflow)
- [Competitive Positioning](#competitive-positioning)
- [Implementation Notes](#implementation-notes)

## Executive Summary

FinancialScore, branded in the application as Corelytics, is a multi-tenant financial operations and business intelligence platform for consultants, business owners, finance teams, and site administrators. The platform combines accounting data, operational data, financial ratios, benchmarks, forecasts, AI-assisted analysis, valuation and quality-of-earnings work, and secure document collaboration into one workspace.

At its core, Corelytics helps companies understand financial health, identify risks, monitor operational performance, and prioritize actions that improve cash flow, margins, profitability, valuation readiness, and management discipline. It is built to support both consultants managing multiple client companies and business users managing a single company.

The project is implemented as a Next.js and TypeScript application backed by Prisma and PostgreSQL. It includes role-based access, mandatory multi-factor authentication, accounting and operational integrations, dashboards, a 13-week cash forecast, custom reports, Ask Corelytics, valuation and Quality of Earnings workflows, loan and covenant tracking, billing and AI usage tracking, and a secure DataRoom.

## Product Purpose

Corelytics is designed to turn financial and operational data into decision-ready insight. Many small and mid-sized companies have useful data in accounting systems, ERP platforms, spreadsheets, and operational systems, but the information is often fragmented, inconsistently mapped, or difficult to interpret. Corelytics provides a structured layer on top of that data so users can:

- Standardize financial data from different accounting systems.
- Map charts of accounts into consistent reporting categories.
- Track financial health through ratios, scorecards, benchmarks, and trends.
- Monitor daily and monthly operating signals such as receivables, payables, inventory, cash, customers, products, and sales.
- Forecast cash week by week and revenue month by month.
- Use AI-assisted workflows to surface risks, anomalies, opportunities, and explanations.
- Build custom reports and charts from plain-language descriptions.
- Manage goals, projections, valuation inputs, Quality of Earnings adjustments, and SDE/EBITDA normalization.
- Share diligence materials securely through a controlled DataRoom.
- Support consultant-led advisory, lending, transaction preparation, and ongoing management workflows.

The platform follows a deterministic-first design. Source financial calculations, mappings, thresholds, forecasts, and reporting outputs are rule-based and auditable. AI is used to augment prioritization, narrative explanation, question answering, document search, report building, and opportunity discovery, rather than replacing the underlying financial logic.

## Target Users

### Consultants

Consultants can manage multiple client companies from a centralized dashboard. They can add companies, manage client access, invite team members, assign team members to specific companies, review financial and operational performance, manage billing where applicable, and use Corelytics as an advisory platform for recurring client reviews.

### Business Users

Business users manage their own company workspace. They can connect accounting data, upload trial balances, review dashboards, complete mapping workflows, analyze performance, manage goals, and use AI-assisted insights to understand company performance.

### Company Users and Company Admins

Company users are users added to a specific company, often by a consultant or administrator. Their access is scoped to the assigned company and controlled by role, sidebar section access, and Operational Dashboard page access. A Company Admin can manage users and permissions for that company.

### External Users

External users are people from outside the company, such as lenders, advisors, buyers, or partner staff, who need access to one or more client companies. They only see the companies they were added to, are never Company Admins, and never appear in Site Admin, accounting, or user-management areas. The same external account can be added to several companies.

### Site Administrators

Site administrators configure company-level settings, accounting systems, operational sync behavior, feature access, DataRoom settings, pricing, AI usage allowances, billing terms, and integration-specific controls.

## Core Functional Areas

### 1. Company and Consultant Management

Corelytics supports a multi-company operating model. Consultants can add client companies, manage consultant team members, assign company access, and work across clients without mixing company data. Business users can register and manage their own company profile.

Consultant team access is scoped by company. A team assignment matrix lets the consultant decide which team members can see which client companies, so team members only work with their assigned clients.

Company profiles include company details such as name, address, industry, accounting system, size, and related configuration. Company selection and active-company handling are central to the user experience because reporting, integrations, documents, and AI workflows are all company scoped.

### 2. Authentication, Security, and Access Control

The platform includes a full authentication system with:

- Email and password login.
- Consultant and business registration flows.
- Password reset support.
- Temporary passwords for administrator-added users, which must be replaced at first sign-in.
- Required multi-factor authentication using authenticator apps.
- Backup codes.
- Trusted device support.
- Role-based access across site admins, consultants, company admins, company users, external users, and business users.
- Company-scoped authorization checks.
- Per-user sidebar section access and Operational Dashboard page access.
- Rate limiting on sign-in and password endpoints.

MFA is mandatory for all users. Trusted devices can be remembered for a configured period and are limited per user. These controls are especially important because the platform stores sensitive financial data, accounting connections, diligence documents, and company-specific analysis.

Request authentication and routing are handled in a central request proxy (`proxy.ts`), which enforces session checks, public-route exceptions, and rate limits before requests reach the application.

### 3. Users, Company Admins, and External Users

Each company manages its own users from Manage Users. Internal users and external users are listed separately.

#### Internal Users

Company Admins, consultants, and site admins can add internal users. The administrator sets a temporary password and the user receives a welcome email. The password is never included in the email; it is shared separately. Each user's role (user or Company Admin), sidebar sections, and Operational Dashboard pages are set per company.

#### External Users

External users are added from the Invite External User form in Manage Users. They can be added by:

- The company's Company Admin.
- The primary contact (consultant admin) of the consultant firm that manages the company.
- A Corelytics Site Admin.

Adding an external user follows the same pattern as adding an internal user: the administrator enters the email, the user's own company name, and a temporary password, and Corelytics sends a welcome email without the password. What happens next depends on the email:

- **New to Corelytics:** a new external account is created with the temporary password. The user must choose a new password the first time they sign in.
- **Already an external user at another company:** the same account gets access to this company, keeps its existing password, and receives an "access added" email.
- **Added here but has not signed in yet:** the temporary password is replaced and the welcome email is resent.
- **Already active here:** the request is refused, and the user is pointed to Forgot Password.
- **An internal Corelytics account:** the request is refused. Internal accounts are never converted to external users.

The result message tells the administrator whether the email was actually delivered. If delivery fails, the account stays pending and the administrator can share the sign-in details directly or add the user again later to resend.

Rules for external users:

- They are never Company Admins.
- They only see the companies they were added to.
- They never appear in Site Admin, accounting, or site-wide user management.
- Removing an external user from a company removes only that company's access. Removing them from their last company removes the account.

Older emailed invite links are retired. People who never accepted an older invite are re-added by an administrator with a temporary password.

### 4. Accounting Data Ingestion

Corelytics supports multiple accounting data ingestion patterns so it can serve companies at different levels of accounting-system maturity.

#### API-Based Integrations

The accounting-system options currently include:

- QuickBooks Online, QuickBooks Desktop, and QuickBooks Enterprise.
- Xero.
- Infor M3 and Infor SyteLine CSI.
- Sage and Sage Intacct.
- Microsoft Dynamics and Dynamics 365.
- Acumatica.
- Epicor and Epicor Prophet 21 (P21).
- NetSuite.
- Odoo.
- SAP S/4HANA.
- IFS.
- Viewpoint Vista Cloud.
- CSV file import.

QuickBooks Online and Xero are implemented through adapter modules and OAuth-style connection flows. QuickBooks Desktop uses a desktop connector with push-style sync. Infor M3 and Infor CSI have the most extensive sync architecture, including queueing, status tracking, async processing, transforms, targeted AR and AP rebuilds, IDO discovery, and diagnostics. Vista Cloud, Sage Intacct, Acumatica (with selectable sync programs), Epicor P21, Odoo, Dynamics 365, and SAP S/4HANA are built as accounting-system plugins with their own Site Admin configuration containers. Implementation depth varies by connector.

#### File and Trial Balance Uploads

For companies that do not connect through an API, Corelytics supports spreadsheet-based import workflows. Users can upload Excel or CSV-style trial balance files that include accounts and monthly balances. The platform then previews, maps, processes, and saves monthly financial data for analysis.

Recommended imports include account names or descriptions, optional account numbers, and historical monthly balances, ideally with enough history to support trends and projections.

#### Pipeline Lanes

The financial ingestion architecture classifies sources into three main lanes:

- ERP ledger sources for ERP-style accounting systems and desktop integrations.
- Lightweight payload sources for systems such as QuickBooks Online, Xero, and Sage Intacct.
- CSV or trial balance sources for manual upload workflows.

This structure allows the platform to normalize different source formats into consistent downstream financial reporting.

### 5. Account Mapping and Data Standardization

Account mapping is one of the most important workflows in Corelytics. Imported or synced chart-of-accounts data is mapped into standardized categories so the same reports, dashboards, benchmarks, ratios, and AI workflows can work across companies with different accounting systems.

The mapping workflow supports:

- Review of imported accounts.
- AI-assisted or learned mapping suggestions where available.
- Manual assignment to target categories.
- Company-specific saved mappings.
- Reuse of mappings on future imports.
- Review and reprocessing when new accounts appear.
- Line of business allocation for companies with multiple service lines, divisions, or product categories.
- Consolidated publishing, where the financials of related entities are combined into one reporting company.

The monthly financial workflow is intentionally controlled. Operational data can sync automatically, but monthly financial statements are finalized after users review mappings, confirm month-end close is complete, and process monthly data. In-progress months are kept off KPIs, ratios, trend charts, and published statements until they are closed.

### 6. Financial Health Score, Dashboards, and Reporting

Corelytics provides financial dashboards that help users understand performance at both summary and detail levels. The dashboard experience includes customizable widgets, KPI tiles, financial score views, trends, ratios, statements, and drill-down reporting. The Corelytics Score has its own sidebar item, directly below Ask Corelytics.

Typical reporting areas include:

- Revenue.
- Gross profit.
- Operating expenses.
- EBITDA, EBIT, and net income.
- Cash.
- Current assets and liabilities.
- Fixed assets.
- Debt.
- Equity.
- Working capital.
- Expense categories.
- Balance sheet trends.
- Profit and loss analysis.

Users can customize dashboards so the most important KPIs and charts are visible for each company.

### 7. Ratios, Trends, and Benchmarks

The ratios module calculates financial health indicators from mapped monthly financial data. Categories include:

- Liquidity ratios such as current ratio and quick ratio.
- Activity ratios such as inventory turnover, receivables turnover, payables turnover, days inventory, days receivables, days payables, and sales to working capital.
- Coverage ratios such as interest coverage, debt service coverage, and cash flow to debt.
- Leverage ratios such as debt to net worth, fixed assets to net worth, and leverage ratio.
- Operating ratios such as asset turnover, return on equity, return on assets, EBITDA margin, and EBIT margin.

The platform supports chart-based ratio views, formula and description links on each Key Ratio chart, industry benchmark lines with chart axes scaled to both the series and the benchmark, priority ratio selection, monthly ratio tables, and export-oriented review workflows. Industry benchmarks also appear in Targets and Goals.

Trend analysis lets users chart financial metrics over time and compare movement across revenue, margins, expenses, cash, assets, liabilities, and equity. Expense trend analysis and COGS Analysis help identify cost creep, category-level variance, and structural margin pressure. Industry signal trend charts and customer concentration trend charts add external and customer-level context.

### 8. Working Capital Management

The working capital area focuses on liquidity and cash conversion performance. It includes:

- Current working capital.
- Working capital ratio.
- Days working capital.
- Cash conversion cycle.
- Working capital trend charts.
- Cash trend charts.
- Current assets versus current liabilities.
- Inventory trend analysis.
- AR and AP aging with trend charts and a bill summary table.

This area helps users connect balance sheet movement to operational health, cash availability, and short-term risk.

### 9. 13-Week Cash Forecast

The 13-week cash forecast projects weekly cash, line of credit usage, receivables, payables, and inventory. It can run on an accrual or cash basis.

Inputs include:

- Minimum cash buffer.
- Line of credit limit and APR.
- Credit sales percentage, historical sales lookback, and collection lag.
- AR collection and AP payment percentages.
- Inventory turns and gross margin.
- Weekly sales, operating expenses, and a signed weekly opex adjustment for one-off changes.

Each week shows receipts, cost of goods sold, direct labor, material purchases, AP payments, cash operating expenses, line of credit interest, debt principal, line of credit draws and repayments, and ending cash, line of credit, AR, AP, and inventory balances.

The forecast is anchored to the prior closed week. AR is forecast from open invoices and collection timing; AP is forecast from projected COGS, vendor history and terms, and paydown of open AP vouchers. Line of credit limits come from the loan instruments on the Loans page, and debt principal comes from every active loan amortization schedule. When forecast cash approaches or falls below the minimum buffer, Company Pulse raises a cash forecast buffer alert.

### 10. Goals, Projections, and Forecasting

Corelytics supports financial and operational goal setting. Users can define expense goals, operating goals, and target values for key metrics, with industry benchmarks shown alongside. Goals can be used to compare actual performance against expected performance and to drive management discussions.

Projection functionality uses historical financial data to forecast future performance. Where sufficient history exists, projections use Holt-Winters-style seasonality and trend logic. Outputs include forecast scenarios for:

- Revenue.
- Operating expenses.
- Net income.
- Total assets.
- Total liabilities.
- Total equity.

Scenario views include most likely, best case, and worst case outputs, and the income statement forecast shows its full horizon. These help users understand future financial direction, assess risk, and plan corrective action.

Sector-specific forecasting pages extend this where operational data supports it:

- **Customer revenue forecasts** blend customer actuals with projections and support multi-year customer plans and concentration targets.
- **Volume Forecast and Volume Forecast Rollup** forecast revenue per customer and item, with Forecast, Forecast-ADJ, and actual columns, locked prior months, and saved customer groups.
- **Monthly Forecast and Forecast Rollup** (wholesale) forecast vendor and item purchases from the order book with per-month overrides.
- **Residential real estate forecasts** use FRED macroeconomic series such as home sales, mortgage and Treasury rates, labor, income, and inflation as drivers.

Where an ERP provides them, forecast and goal actuals come directly from the ERP (for example, Infor shipments and posted invoice lines) rather than from spreadsheets.

### 11. Operational Hub and Company Pulse

Corelytics extends beyond monthly accounting statements by collecting and analyzing operational data. The Operational Hub includes areas such as:

- Customer analytics and customer concentration.
- Accounts receivable and accounts payable aging.
- Products, product sales, and product margins.
- Inventory.
- Cash.
- Daily financials.
- Vendors, vendor pricing, freight, and duties and tariffs where available.
- Sales (CRM) data when a CRM source is connected.
- Sector-specific reports for construction, manufacturing, wholesale, real estate, professional services, and retail.

The Operational Hub is customized per company with a tab-first layout. Tabs come from a sector master list, and companies can add company-specific tabs and reports. Each user's access to Operational Dashboard pages is assigned in Manage Users; users without assigned pages cannot open them, and the API enforces the same rule. When the ERP adds a new item, customer, or vendor, a banner on the Products and Vendors views links to the pages that need updating.

Company Pulse is the daily operating-risk workspace. It highlights issues that need attention, items being monitored, and policy-driven alerts. Alert types include:

- AR and AP aging changes and critical aging.
- Cash drops.
- Executive risk signals, such as revenue or gross profit deterioration, thin balance sheet liquidity, customer concentration, and product concentration.
- Sector-specific exceptions built from sector metric rules.
- Tariff rate changes above a minimum annual impact.
- 13-week cash forecast buffer alerts.
- Findings and data freshness.

Pulse supports:

- Prioritized alerts.
- Needs Attention and Monitoring groups.
- Resolved alert handling.
- Policy settings.
- Sector-default thresholds.
- Company-specific overrides.
- Alert lifecycle actions such as acknowledge, snooze, assign, reopen, and resolve.
- Explainability, including formulas, thresholds, trigger reasons, and source references.
- Data readiness indicators.

This allows leadership teams to manage operational exceptions on a daily or weekly cadence instead of waiting for month-end financial statements.

### 12. Loans, Covenants, and Cap Table

The Loans tab in the Operational Hub tracks the company's debt. It has four sub-tabs:

- **Instruments:** loans and lines of credit, with closed instruments hidden but retained.
- **Schedules:** amortization schedules for each instrument.
- **Covenants:** loan covenants, covenant types, and covenant status for lender reporting and compliance monitoring.
- **Liquidity:** available liquidity across instruments, including unused line of credit capacity.

Loan instruments are the source of truth for line of credit limits and debt principal in the 13-week cash forecast, and loans and covenants are available to Ask Corelytics.

The Cap Table is also an Operational Hub tab. It shows current ownership and financing and dilution, and values holdings from a share price to give ownership percentages by holder and by security.

### 13. Custom Reports, Custom Charts, and Report Packages

Custom Reports lets users build reports and charts by describing what they want in plain language. Corelytics turns the description into a report definition and shows a live preview. A site admin enables Custom Reports per company.

Capabilities include:

- Eight chart types: line, multi-line, bar, grouped bar, stacked bar, combo (bars and lines with optional dual axes), pie, and table.
- About 22 semantic datasets covering customer orders and sales, invoices, AR and AP transactions and aging, contracts, products, inventory, vendors, cash accounts, monthly financials, workforce and hiring, and product unit economics.
- Dimension reports that chart values by customer, product, or other category instead of by month, with product and entity filters and clean product display names.
- Financial combo charts that combine monthly financial context, such as revenue, with operational data.
- Relative date ranges (last N days, weeks, months, quarters, or years) or exact start and end dates, which can be picked up from the description.
- Saved reports that can be reopened, renamed, duplicated, and deleted, with the creator shown.
- CSV export.

Report Packages assemble selected reports into a print-ready package, with portrait or landscape set per report.

### 14. AI-Assisted Analysis

The analysis area uses structured AI-assisted workflows to help users identify performance issues and opportunities. The main analysis views are:

- Overview.
- Focus Board.
- Trend Explorer.
- Anomaly Inbox.
- Opportunity Workspace.

The Overview confirms context such as industry group, operational profile, data range, and readiness. The Focus Board groups findings into action categories such as Fix Now, Investigate, Monitor, and Opportunities. Trend Explorer connects findings to underlying time-series data. Anomaly Inbox highlights unusual signals and likely causes. Opportunity Workspace turns findings into a pipeline of possible actions with impact ranges, owners, status, evidence, and time-to-impact context. An executive briefing summarizes the most important signals.

The AI layer is designed to support management workflows by organizing evidence and prioritizing action. It works best when financial data, operational data, benchmarks, goals, and company documents are available.

### 15. Ask Corelytics

Ask Corelytics is the AI question-and-answer workspace for company-specific analysis. It is a sidebar item that a site admin can turn on or off per company, and it has three tabs.

#### Ask Corelytics Tab

Users ask questions in plain language and get answers built from company-scoped data tools. Answers include a short answer, a longer explanation, cited supporting points tagged as financials or operations, and a "How this impacts us" section. Answers give specific, quantified results, and exact period-over-period comparisons are calculated directly from the monthly figures. If a question is unclear, Ask Corelytics asks one clarifying question.

Data sources include:

- Monthly financials (income statement and balance sheet) and daily financials.
- Customer and product sales, inventory, cash, and AR and AP aging.
- Open invoices and bills, payments, and general ledger detail.
- Open and filled orders, vendors, contracts, and vendor forecasts.
- Loans and covenants.
- ERP actuals, such as product revenue from Infor.
- The operational data store, which holds connected HR, payroll, CRM, field operations, and spreadsheet data synced nightly or for a chosen date range.
- Company and sector profile, KPI ratios against industry benchmarks, and attached documents.

External web sources are off by default and can be turned on per question.

Each answer states the as-of date for its key figures, and figures more than seven days old or from months not yet closed are flagged as stale or partial. While it works, Ask Corelytics shows live progress (for example "Querying customer sales" with an elapsed timer) and streams the answer as it is written.

#### Threads, Sharing, and Email

- Every question is saved to a thread automatically, and follow-up questions keep context ("that", "why", "same period").
- **Share Thread** sends the thread to people in the company with an optional message. Recipients get an email and a read-only view, and can continue the conversation in their own thread. The sidebar shows who has viewed it.
- **Email Thread** sends a snapshot of the thread to any email address, with replies going to the sender.
- **Export Thread** downloads the thread as a Word document.

#### Suggested and Custom Questions

Suggested questions come in five groups: Financial Data, Daily Operations, Monthly COA, Peers / Market, and Opportunities. Users can add, remove, and reset their own questions per company.

#### Search Documents and Web Research Tabs

- **Search Documents** answers questions about a selected loan, financing, legal and regulatory, tax, or other document, with citations.
- **Web Research** researches a named business or person with location, aliases, excluded names, identity anchors, and a chosen scope (local, state, regional, or national), with follow-up questions.

#### Usage Tracking

AI token usage is recorded per company and per feature. Company Admins can see Ask Corelytics usage on a Token Usage tab, and Site Admin manages allowances and costs (see [Payments, Billing, and AI Usage](#19-payments-billing-and-ai-usage)).

### 16. Management Assessment and Readiness

The platform includes management assessment workflows and readiness-style views. These are designed to help companies and advisors evaluate management practices, operational maturity, and readiness for financing, sale, or improvement programs.

Assessment features include welcome screens, scoring guides, score summaries, result views, and supporting dashboards. These workflows complement the quantitative financial analysis by adding structured qualitative review.

### 17. Valuation, SDE, and Quality of Earnings

The Valuation section has five tabs: SDE, EBITDA Analysis, DCF Analysis, Business Overview / Market Position, and Valuation Reports. A site admin enables Valuation per company.

#### SDE and Quality of Earnings

The SDE module uses sector benchmarks, deterministic scoring, and recommendations, with guardrails around AI-assisted narrative. Its tabs are Executive Summary, Income Statement, Quality of Earnings, Revenue Quality, Customer Quality, Working Capital, Cash Flow Quality, and Balance Sheet Quality.

On the Quality of Earnings tab, users:

- Assign accounts to four adjustment groups: Owner Compensation, Personal, Non-Recurring, and One-Time Revenue.
- Set each adjustment as a percentage or a dollar amount.
- Post manual adjustments to a chosen month.
- Save account edits and valuation settings together with one Save button.

Trailing-twelve-month amounts per account load from the QuickBooks Desktop General Ledger Detail or from QuickBooks Online Profit & Loss and Balance Sheet reports.

The QoE adjusted income statement has two views:

- **Trailing 12 months:** TTM, QoE adjustment, and Adjusted TTM columns.
- **Monthly:** account adjustments follow each account's monthly activity, and other saved adjustments are spread evenly across the months.

Both views end at Adjusted EBITDA and support print and export. Saved QoE adjustments feed SDE and EBITDA normalization, including the QoE waterfall in the SDE valuation report.

#### Valuation Reports

Valuation Reports lets users choose and save report sections, including Executive Summary, Quality of Earnings, Revenue, Customer, Working Capital, Cash Flow, and Balance Sheet Quality, EBITDA, DCF, and a Market, Competitor, and Opportunity Scan. The market scan draws on market signals and a daily AI-generated industry brief that uses FRED, Bureau of Labor Statistics, and web research sources. Reports have a full print layout.

The valuation area helps users prepare for transaction discussions, understand value drivers, and organize financial adjustments that may be relevant for owners, consultants, lenders, or buyers.

### 18. DataRoom

Corelytics DataRoom is a secure diligence workspace for company documents. It is designed for consultant-led transactions, lending processes, internal collaboration, and external sharing.

DataRoom capabilities include:

- Folder and category organization.
- Company-level enablement.
- Pricing and entitlement checks.
- View, download, upload, share, and manage permissions.
- Default, folder-level, and document-level permission overrides.
- Access for external users added through Manage Users (see [Users, Company Admins, and External Users](#3-users-company-admins-and-external-users)).
- Scan gating before document access.
- Quarantine or block behavior for unsafe documents.
- Guarded view and download routes.
- Audit events for assignment, movement, viewing, download, scan, permission updates, and blocked access.
- Search using indexed document chunks and AI-assisted retrieval.

Only clean files are available for viewing and download. Audit history includes user, action, timestamp, document or folder context, and request metadata where available.

### 19. Payments, Billing, and AI Usage

The platform includes commercial functionality for subscriptions, payment transactions, revenue records, consultant payables, and affiliates. Consultants can manage payment plans and billing workflows where the plan requires payment. Affiliate codes can be used during business registration for partner tracking or pricing.

Billing options include:

- **Platform payments** through the payment processor.
- **Invoice-managed billing**, where a company is billed by QuickBooks invoice or another external method, with payment status, invoice number, link, and date tracked per company.
- **Referral partner billing**, with referral partners and consultant referral billing terms.
- **Digital Presence**, a separately billed service with its own checkout and per-company pricing, enabled or disabled in Site Admin.

AI usage is tracked per company and per feature. Each company can have a monthly token allowance and an overage price per million tokens. The Site Admin AI Usage card shows billable and total cost and flags companies as "Nearing allowance" at 80% and "Over allowance" at 100%.

Payment and subscription data also supports DataRoom entitlement and consultant revenue workflows.

## Data Integration Capabilities

### Accounting Systems

Corelytics is built to work with a variety of accounting and ERP systems. The codebase includes platform definitions, connection models, adapter patterns, accounting-system plugins, site admin configuration, API routes, and operational sync entry points for several systems.

Key accounting and ERP integration capabilities include:

- OAuth-style integrations for cloud accounting systems.
- QuickBooks Online sync and settings.
- QuickBooks Desktop import and push-style workflows, including post-sync report publishing and General Ledger detail.
- Xero authorization, callback, sync, status, disconnect, and diagnostics.
- Infor M3 and Infor CSI connection, trial balance, operational sync, async queue, transforms, IDO discovery and probes, targeted AR and AP rebuilds, shipments, contract prices, financial push, and status routes.
- Sage Intacct, Vista Cloud, Acumatica, Epicor P21, Odoo, Dynamics 365, and SAP S/4HANA plugin configuration.
- Generic accounting-system settings routes.
- Chart of accounts ingestion and mapping.
- Trial balance ingestion.
- Operational sync scheduling and manual run controls, with syncs gated on connected status.

### Operational Data Sources

Operational sync workflows can populate normalized operational datasets for:

- Customers.
- Vendors.
- Items and products.
- Invoices and invoice lines.
- Payments.
- Bills and bill lines.
- Bill payments.
- Accounts receivable aging.
- Accounts payable aging.
- Inventory.
- Product sales.
- Orders and shipments.
- Cash.
- Daily financial snapshots.
- General ledger transaction facts.
- Accounts payable transaction facts.

The operational data model is designed for long-horizon reporting, with retention support for multi-year trend analysis.

Operational sources are set up in the operational source's connection container, next to its Data Domains, and are grouped by sector:

- **Construction:** Crewtracks, Hilti.
- **Manufacturing:** Bakers COGS, FoodReady AI, JobBOSS², ProShop.
- **Manufacturing and wholesale:** APR SGP GMPA.
- **Real estate:** ICE Encompass, Profit Power Enterprise, RamQuest Title, RSMeans PM, Buildout CRE, Applied Epic (insurance services).
- **Professional services:** iSolved People Cloud.
- **Administration and support:** BambooHR, Cogent Rate Card.
- **CRM (any sector):** HubSpot, HighLevel. Connecting a CRM turns on the Sales tab.
- **Retail:** Monthly Store Visit Report and Monthly Inventory Report workbooks.

### Documents and AI Retrieval

Company documents can be uploaded, categorized, indexed, chunked, and searched. Document chunks support retrieval workflows used by Ask Corelytics and DataRoom search. This allows company-specific documents to become part of evidence-backed AI answers.

### Scheduled and Background Processing

Corelytics includes scheduled automation and background workers for recurring operational tasks, including:

- Operational data sync, including the Ask Corelytics operational data store.
- Infor sync run processing.
- Pending transform processing.
- QuickBooks token refresh.
- QuickBooks operational backfill.
- Trusted device cleanup.
- Monthly financial publish.
- Industry brief refresh.
- Operational page cache warmups.
- Keepalive jobs.
- Worker-based sync draining.

Scheduled times are set in Eastern Time, which is the application time zone for every company. This automation supports a hybrid model where operational data can refresh daily while month-end financial publishing remains controlled by mapping and close workflows.

## Technology Architecture

Corelytics is built with:

- Next.js 16 App Router, with `proxy.ts` for request interception.
- React 19.
- TypeScript.
- Node.js, with a custom server for Socket.IO.
- Prisma ORM 6.
- PostgreSQL (Neon).
- NextAuth 5.
- Socket.IO.
- Recharts 3.
- OpenAI SDK.
- Zod.
- Resend email service.
- Vercel Blob storage.
- QuickBooks Intuit OAuth.
- Xero Node SDK.
- MFA libraries for TOTP and QR code generation.

The application uses Next.js route handlers for API endpoints, a custom Node server for local/custom runtime behavior, Prisma for the data layer, and scheduled serverless routes for cron-style processing. Database migrations are applied automatically during deployment builds. A separate worker can drain sync tasks for longer-running integration workloads.

## Data Model Highlights

The project includes a broad Prisma data model covering:

- Consultants, consultant team assignments, companies, users, company access, roles, external-user and temporary-password status, and trusted devices.
- Financial records, monthly financials, assessments, benchmarks, company profiles, account mappings, learned mappings, and balance sheet anchors.
- Accounting connections, accounting platforms, operational system connections, operational source data domains, and connection status.
- Infor sync runs, sync tasks, raw batches, raw records, and completeness tracking.
- Operational snapshots and facts for AR, AP, inventory, product sales, customers, orders, cash, GL transactions, daily financials, and mapped lines.
- Forecast settings, loan instruments, amortization schedules, loans, and covenants.
- Cap table holders, securities, and financing events.
- Custom reports and saved report definitions.
- Ask Corelytics threads, messages, shares, and emails.
- AI usage records by company and feature.
- Subscriptions, payment transactions, revenue records, consultant payables, referral partners, affiliates, and affiliate codes.
- Company documents, document chunks, categories, and DataRoom-related permissions and audit behavior.
- Audit logs, system settings, operational sector layout configuration, and Operational Hub customization.

This data model supports multi-tenant company isolation, detailed financial processing, operational analytics, AI retrieval, compliance history, and commercial workflows.

## Business Benefits

### Better Financial Visibility

Corelytics consolidates accounting, operational, and document data into a single workspace. Users can move from raw accounting exports to dashboards, trends, ratios, forecasts, custom reports, and AI-supported explanations.

### Stronger Advisory Workflows

Consultants can manage multiple client companies, standardize analysis across clients, assign team members to specific clients, and run recurring review workflows. The platform supports both high-level scorecards and detailed drill-downs, making it useful for advisory meetings, board updates, lending discussions, and transaction preparation.

### Faster Issue Detection

Operational dashboards and Company Pulse help users detect cash, receivables, payables, inventory, product, tariff, and customer issues earlier than month-end reports alone. Alerts, thresholds, and lifecycle controls make issue management more actionable.

### Consistent Reporting Across Systems

Because companies use different accounting systems and charts of accounts, Corelytics emphasizes mapping and canonical reporting categories. This gives consultants and leadership teams a consistent reporting layer across QuickBooks, Xero, ERP systems, and file uploads.

### Evidence-Backed AI Assistance

The AI workflows are grounded in available company data, operational data, financial statements, benchmarks, goals, and documents. Ask Corelytics states the as-of date for its figures and flags stale or partial data, which ties answers to specific, current supporting evidence.

### Improved Cash and Working Capital Discipline

The 13-week cash forecast, working capital views, AR and AP aging, cash trends, inventory reporting, loan tracking, and operational goals help companies manage liquidity and cash conversion more intentionally.

### Transaction and Diligence Readiness

The valuation, SDE, Quality of Earnings, management assessment, covenant, cap table, and DataRoom modules support companies preparing for sale, financing, lender reporting, investor review, or internal diligence.

### Governance and Security

Mandatory MFA, trusted devices, company scoping, role and page-level access controls, forced replacement of temporary passwords, strict external-user boundaries, scan-gated document access, audit logs, and controlled integration credentials provide a stronger governance model than spreadsheet-based analysis and ad hoc file sharing.

## Typical End-to-End Workflow

1. A consultant or business user registers and completes MFA.
2. A company is created or selected.
3. Company profile details are completed, including industry and accounting system.
4. Accounting data is connected through an API integration or imported through trial balance upload.
5. Accounts are mapped into Corelytics categories.
6. Users review data quality, resolve missing mappings or anomalies, and process monthly financials.
7. Dashboards, statements, ratios, working capital, and trend reports become available.
8. Operational sources are connected and sync manually or on schedule.
9. Company Pulse and the Operational Hub monitor daily or recurring operating signals.
10. The 13-week cash forecast, goals, projections, loans, valuation inputs, and Quality of Earnings adjustments are set up as needed.
11. AI analysis produces focus areas, anomalies, opportunities, and trend explanations.
12. Ask Corelytics answers company-specific questions, and threads are shared with colleagues.
13. Custom reports and report packages are built for recurring reviews.
14. Internal and external users are added with temporary passwords, and documents are shared through DataRoom with permissions and audit history.
15. Consultants and company leaders use the platform for ongoing management, advisory, financing, or transaction workflows.

## Competitive Positioning

FinancialScore / Corelytics sits between accounting systems, BI dashboards, and advisor workflow tools. It is not just a data connector or a static reporting portal. Its value comes from combining:

- Accounting normalization.
- Operational data automation.
- Financial scoring and ratios.
- Benchmarks and trend analysis.
- Cash and revenue forecasting.
- AI-assisted performance analytics and question answering.
- Custom reporting.
- Valuation and Quality of Earnings.
- Secure document collaboration.
- Consultant and company management workflows.
- Governance controls.

This combination makes the platform especially useful for consultants, fractional CFOs, business owners, finance teams, lenders, and transaction advisors who need a repeatable way to understand company performance and drive action.

## Implementation Notes

The application is actively developed and contains broad product surface area. Some integrations are fully implemented through active adapters and API routes, while others are represented through configuration containers, plugins, platform models, and pipeline lanes that may require additional connector-specific implementation depending on the target system and deployment needs. Some sector-specific pages and reports are enabled only for the companies that use them.

The platform is designed to support production deployment with PostgreSQL, automatic migrations, scheduled jobs, background sync workers, protected environment handling, and company-scoped data separation.
