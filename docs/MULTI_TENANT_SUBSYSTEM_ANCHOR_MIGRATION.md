# Multi-Tenant Subsystem Anchor Migration

**Status:** Local-only (uncommitted) work-in-progress as of 2026-04-21.
**Owner:** Steve.
**Goal:** Eliminate the per-tenant hardcoded AR / AP balance-sheet anchor maps so a second Infor CSI customer can be onboarded without code changes.

---

## TL;DR

The reporting platform is multi-tenant by design — every API is keyed on `companyId`, every Prisma query is filtered by `companyId`, and the `BalanceSheetAnchor` table is already per-company in the DB. The **one remaining gap** is three TypeScript files that hold per-customer config in hardcoded `Record<companyId, ...>` maps:

- `lib/financial/cash-balance-sheet-anchor.ts` (cash anchor + cash account allowlist)
- `lib/financial/ar-balance-sheet-anchor.ts` (AR anchor + 180-day aging window)
- `lib/financial/ap-balance-sheet-anchor.ts` (AP anchor)

These were written for the first Infor CSI customer (Atlantic Precision) and only contain that customer's `companyId`s and balances. Without changes, a new CSI customer's AR/AP trend reconciliation degrades and the cash filtering would be a no-op.

This migration moves the AR and AP anchors into a new Prisma table, `CompanySubsystemAnchor`, behind an admin API. The cash anchor stays put for now (used only by a debug endpoint) and the cash allowlist code is dead and slated for deletion.

---

## Scope decision (recap from planning conversation)

After investigation, the actual production usage of these helpers is much smaller than initially feared:

| Helper | Production call sites | Status |
|---|---|---|
| `getCashBalanceSheetAnchorConfig` | `app/api/debug/cash-reconcile/route.ts` only | Debug-only — out of scope |
| `getCashAccountAllowlist` / `getCashAccountAllowlistSet` / `isAllowedCashAccount` | **Zero** | Dead code — deletion in PR 4 |
| `getArBalanceSheetAnchorConfig` | `app/api/operational-data/route.ts:3147` (AR trend reconciliation) | **In scope — PR 2** |
| `getApBalanceSheetAnchorConfig` | `app/api/operational-data/route.ts:4420, 6118` (AP trend, AP sheet anchor) | **In scope — PR 2** |

The other ERPs in the codebase (Vista Cloud, QuickBooks Desktop, QuickBooks Online, Xero, Sage Intacct) **do not have the same anti-pattern** — they are all metadata-driven and multi-tenant clean. This work only addresses Infor CSI.

---

## Solution architecture

### New Prisma model: `CompanySubsystemAnchor`

Single table holds AR and AP (extensible to future subsystems):

```prisma
model CompanySubsystemAnchor {
  id          String   @id @default(cuid())
  companyId   String
  subsystem   String   // 'AR' | 'AP'
  anchorDate  DateTime // UTC midnight
  agingDays   Int?     // AR-only; null for other subsystems
  accounts    Json     // [{ accountId, accountNumber, accountName, balance }]
  source      String?
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([companyId, subsystem, anchorDate])
  @@index([companyId, subsystem, anchorDate(sort: Desc)])
}
```

Design choices:

- **One table, not two** — keeps schema small; future subsystems (`CASH`, `INVENTORY`) slot in by adding a new value to the `subsystem` string
- **`accounts` as JSON** — both AR and AP are arrays of 1-5 accounts with identical shape; not query-able by account but neither helper queries that way
- **No FK to `Company`** — matches the existing convention in `BalanceSheetAnchor` and `BalanceSheetAccountAnchor`
- **Composite unique** `(companyId, subsystem, anchorDate)` — multiple anchor dates per company are allowed; helpers select the most recent

### Admin endpoint: `POST /api/admin/set-subsystem-anchor`

Mirrors the existing `set-bs-anchor` pattern — `CRON_SECRET`-guarded, validates inputs, upserts. `GET` lists anchors for debugging.

### Helper refactor

Each helper becomes `async` and reads DB-first with hardcoded fallback:

```ts
export async function getArBalanceSheetAnchorConfig(
  companyId: string
): Promise<ArBalanceSheetAnchorConfig | null> {
  // 1. Try DB (CompanySubsystemAnchor where subsystem='AR', most recent)
  // 2. On DB error or missing row, fall back to hardcoded map (logs warning)
  // 3. Return null if neither path produces a value
}
```

The fallback is **temporary** — kept in PR 2, removed in PR 3 once production has run on the DB-backed path long enough to confirm parity.

### Backfill script

`scripts/backfill-subsystem-anchors.ts` — idempotent upsert of Atlantic prod + dev anchor values into the new table. Supports `--dry-run`.

---

## Rollout plan (4 PRs, in order)

### PR 1 — Schema + admin endpoint + backfill (DONE locally, NOT deployed)

**Risk:** None. Purely additive. Zero behavior change for any existing tenant.

