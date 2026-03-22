# Corelytics Operational Manual - Enterprise Controls Appendix

This appendix defines enterprise-grade operating controls for release management, incidents, data governance, access lifecycle, integration SLAs, reconciliation, and continuity planning.

## 1) Environments and Release Operations

### 1.1 Environment model

- **Local/Dev**: active feature development and rapid validation.
- **Staging**: pre-production validation for integrations, security paths, and regression checks.
- **Production**: controlled releases only, with approved change windows.

### 1.2 Release flow

1. Feature complete in development branch.
2. Validate against role-specific runbooks.
3. Promote to staging and execute UAT checklist.
4. Approve release in defined change window.
5. Deploy to production with rollback plan.

### 1.3 Rollback readiness

Every release should include:

- impacted files/modules list
- migration impact statement (if any)
- configuration change impact statement
- rollback command/process
- owner-on-call and verification steps

## 2) Observability and Incident Response

### 2.1 Monitoring domains

- integration health (sync/probe failures, auth errors, mapping failures)
- app/API health (error rates, latency, route failures)
- data-quality and reconciliation exceptions
- DataRoom security events (scan blocked, permission denials)

### 2.2 Incident severity model

- **SEV-1**: security breach, cross-tenant risk, critical platform outage.
- **SEV-2**: major module unavailable or materially incorrect financial output.
- **SEV-3**: degraded performance or partial module impact with workaround.
- **SEV-4**: minor issue, cosmetic defect, or low-risk usability problem.

### 2.3 Incident workflow

1. Detect and classify severity.
2. Assign incident owner.
3. Contain (disable affected flow, isolate tenant/module if needed).
4. Resolve and validate.
5. Publish postmortem with corrective actions.

### 2.4 Postmortem minimum fields

- timeline
- impact scope
- root cause
- containment and fix
- preventive controls
- owner + due dates

## 3) Data Governance and Retention

### 3.1 Data classification

- **Confidential financial data**: company statements, operational snapshots, mappings.
- **Restricted security data**: credentials, auth metadata, MFA-related artifacts.
- **Regulated diligence data**: DataRoom documents and permission/audit traces.

### 3.2 Governance principles

- least privilege access
- tenant/company isolation by design
- deterministic source-of-truth for financial calculations
- auditable change and access records for sensitive operations

### 3.3 Retention and deletion policy framework

Define policy by data family:

- operational snapshots
- financial monthly records
- DataRoom assets and scans
- audit/event logs
- integration run logs

Each policy should specify retention period, archival behavior, and deletion authority.

## 4) Access Lifecycle Management

### 4.1 Provisioning controls

- require approved role assignment at onboarding
- enforce company scope and role boundaries
- enable MFA per policy

### 4.2 Role change controls

- approval required for elevated roles (especially Site Admin)
- timestamped change record
- immediate re-evaluation of high-risk permissions

### 4.3 Offboarding controls

- disable account access immediately
- revoke integration/admin privileges
- rotate credentials where user had privileged scope
- verify removal from company-level access lists

### 4.4 Emergency access

- temporary, time-bound elevated access
- named approver
- full audit trail and mandatory post-use review

## 5) Integration SLA Matrix (Control Template)

For each integration, document:

- expected refresh cadence
- max end-to-end latency
- retry/backoff policy
- required credentials/context fields
- failure alert destination
- escalation owner

Minimum integration classes:

- Infor (M3/CSI)
- QuickBooks (Online/Desktop)
- Xero
- payment/webhook integration (USAePay)

## 6) Reconciliation Runbook Framework

### 6.1 Required runbook sections (per module)

- source-of-truth baseline
- formula and mapping assumptions
- threshold bands (acceptable/warn/investigate)
- exception queue ownership
- sign-off owner and cadence

### 6.2 Priority reconciliation modules

- Daily Financials month-end publish lane
- Products weekly margin lane
- AR/AP aging summaries vs source snapshots
- key KPI totals on executive/valuation surfaces

## 7) Change Management and Approval Gates

### 7.1 Change classes

- **Config-only** (e.g., category visibility toggles)
- **Code-only** (no data contract changes)
- **Schema/data contract change** (highest scrutiny)

### 7.2 Approval gates

- technical validation complete
- security/data-separation validation complete
- business owner acknowledgment for behavior-impacting changes
- rollback and communication plan approved

### 7.3 Release communications

Minimum release note:

- what changed
- why it changed
- who is affected
- required action (if any)
- known limitations

## 8) Disaster Recovery and Business Continuity

### 8.1 Continuity scenarios

- integration outage
- database outage/degradation
- external dependency outage (auth/payment/email/AI)
- security event requiring feature isolation

### 8.2 RTO/RPO framework

Define and publish:

- **RTO** (target restore time) by module criticality
- **RPO** (acceptable data loss window) by dataset type

### 8.3 Fallback operations

- temporary switch to known-good snapshots where appropriate
- disable affected category/report sections instead of serving invalid outputs
- preserve audit trail of continuity actions taken

## 9) Operational Ownership Matrix (Template)

At minimum assign owners for:

- platform release management
- security and access control
- integration operations
- data quality and reconciliation
- DataRoom compliance
- valuation/recommendation governance

Each owner role should have primary + backup assignment.

## 10) Next-Step Implementation Recommendations

1. Formalize SLA table per integration in a single source document.
2. Add edit/delete lifecycle and approval metadata for custom reports.
3. Add global-template inheritance behavior for future companies.
4. Convert remaining policy `.docx` artifacts into markdown and merge policy sections.
5. Add an incident postmortem template file under `docs/`.

