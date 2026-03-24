# QBD Project Schema Extension (Direct Extraction)

## Purpose

Define an implementation-ready extension to support company-specific QuickBooks Desktop project codes (example: `35-523`, `71-254-02`) as first-class operational keys in Corelytics.

This document is designed to fit the existing QuickBooks Desktop integration flow already present in:

- `app/api/quickbooks-desktop/settings/route.ts`
- `app/api/quickbooks-desktop/financial-push/route.ts`
- `app/api/quickbooks-desktop/operational-push/route.ts`
- `lib/quickbooks-desktop/operational-sync.ts`
- `lib/financial-ingestion.ts`

---

## Current State

### Supported today

- Direct QBD integration configuration (SDK/Web Connector) exists.
- Financial push ingestion exists for month-level `monthlyData`.
- Operational push ingestion exists for cash, AR/AP aging, customer sales, product sales, and inventory snapshots.

### Gap for this client

- No normalized project/job entity keyed by the project number schema.
- No persisted parse results for project code segments.
- No exception model for malformed or ambiguous project keys.
- No standardized precedence logic for source fields (`PO`, job name, memo/reference).

---

## Design Goals

- Preserve raw source values exactly as exported/extracted from QBD.
- Make project code searchable/joinable across operational and financial records.
- Support both 2-segment and 3-segment keys:
  - `NN-NNN`
  - `NN-NNN-NN`
- Treat parsing as deterministic and auditable.
- Do not block ingestion because of edge-case parse failures; route to exceptions.

---

## Canonical Key Model

### Canonical project key fields

- `projectCodeRaw` (string, required when present in source)
- `customerSegment` (2 digits, nullable)
- `projectSegment` (3 digits, nullable)
- `subtypeSegment` (2 digits, nullable)
- `codeSchemaVersion` (string, default `qbd-client-v1`)
- `parseStatus` (`OK` | `WARNING` | `FAILED`)
- `parseReason` (nullable string)

### Parsing patterns

- Pattern A: `^(\d{2})-(\d{3})$`
  - `customerSegment = group1`
  - `projectSegment = group2`
  - `subtypeSegment = null`
- Pattern B: `^(\d{2})-(\d{3})-(\d{2})$`
  - `customerSegment = group1`
  - `projectSegment = group2`
  - `subtypeSegment = group3`

Normalize input before parse:

- trim whitespace
- collapse internal spaces
- strip surrounding punctuation

Do not remove hyphens; they are structurally significant.

---

## Source Precedence Rules

Use this precedence to resolve `projectCodeRaw`:

1. Explicit project code source field from extractor payload (if provided)
2. `PO`/purchase-order-like field
3. Parsed token from `Customer:Job`/job name text
4. Parsed token from memo/reference fallback

Persist all source candidates for audit:

- `sourceProjectCodeExplicit`
- `sourceProjectCodePO`
- `sourceProjectCodeName`
- `sourceProjectCodeMemo`
- `resolvedProjectCodeSource` (enum of winning source)

If multiple candidates disagree, set `parseStatus = WARNING` and create an exception row.

---

## Proposed Schema Additions (Prisma)

## 1) Project master

```prisma
model QbdProject {
  id                    String   @id @default(cuid())
  companyId             String
  projectCodeRaw        String
  customerSegment       String?
  projectSegment        String?
  subtypeSegment        String?
  codeSchemaVersion     String   @default("qbd-client-v1")
  parseStatus           String   @default("OK") // OK | WARNING | FAILED
  parseReason           String?

  qbCustomerListId      String?
  qbJobListId           String?
  qbFullName            String?  // e.g. Parent:35-523 Project Name
  displayName           String?
  isActive              Boolean  @default(true)

  firstSeenAt           DateTime @default(now())
  lastSeenAt            DateTime @default(now())
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([companyId, projectCodeRaw])
  @@index([companyId, customerSegment, projectSegment])
  @@index([companyId, parseStatus])
}
```

## 2) Project source exception log

```prisma
model QbdProjectCodeException {
  id                    String   @id @default(cuid())
  companyId             String
  snapshotDate          DateTime?
  sourceEntity          String   // invoice, customer-job, report-row, etc.
  sourceEntityId        String?
  sourceField           String   // PO, FullName, Memo, etc.
  rawValue              String
  normalizedValue       String?
  reasonCode            String   // FORMAT_INVALID, CONFLICTING_SOURCES, MISSING_CODE, ...
  details               Json?
  resolved              Boolean  @default(false)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([companyId, createdAt(sort: Desc)])
  @@index([companyId, resolved, createdAt(sort: Desc)])
}
```

## 3) Link table for facts (optional but recommended)

