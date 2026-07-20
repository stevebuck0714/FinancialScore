# Financial Score Nightly Data Extract Specification

## Purpose

This document defines the preferred file format, structure, and nightly delivery process for sending manufacturing financial and operational data to Financial Score.

The goal is to create a repeatable, auditable data feed from your data warehouse into Financial Score so we can refresh the company score, trends, working capital analysis, margin analysis, and operational indicators each night.

This is a nightly feed. Some files contain accounting-period snapshots because financial statements are organized by accounting period, but those snapshots should still be regenerated and delivered every night. The current open period should be included nightly so Financial Score can reflect new postings, adjustments, shipments, receipts, invoices, and operational activity.

## Preferred Delivery Method

Financial Score prefers a nightly export from stable warehouse views into a secure file location.

Recommended flow:

```text
Your Data Warehouse
-> Financial Score Export Views
-> Parquet Files
-> Manifest File
-> Secure Cloud Storage or SFTP
-> Financial Score Nightly Ingestion
```

Preferred delivery options:

- Secure cloud storage bucket, such as AWS S3, Azure Blob Storage, or Google Cloud Storage
- Secure SFTP, if cloud storage is not available

The export should be read-only from Financial Score's perspective. Financial Score does not need write access to your warehouse or ERP.

## Preferred File Format

Use `Parquet` as the standard file format.

Parquet is preferred because it:

- Preserves data types more reliably than CSV
- Handles large financial and operational datasets efficiently
- Compresses well
- Supports repeatable nightly ingestion
- Reduces date, decimal, and null-handling issues

Acceptable fallback format:

- `CSV` for initial onboarding, testing, or smaller extracts

If CSV is used:

- Use UTF-8 encoding
- Include a header row
- Use comma delimiters
- Escape quotes using standard CSV rules
- Use ISO date format: `YYYY-MM-DD`
- Use ISO timestamp format: `YYYY-MM-DDTHH:mm:ssZ`
- Do not include subtotal, blank, or formatting rows

Avoid:

- Excel files
- Manually formatted reports
- PDF reports
- Files sent by email
- Changing column names without versioning

## Nightly Folder Structure

Each nightly extract should be delivered as a complete batch.

Recommended folder structure:

```text
/financial-score/
  /company=<company_id>/
    /extract_date=YYYY-MM-DD/
      manifest.json
      income_statement_period_snapshot.parquet
      balance_sheet_period_snapshot.parquet
      cash_flow_period_snapshot.parquet
      general_ledger.parquet
      chart_of_accounts.parquet
      ar_aging.parquet
      ap_aging.parquet
      inventory_snapshot.parquet
      sales_orders.parquet
      invoices.parquet
      purchase_orders.parquet
      work_orders.parquet
      manufacturing_kpis.parquet
```

Example:

```text
/financial-score/company=acme_mfg/extract_date=2026-07-14/general_ledger.parquet
```

## Manifest File

Each nightly batch must include a `manifest.json` file. This lets Financial Score confirm that the batch is complete before ingestion starts.

Example:

```json
{
  "company_id": "acme_mfg",
  "company_name": "Acme Manufacturing, Inc.",
  "extract_date": "2026-07-14",
  "extract_timestamp": "2026-07-14T23:30:00Z",
  "source_warehouse": "Snowflake",
  "currency": "USD",
  "timezone": "America/New_York",
  "schema_version": "1.0",
  "files": [
    {
      "name": "income_statement_period_snapshot.parquet",
      "record_count": 39,
      "period_start": "2023-07",
      "period_end": "2026-07",
      "includes_current_open_period": true
    },
    {
      "name": "general_ledger.parquet",
      "record_count": 482391,
      "period_start": "2024-07-01",
      "period_end": "2026-07-14"
    }
  ]
}
```

Required manifest fields:

| Field | Description |
|---|---|
| `company_id` | Stable company identifier used for the feed |
| `extract_date` | Business date of the extract |
| `extract_timestamp` | Timestamp when the export was created |
| `source_warehouse` | Warehouse platform, such as Snowflake, BigQuery, Redshift, SQL Server, or Databricks |
| `currency` | Primary reporting currency |
| `timezone` | Timezone used for business dates |
| `schema_version` | Version of this export layout |
| `files` | List of included files and record counts |

## Required Common Fields

Every file should include these fields where applicable:

