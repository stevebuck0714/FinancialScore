# Infor CloudSuite M3 Integration Questionnaire

**Integration approach:** M3 REST APIs (OAuth2)  
**Initial data load:** 36 months of monthly financial data + daily operational data

---

**Client Name:**  
**Primary Contact:**  
**Email / Phone:**  
**Time Zone:**  

---

## 1) Environment & Edition

| Field | Response |
|-------|----------|
| M3 edition | **BE (on-prem)** / **CE (cloud)** |
| Exact version/build (from About/Release screen) | |
| Hosting location (if cloud) | |
| Environments available (dev / test / prod) | |
| Base URL for M3 REST API (e.g. `https://tenant.m3.inforcloudsuite.com`) | |

---

## 2) Access & Connectivity

| Field | Response |
|-------|----------|
| Integration method | **M3 REST APIs** (confirmed) |
| Authentication | **OAuth2** / API token / basic auth / other |
| IP allowlisting or VPN required? | |
| Service account allowed? Who provisions it? | |
| API documentation available? (WADL, Swagger, PDF) | |
| Sandbox/test environment for development? | |

---

## 3) Chart of Accounts (COA) — Monthly

**Purpose:** Map accounts to our target fields (revenue, COGS, payroll, etc.) and support 36-month P&L/Balance Sheet sync.

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **Chart of Accounts (list)** | e.g. `ACS200MI` List, or equivalent | Account ID, name, type, status, effective dates |
| **Companies/legal entities** to include | | Which divisions (CONO, etc.)? |
| Include inactive accounts? | **Yes / No** | |
| Include effective dates or historical changes? | **Yes / No** | |
| Required dimensions | | Department, cost center, location, project? |
| Key output fields we need | | Account number, description, account type, normal balance |

---

## 4) Monthly Financial Reports — 36 Months

**Purpose:** P&L and Balance Sheet data for each of the last 36 months.

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **Profit & Loss (P&L)** by period | e.g. `GLS217` Period Analysis, or equivalent | Account-level detail per month |
| **Balance Sheet** by period | e.g. `GLS215` GL Balance, or equivalent | End-of-period balances |
| **Trial Balance** (if used instead of above) | | Period, account, debit, credit |
| Period/date format | | e.g. YYYYMM, fiscal period number |
| How to request multiple periods | | Single call per period? Batch? Date range? |

---

## 5) Cash Balances — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **Bank/cash account balances** | e.g. GL cash accounts, bank subledger API | Balance, as-of date, account ID/name |
| Source (GL vs dedicated bank module) | | |
| Key output fields | | Account ID, account name, balance, currency, as-of date |

---

## 6) AR Aging — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **AR aging buckets** | e.g. `ARS245`, `ARS250`, or AR aging report API | Current, 1–30, 31–60, 61–90, 90+ days |
| Aging method (invoice date, due date, other) | | |
| Key output fields | | Total AR, current, days 1–30, 31–60, 61–90, 90+ |

---

## 7) AP Aging — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **AP aging buckets** | e.g. `APS245`, `APS250`, or AP aging report API | Current, 1–30, 31–60, 61–90, 90+ days |
| Aging method | | |
| Key output fields | | Total AP, current, days 1–30, 31–60, 61–90, 90+ |

---

## 8) Customer Sales — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **Customer revenue by period** | e.g. `OIS180` sales statistics, `CRS610` + invoicing, or equivalent | Customer ID, name, revenue, invoice count |
| Date range filter supported? | | |
| Key output fields | | Customer ID, customer name, revenue, invoice count, period (day/month) |

---

## 9) Product/Item Sales — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **Product/item sales by period** | e.g. `OIS180`, `MWS070` stock/sales, or equivalent | Item ID, quantity, revenue, COGS |
| Key output fields | | Item ID, item name, SKU, quantity sold, revenue, COGS, period |

---

## 10) Inventory — Daily

| Data | M3 Program/API or REST Endpoint | Notes |
|------|--------------------------------|-------|
| **On-hand inventory** | e.g. `MMS301`, `MWS070`, or balance API | Item ID, quantity, value |
| Valuation method (FIFO, avg cost, other) | | |
| Key output fields | | Item ID, item name, SKU, qty on hand, asset value, avg cost, as-of date |

---

## 11) Data Volumes & Performance

| Field | Response |
|-------|----------|
| Estimated COA record count | |
| Estimated records per nightly ops sync (AR, AP, sales, inventory) | |
| API rate limits (requests/minute or hour) | |
| Batch size limits per request | |
| Max response size (if any) | |

---

## 12) Mapping & Transformations

| Field | Response |
|-------|----------|
| Fiscal calendar | Calendar year / 4-4-5 / 13-period / other |
| Currency | Single / multi-currency (reporting currency?) |
| Debit/credit sign conventions | | 
| Accounts or entities to exclude | Intercompany, eliminations, suspense? |

---

## 13) Nightly Sync Operations

| Field | Response |
|-------|----------|
| Data freshness required | e.g. "up to prior day close" |
| Preferred cutoff time (client local time) | |
| Incremental sync supported? | **Yes / No** |
| Change-tracking fields (lastModified, transactionDate) | |
| Batch vs real-time preferred | |

---

## 14) Validation & Reconciliation

| Field | Response |
|-------|----------|
| Reconciliation reports we must match | GL trial balance, AR/AP aging, inventory? |
| Acceptable variance thresholds | |
| Who signs off on mapping and reconciliation? | |

---

## 15) Security & Compliance

| Field | Response |
|-------|----------|
| PII/PHI/PCI in exported data? | |
| Masking or exclusion rules | |
| Audit/logging requirements | |
| Data retention for raw data | |

---

## 16) Operations & Support

| Field | Response |
|-------|----------|
| Desired start date for data loads | |
| Preferred cadence for monthly COA sync (date/time) | |
| Preferred cadence for daily ops sync (date/time) | |
| Expected support window (business hours) | |
| Escalation contact | |

---

## Appendix: M3 Program Reference (for client/IT)

*Common M3 programs — confirm which apply to your implementation:*

| Module | Program | Description |
|--------|---------|-------------|
| Accounts | ACS200 | Account master |
| GL | GLS215 | GL Balance display |
| GL | GLS217 | Period analysis |
| GL | GLS840MI | Generic GL interface API |
| AR | ARS245, ARS250 | AR reconciliation, display |
| AP | APS245, APS250 | AP reconciliation, display |
| Customer | CRS610 | Customer master |
| Supplier | CRS620 | Supplier master |
| Inventory | MMS301, MWS070 | Physical inventory, stock transactions |
| Sales | OIS100MI, OIS180 | Order interface, invoicing/sales stats |

**Note:** Actual REST endpoints may differ (e.g. `/m3api-rest/execute/ACS200MI/List`). Client IT should provide the exact REST paths and required input/output fields for their M3 instance.
