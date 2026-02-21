# QuickBooks Desktop Integration Questionnaire

**Purpose:** Collect all information required to connect our platform to your QuickBooks Desktop environment and complete validation.  
**Requested return date:**  
**Client Name:**  
**Primary Contact:**  
**Email / Phone:**  
**Time Zone:**  

---

## 1) Required Before Kickoff

Please provide the following items before technical setup begins.

| Item | Response |
|------|----------|
| QuickBooks Desktop edition and year (Pro/Premier/Enterprise + year) | |
| Country version (US/CA/UK/etc.) | |
| Company file name and location (`.QBW`) | |
| Confirmation of production company file to integrate | |
| QuickBooks Admin user available for authorization session | |
| Windows host machine name and location (where QB Desktop runs) | |
| Confirmation machine can remain online for sync windows | |
| IT contact for firewall/network approvals | |

---

## 2) QuickBooks Environment

| Field | Response |
|-------|----------|
| QuickBooks release/version (from `F2` Product Information) | |
| Single-user or Multi-user mode | |
| Number of company files in use | |
| Is this a hosted environment? (local server, RDS, third-party hosting) | |
| Any planned QB upgrades in next 90 days? | |

---

## 3) Access & Authorization

| Field | Response |
|-------|----------|
| Can an Admin open the target company file during setup? | Yes / No |
| Can client approve integrated application certificate prompt? | Yes / No |
| Allow app access when QuickBooks is not running? (recommended for scheduled sync) | Yes / No |
| Preferred setup window/date for one-time authorization | |
| Security policy restrictions we must follow | |

---

## 4) Integration Method

| Field | Response |
|-------|----------|
| Integration type | QuickBooks SDK / Web Connector (QWC) |
| If Web Connector: is QuickBooks Web Connector installed? | Yes / No |
| If Web Connector: version installed | |
| If Web Connector: who will maintain service on host machine? | |
| Are local admin rights available for initial install/config if required? | Yes / No |

---

## 5) Network & Infrastructure

| Field | Response |
|-------|----------|
| Outbound HTTPS allowed from QB host to our integration endpoint | Yes / No |
| IP/domain allowlisting required by client policy | Yes / No |
| Proxy required for outbound traffic | Yes / No |
| Antivirus/EDR exclusions needed for connector process | |
| IT owner for networking changes | |

---

## 6) Scope of Data Sync

Please mark what should be included in phase 1.

| Data Domain | Include? (Y/N) | Notes |
|------------|-----------------|-------|
| Chart of Accounts | | |
| Customers | | |
| Vendors | | |
| Items/Products | | |
| Invoices | | |
| Sales Receipts | | |
| Payments Received | | |
| Bills | | |
| Bill Payments | | |
| Journal Entries | | |
| Bank Transactions / Reconciliations (if applicable) | | |

---

## 7) Sync Rules & Frequency

| Field | Response |
|-------|----------|
| Sync direction | One-way (QB -> platform) / Two-way |
| Initial historical backfill start date | |
| Ongoing sync frequency | Hourly / Daily / Other |
| Preferred sync window (client local time) | |
| Blackout windows (times not to run sync) | |
| Incremental sync basis | Modified date / Txn date / Other |

---

## 8) Financial Mapping Requirements

| Field | Response |
|-------|----------|
| Fiscal year start month | |
| Multi-currency enabled in QuickBooks? | Yes / No |
| Home/reporting currency | |
| Class tracking enabled? | Yes / No |
| Location tracking enabled? | Yes / No |
| Account mapping exceptions or custom rollups | |
| Entities/accounts to exclude | |

---

## 9) Validation & Reconciliation

| Field | Response |
|-------|----------|
| Reports used for reconciliation (P&L, Balance Sheet, Trial Balance, AR/AP aging) | |
| Reconciliation level required | Summary / Account-level / Transaction-level |
| Acceptable variance threshold | |
| Business owner who signs off on validation | |

---

## 10) Operations & Support

| Field | Response |
|-------|----------|
| Go-live target date | |
| Primary technical contact | |
| Backup technical contact | |
| Preferred support hours | |
| Escalation contact | |

---

## 11) Security & Compliance

| Field | Response |
|-------|----------|
| Data classification requirements (PII/financial restrictions) | |
| Required logging/audit standards | |
| Data retention requirements | |
| Any contractual/security review required before connection | |

---

## 12) Client Setup Checklist (One-Time Authorization Session)

Please confirm these steps can be completed during setup:

- Admin logs into the target QuickBooks company file.
- Client accepts integrated app authorization prompt.
- Client confirms permission scope (read-only or read/write as agreed).
- If scheduled sync is required, client enables access when QuickBooks is not running.
- If Web Connector is used, client imports our `.QWC` file and enters credentials.

---

## Attachments Requested

Please attach (if available):

- Screenshot of QuickBooks `F2` Product Information window.
- Screenshot of company file path or file list showing target `.QBW`.
- Any internal network/security questionnaire we must complete.

---

## Notes

- Do not send passwords or secrets by email.
- If policy requires secure transfer, we will provide a secure channel for credentials and certificates.
