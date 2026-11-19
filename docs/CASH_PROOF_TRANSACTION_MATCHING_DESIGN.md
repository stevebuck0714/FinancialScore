# Cash Proof: Book-to-Bank Transaction Matching (Design)

Status: decisions confirmed (section 13). Nothing here is built yet.

## 1. Goal

Compare every bank-account posting in the accounting system (QBO / QBD General Ledger) with the
client's own bank data in the Data Room, and surface the differences as exceptions in the Cash
Proof report. Today the cash proof only compares **month-end balances** for **sampled months**.
This adds **transaction-level** testing and a **totals test for every month**.

## 2. What exists today (and is reused)

| Piece | Where | Used for |
| --- | --- | --- |
| Book register per bank account (date, type, num, name/memo, amount) | `lib/quickbooks-online/bank-register.ts`, `lib/quickbooks-desktop/bank-register.ts` | Book side of the match |
| Bank transactions, line level (date, amount, check #, payee, description) | `BankTransaction` table, filled from Plaid asset reports (`PLAID_ASSETS`) and Corelytics-reviewed CSV/Excel exports (`UPLOAD_EXPORT`) | Bank side of the match |
| Statement monthly totals (beginning, deposits, withdrawals, ending) | PDF statements read by `lib/cash-proof/statement-scan.ts` into `CashProofSample` / `CashProofDeposit` | Totals test where no line detail exists |
| Engagement, included bank accounts, review period, tolerance | `CashProofEngagement`, `CashProofBankAccount` | Scope of the test |
| Account linking | `CashProofBankAccount.sourceAccountId` (accounting account) and `accountLast4` + `bankName` (statement account, via `matchStatementAccount`) | Ties a book account to its bank transactions |
| Balance tie-out and exception workflow (Open / Cleared + resolution note) | `lib/cash-proof/tie-out.ts`, `CashProofSample` | Pattern the new exceptions follow |
| Exceptions section of the report | `app/components/valuation/CashProofReportSection.tsx` | Single home for all cash proof exceptions |

## 3. Coverage by type of bank evidence

| Bank evidence for an account-month | Line matching | Totals test | Auto reconciliation |
| --- | --- | --- | --- |
| Plaid bank connection report | Yes | Yes | Yes |
| Reviewed CSV / Excel export | Yes | Deposits and withdrawals only (exports have no balances) | Yes, when a statement gives the ending balance |
| PDF statement only | No (Phase 2) | Yes | No; reconciling items stay manual |
| Nothing | No | No | No; month shows as "No bank evidence" |

The report states which months were tested at line level so the reader knows the coverage.

## 4. Book side

A shared function returns book lines for one cash proof bank account over a date range:

```
loadBookBankLines(companyId, account: CashProofBankAccount, start, end) -> BookLine[]
BookLine = { key, date, type, num, name, memo, amount }   // amount: + deposit, − withdrawal
```

- QBO: `GLTransactionFact` where `accountId = sourceAccountId`. `key` = `transNum` (already unique).
- QBD: General Ledger detail rows for the account. QBD rows have no transaction id, so
  `key` = hash of `date | type | num | name | amount | occurrence#`. If a QBD resync changes
  history, keys can shift; resolutions are preserved by fingerprint (section 8) rather than key.
- The Bank Transactions tab and the cash proof use this same function, so the numbers agree.

## 5. Bank side

`BankTransaction` rows for the account's `accountLast4` (bank name breaks ties, same rule as
statement scanning). Amount is already + for money in. When the same transaction arrives from
both Plaid and a CSV export, Plaid wins (same priority the statement scan uses) and the
duplicate is ignored.

## 6. Matching

Matching runs across the **whole review period plus a 60-day tail** for each account, not month by
month. A check written March 28 that clears April 6 is a normal reconciling item for March, not
two exceptions.

Passes, strongest first. Each line can be matched once.

| Pass | Rule | Typical case |
| --- | --- | --- |
| 1. Check number | Same check #, same amount, bank date ≥ book date − 3 days | Checks |
| 2. Exact | Same amount, bank date within ±5 days of book date | ACH, card, transfers, most deposits |
| 3. Late clearing | Same amount, withdrawal, bank date 6–60 days after book date | Slow checks |
| 4. Batched deposit | One bank deposit = sum of 2–15 book receipts dated within ±3 days | Several customer payments deposited together |
| 5. Split withdrawal | One book payment = sum of 2–5 bank debits within ±3 days | Payroll split by provider |

