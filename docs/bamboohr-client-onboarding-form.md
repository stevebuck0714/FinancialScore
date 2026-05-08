# BambooHR connection – information exchange

Use this when onboarding a company for the **BambooHR** operational data source alongside an existing accounting connection (e.g. QuickBooks).  
Copy into an email, Word/Google Doc, or PDF as needed.

---

## Company record (internal)

| Field | Value |
|------|--------|
| Company name | _________________________________ |
| FinancialScore company ID | _________________________________ |
| Environment | ☐ Development ☐ Production |

*Example (dev): Company name **Test of Employment Services** · Company ID `cmohtz2t80002qh90orwobwwe`.*

---

## Part 1 – What you will receive from us

_Fill in before sending to the client._

| Item | Our response |
|------|----------------|
| **Product / integration name** | FinancialScore – BambooHR operational sync |
| **Purpose** | Read workforce and organizational data from BambooHR to support reporting and analytics in FinancialScore (alongside your financial data source). |
| **Connection method** | BambooHR **API key** authentication to the BambooHR REST API (standard gateway URL pattern). |
| **Data we intend to pull** | By default we target: employee directory, departments, locations, and job information. **Time off / requests** can be included if you approve it for your tenant. |
| **Access type** | Typically **read-only** API access; we do not change BambooHR records through this integration. |
| **Sync pattern** | Scheduled pulls (e.g. daily / weekly / monthly) plus optional incremental behavior, per your policy and our configuration. |
| **Where credentials are stored** | Stored in FinancialScore’s secure application configuration for your company (operational system connection). Treat the API key like a password. |
| **Support / implementation contact** | Name: _________________ · Email: _________________ · Phone (optional): _________________ |
| **Privacy / security questions** | Direct requests to: _________________ |
| **Environment URL / access** _(if dev)_ | _________________ _(e.g. how they log into the dev site, if applicable)_ |

---

## Part 2 – What we need from you

_Ask the client to complete and return._

### 2.1 BambooHR access

| Field | Your answer |
|--------|-------------|
| **Company BambooHR subdomain** | `__________` _(the part before `bamboohr.com` in your login URL, e.g. `yourcompany`)_ |
| **API key** | `_________________________________` |
| **API key contact / owner** | Name: _________________ · Title: _________________ · Email: _________________ |
| **Date key created / rotated** | _________________ |

**How to create an API key (BambooHR admin):** In BambooHR, an administrator typically creates a key under **Settings → Account → Apps & Integrations → API** (wording may vary slightly by BambooHR version). Restrict the key to the minimum scope needed for the endpoints your IT policy allows.

### 2.2 Data scope confirmation

Check what we are allowed to sync for your organization:

| Data area | Include? (Yes / No) |
|-----------|----------------------|
| Employees (directory) | ☐ Yes ☐ No |
| Departments (metadata) | ☐ Yes ☐ No |
| Locations (metadata) | ☐ Yes ☐ No |
| Job information | ☐ Yes ☐ No |
| Time off / requests | ☐ Yes ☐ No |

If **No** to any default area, note the reason or alternative: _____________________________________________

### 2.3 Scheduling preferences

| Preference | Your answer |
|------------|-------------|
| **Sync frequency** | ☐ Daily ☐ Weekly ☐ Monthly |
| **Preferred sync time** | _________________ _(local time or specify timezone)_ |
| **Historical start** _(if applicable)_ | From date: _________________ |
| **Incremental sync** _(ongoing deltas vs full refresh – as we support)_ | ☐ Yes ☐ No ☐ Discuss with FinancialScore |

### 2.4 Approvals & compliance

| Question | Answer |
|----------|--------|
| **Authorized signer / approver** for this integration | Name: _________________ · Email: _________________ |
| **Legal / vendor review** required? | ☐ Yes ☐ No — If yes, status: _________________ |
| **Notes** (IP allowlisting, key rotation policy, offboarding): | _____________________________________________ |

---

## Part 3 – Client acknowledgement

By returning Part 2, you confirm that you are authorized to provide API access for the scope selected and that FinancialScore may use it as described in Part 1.

**Company name:** _________________________________  

**Signature / Name / Title:** _________________________________  

**Date:** _________________________________  

---

## Appendix – Technical reference (optional)

- **Base URL pattern:** `https://api.bamboohr.com/api/gateway.php/<subdomain>/v1`  
- **FinancialScore source code:** `BAMBOOHR_STANDARD` _(internal label)_  

Adjust Part 1 wording to match your legal/comms standards before sending.