Files added/modified:

- `prisma/schema.prisma` (added `CompanySubsystemAnchor` model after `BalanceSheetAccountAnchor`)
- `prisma/migrations/20260421000000_add_company_subsystem_anchor/migration.sql` (new)
- `app/api/admin/set-subsystem-anchor/route.ts` (new)
- `scripts/backfill-subsystem-anchors.ts` (new)

Verification:

- `npx prisma generate` succeeded
- `npx tsc --noEmit` reports zero new errors (only pre-existing 16 errors in `tmp/rebuild-ar-q1-2026.ts`)
- No linter errors on any added/modified file

**Deploy steps when ready:**

```bash
# Dev DB
DATABASE_URL="<dev-db-url>" npx prisma migrate deploy
DATABASE_URL="<dev-db-url>" npx tsx scripts/backfill-subsystem-anchors.ts --dry-run
DATABASE_URL="<dev-db-url>" npx tsx scripts/backfill-subsystem-anchors.ts

# Verify via GET (look for AR row with arBalance=1179854.70 and AP row with apBalance=697929.58)
curl "https://<dev-host>/api/admin/set-subsystem-anchor?companyId=cmmnwyofv000fqhp4z8lebbny&secret=$CRON_SECRET"

# Prod DB (only after dev is verified)
DATABASE_URL="<prod-db-url>" npx prisma migrate deploy
DATABASE_URL="<prod-db-url>" npx tsx scripts/backfill-subsystem-anchors.ts --dry-run
DATABASE_URL="<prod-db-url>" npx tsx scripts/backfill-subsystem-anchors.ts
curl "https://<prod-host>/api/admin/set-subsystem-anchor?companyId=cmmcp278j0002kz0439rlixdj&secret=$CRON_SECRET"
```

### PR 2 — Helpers read from DB with hardcoded fallback (DONE locally, NOT deployed)

**Risk:** Low. Only PR with runtime behavior change.

Files modified:

- `lib/financial/ar-balance-sheet-anchor.ts` (helper became async, DB-first with fallback)
- `lib/financial/ap-balance-sheet-anchor.ts` (same pattern)
- `app/api/operational-data/route.ts` (3 call sites: lines 3147, 4420, 6118 — added `await`)

Safety properties:

1. DB error → falls back to hardcoded map (Atlantic stays alive)
2. DB row with malformed JSON → falls back to hardcoded map
3. DB hit with valid JSON → returns identical shape to legacy hardcoded values
4. New CSI tenant with no DB row + not in fallback map → returns `null` (same as today)
5. Diagnostic logs distinguish: DB hit (no log), DB miss + fallback (`console.warn`), DB error + fallback (`console.error`)

Verification:

- `npx tsc --noEmit` reports zero new errors
- All three call sites updated; no other production callers exist (only `tmp/` diag scripts)

**Deploy steps when ready:**

1. Merge PR 1 first; complete its deploy steps including the backfill
2. Confirm via GET endpoint that backfilled values match the hardcoded constants byte-for-byte
3. Deploy PR 2 to dev → smoke test for ~24 hours → verify Atlantic AR/AP trend numbers unchanged
4. Deploy PR 2 to prod → monitor logs for `[ar-balance-sheet-anchor]` / `[ap-balance-sheet-anchor]` warnings for ~1 week
5. If zero fallback warnings for a week → safe to proceed to PR 3

