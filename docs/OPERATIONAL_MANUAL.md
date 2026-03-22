# Corelytics Operational Manual

## 1) Purpose and Scope

This manual describes how the Corelytics platform is designed to operate end-to-end across:

- platform architecture and security
- company onboarding and Site Admin controls
- accounting integrations and data movement
- functional modules (Operations, DataRoom, Analysis, Ratios, Goals/Projections, SDE/Valuation, Payments)
- sector-specific reporting behavior
- operational guardrails, controls, and cadences

This is an operations/design manual (how the system works), not a click-by-click user guide.

## Manual Set

This manual is part of a three-document set:

- Core operational reference: `docs/OPERATIONAL_MANUAL.md`
- Executive summary: `docs/OPERATIONAL_MANUAL_EXECUTIVE_SUMMARY.md`
- Role-based runbooks: `docs/OPERATIONAL_MANUAL_RUNBOOK_APPENDIX.md`
- Enterprise controls appendix: `docs/OPERATIONAL_MANUAL_APPENDIX_ENTERPRISE_CONTROLS.md`

## 2) Operating Model Overview

Corelytics runs as a multi-tenant financial intelligence platform where:

- **Company** is the tenancy boundary.
- **Sector** drives default operational categories and analytics focus.
- **Accounting integrations** feed canonical datasets.
- **Operational Hub** and analytics modules render standardized outputs.
- **Site Admin** controls company-level behavior, visibility, pricing, and data mode.

The platform is designed to support both:

- standardized cross-company reporting contracts, and
- selective company-specific customization where needed.

## 3) Technology and Runtime

Based on `TECH_STACK.md`:

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, Recharts.
- **Backend/API**: Next.js route handlers (`app/api`), Node runtime, socket support.
- **Data layer**: Prisma ORM with PostgreSQL (primary), SQLite for dev tooling.
- **Authentication**: NextAuth; MFA support via OTP (Speakeasy + QR).
- **Integrations**: QuickBooks, Xero, Infor (M3/CSI), payment gateway (USAePay), AI services.
- **Tooling**: ESLint, TypeScript, Prisma migrations/scripts.

## 4) Security, Privacy, and Access Control

### 4.1 Security posture

Security design is layered:

- authentication + session controls
- MFA support (including trusted-device behavior)
- role-based access (including Site Admin-only configuration actions)
- company boundary checks in data and document APIs
- auditable operational actions

From MFA and integration security docs:

- MFA is implemented and operational with trusted-device support.
- MFA is required to mitigate credential compromise and account takeover risk.
- Infor integrations enforce strict per-company credential separation and review controls.

### 4.2 Data separation controls

From `infor-m3-security-data-separation-one-pager.md`, the platform applies:

- company-scoped credential storage and retrieval
- per-company API access checks
- production controls and review checklists for integration changes

### 4.3 DataRoom security controls

From `DATAROOM_FUNCTIONAL_OVERVIEW.md`:

- entitlement gate (enabled + subscription state)
- capability gate (`view`, `download`, `upload`, `share`, `manage`)
- scan-gated delivery (only clean files are viewable/downloadable)
- append-only audit behavior for key events

### 4.4 Note on source documents

Two requested source files are `.docx` and not machine-readable through the current tooling:

- `docs/SECURITY_FOR_STAKEHOLDERS.docx`
- `docs/Privacy_Policy.docx`

This manual therefore reflects available markdown/text sources plus existing platform behavior.  
If needed, convert those two files to `.md` and merge them into this manual as a policy appendix.

## 5) Company Configuration and Site Administration

Site Admin is the system control plane for company-level operational behavior.

### 5.1 Core admin domains

Site Admin controls:

- accounting system connection configuration
- integration credentials and sync actions
- operational data mode (mock/real readiness controls)
- Operational Hub visibility and section-level customization
- DataRoom enablement and pricing
- default pricing and payment-related baselines

### 5.2 Operational Hub customization model

Operational Hub configuration is stored in:

- `Company.userDefinedAllocations.operationalHub`

Primary substructures:

- `sections` -> report/tab visibility toggles
- `customReports` -> admin-defined report entries

### 5.3 Tab categories and sector behavior

`TAB CATEGORIES` are sector-derived per company (`industrySectorCategory`).

Key behavior:

- selected categories render category containers
- standard report toggles are mapped by module data type
- company-specific and global custom report entries are appended in category containers

### 5.4 New custom report scope model

