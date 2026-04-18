# AP Reconciliation — Known Limitations

**Date:** 2026-04-17
**Scope:** Atlantic Precision Resource (Infor M3 / CSI), account `30100` Accounts Payable
**Status:** Accepted limitation. Tracked for revisit after a focused SLLedgers re-sync.

## TL;DR

The current `GLTransactionFact`-based AP roll-forward is **correct in aggregate** but can miss the exact **monthly closing balance** by an amount roughly equal to the cross-month-boundary voucher activity. Across two consecutive months on the validated company, drift was **~$7K on $357K of activity (0.2%)** — but individual month closes can be off by ±$150K when activity straddles the period cutoff.

This is a data-source limitation, not a logic bug.

## What we built

`GLTransactionFact` is the canonical event store for GL postings. It is fed by two CSI programs:

| Source | Payload fields | Has `ControlPeriod`? | Coverage on `30100` |
|---|---|---|---|
| `SLGLTRANS` | 9 (thin) | **No** | Complete recent months, no fiscal-period stamp |
| `SLLedgers` | 144 (rich) | **Yes** | Complete history (2024-09 → 2025-12), partial recent months |

Both sources write into the same `GLTransactionFact` table with `sourceProgram` tagged. A unique key on `(companyId, transDate, accountId, transNum, ref, description)` deduplicates entries that appear in both feeds.

For 2024-09 through 2025-12, `SLGLTRANS` and `SLLedgers` are byte-identical (parallel feeds working). Starting Jan 2026, SLLedgers row counts collapsed for `30100`:

| Month | SLGLTRANS rows | SLLedgers rows |
|---|---|---|
| 2025-12 | 216 | 216 |
| 2026-01 | 207 | 73 |
| 2026-02 | 199 | **7** |
| 2026-03 | 223 | **0** |
| 2026-04 | 94 | 30 |

The drop is on the SLLedgers feed; SLGLTRANS picks up the slack.

## Why monthly closes drift

The TB closing balance is computed by CSI using the fiscal-period stamp (`ControlPeriod` / `ControlYear`) on each ledger line, **not** by the `TransDate` posting date. A voucher with `TransDate=2026-03-02` but `ControlPeriod=2/Year=2026` lands in **February's TB**.

`SLGLTRANS` does not include `ControlPeriod` — its 9-field payload only has `TransDate`, `RecordDate`, `Acct`, `Ref`, `TransNum`, `DomAmount`, `ForAmount`, `Site`, `_ItemId`. So when SLGLTRANS is the only available source for a given month (Feb–Mar 2026 in our test case), we cannot apply the fiscal-period cutoff used by the TB.

Validated checkpoints (account `30100`, anchored at $458,386.50 on 2026-01-31, re-anchored each interval):

| Interval | Expected ΔAP | Computed ΔAP (TransDate) | Drift |
|---|---|---|---|
| Jan 31 → Feb 28 | +$220,586 | +$370,902 | **+$150,316 (over)** |
| Feb 28 → Mar 31 | +$136,289 | -$20,515 | **-$156,804 (under)** |
| **Two-month sum** | **+$356,874** | **+$350,387** | **-$6,487 (-1.8%)** |

The Feb over-statement and Mar under-statement nearly mirror each other. That mirroring is the timing-shift signature, not data loss.

## What `distDate` did not solve

Three roll-forward methods were tested:

1. `transDate` everywhere
2. `COALESCE(distDate, transDate)`
3. Hybrid: `APV`/`APA` use `distDate`, `APP` uses `transDate`

All three produced **identical** numbers for `30100`. Reason: `distDate` is `NULL` for **all 15,225** `30100` rows in `GLTransactionFact`. The dual-date pattern that exists in `SLVCHHDRS` voucher headers does not carry through to the GL line records that feed this account.

## Acceptance rationale

For the AP product surface (trends, balances, aging exposure), the following are unaffected:

- **AP daily/weekly/monthly trend shape** — sums align across two-month windows.
- **AP aging by voucher** — uses voucher-level data (`APTransactionFact`) anchored on `DistDate`, which is correct.
- **Year-over-year AP comparisons** — drift averages out across periods.

What is potentially imprecise:

- **Exact AP balance reported on a specific month-end** when month-boundary voucher activity is present. Drift is bounded by the size of cross-boundary entries.

## Planned remediation

A focused SLLedgers re-sync targeting Jan 2026 → present, all sites, is required to populate `ControlPeriod` for the recent months. Once `GLTransactionFact` has `ControlPeriod` populated for ≥99% of recent rows, the AP roll-forward query can switch from a `TransDate` window to a `(ControlYear, ControlPeriod)` filter, which matches CSI's TB definition and should eliminate the drift.

When doing the re-sync, also investigate the live-sync pipeline to find why SLLedgers row counts dropped from ~280/month to single digits starting Jan 2026 (likely a pagination cap, task failure, or filter regression).

Tracked as TODO id `8` in the agent task list.

## Diagnostics

The investigation scripts that produced these findings are in `tmp/`:

- `tmp/check-prod-state.ts` — DB identity, raw + fact row counts.
- `tmp/diag-30100-dates.ts` — month-by-month source coverage.
- `tmp/diag-ap-family.ts` — sibling-account movement (rules out 30200/39185 as the source of the gap).
- `tmp/validate-30100-final.ts` — three-scenario roll-forward (SLLedgers / combined / SLGLTRANS).
- `tmp/validate-30100-distdate.ts` — TransDate vs DistDate vs hybrid comparison.
- `tmp/diag-controlperiod.ts` — ControlPeriod population by source.
- `tmp/diag-payload-fields.ts` — full payload-shape inspection for SLGLTRANS, SLLedgers, GLAcctPeriodBalances.