Amounts must match to the cent. Closest date wins ties; then same direction and similar
payee text (normalized words overlap) breaks remaining ties. Pass 4 and 5 use a bounded
subset-sum search to stay fast.

Each match records the rule used and the day gap, so the reviewer can see why two lines were paired.

## 7. Results per account-month

Every line ends up in exactly one bucket:

- **Matched**: book and bank agree.
- **Reconciling item**: book line in month M that matches a bank line in M+1 / M+2
  (deposit in transit, outstanding check). Not an exception unless it violates a rule below.
- **Exception**: see section 8.

Auto bank reconciliation for each sampled month (replaces the hand-entered reconciling-items figure):

```
statement ending
  + deposits in transit       (booked in M, cleared after M)
  − outstanding checks        (booked in M or earlier, cleared after M or not at all)
  ± bank-only items not yet booked
  = book ending               → difference should be 0.00
```

The computed reconciling items feed `computeTieOut`. A reviewer can still override with a note.

**Totals test (every month, all evidence types):** book deposits and withdrawals vs statement
deposits and withdrawals. Difference above the engagement tolerance is an exception.

## 8. Exception types

| Code | What it means | Default severity | Phase |
| --- | --- | --- | --- |
| `BANK_ONLY_DEPOSIT` | Money came in, never booked. Possible unrecorded revenue, loan, owner contribution | High | 1 |
| `BANK_ONLY_WITHDRAWAL` | Money left, never booked. Possible owner draw, undisclosed debt payment, personal spend | High | 1 |
| `BOOK_ONLY_DEPOSIT` | Deposit booked, never reached the bank. Revenue inflation red flag | Critical | 1 |
| `STALE_OUTSTANDING_CHECK` | Check booked, not cleared after 90 days | Medium | 1 |
| `AMOUNT_MISMATCH` | Same check #, different amount | High | 1 |
| `TOTALS_MISMATCH` | Month's book deposits / withdrawals differ from the statement beyond tolerance | High | 1 |
| `RECON_DIFFERENCE` | Auto reconciliation leaves an unexplained difference | High | 1 |
| `UNDISCLOSED_BANK_ACCOUNT` | Bank account in the Data Room (by bank + last 4) with no matching account in the books | Critical | 1 |
| `RECON_CONFLICT` | Hand-entered reconciling items differ from the calculated figure | Medium | 1 |
| `BANK_FEES_INTEREST` | Small bank-only items (≤ $50, fee / interest text). Grouped per month, not listed singly | Low | 1 |
| `CUTOFF` | Deposit booked in the last 3 days of a month that cleared after the 5th of the next | Medium | 2 |
| `UNMATCHED_TRANSFER` | Money leaves one company account and never arrives in another within 5 days | High | 2 |
| `DUPLICATE_BOOK_ENTRY` | Same amount, date, and payee booked twice, only one bank line | Medium | 2 |
| `ROUND_DOLLAR_DEPOSIT` | Bank-only round deposits ≥ $1,000 (owner cash injections, loans) | Medium | 2 |

Severity drives sort order and the report summary. Thresholds (90 days, $50, 3 days, $1,000) are
engagement settings with these defaults.

