# FinancialScore / Corelytics Project Description

Updated: May 2026

## Executive Summary

FinancialScore, branded in the application as Corelytics, is a multi-tenant financial operations and business intelligence platform for consultants, business owners, finance teams, and site administrators. The platform combines accounting data, operational data, financial ratios, benchmarks, projections, AI-assisted analysis, and secure document collaboration into one workspace.

At its core, Corelytics helps companies understand financial health, identify risks, monitor operational performance, and prioritize actions that improve cash flow, margins, profitability, valuation readiness, and management discipline. It is built to support both consultants managing multiple client companies and business users managing a single company.

The project is implemented as a Next.js and TypeScript application backed by Prisma and PostgreSQL. It includes role-based access, mandatory multi-factor authentication, accounting integrations, operational sync workflows, dashboards, AI analysis tools, valuation workflows, covenant tracking, billing, and a secure DataRoom.

## Product Purpose

Corelytics is designed to turn financial and operational data into decision-ready insight. Many small and mid-sized companies have useful data in accounting systems, ERP platforms, spreadsheets, and operational systems, but the information is often fragmented, inconsistently mapped, or difficult to interpret. Corelytics provides a structured layer on top of that data so users can:

- Standardize financial data from different accounting systems.
- Map charts of accounts into consistent reporting categories.
- Track financial health through ratios, scorecards, benchmarks, and trends.
- Monitor daily and monthly operating signals such as receivables, payables, inventory, cash, customers, products, and sales.
- Use AI-assisted workflows to surface risks, anomalies, opportunities, and explanations.
- Manage goals, projections, valuation inputs, and SDE/EBITDA adjustments.
- Share diligence materials securely through a controlled DataRoom.
- Support consultant-led advisory, lending, transaction preparation, and ongoing management workflows.

The platform follows a deterministic-first design. Source financial calculations, mappings, thresholds, and reporting outputs are rule-based and auditable. AI is used to augment prioritization, narrative explanation, document search, and opportunity discovery, rather than replacing the underlying financial logic.

## Target Users

### Consultants

Consultants can manage multiple client companies from a centralized dashboard. They can add companies, manage client access, invite team members, review financial and operational performance, manage billing where applicable, and use Corelytics as an advisory platform for recurring client reviews.

### Business Users

Business users manage their own company workspace. They can connect accounting data, upload trial balances, review dashboards, complete mapping workflows, analyze performance, manage goals, and use AI-assisted insights to understand company performance.

### Company Users

Company users are users invited to a specific company, often by a consultant or administrator. Their access is scoped to the assigned company and controlled by role and permissions.

### Site Administrators

Site administrators configure company-level settings, accounting systems, operational sync behavior, feature access, DataRoom settings, pricing, and integration-specific controls.

## Core Functional Areas

### 1. Company and Consultant Management

Corelytics supports a multi-company operating model. Consultants can add client companies, manage consultant team members, assign company access, and work across clients without mixing company data. Business users can register and manage their own company profile.

Company profiles include company details such as name, address, industry, accounting system, size, and related configuration. Company selection and active-company handling are central to the user experience because reporting, integrations, documents, and AI workflows are all company scoped.

### 2. Authentication, Security, and Access Control

The platform includes a full authentication system with:

- Email and password login.
- Consultant and business registration flows.
- Password reset support.
- Required multi-factor authentication using authenticator apps.
- Backup codes.
- Trusted device support.
- Role-based access across site admins, consultants, company users, and business users.
- Company-scoped authorization checks.

MFA is mandatory for all users. Trusted devices can be remembered for a configured period and are limited per user. These controls are especially important because the platform stores sensitive financial data, accounting connections, diligence documents, and company-specific analysis.

### 3. Accounting Data Ingestion

Corelytics supports multiple accounting data ingestion patterns so it can serve companies at different levels of accounting-system maturity.

#### API-Based Integrations

The application includes active integration lanes and implementation paths for modern accounting systems and ERP platforms. Current integration coverage includes:

- QuickBooks Online.
- QuickBooks Desktop.
- Xero.
- Infor M3.
- Infor CSI.
- Sage Intacct.
- Dynamics-family systems.
- Acumatica.
- Odoo.
- Vista Cloud.
- Other ERP-style systems represented in the accounting platform and pipeline model.

QuickBooks Online and Xero are implemented through adapter modules and OAuth-style connection flows. Infor M3 has a more extensive operational sync architecture, including queueing, status tracking, async processing, transforms, and diagnostics. Other ERP systems are represented through system-specific configuration modules, site admin containers, and pipeline lanes, with implementation depth varying by connector.

#### File and Trial Balance Uploads

For companies that do not connect through an API, Corelytics supports spreadsheet-based import workflows. Users can upload Excel or CSV-style trial balance files that include accounts and monthly balances. The platform then previews, maps, processes, and saves monthly financial data for analysis.

Recommended imports include account names or descriptions, optional account numbers, and historical monthly balances, ideally with enough history to support trends and projections.

#### Pipeline Lanes

The financial ingestion architecture classifies sources into three main lanes:

- ERP ledger sources for ERP-style accounting systems and desktop integrations.
- Lightweight payload sources for systems such as QuickBooks Online, Xero, and Sage Intacct.
- CSV or trial balance sources for manual upload workflows.

This structure allows the platform to normalize different source formats into consistent downstream financial reporting.

### 4. Account Mapping and Data Standardization

Account mapping is one of the most important workflows in Corelytics. Imported or synced chart-of-accounts data is mapped into standardized categories so the same reports, dashboards, benchmarks, ratios, and AI workflows can work across companies with different accounting systems.

The mapping workflow supports:

- Review of imported accounts.
- AI-assisted or learned mapping suggestions where available.
- Manual assignment to target categories.
- Company-specific saved mappings.
- Reuse of mappings on future imports.
- Review and reprocessing when new accounts appear.
- Line of business allocation for companies with multiple service lines, divisions, or product categories.

The monthly financial workflow is intentionally controlled. Operational data can sync automatically, but monthly financial statements are finalized after users review mappings, confirm month-end close is complete, and process monthly data.

### 5. Financial Health Score, Dashboards, and Reporting

Corelytics provides financial dashboards that help users understand performance at both summary and detail levels. The dashboard experience includes customizable widgets, KPI tiles, financial score views, trends, ratios, statements, and drill-down reporting.

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

### 6. Ratios, Trends, and Benchmarks

The ratios module calculates financial health indicators from mapped monthly financial data. Categories include:

- Liquidity ratios such as current ratio and quick ratio.
- Activity ratios such as inventory turnover, receivables turnover, payables turnover, days inventory, days receivables, days payables, and sales to working capital.
- Coverage ratios such as interest coverage, debt service coverage, and cash flow to debt.
- Leverage ratios such as debt to net worth, fixed assets to net worth, and leverage ratio.
- Operating ratios such as asset turnover, return on equity, return on assets, EBITDA margin, and EBIT margin.

The platform supports chart-based ratio views, formula visibility, benchmark lines where available, priority ratio selection, monthly ratio tables, and export-oriented review workflows.

Trend analysis lets users chart financial metrics over time and compare movement across revenue, margins, expenses, cash, assets, liabilities, and equity. Expense trend analysis helps identify cost creep, category-level variance, and structural margin pressure.

### 7. Working Capital Management

The working capital area focuses on liquidity and cash conversion performance. It includes:

- Current working capital.
- Working capital ratio.
- Days working capital.
- Cash conversion cycle.
- Working capital trend charts.
- Cash trend charts.
- Current assets versus current liabilities.
- Inventory trend analysis.

This area helps users connect balance sheet movement to operational health, cash availability, and short-term risk.

### 8. Goals and Projections

Corelytics supports financial and operational goal setting. Users can define expense goals, operating goals, and target values for key metrics. Goals can be used to compare actual performance against expected performance and to drive management discussions.