From `OPERATIONAL_HUB_CUSTOM_REPORT_SELECTION_PROCESS.md`, Site Admin can create:

- **Company-only** custom report entries
- **Global** custom report entries (written to all companies at creation time)

Important:

- this creates configurable report metadata and toggles
- rendering actual new chart/table content still requires implementation in module UI/data logic

## 6) Accounting Integrations and Data Contracts

### 6.1 Canonical contract strategy

From `OPERATIONS_PLAYBOOK_DATA_MATRIX.md`:

- Integrations map source payloads to shared canonical datasets.
- Dashboards should consume canonical contracts, not source-specific fields.
- Detail layers are additive by sector/use case.

Canonical operational datasets include:

- AR/AP aging snapshots
- customer/product snapshots
- inventory and cash snapshots
- optional detail tables for invoices/payments

### 6.2 Infor security and operational onboarding

Infor controls emphasize:

- strict tenant/company isolation
- controlled onboarding checklist
- PR review checklist for integration modifications

### 6.3 QBD schema extension direction

From `QBD_PROJECT_SCHEMA_EXTENSION.md`:

- extends project-level keying for direct extraction
- adds source precedence, parser logic, and exception logging
- supports project-aware facts and future expanded joins

## 7) Functional Areas: Design and Runtime Behavior

### 7.1 Operations Hub

Operations is the cross-functional operating dashboard and is sector-aware.

Current design includes:

- category tabs derived from sector and layout config
- section-level visibility toggles (company override)
- fixture-first support for scaffolding where live ERP data is pending
- chart/table sections for AR, AP, Cash, Customers, Products, Inventory, Daily Financials

### 7.2 Products and margin reporting

From `PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`:

- weekly product margin model by item/site/customer
- net revenue/cost/margin logic with finance sign-off definitions
- EST schedule target:
  - weekly close Friday EOD EST
  - run Saturday 2:00 AM EST
  - publish by Saturday 8:00 AM EST
- reconciliation thresholds:
  - <0.5% acceptable
  - 0.5-1.0% warning
  - >1.0% investigate

### 7.3 Daily Financials lane

From `DAILY_TRIAL_BALANCE_IMPLEMENTATION_MAP.md`:

- introduces a daily operational financial lane
- keeps core monthly statements unchanged during month
- supports controlled month-end publish into monthly financial records
- enforces separation between operational daily views and monthly canonical statement lane

### 7.4 DataRoom

From `DATAROOM_FUNCTIONAL_OVERVIEW.md` and validation checklist:

- secure diligence workspace with entitlement + permissions + scan-gate
- external invite flow and controlled user access
- audited view/download/assignment/permission events
- production validation checklist across access, lifecycle, controls, and regressions

### 7.5 Analysis (Performance Analytics)

From `ANALYSIS_SECTION.md`:

- Overview (context + run controls)
- Focus Board (triage buckets)
- Trend Explorer
- Anomaly Inbox
- Opportunity Workspace

The section is AI-enabled but designed around controlled inputs and run workflows.

### 7.6 Ask Corelytics

From `ASK_CORELYTICS.md`:

- AI Q&A and period-review experience
- default categorized question sets per company
- company-level custom question persistence with reset-to-default fallback

### 7.7 Ratios and Trend Analysis

From `RATIOS_AND_TRENDS.md`:

- ratio dashboards and formula-driven KPI tracking
- priority ratio selection (company-specific)
- monthly category ratio exports
- time-series trend exploration for major financial and expense categories

### 7.8 Goals and Projections

From `GOALS_AND_PROJECTIONS.md`:

- goals:
  - expense goals (COA-driven)
  - operational goals (AR/AP/Cash/Inventory KPI targets)
- projections:
  - 12-month scenario outputs
  - Holt-Winters-driven forecast model with fallback method

### 7.9 Line of Business allocation

From `LOB_ALLOCATION_GUIDE.md`:

- supports account-to-target-field mapping with per-LOB percentage splits
- aggregates by LOB and field to produce breakdowns
- persists breakdown artifacts for downstream analysis

### 7.10 Valuation and recommendation modules

From value creation and SDE docs:

- deterministic-first facts and scoring remain canonical
- recommendation layer adds explainable action framing
- impact modeling includes EBITDA, working capital, and value-range logic
- guardrails require evidence linkage and human oversight for impactful actions

## 8) Sector System and Reporting Logic

### 8.1 Sector mapping strategy