**Re-runs keep resolutions.** Each exception has a fingerprint (account, type, date, amount, and
check # or bank transaction id). When matching is re-run after new statements arrive, an exception
with the same fingerprint keeps its status and note; exceptions that no longer occur are
closed automatically ("Resolved by new data") rather than deleted, so the audit trail stays.

## 9. Data model (new tables; needs a migration)

```prisma
model CashProofTransactionMatch {
  id                 String   @id @default(cuid())
  engagementId       String
  bankAccountId      String
  month              String   // YYYY-MM of the book line (bank month for bank-only groups)
  rule               String   // CHECK_NUMBER | EXACT | LATE_CLEARING | BATCHED_DEPOSIT | SPLIT_WITHDRAWAL
  bookKeys           String[]
  bankTransactionIds String[]
  amount             Float
  dayGap             Int
  isReconcilingItem  Boolean  @default(false)
  createdAt          DateTime @default(now())
  @@index([engagementId, bankAccountId, month])
}

model CashProofTransactionException {
  id                String    @id @default(cuid())
  engagementId      String
  bankAccountId     String
  month             String    // YYYY-MM
  type              String    // codes in section 8
  severity          String    // CRITICAL | HIGH | MEDIUM | LOW
  fingerprint       String
  amount            Float
  bookKey           String?
  bookDate          String?
  bankTransactionId String?
  bankDate          String?
  description       String    // plain-English explanation shown in the report
  detail            Json?     // the lines involved
  status            String    @default("OPEN")   // OPEN | CLEARED | AUTO_RESOLVED
  resolutionNote    String?
  resolvedByUserId  String?
  resolvedAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@unique([engagementId, fingerprint])
  @@index([engagementId, bankAccountId, month])
}
```

`CashProofEngagement` gains `transactionMatch Json?` holding the last run summary
(`runAt`, per account-month counts, coverage, settings used), the same way `statementScan` works.
Locked engagements keep their stored results; matching cannot be re-run after lock.

## 10. Where it runs

- New cash proof action `run-transaction-match` in `runCashProofAction` (same route,
  `app/api/cash-proof/route.ts`).
- Runs automatically at the end of **Read Statements** and after a bank connection report or
  CSV export is accepted, so results stay current without an extra button. A **Re-run matching**
  button sits beside Read Statements for manual runs.
- Large engagements (3 years × several accounts) run with `after()` in the background with a
  progress status on the engagement, the same pattern as the QBO backfill.

## 11. UI

Following the layout rule (one home per thing, match existing siblings):

- **Cash Proof workspace**: a **Transaction Match** card next to the existing Statement Scan card,
  same styling. Shows coverage (months tested at line level), % of bank dollars matched,
  open exceptions by severity, and the Re-run button.
- **Account-month drill-down**: clicking a cell in the existing balance grid opens a panel with
  three tabs: Matched, Reconciling Items, Exceptions. Columns mirror the Bank Transactions tab
  (Date, Type, Num, Name / Memo, Deposit, Withdrawal) with the bank side alongside.
- **Exceptions workflow**: each exception gets Clear + resolution note, same controls as
  sampled-month exceptions today. No separate exceptions page.
- **Cash Proof report**: the existing Exceptions section gets a second table,
  "Transaction exceptions", grouped by severity then account-month. A new "Transaction testing"
  summary above it states coverage, dollars matched, and counts and dollars per exception type.
  The headline sentence counts both balance and transaction exceptions.

## 12. Phases

**Phase 1:** book line loader, bank line loader, passes 1–5, reconciling items, auto
reconciliation feeding the tie-out, totals test for every month, Phase 1 exception types
(including undisclosed bank accounts and reconciling-item conflicts),
fingerprint-preserving re-runs, workspace card + drill-down, report section.

**Phase 2:** cutoff, unmatched transfers, duplicate book entries, round-dollar deposits;
PDF statement line items (Ocrolus or a parser upgrade) so PDF-only months get line matching.

## 13. Decisions (confirmed Nov 19, 2026)

1. **Date windows**: ±5 days for exact matches; up to 60 days for late-clearing checks.
2. **Stale check threshold**: 90 days.
3. **Bank fee grouping**: bank-only items ≤ $50 with fee or interest wording are grouped into one low-severity line per month.
4. **Auto reconciliation**: fills blank reconciling-items figures only. When a hand-entered figure differs from the calculated one, show a conflict (same rule as Read Statements); never overwrite.
5. **Undisclosed accounts**: bank accounts in the Data Room with no matching account in the books are a Critical `UNDISCLOSED_BANK_ACCOUNT` exception (Phase 1).
6. **Materiality**: every exception is listed; reviewers clear the small ones. No threshold.

## 14. Known limits

- QBO check numbers exist only on General Ledger lines synced after the Nov 19, 2026 change;
  older lines match on amount and date only (pass 2/3), which works for most items.
- QBD line keys are derived, not native ids (section 4).
- PDF-only months get the totals test, not line matching, until Phase 2.
- The migration must be applied through the normal process before deploying; the build does not run migrations.