Projection functionality uses historical financial data to forecast future performance. Where sufficient history exists, projections use Holt-Winters-style seasonality and trend logic. Outputs include forecast scenarios for:

- Revenue.
- Operating expenses.
- Net income.
- Total assets.
- Total liabilities.
- Total equity.

Scenario views include most likely, best case, and worst case outputs. These help users understand future financial direction, assess risk, and plan corrective action.

### 9. Operational Dashboard and Company Pulse

Corelytics extends beyond monthly accounting statements by collecting and analyzing operational data. The operations dashboard includes areas such as:

- Customer analytics.
- Accounts receivable aging.
- Accounts payable aging.
- Product sales.
- Inventory.
- Cash.
- Daily financials.
- Vendor and invoice-related operating data where available.

Operational dashboards provide KPI cards, trend charts, tables, concentration analysis, aging views, product margin views, and detailed operational records.

Company Pulse is the daily operating-risk workspace. It highlights issues that need attention, items being monitored, and policy-driven alerts. Pulse supports:

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

### 10. AI-Assisted Analysis

The analysis area uses structured AI-assisted workflows to help users identify performance issues and opportunities. The main analysis views are:

- Overview.
- Focus Board.
- Trend Explorer.
- Anomaly Inbox.
- Opportunity Workspace.

The Overview confirms context such as industry group, operational profile, data range, and readiness. The Focus Board groups findings into action categories such as Fix Now, Investigate, Monitor, and Opportunities. Trend Explorer connects findings to underlying time-series data. Anomaly Inbox highlights unusual signals and likely causes. Opportunity Workspace turns findings into a pipeline of possible actions with impact ranges, owners, status, evidence, and time-to-impact context.

The AI layer is designed to support management workflows by organizing evidence and prioritizing action. It works best when financial data, operational data, benchmarks, goals, and company documents are available.

### 11. Ask Corelytics

Ask Corelytics is an AI-assisted Q&A experience for company-specific analysis. It supports:

- AI search with citations.
- Period review for selected periods.
- Questions against daily operational data.
- Questions against monthly chart-of-accounts data.
- Company document search context when documents are uploaded and indexed.
- Default question categories.
- User-created custom questions.
- Saved question sets by company.

Default categories include company questions, daily operations, monthly COA, peers and market, and opportunities. This gives users a starting point for common management and advisory questions while also allowing them to create custom prompts.

### 12. Management Assessment and Readiness

The platform includes management assessment workflows and readiness-style views. These are designed to help companies and advisors evaluate management practices, operational maturity, and readiness for financing, sale, or improvement programs.

Assessment features include welcome screens, scoring guides, score summaries, result views, and supporting dashboards. These workflows complement the quantitative financial analysis by adding structured qualitative review.

### 13. Valuation, SDE, and EBITDA Adjustments

Corelytics includes valuation and seller discretionary earnings workflows. These modules support deterministic scoring, adjustment panels, previews, recommendation frameworks, and guardrails around AI-assisted narrative.

The valuation and SDE area helps users prepare for transaction discussions, understand value drivers, and organize financial adjustments that may be relevant for owners, consultants, lenders, or buyers.

### 14. Covenants and Lending Support

The project includes a covenants module for loan and covenant tracking. The data model supports loans, loan types, loan statuses, covenants, covenant types, and covenant statuses. This allows Corelytics to support lender reporting, covenant monitoring, and financial compliance workflows alongside the broader financial analysis platform.

### 15. DataRoom

Corelytics DataRoom is a secure diligence workspace for company documents. It is designed for consultant-led transactions, lending processes, internal collaboration, and external sharing.

DataRoom capabilities include:

- Folder and category organization.
- Company-level enablement.
- Pricing and entitlement checks.
- View, download, upload, share, and manage permissions.
- Default, folder-level, and document-level permission overrides.
- External user invite flow.
- Scan gating before document access.
- Quarantine or block behavior for unsafe documents.
- Guarded view and download routes.
- Audit events for assignment, movement, viewing, download, scan, permission updates, and blocked access.
- Search using indexed document chunks and AI-assisted retrieval.

