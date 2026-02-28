# QuickBooks Desktop Integration: Required vs Deferred Information

Use this guide to keep onboarding fast. Collect the **Required** items first to establish connectivity, then gather **Deferred** items before production hardening or phase-2 scope.

---

## Required (Day-1 Connectivity)

These are the minimum items needed to connect and run initial sync tests.

| Category | Required Item | Why It Is Required |
|----------|----------------|--------------------|
| QuickBooks environment | QuickBooks Desktop edition/year and country version | Confirms compatibility and connector behavior. |
| Company file | Target production `.QBW` file and confirmation it is the correct file | Prevents connecting to the wrong company. |
| Access | QuickBooks Admin user available for one-time authorization | Desktop integrations require Admin approval. |
| Host machine | Windows host/server where QB Desktop can access the company file | Integration must run where QB/company file is reachable. |
| Integration method | Confirm Web Connector vs SDK approach | Determines setup steps and technical path. |
| Network | Host can reach integration endpoint (HTTPS, proxy/firewall approval as needed) | Required for data exchange. |
| Scope (minimum) | Initial data scope (for example: COA + customers + invoices) | Defines what to pull during first validation. |
| Permissions | Read-only vs read/write decision | Prevents unauthorized write behavior. |

---

## Required Before Production Go-Live

These are not always required for first connection, but should be confirmed before production scheduling.

| Category | Required Item | Why It Is Required |
|----------|----------------|--------------------|
| Sync operations | Frequency, preferred time window, and blackout windows | Ensures stable and predictable jobs. |
| Data rules | Fiscal year, currency, class/location usage, exclusions | Needed for correct reporting and mappings. |
| Validation | Reconciliation reports and sign-off owner | Defines acceptance criteria for go-live. |
| Support | Primary technical contact for incidents | Needed for troubleshooting and recovery. |

---

## Deferred (Can Be Collected Later)

These can usually wait until after connectivity is proven, unless client policy requires them upfront.

| Category | Deferred Item | Typical Timing |
|----------|---------------|----------------|
| Advanced scope | Phase-2 objects (inventory detail, advanced AP/AR analytics, optional modules) | After phase-1 validation |
| Documentation extras | Screenshots and non-critical reference attachments | During implementation |
| Extended operations | Full escalation matrix and expanded support procedures | Before scale-up |
| Compliance detail | Deep security/compliance questionnaires beyond baseline access approvals | Prior to production if required by policy |
| Optimization | Performance tuning preferences and advanced batching constraints | After baseline sync stability |

---

## Recommended Rollout Sequence

1. Collect **Day-1 Connectivity Required** items.
2. Complete one-time Admin authorization and test sync.
3. Validate sample results with finance/IT.
4. Collect **Required Before Production Go-Live** items.
5. Gather **Deferred** items as part of phase-2 hardening.
