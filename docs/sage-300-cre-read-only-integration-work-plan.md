# Sage 300 CRE Read-Only Integration Work Plan

**Purpose:** Define the planned approach for connecting FinancialScore to Sage 300 Construction and Real Estate (Sage 300 CRE) in a read-only manner.  
**Integration type:** Read-only accounting and job cost data sync.  
**Primary objective:** Bring Sage 300 CRE financial, project, payable, receivable, and job cost data into FinancialScore for reporting, analytics, and financial scoring without writing data back to Sage.

---

## 1. Executive Summary

FinancialScore will integrate with Sage 300 CRE using a read-only data connection. The recommended approach is to deploy a small connector in the client's Sage environment that extracts approved data from Sage, sends it securely to FinancialScore, and supports scheduled refreshes.

The integration will not post transactions, update records, or write directly to the Sage 300 CRE database. FinancialScore will maintain its own copy of approved accounting and job cost data for analytics and reporting.

The expected data flow is:

```text
Sage 300 CRE -> Read-Only Connector -> FinancialScore Staging -> FinancialScore Reporting and Scoring
```

This approach protects the accounting system while still allowing FinancialScore to deliver timely financial visibility.

---

## 2. Integration Goals

The integration is designed to:

- Provide FinancialScore with trusted accounting and operational data from Sage 300 CRE.
- Support financial scorecards, dashboards, variance analysis, trend reporting, and project-level insights.
- Reduce manual spreadsheet exports and recurring data preparation work.
- Preserve Sage 300 CRE as the system of record.
- Avoid write-back risk by keeping the integration read-only.
- Provide a repeatable, auditable sync process.

---

## 3. Read-Only Scope

FinancialScore will only extract approved data from Sage 300 CRE. No data will be written back to Sage.

The initial integration scope may include:

- Companies or entities.
- Chart of accounts.
- General Ledger balances.
- General Ledger transaction history.
- Vendors.
- Customers.
- Accounts Payable invoices.
- Accounts Payable payments.
- Accounts Receivable invoices.
- Cash receipts.
- Jobs or projects.
- Cost codes.
- Cost types or cost categories.
- Job cost actuals.
- Commitments, subcontracts, or purchase orders.
- Contract values and change orders, where available and approved.

Payroll, bank account details, tax identifiers, Social Security numbers, and direct deposit data are excluded unless specifically required, approved, and documented.

---

## 4. Recommended Technical Approach

The recommended approach is a read-only ODBC-based connector, subject to confirmation of the client's Sage 300 CRE version, hosting model, licensing, and available drivers.

The connector would typically run:

- On the Sage 300 CRE server.
- On a Windows VM with network access to Sage.
- Inside the client's hosted Sage environment.
- On another approved Windows host that can access the Sage data source.

The connector will:

- Authenticate to Sage 300 CRE using read-only access.
- Run predefined extraction queries.
- Transform extracted records into FinancialScore's expected format.
- Track sync progress and sync timestamps.
- Send approved data securely to FinancialScore.
- Log sync status, record counts, errors, and completion times.
- Avoid any insert, update, delete, post, or write-back operation in Sage.

FinancialScore will not query Sage directly from the user interface. Instead, synced data will be staged inside FinancialScore and used for application reporting.

---

## 5. Discovery and Access Requirements

Before technical setup begins, the following items should be confirmed with the client and/or Sage hosting provider.

| Item | Response |
|------|----------|
| Sage 300 CRE version | |
| Sage hosting model: on-prem, RDS/Citrix, private cloud, third-party hosting | |
| Primary Sage administrator | |
| IT or hosting provider contact | |
| Number of Sage companies/entities in scope | |
| Sage modules in use: GL, AP, AR, Job Cost, Contracts, Cash Management, Payroll | |
| ODBC driver availability | |
| Read-only credential availability | |
| Approved connector host machine | |
| Outbound HTTPS allowed from connector host | |
| Firewall, proxy, or allowlisting requirements | |
| Preferred sync schedule | |
| Required historical lookback period | |
| Client reporting package used for reconciliation | |

---

## 6. Data Mapping Workstream

FinancialScore and the client will jointly confirm which Sage data fields are needed and how they map into FinancialScore.

For each source object, the mapping should define:

- Source table, view, report, or extract.
- Primary key or unique identifier.
- Company/entity relationship.
- Job/project relationship, where applicable.
- Date fields.
- Amount fields.
- Status fields.
- Voided, reversed, closed, or archived record handling.
- Last modified field, if available.
- Transformation rules.
- FinancialScore destination object.

Example mappings:

| Sage 300 CRE Source | FinancialScore Destination |
|---------------------|----------------------------|
| Job | Project |
| Cost code | Project cost category |
| Job cost actual | Project cost actual |
| Vendor | Vendor |
| AP invoice | Payable obligation |
| AR invoice | Receivable obligation |
| GL account | Chart of accounts line |
| GL balance | Financial statement balance |
| Commitment or subcontract | Committed project cost |

The final field mapping will be documented and approved before production rollout.

---

## 7. Sync Strategy

The integration will use staged syncs rather than live queries against Sage.

### Initial Sync

The initial sync will pull the approved historical dataset from Sage 300 CRE into FinancialScore staging. This may include current-year data, prior-year data, open jobs, historical jobs, open AP/AR, GL balances, and job cost detail depending on the approved scope.

Initial sync activities:

- Extract approved Sage data.
- Load into FinancialScore staging.
- Normalize records into FinancialScore data models.
- Review row counts and key totals.
- Reconcile against Sage reports.
- Resolve mapping issues before production launch.

### Incremental Sync

For recurring syncs, the preferred method is to use reliable modified-date fields if available. If reliable modified timestamps are not available, FinancialScore will use a scoped refresh approach.

Potential scoped refresh rules:

- Refresh current fiscal year financial data nightly.
- Refresh open jobs nightly.
- Refresh AP and AR activity for the last 90 to 180 days.
- Refresh closed periods and historical jobs less frequently.
- Refresh master data such as vendors, customers, accounts, jobs, and cost codes on each scheduled sync.

The final incremental approach will depend on Sage data structure, performance, and reconciliation results.

---

## 8. Security and Controls

Security controls will be built around least privilege, encryption, and auditability.

Required controls:

- Use dedicated read-only Sage access for the integration.
- Store credentials securely on the approved connector host.
- Encrypt all data sent from the connector to FinancialScore.
- Restrict connector access to approved systems and endpoints.
- Pull only approved fields and entities.
- Maintain audit logs for each sync.
- Track sync start time, end time, record counts, and errors.
- Allow integration access to be disabled if needed.
- Keep company/entity data separated in FinancialScore.
- Apply FinancialScore role-based access controls to synced data.

The integration will not:

- Write directly to Sage tables.
- Post journals, invoices, payments, or job cost transactions.
- Modify vendor, customer, job, cost code, or account records.
- Extract payroll or personally sensitive data unless explicitly approved.

---

## 9. Validation and Reconciliation

Validation will be completed before production use. The goal is to confirm that FinancialScore totals match trusted Sage reports.

Recommended reconciliation checks:

- General Ledger trial balance totals.
- GL account balances by period.
- Accounts Payable aging totals.
- Accounts Receivable aging totals.
- Open AP invoices.
- Open AR invoices.
- Job cost actuals by job and cost code.
- Open commitments or subcontract balances.
- Contract totals and change orders, if included.
- Cash balances or cash activity, if included.

Validation should be performed by:

- Company or entity.
- Fiscal period.
- Module.
- Job/project, where applicable.

Acceptance criteria:

- Key totals reconcile to Sage within an agreed tolerance.
- Differences are documented and explained.
- Voided, reversed, closed, and archived records are handled correctly.
- Multi-company data remains separated.
- Client accounting or finance lead approves the results.

---

## 10. Monitoring and Support

The production integration should include ongoing monitoring.

FinancialScore should track:

- Last successful sync time.
- Sync duration.
- Record counts by object type.
- Failed queries or failed uploads.
- Authentication failures.
- Unexpected changes in row counts.
- Connector availability.
- Reconciliation drift or missing data indicators.

Recommended user-facing status:

- Last Sage sync timestamp.
- Sync success or failure status.
- Administrative alert when sync fails.

Support procedures should define:

- Who owns the Sage connector host.
- Who owns Sage credentials.
- Who responds to sync failures.
- How hosting provider restrictions are escalated.
- How Sage upgrades or server moves are communicated.

---

## 11. Pilot Rollout Plan

The recommended pilot is a limited read-only deployment with one company/entity or one approved data set.

Pilot steps:

1. Confirm Sage environment and read-only access.
2. Install or configure the connector on the approved Windows host.
3. Run a limited initial sync.
4. Load data into FinancialScore staging.
5. Reconcile against Sage reports.
6. Review dashboards and score outputs with client stakeholders.
7. Adjust mappings as needed.
8. Confirm sync performance and user trust in the data.
9. Approve production rollout.

Pilot success criteria:

- No disruption to Sage users.
- Connector runs reliably.
- Key totals reconcile to Sage.
- Client confirms the data is understandable and useful.
- FinancialScore can explain the source behind reported values.

---

## 12. Production Rollout Plan

Production rollout should be controlled and staged.

Recommended rollout steps:

1. Confirm final data scope and field mapping.
2. Confirm production read-only access.
3. Install connector in the production Sage environment.
4. Configure secure outbound communication to FinancialScore.
5. Run initial production sync after business hours.
6. Reconcile GL, AP, AR, and job cost totals.
7. Resolve any mapping or reconciliation exceptions.
8. Enable FinancialScore access for internal administrators.
9. Monitor several sync cycles.
10. Open access to broader users after approval.

---

## 13. Estimated Timeline

The estimated timeline for a careful read-only Sage 300 CRE integration is six to ten weeks, depending on access, hosting provider responsiveness, data complexity, and reconciliation needs.

| Workstream | Estimated Duration |
|------------|--------------------|
| Discovery | 3 to 5 business days |
| Access and environment setup | 2 to 7 business days |
| Data scope and mapping | 1 to 2 weeks |
| Connector configuration/build | 2 to 4 weeks |
| Validation and reconciliation | 1 to 2 weeks |
| Pilot rollout | 1 to 2 weeks |
| Production rollout | 2 to 5 business days |

---

## 14. Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ODBC access is unavailable or restricted | Confirm access early with Sage administrator or hosting provider |
| Hosted Sage provider limits connector installation | Identify approved connector host during discovery |
| Sage data structures vary by version or module | Complete field mapping and test extracts before rollout |
| Modified timestamps are unreliable | Use scoped refreshes for current periods and open records |
| Data does not reconcile to reports on first pass | Reconcile by module, company, period, and job; document rules |
| Multi-company data is mixed | Enforce company/entity identifiers throughout the sync |
| Payroll or sensitive data is exposed unintentionally | Exclude sensitive modules and fields unless explicitly approved |
| Sage performance is affected | Schedule syncs off-hours and use bounded extraction queries |
| Sage upgrades change data access | Establish client notification process for Sage upgrades |

---

## 15. Recommended MVP Scope

The recommended first production version should include:

- Read-only connector.
- Nightly scheduled sync.
- One company/entity first, unless multi-company access is required immediately.
- General Ledger balances and transactions.
- Accounts Payable invoices and payments.
- Accounts Receivable invoices and receipts.
- Jobs/projects.
- Cost codes.
- Job cost actuals.
- Commitments or subcontracts, if available.
- Reconciliation against Sage trial balance, AP aging, AR aging, and job cost reports.

Deferred items:

- Payroll data.
- Write-back to Sage.
- Near-real-time sync.
- Advanced historical restatement logic.
- Custom client-specific report replication beyond the approved MVP scope.

---

## 16. Client Responsibilities

The client will need to provide:

- Sage administrator contact.
- IT or hosting provider contact.
- Confirmation of Sage version and modules in use.
- Read-only access approval.
- Approved connector host or environment.
- Network approval for outbound secure communication.
- Sample Sage reports for reconciliation.
- Finance/accounting stakeholder for validation.
- Notice of Sage upgrades, server moves, or hosting changes.

---

## 17. FinancialScore Responsibilities

FinancialScore will provide:

- Integration design and implementation plan.
- Connector setup requirements.
- Data mapping workbook.
- Secure data ingestion endpoint.
- Staging and normalization process.
- Sync monitoring and error reporting.
- Reconciliation support.
- Production rollout support.
- Ongoing support for integration-related sync issues.

---

## 18. Approval Checkpoints

Recommended approval checkpoints:

- Discovery and access approved.
- Data scope approved.
- Field mapping approved.
- Initial sync completed.
- Reconciliation completed.
- Pilot accepted.
- Production rollout approved.

Each checkpoint should identify the client owner, FinancialScore owner, approval date, and any open exceptions.