Only clean files are available for viewing and download. Audit history includes user, action, timestamp, document or folder context, and request metadata where available.

### 16. Payments, Subscriptions, and Affiliates

The platform includes commercial functionality for subscriptions, payment transactions, revenue records, consultant payables, and affiliates. Consultants can manage payment plans and billing workflows where the plan requires payment. Affiliate codes can be used during business registration for partner tracking or pricing.

Payment and subscription data also supports DataRoom entitlement and consultant revenue workflows.

## Data Integration Capabilities

### Accounting Systems

Corelytics is built to work with a variety of accounting and ERP systems. The codebase includes platform definitions, connection models, adapter patterns, site admin configuration, API routes, and operational sync entry points for several systems.

Key accounting and ERP integration capabilities include:

- OAuth-style integrations for cloud accounting systems.
- QuickBooks Online sync and settings.
- QuickBooks Desktop import and push-style workflows.
- Xero authorization, callback, sync, status, disconnect, and diagnostics.
- Infor M3 connection, trial balance, operational sync, async queue, transforms, probes, financial push, and status routes.
- Sage Intacct, Vista Cloud, Acumatica, Odoo, Dynamics, and other ERP configuration lanes.
- Generic accounting-system settings routes.
- Chart of accounts ingestion and mapping.
- Trial balance ingestion.
- Operational sync scheduling and manual run controls.

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
- Cash.
- Daily financial snapshots.
- General ledger transaction facts.
- Accounts payable transaction facts.

The operational data model is designed for long-horizon reporting, with retention support for multi-year trend analysis.

### Human Resources and Sector Data

The platform includes operational system connection models and provider support for systems such as BambooHR and spreadsheet upload workflows. It also includes sector-specific operational structures and workbook snapshot models, including support for Plato's Closet-style workbook facts.

### Documents and AI Retrieval

Company documents can be uploaded, categorized, indexed, chunked, and searched. Document chunks support retrieval workflows used by Ask Corelytics and DataRoom search. This allows company-specific documents to become part of evidence-backed AI answers.

### Scheduled and Background Processing

Corelytics includes scheduled automation and background workers for recurring operational tasks, including:

- Operational data sync.
- Infor sync run processing.
- Pending transform processing.
- QuickBooks token refresh.
- QuickBooks operational backfill.
- Trusted device cleanup.
- Monthly financial publish.
- Keepalive jobs.
- Worker-based sync draining.

This automation supports a hybrid model where operational data can refresh daily while month-end financial publishing remains controlled by mapping and close workflows.

## Technology Architecture

Corelytics is built with:

- Next.js 14 App Router.
- React 18.
- TypeScript.
- Node.js.
- Prisma ORM.
- PostgreSQL.
- NextAuth.
- Socket.IO.
- Recharts.
- OpenAI SDK.
- Resend email service.
- Vercel Blob storage.
- QuickBooks Intuit OAuth.
- Xero Node SDK.
- MFA libraries for TOTP and QR code generation.

The application uses Next.js route handlers for API endpoints, a custom Node server for local/custom runtime behavior, Prisma for the data layer, and scheduled serverless routes for cron-style processing. A separate worker can drain sync tasks for longer-running integration workloads.

## Data Model Highlights

The project includes a broad Prisma data model covering:

- Consultants, companies, users, company access, roles, and trusted devices.
- Financial records, monthly financials, assessments, benchmarks, company profiles, account mappings, learned mappings, and balance sheet anchors.
- Accounting connections, accounting platforms, operational system connections, and connection status.
- Infor sync runs, sync tasks, raw batches, raw records, and completeness tracking.
- Operational snapshots and facts for AR, AP, inventory, product sales, customers, cash, GL transactions, daily financials, and mapped lines.
- Subscriptions, payment transactions, revenue records, consultant payables, affiliates, and affiliate codes.
- Company documents, document chunks, categories, and DataRoom-related permissions and audit behavior.
- Loans and covenants.
- Audit logs, system settings, operational sector layout configuration, and forecast settings.

