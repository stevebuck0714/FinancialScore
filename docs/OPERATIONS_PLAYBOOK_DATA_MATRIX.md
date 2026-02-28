# Operations Playbooks Canonical Data Matrix

This document defines a shared canonical model for Operations dashboards and the 19 sector playbooks. It is designed so all accounting integrations (Infor M3, QBO, Sage, etc.) map into one stable reporting contract.

## Canonical datasets (shared by all playbooks)

- `CustomerSalesSnapshot` (existing)
- `ARAgingSnapshot` (existing)
- `AROpenInvoiceSnapshot` (new detail layer)
- `ARPaymentFact` (new detail layer)
- `APAgingSnapshot` (existing)
- `ProductSalesSnapshot` (existing)
- `InventorySnapshot` (existing)
- `CashSnapshot` (existing)

## Core field contracts

- **AR summary/trend**: `totalAR`, `current`, `days1to30`, `days31to60`, `days61to90`, `days90plus`, `snapshotDate`
- **AR invoice detail**: `customerId`, `customerName`, `invoiceNo`, `invoiceDate`, `dueDate`, `amountDueHome`, optional invoice-level buckets
- **AR paid history**: `paymentDate`, `customerId`, `customerName`, `invoiceNo`, `paidAmountHome`
- **AP summary/trend**: `totalAP`, bucket fields above, `snapshotDate`
- **Customer demand**: `customerId`, `customerName`, `revenue`, `invoiceCount`, `snapshotDate`
- **Product performance**: `itemId`, `itemName`, `quantitySold`, `revenue`, `cogs`, `snapshotDate`
- **Inventory**: `itemId`, `itemName`, `qtyOnHand`, `assetValue`, `avgCost`, `snapshotDate`
- **Cash**: `accountId`, `accountName`, `cashBalance`, `snapshotDate`

## 19 playbooks x required datasets

| Sector Code | Sector | Primary datasets | Typical detail extensions |
|---|---|---|---|
| `01` | General / Default | AR, AP, Cash, Inventory, Customers, Products | AR invoices, AP bills |
| `11` | Agriculture | Products, Inventory, AP, AR, Cash | Yield/grade and input-cost drivers |
| `21` | Mining | Products, Inventory, AP, Cash | Throughput, downtime, recovery |
| `22` | Utilities | Cash, AR, AP, Customers | Usage/load and outage dimensions |
| `23` | Construction | AR, AP, Cash, Customers | Project/WIP, retainage, subcontractor detail |
| `32` | Manufacturing | Products, Inventory, AP, AR | WIP stages, BOM/material cost variance |
| `42` | Wholesale Trade | AR, Inventory, Products, Customers, AP | Deductions/chargebacks, fill-rate proxies |
| `45` | Retail Trade | Inventory, Products, Customers, Cash | Sell-through, returns reason, markdowns |
| `48` | Transportation & Warehousing | Customers, AP, Cash, AR | Lane, shipment, claims/accessorial fields |
| `51` | Information | Customers, AR, AP, Cash | Credits/SLA, account renewal cohorts |
| `52` | Finance & Insurance | AR, AP, Cash, Customers | Loss/default and portfolio context |
| `53` | Real Estate | AR, AP, Cash, Customers | Property/unit, occupancy, tenant cohorts |
| `54` | Professional Services | AR, AP, Customers, Cash | Project/engagement and contractor mix |
| `56` | Admin/Support/Waste | AR, AP, Cash, Customers | Route/site/work-order context |
| `61` | Educational Services | AR, AP, Cash, Customers | Program/cohort and collection cycle |
| `62` | Health Care & Social Assistance | AR, AP, Cash, Customers | Payer mix, denials/write-off dimensions |
| `71` | Arts/Entertainment/Recreation | Customers, AR, AP, Cash | Event/program and attendance dimensions |
| `72` | Accommodation/Food Services | Inventory, Products, AR, AP, Cash | Item spoilage/waste, outlet/location |
| `81` | Other Services | AR, AP, Customers, Cash | Work-order cycle and repeat-customer traits |

## Integration mapping rule

Each integration implements adapters that map source payloads into canonical contracts:

- `mapInforRowToCanonical(...)`
- `mapQboRowToCanonical(...)`
- `mapSageRowToCanonical(...)`

Dashboards and playbooks must read canonical datasets only; they should not depend on source-specific fields.

## Evolution strategy

- Add columns/tables additively (nullable first).
- Keep core contracts stable.
- Add optional detail layers by sector/use case (e.g., retainage, denial codes, lane IDs).
- Backfill new fields asynchronously where source history is available.
