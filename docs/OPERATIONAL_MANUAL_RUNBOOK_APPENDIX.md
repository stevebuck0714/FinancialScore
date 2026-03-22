# Corelytics Operational Runbook Appendix

This appendix provides role-based operational checklists to run the platform reliably.

## 1) Site Admin Runbook

### Daily Checklist

- Verify critical integrations are connected for active companies.
- Review sync/error indicators for accounting integrations.
- Confirm no unresolved security or access alerts for tenant-scoped routes.
- Review DataRoom scan backlog and blocked-file queue.

### Weekly Checklist

- Review Operational Hub category/section visibility for key clients.
- Validate custom report entries and scope assignments:
  - company-only reports still scoped correctly
  - global reports present where expected
- Review pricing/subscription status for DataRoom and platform plans.
- Spot-check major dashboard modules with latest data refresh.

### Monthly Checklist

- Confirm month-end publish workflow completion where applicable.
- Verify reconciliation thresholds and exception counts on key financial outputs.
- Audit role/permission changes made in the prior period.
- Export/retain operational configuration snapshots for change tracking.

### Change-Control Checklist (before production-impacting change)

- Confirm tenant-scope impact and rollback plan.
- Confirm deterministic metric logic is unchanged unless explicitly approved.
- Confirm security review for integration/auth/data-access code paths.
- Confirm at least one company-level validation run in staging/local.

## 2) Consultant Runbook

### Weekly Client Operations Review

- Open Operations Hub and review exception areas first (AR/AP/Cash/Products).
- Validate category relevance to client sector and active data availability.
- Confirm custom report toggles align with current engagement focus.
- Document top 3 actions from Analysis + Operations signals.

### Monthly Client Value Review

- Compare goals vs actuals (expense and operational goals).
- Review trend and ratio movement against benchmark context.
- Validate recommendation queue and action status progression.
- Prepare executive summary with realized impact and next priorities.

## 3) Operations Analyst Runbook

### Data Quality and Monitoring

- Validate freshness windows for key datasets.
- Check null/coverage anomalies and source-field mapping integrity.
- Review outlier/anomaly queues and classify false positives vs true issues.
- Escalate mapping defects that affect cross-module consistency.

### Reporting Reliability

- Verify chart/table sections render for enabled category toggles.
- Confirm filters, exports, and coverage timestamps are consistent.
- Validate company overrides do not suppress critical controls unintentionally.

## 4) DataRoom Operations Runbook

### Daily Security Operations

- Review failed scans and blocked files.
- Confirm no unauthorized access attempts in audit stream.
- Verify external invite acceptance and permission assignment outcomes.

### Weekly Compliance Checks

- Spot-check document capability rules (`view/download/upload/share/manage`).
- Verify audit export integrity for the prior period.
- Review high-sensitivity folder permissions.

## 5) Integration Operations Runbook

### Onboarding (per company)

- Confirm accounting system selection and credentials are complete.
- Validate required integration-specific fields (e.g., tenant/site context).
- Execute probe/test endpoint and confirm expected scope.
- Run initial sync and validate canonical dataset outputs.

### Incident Handling

- Capture exact endpoint/error payload and affected company ID.
- Determine whether issue is auth, mapping, schema, or source availability.
- Apply fix in least-privilege sequence (config first, code second).
- Re-run probe and sync; capture before/after evidence.

## 6) Operational Hub Custom Reports Runbook

### Add New Report Entry

1. Open company in Site Admin.
2. Go to Operational Hub Customization.
3. Enter report label.
4. Select target tab category.
5. Choose scope:
   - `Company only`
   - `All companies (global)`
6. Click **Add Report**.
7. Set report toggle on/off.
8. Click **Save**.

### Validation Checklist

- Report appears under selected category container.
- Scope behavior matches expectation:
  - company-only visible for subject company
  - global present across intended companies
- Toggle state persists after refresh.

### Important Limitation

- New custom report entries create configuration controls.
- If report content is new, Operations module rendering/data logic must be implemented separately.

## 7) Escalation Matrix

Escalate to Engineering when:

- canonical mapping produces incorrect financial totals
- tenant separation or permission behavior is suspect
- module rendering fails for enabled sections
- global custom report propagation is inconsistent

Escalate to Product/Operations leadership when:

- sector categories or default report families need redesign
- new report definitions require cross-company policy decisions
- reconciliation thresholds or publish cadences require business sign-off