This data model supports multi-tenant company isolation, detailed financial processing, operational analytics, AI retrieval, compliance history, and commercial workflows.

## Business Benefits

### Better Financial Visibility

Corelytics consolidates accounting, operational, and document data into a single workspace. Users can move from raw accounting exports to dashboards, trends, ratios, projections, and AI-supported explanations.

### Stronger Advisory Workflows

Consultants can manage multiple client companies, standardize analysis across clients, and run recurring review workflows. The platform supports both high-level scorecards and detailed drill-downs, making it useful for advisory meetings, board updates, lending discussions, and transaction preparation.

### Faster Issue Detection

Operational dashboards and Company Pulse help users detect cash, receivables, payables, inventory, product, and customer issues earlier than month-end reports alone. Alerts, thresholds, and lifecycle controls make issue management more actionable.

### Consistent Reporting Across Systems

Because companies use different accounting systems and charts of accounts, Corelytics emphasizes mapping and canonical reporting categories. This gives consultants and leadership teams a consistent reporting layer across QuickBooks, Xero, ERP systems, and file uploads.

### Evidence-Backed AI Assistance

The AI workflows are grounded in available company data, operational data, financial statements, benchmarks, goals, and documents. This improves the usefulness of AI output by tying recommendations and answers to specific supporting evidence.

### Improved Cash and Working Capital Discipline

Working capital views, AR and AP aging, cash trends, inventory reporting, and operational goals help companies manage liquidity and cash conversion more intentionally.

### Transaction and Diligence Readiness

The valuation, SDE, management assessment, covenant, and DataRoom modules support companies preparing for sale, financing, lender reporting, investor review, or internal diligence.

### Governance and Security

Mandatory MFA, trusted devices, company scoping, role controls, scan-gated document access, audit logs, and controlled integration credentials provide a stronger governance model than spreadsheet-based analysis and ad hoc file sharing.

## Typical End-to-End Workflow

1. A consultant or business user registers and completes MFA.
2. A company is created or selected.
3. Company profile details are completed, including industry and accounting system.
4. Accounting data is connected through an API integration or imported through trial balance upload.
5. Accounts are mapped into Corelytics categories.
6. Users review data quality, resolve missing mappings or anomalies, and process monthly financials.
7. Dashboards, statements, ratios, working capital, and trend reports become available.
8. Operational sync runs manually or on schedule where configured.
9. Company Pulse and operational dashboards monitor daily or recurring operating signals.
10. Goals, projections, valuation inputs, and assessments are created as needed.
11. AI analysis agents produce focus areas, anomalies, opportunities, and trend explanations.
12. Ask Corelytics answers company-specific questions using financial, operational, and document context.
13. Documents can be organized and shared through DataRoom with permissions and audit history.
14. Consultants and company leaders use the platform for ongoing management, advisory, financing, or transaction workflows.

## Competitive Positioning

FinancialScore / Corelytics sits between accounting systems, BI dashboards, and advisor workflow tools. It is not just a data connector or a static reporting portal. Its value comes from combining:

- Accounting normalization.
- Operational data automation.
- Financial scoring and ratios.
- Benchmarks and trend analysis.
- AI-assisted performance analytics.
- Secure document collaboration.
- Consultant and company management workflows.
- Governance controls.

This combination makes the platform especially useful for consultants, fractional CFOs, business owners, finance teams, lenders, and transaction advisors who need a repeatable way to understand company performance and drive action.

## Implementation Notes

The application is actively developed and contains broad product surface area. Some integrations are fully implemented through active adapters and API routes, while others are represented through configuration containers, platform models, and pipeline lanes that may require additional connector-specific implementation depending on the target system and deployment needs.

The platform is designed to support production deployment with PostgreSQL, scheduled jobs, background sync workers, protected environment handling, and company-scoped data separation.