| Field | Description |
|---|---|
| `company_id` | Stable company identifier |
| `source_system` | ERP, accounting system, MES, WMS, CRM, or other source |
| `source_record_id` | Stable source record ID when available |
| `reporting_period` | Accounting period, formatted as `YYYY-MM` |
| `transaction_date` | Transaction date, formatted as `YYYY-MM-DD` |
| `currency` | Currency code, such as `USD` |
| `amount` | Signed numeric amount where relevant |
| `updated_at` | Source system last updated timestamp |
| `extract_timestamp` | Warehouse export timestamp |

Use decimals for financial values. Do not send currency symbols or formatted strings in amount fields.

## Core Financial Files

### `income_statement_period_snapshot.parquet`

Nightly income statement snapshot by accounting period, account, department, plant, product line, or business unit where available. Each nightly file should include the current open accounting period and recent prior periods that may still receive adjustments.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `reporting_period` | Accounting period, formatted as `YYYY-MM` |
| `account_code` | GL account code |
| `account_name` | GL account name |
| `account_category` | Revenue, COGS, operating expense, other income, other expense |
| `department` | Department or cost center, if used |
| `plant` | Manufacturing site, if used |
| `product_line` | Product line, if available |
| `amount` | Signed period-to-date amount |
| `currency` | Currency code |

### `balance_sheet_period_snapshot.parquet`

Nightly balance sheet snapshot by accounting period and account. Each nightly file should include current balances for the open period and recent prior periods that may still receive adjustments.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `reporting_period` | Accounting period, formatted as `YYYY-MM` |
| `account_code` | GL account code |
| `account_name` | GL account name |
| `account_category` | Asset, liability, or equity |
| `amount` | Ending balance as of the nightly extract for that accounting period |
| `currency` | Currency code |

### `cash_flow_period_snapshot.parquet`

Nightly cash flow snapshot by accounting period, if available from the warehouse.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `reporting_period` | Accounting period, formatted as `YYYY-MM` |
| `cash_flow_category` | Operating, investing, or financing |
| `cash_flow_line` | Cash flow line item |
| `amount` | Signed period-to-date amount |
| `currency` | Currency code |

### `general_ledger.parquet`

Transaction-level GL detail for financial validation, account mapping, and drill-down.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `source_record_id` | Stable journal or ledger line ID |
| `journal_entry_id` | Journal entry ID |
| `transaction_date` | GL transaction date |
| `posting_date` | GL posting date, if different |
| `reporting_period` | Accounting period |
| `account_code` | GL account code |
| `account_name` | GL account name |
| `debit_amount` | Debit amount, positive decimal |
| `credit_amount` | Credit amount, positive decimal |
| `net_amount` | Signed net amount |
| `department` | Department or cost center |
| `plant` | Manufacturing site |
| `customer_id` | Customer ID, if linked |
| `vendor_id` | Vendor ID, if linked |
| `description` | Transaction description |
| `currency` | Currency code |
| `updated_at` | Last updated timestamp |

### `chart_of_accounts.parquet`

Account metadata used to map source accounts into the Financial Score model.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `account_code` | GL account code |
| `account_name` | GL account name |
| `account_type` | Asset, liability, equity, revenue, COGS, expense, other |
| `parent_account_code` | Parent account, if applicable |
| `is_active` | True or false |

## Working Capital Files

### `ar_aging.parquet`

Accounts receivable aging as of the extract date.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `as_of_date` | Aging date |
| `customer_id` | Customer identifier |
| `customer_name` | Customer name |
| `invoice_id` | Invoice identifier |
| `invoice_date` | Invoice date |
| `due_date` | Invoice due date |
| `open_amount` | Open receivable amount |
| `aging_bucket` | Current, 1-30, 31-60, 61-90, 90+ |
| `currency` | Currency code |

### `ap_aging.parquet`

Accounts payable aging as of the extract date.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `as_of_date` | Aging date |
| `vendor_id` | Vendor identifier |
| `vendor_name` | Vendor name |
| `bill_id` | Bill or voucher identifier |
| `bill_date` | Bill date |
| `due_date` | Bill due date |
| `open_amount` | Open payable amount |
| `aging_bucket` | Current, 1-30, 31-60, 61-90, 90+ |
| `currency` | Currency code |

### `inventory_snapshot.parquet`