**Rollback:** Revert PR 2 only (PR 1 stays — it's harmless additive data). The hardcoded fallback in PR 2 means even an in-place revert is instantaneous.

### PR 3 — Remove hardcoded fallback (NOT STARTED)

**Risk:** Near zero, *if* PR 2 has been clean in production for at least a week.

Changes:

- Delete `INFOR_CSI_AR_ANCHOR_FALLBACK` and `AR_BALANCE_SHEET_ANCHORS_FALLBACK` from `ar-balance-sheet-anchor.ts`
- Delete `INFOR_CSI_AP_ANCHOR_FALLBACK` and `AP_BALANCE_SHEET_ANCHORS_FALLBACK` from `ap-balance-sheet-anchor.ts`
- Helper functions just return `null` if DB returns nothing
- Update file-header comments to remove the "transition period" language

**Pre-flight check:** grep production logs for the fallback warning strings. Must be zero hits in the prior 7 days.

### PR 4 — Dead cash code cleanup (NOT STARTED)

**Risk:** Zero. Verified no production importers.

Changes:

- Delete `CashAccountAllowlist` type
- Delete `ATLANTIC_PRECISION_CASH_ALLOWLIST` constant
- Delete `CASH_ACCOUNT_ALLOWLISTS` map
- Delete `getCashAccountAllowlist`, `getCashAccountAllowlistSet`, `isAllowedCashAccount` exports

(Leave `getCashBalanceSheetAnchorConfig` alone — used by debug endpoint and potential future cleanup.)

---

## Current state (2026-04-21)

**All four PRs are unmerged. PRs 1 and 2 are written but stashed (not in the working tree, not committed). PRs 3 and 4 have not been started.**

The work was deliberately stashed before an Atlantic client meeting to eliminate any risk of accidentally committing or deploying the changes. The dev server is currently running on the original (pre-PR) code paths.

### Stash location

```
stash@{0}: On dev: subsystem-anchor-pr1-pr2-WIP
```

Verify with:

```bash
git stash list | findstr subsystem-anchor
```

### Files included in the stash

- `prisma/schema.prisma` (modified — added `CompanySubsystemAnchor` model)
- `prisma/migrations/20260421000000_add_company_subsystem_anchor/migration.sql` (new)
- `app/api/admin/set-subsystem-anchor/route.ts` (new)
- `scripts/backfill-subsystem-anchors.ts` (new)
- `lib/financial/ar-balance-sheet-anchor.ts` (modified — async + DB-first)
- `lib/financial/ap-balance-sheet-anchor.ts` (modified — async + DB-first)
- `app/api/operational-data/route.ts` (modified — 3 `await` additions at lines 3147, 4420, 6118)

### Files NOT in the stash (intentional)

- `docs/MULTI_TENANT_SUBSYSTEM_ANCHOR_MIGRATION.md` (this file — left in tree as reference doc)

### Production status

Completely untouched. Atlantic is running the exact same code as before this work began. The migration has NOT been applied to any database. No deployment occurred.

---

## Resuming this work

When ready to resume (e.g. after the Atlantic client meeting):

### 1. Restore the stashed changes

```bash
# From the FinancialScore repo root:
git stash list                              # confirm stash@{0} is the WIP entry
git stash pop                                # OR: git stash apply stash@{0} to keep the stash
```

If `git stash pop` fails due to conflicts (someone else may have modified the same files in the meantime), inspect the conflicts and resolve manually.

### 2. Regenerate the Prisma client

The stashed schema change requires the generated Prisma client to be rebuilt:

```bash
npx prisma generate
```

Without this, TypeScript will not see `prisma.companySubsystemAnchor` and the helpers will fail to compile.

### 3. Verify the local state matches expectations

```bash
git status --short
# Should show 4 modified files + 3 new files matching the list above
```

```bash
npx tsc --noEmit
# Expected: 16 pre-existing errors, all in tmp/rebuild-ar-q1-2026.ts. Zero errors elsewhere.
```

### 4. Decide deploy timing

- PR 1 (schema + admin endpoint + backfill) is safe to deploy anytime — purely additive
- PR 2 (helper refactor) requires PR 1's backfill to have run first

### 5. Follow the deploy steps in the PR 1 → PR 2 sections above

### 6. After ~1 week of clean prod logs

Proceed to PR 3 (remove hardcoded fallback maps).

### 7. PR 4

Independent, can be done anytime.

---

## Onboarding a second Infor CSI customer (after this migration is complete)

After PR 2 is in production, adding a second CSI customer requires:

1. **Existing onboarding steps** (unchanged by this work):
   - Create the `Company` row with `accountingSystem = 'INFOR_CSI'`
   - Save credentials under `connectionMetadata.inforProfiles.INFOR_CSI`
   - Save accounting program rows under `connectionMetadata.accountingProgramsBySystem.INFOR_CSI`
   - Set the `site` in connection metadata
   - Run COA sync and complete account mappings
   - Set the GL Balance Sheet anchor via `POST /api/admin/set-bs-anchor`
2. **New step** (replaces "edit lib/financial/*-balance-sheet-anchor.ts and redeploy"):
   - For each subsystem (AR and AP), POST to `/api/admin/set-subsystem-anchor` with the customer's account list and trial-balance values:
     ```json
     {
       "secret": "<CRON_SECRET>",
       "companyId": "<new-company-id>",
       "subsystem": "AR",
       "anchorDate": "YYYY-MM-DD",
       "agingDays": 180,
       "accounts": [
         { "accountId": "...", "accountNumber": "...", "accountName": "...", "balance": ... }
       ],
       "source": "Trial Balance YYYY-MM-DD"
     }
     ```

That's it. No code change, no redeploy.

---

## Out of scope (intentionally deferred)

- **Cash anchor migration** — only used by a debug endpoint, no customer impact
- **Cash allowlist as a real feature** — the dead-code exports cover a hypothetical use case; design when a real second-customer scenario exists
- **UI for managing subsystem anchors** — admin endpoint is sufficient for now
- **Generalizing `BalanceSheetAnchor` and `CompanySubsystemAnchor` into one schema** — premature
- **Per-request memoization in the helpers** — unique-index DB lookups are sub-millisecond; optimize only if profiling shows a problem
- **Other ERP integrations** (Vista, QBD, QBO, Xero, Sage Intacct) — already multi-tenant clean; no parallel cleanup needed