From `SECTOR_MAPPING_SCHEMA_DRAFT.md`:

- sector-specific revenue/COGS mapping keys
- stable naming convention (`rev_*`, `cogs_*`)
- scoped category sets by NAICS group

### 8.2 Sector playbook behavior

From `SECTOR_PLAYBOOK_LIBRARY.md`:

- playbooks drive priority, anomaly interpretation, and recommendation themes by sector
- normalized sector key selection with fallback behavior
- same analysis pipeline scales as additional metrics become available

### 8.3 Sector-specific category rendering

Operational category lists and defaults are sector-driven, then overridden by company settings where needed.

## 9) Payments and Revenue Share Operations

From `USAEPAY_INTEGRATION.md`:

- recurring payment events flow into revenue tracking and payable calculations
- webhook-driven lifecycle handles success, failure, and refund paths
- consultant-linked vs direct-business revenue handling
- monthly payable generation workflow for consultant settlements

`PAYMENT_INTEGRATION_SUMMARY.txt` was provided as input but currently has no readable content in repository tooling.

## 10) Operational Cadences and Runbooks

Recommended standing cadences:

- **Daily**
  - monitor integration sync status and error queues
  - review DataRoom scan failures and blocked files
- **Weekly**
  - review Operations anomalies and exception queues
  - validate report refresh and completeness
- **Month-end**
  - run controlled publish processes for monthly lanes
  - reconcile key finance outputs and review deltas

For product margins specifically, use the Saturday EST publish cadence defined above.

## 11) Governance, Auditability, and Controls

The platform control model emphasizes:

- deterministic-first computation for financial truth
- explicit configuration ownership in Site Admin
- append-only or traceable operational event logs where applicable
- scoped tenant/company updates for sensitive configuration
- phased rollout patterns (deterministic baseline -> enhanced AI layers with guardrails)

## 12) Known Limits and Current Gaps

- Custom report creation currently creates configuration/toggles; full report rendering still requires implementation in Operations UI/data layer.
- Global custom report scope applies to companies present at creation time.
- Dedicated edit/delete lifecycle for custom report metadata is not yet formalized.
- Two policy/security source documents are currently `.docx` and were not machine-readable during this compilation.

## 13) Source Document Index

This manual was synthesized from:

- `docs/TECH_STACK.md`
- `docs/MFA_SECURITY_SUMMARY.md`
- `docs/MFA_CLIENT_OVERVIEW.md`
- `docs/infor-m3-security-data-separation-one-pager.md`
- `docs/QBD_PROJECT_SCHEMA_EXTENSION.md`
- `docs/OPERATIONS_PLAYBOOK_DATA_MATRIX.md`
- `docs/DATAROOM_PROD_VALIDATION_CHECKLIST.md`
- `docs/RATIOS_AND_TRENDS.md`
- `docs/DATAROOM_FUNCTIONAL_OVERVIEW.md`
- `docs/ASK_CORELYTICS.md`
- `docs/ANALYSIS_SECTION.md`
- `LOB_ALLOCATION_GUIDE.md`
- `docs/GOALS_AND_PROJECTIONS.md`
- `docs/SECTOR_PLAYBOOK_LIBRARY.md`
- `docs/SECTOR_MAPPING_SCHEMA_DRAFT.md`
- `docs/PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`
- `docs/DAILY_TRIAL_BALANCE_IMPLEMENTATION_MAP.md`
- `docs/OPERATIONAL_HUB_CUSTOM_REPORT_SELECTION_PROCESS.md`
- `docs/VALUE_CREATION_RECOMMENDATIONS_PRD.md`
- `docs/SDE_EXEC_SUMMARY_AND_RECOMMENDATIONS_IMPLEMENTATION_MAP.md`
- `docs/SDE_AGENTIC_AI_GUARDRAILS.md`
- `USAEPAY_INTEGRATION.md`
- `docs/OPERATIONAL_MANUAL_EXECUTIVE_SUMMARY.md`
- `docs/OPERATIONAL_MANUAL_RUNBOOK_APPENDIX.md`
- `docs/OPERATIONAL_MANUAL_APPENDIX_ENTERPRISE_CONTROLS.md`

Additional requested but not machine-readable in current tooling:

- `docs/SECURITY_FOR_STAKEHOLDERS.docx`
- `docs/Privacy_Policy.docx`
- `PAYMENT_INTEGRATION_SUMMARY.txt` (no readable content via current read path)