Nightly inventory balances and valuation as of the extract date.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `as_of_date` | Inventory snapshot date |
| `reporting_period` | Accounting period, formatted as `YYYY-MM` |
| `item_id` | Item or SKU identifier |
| `item_name` | Item name |
| `item_category` | Raw material, WIP, finished goods, MRO, other |
| `plant` | Manufacturing site |
| `warehouse` | Warehouse or location |
| `quantity_on_hand` | Quantity on hand |
| `unit_cost` | Unit cost |
| `inventory_value` | Total inventory value |
| `currency` | Currency code |

## Manufacturing Operations Files

### `sales_orders.parquet`

Sales order detail used for demand, backlog, customer concentration, and margin analysis.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `sales_order_id` | Sales order identifier |
| `sales_order_line_id` | Sales order line identifier |
| `order_date` | Order date |
| `requested_ship_date` | Requested ship date |
| `actual_ship_date` | Actual ship date, if shipped |
| `customer_id` | Customer identifier |
| `customer_name` | Customer name |
| `item_id` | Item or SKU identifier |
| `product_line` | Product line |
| `quantity_ordered` | Quantity ordered |
| `quantity_shipped` | Quantity shipped |
| `sales_amount` | Revenue amount |
| `estimated_cost` | Estimated cost, if available |
| `gross_margin_amount` | Gross margin amount, if available |
| `order_status` | Open, shipped, cancelled, closed |
| `currency` | Currency code |

### `invoices.parquet`

Invoice detail used to validate revenue, customer concentration, AR, and margin.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `invoice_id` | Invoice identifier |
| `invoice_line_id` | Invoice line identifier |
| `invoice_date` | Invoice date |
| `customer_id` | Customer identifier |
| `customer_name` | Customer name |
| `item_id` | Item or SKU identifier |
| `product_line` | Product line |
| `quantity` | Quantity invoiced |
| `revenue_amount` | Invoice revenue |
| `cost_amount` | Cost amount, if available |
| `gross_margin_amount` | Gross margin amount, if available |
| `currency` | Currency code |

### `purchase_orders.parquet`

Purchase order detail used for vendor concentration, material cost trends, and supply chain analysis.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `purchase_order_id` | Purchase order identifier |
| `purchase_order_line_id` | Purchase order line identifier |
| `order_date` | PO date |
| `expected_receipt_date` | Expected receipt date |
| `actual_receipt_date` | Actual receipt date |
| `vendor_id` | Vendor identifier |
| `vendor_name` | Vendor name |
| `item_id` | Item or SKU identifier |
| `quantity_ordered` | Quantity ordered |
| `quantity_received` | Quantity received |
| `unit_cost` | Unit cost |
| `extended_cost` | Extended cost |
| `po_status` | Open, received, cancelled, closed |
| `currency` | Currency code |

### `work_orders.parquet`

Production or work order data used for throughput, efficiency, scrap, rework, and production trend analysis.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `work_order_id` | Work order or production order identifier |
| `item_id` | Finished good or produced item |
| `product_line` | Product line |
| `plant` | Manufacturing site |
| `start_date` | Production start date |
| `completion_date` | Production completion date |
| `quantity_planned` | Planned quantity |
| `quantity_completed` | Completed quantity |
| `quantity_scrapped` | Scrapped quantity |
| `standard_labor_hours` | Standard labor hours |
| `actual_labor_hours` | Actual labor hours |
| `standard_machine_hours` | Standard machine hours |
| `actual_machine_hours` | Actual machine hours |
| `work_order_status` | Open, completed, cancelled, closed |

### `manufacturing_kpis.parquet`

Nightly operational KPI feed. Daily KPI rows are preferred where available; weekly or accounting-period KPI rows are acceptable for metrics that are not calculated daily.

Required fields:

| Field | Description |
|---|---|
| `company_id` | Company identifier |
| `period_start_date` | KPI period start date |
| `period_end_date` | KPI period end date |
| `period_grain` | Daily, weekly, or accounting_period |
| `plant` | Manufacturing site |
| `product_line` | Product line, if available |
| `kpi_name` | KPI name |
| `kpi_value` | Numeric KPI value |
| `kpi_unit` | Percent, days, dollars, units, hours, turns |

Recommended KPI names:

- `gross_margin_percent`
- `inventory_turns`
- `days_inventory_outstanding`
- `days_sales_outstanding`
- `days_payable_outstanding`
- `cash_conversion_cycle`
- `on_time_delivery_percent`
- `scrap_rate_percent`
- `rework_rate_percent`
- `capacity_utilization_percent`
- `labor_efficiency_percent`
- `material_cost_variance`
- `purchase_price_variance`
- `production_throughput_units`
- `machine_downtime_hours`

## Historical Backfill

For the initial onboarding, please provide:

| Dataset | Preferred History |
|---|---|
| Income statement period snapshots | 36 months |
| Balance sheet period snapshots | 36 months |
| Cash flow period snapshots | 36 months, if available |
| General ledger detail | 24 to 36 months |
| AR and AP aging | Current aging plus historical aging snapshots if available |
| Inventory history | 24 to 36 months |
| Sales orders and invoices | 24 to 36 months |
| Purchase orders | 24 to 36 months |
| Work orders / production orders | 12 to 24 months |
| Manufacturing KPIs | 24 to 36 months |

After the initial backfill, nightly extracts should include new and changed transaction records since the prior successful extract, plus refreshed current-period snapshots for financial statements, inventory, aging, and KPIs.

## Nightly Incremental Logic

Each nightly file should include records that were created or updated since the previous successful extract.

Preferred incremental fields:

- `updated_at`
- `created_at`
- source system change sequence, if available
- warehouse load timestamp, if source timestamps are not reliable

Financial Score recommends including a small overlap window, such as the last 3 business days of updated data, to catch late-arriving changes. Financial Score will deduplicate records using stable source IDs.

For financial statement snapshot files, include the current open period and the prior two closed periods each night. This helps capture adjustments, late postings, and month-end close changes while keeping the feed nightly.

## Data Validation Expectations

Financial Score will validate each batch before promoting the data into scoring.

Expected controls:

- Manifest file exists and lists all delivered files
- Record counts match delivered files
- Required columns are present
- Dates and timestamps are valid
- Amounts are numeric decimals, not formatted strings
- Required IDs are populated
- Duplicate source record IDs are rejected or deduplicated
- Income statement periods reconcile to source totals
- Balance sheet balances by month
- GL debit and credit totals reconcile by journal entry where available
- AR and AP aging totals reconcile to the balance sheet where possible
- Inventory value reconciles to inventory GL accounts where possible
- Currency is consistent or explicitly provided per row

If a validation fails, Financial Score will hold the batch in staging and report the issue for review.

## Warehouse View Recommendation

Please create stable export views in your warehouse rather than sending extracts directly from raw ERP tables.

Recommended view names:

```text
fs_income_statement_period_snapshot
fs_balance_sheet_period_snapshot
fs_cash_flow_period_snapshot
fs_general_ledger
fs_chart_of_accounts
fs_ar_aging
fs_ap_aging
fs_inventory_snapshot
fs_sales_orders
fs_invoices
fs_purchase_orders
fs_work_orders
fs_manufacturing_kpis
```

These views should preserve stable column names and data types. If a schema change is needed, update the `schema_version` in the manifest and notify Financial Score before the new version is sent.

## Security And Access

Financial Score only requires read access to the delivered files.

Recommended controls:

- Use encrypted transfer, such as HTTPS, SFTP, or cloud object storage with TLS
- Encrypt files at rest in the storage location
- Restrict access to the Financial Score ingestion identity
- Do not include unnecessary personally identifiable information
- Do not include bank account numbers, tax IDs, or payroll employee-level sensitive data unless specifically requested and approved
- Rotate credentials according to your internal security policy

## Nightly Delivery Timing

Preferred cadence:

- Export starts after warehouse nightly refresh is complete
- Files are delivered by a mutually agreed cutoff time
- Manifest is written last, after all data files are complete
- Financial Score ingestion starts only after the manifest is available

Recommended timing example:

```text
10:00 PM local time: Warehouse refresh completes
10:30 PM local time: Financial Score export views are materialized
11:00 PM local time: Parquet files are written
11:05 PM local time: manifest.json is written
11:15 PM local time: Financial Score ingestion begins
```

## Summary

Financial Score's preferred nightly feed is a versioned Parquet export from curated warehouse views, delivered as a complete batch with a manifest file. The batch should include core financial statements, GL detail, working capital data, inventory, sales, purchasing, production orders, and manufacturing KPIs. Financial Score will ingest the files into staging, validate and reconcile the data, then refresh the manufacturing score and related analytics.