```prisma
model QbdProjectFactLink {
  id                    String   @id @default(cuid())
  companyId             String
  qbdProjectId          String?
  sourceFactType        String   // customer_sales, product_sales, ar_open_invoice, monthly_financial, ...
  sourceFactId          String
  projectCodeRaw        String?
  confidence            String   @default("high") // high | medium | low
  createdAt             DateTime @default(now())

  @@index([companyId, sourceFactType, sourceFactId])
  @@index([companyId, qbdProjectId])
  @@index([companyId, projectCodeRaw])
}
```

---

## Payload Contract Extension (QBD Push)

Add optional project-aware fields to operational payload rows without breaking existing payloads.

### Customer sales rows

Current:

- `customerId`
- `customerName`
- `revenue`
- `invoiceCount`
- `avgInvoiceSize`

Extended:

- `projectCodeRaw?`
- `projectNameRaw?`
- `poNumber?`
- `jobFullName?`
- `projectCodeSource?`

### Product sales rows

Current:

- `itemId`
- `itemName`
- `sku`
- `quantitySold`
- `revenue`
- `cogs`

Extended:

- `projectCodeRaw?`
- `projectNameRaw?`
- `poNumber?`
- `jobFullName?`
- `projectCodeSource?`

Backward compatibility:

- Existing payloads continue to ingest.
- New fields are optional and used when present.

---

## Ingestion Logic Changes

## 1) Parser utility

Add `lib/quickbooks-desktop/project-code.ts`:

- `normalizeProjectCode(raw: string): string`
- `parseProjectCode(raw: string): ParsedProjectCodeResult`
- `extractCandidateProjectCodes(input: { po?: string; fullName?: string; memo?: string; explicit?: string })`
- `resolveProjectCodeWithPrecedence(candidates): ResolvedProjectCode`

## 2) Operational sync integration

Update `lib/quickbooks-desktop/operational-sync.ts`:

- For each customer/product row:
  - resolve project code candidate
  - parse and upsert `QbdProject`
  - create `QbdProjectFactLink`
  - log exception rows where needed

## 3) Financial push metadata

Update `lib/financial-ingestion.ts` to optionally persist:

- project parse summary stats in `rawData.validation`:
  - `projectCodesParsed`
  - `projectCodeWarnings`
  - `projectCodeFailures`

No change required to `monthlyFinancial` grain in v1.

---

## Validation Rules

Hard validations (reject only row-level project linkage, not entire sync):

- `projectCodeRaw` exceeds max length (e.g., > 50 chars)
- unparseable and no fallback source available

Soft validations (ingest with warning):

- conflicting values between `PO` and job name
- multiple candidate tokens in one source field
- code parsed but source context ambiguous

Exception reason codes:

- `FORMAT_INVALID`
- `MISSING_CODE`
- `CONFLICTING_SOURCES`
- `AMBIGUOUS_TOKEN`
- `UNSUPPORTED_PATTERN`

---

## Reconciliation and QA

Per run, publish to `ApiSyncLog.errorDetails`:

- total rows processed
- rows with resolved project code
- rows with warning/failure parse status
- exception counts by reason code
- count of new/updated `QbdProject` rows

Target acceptance metrics for go-live:

- >= 98% project code resolution on in-scope entities
- 0 unresolved high-volume customers/jobs
- no variance in financial totals due to project parsing layer

---

## Rollout Plan

## Phase 1 - Non-breaking foundation

1. Add new Prisma models and migrate.
2. Add parser utility and unit tests.
3. Integrate parser in operational sync paths behind feature flag:
   - `QBD_PROJECT_CODE_PARSER_ENABLED=true`
4. Emit reconciliation metrics.

## Phase 2 - Backfill + hardening

1. Backfill project keys from recent historical payloads in `connectionMetadata`.
2. Review exception queue and add client-specific overrides if needed.
3. Add dashboard views for project-level quality and coverage.

## Phase 3 - Expanded joins

1. Link AR/AP open facts and payment facts to `QbdProject` where source fields allow.
2. Add project-level trend cards/filters in operations UI.

---

## Open Decisions (Need Client Confirmation)

- Confirm whether `subtypeSegment` is strictly `service` vs `product` or broader internal coding.
- Confirm if any alternate patterns exist beyond `NN-NNN[-NN]`.
- Confirm source-of-truth priority when `PO` conflicts with job name.
- Confirm whether legacy closed jobs should remain in active project dimension.

---

## Implementation Checklist

- [ ] Add Prisma models and migration.
- [ ] Add parser utility with tests for valid/invalid patterns.
- [ ] Extend payload types with optional project fields.
- [ ] Wire parser into QBD operational ingestion.
- [ ] Write to `QbdProject`, `QbdProjectFactLink`, and exceptions.
- [ ] Add per-run reconciliation metrics.
- [ ] Add backfill script for historical payloads.
- [ ] Validate with client sample extracts before production go-live.

