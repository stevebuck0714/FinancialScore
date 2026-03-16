# DataRoom Production Validation Checklist

Use this checklist to validate DataRoom behavior in production after the recent access, scan, invite, and audit changes.

## Test Setup

- Create or identify two companies:
  - `Company A` (DataRoom paid)
  - `Company B` (DataRoom free / $0 pricing)
- Create test users:
  - Site Admin
  - Consultant
  - Company Admin (Company A)
  - Company User (Company A) with limited DataRoom permissions
  - External Invite Recipient (new email, no account yet)
- Ensure scanner config is set:
  - `DATAROOM_SCAN_PROVIDER`
  - `DATAROOM_SCAN_SERVICE_URL` (if using external scanner)
- Record test window start/end timestamps for audit verification.

## 1) Entitlement and Navigation

- [ ] Company A: DataRoom enabled + paid active => DataRoom entry appears.
- [ ] Company A: set subscription to past_due => behavior matches grace policy.
- [ ] Company B ($0 pricing): DataRoom entry appears without payment gate.
- [ ] Disable DataRoom for a company => entry hidden and deep-link blocked.
- [ ] Company Dashboard DataRoom tab opens DataRoom successfully.

## 2) Role and Permission Enforcement

- [ ] Site Admin can view/manage all DataRoom docs.
- [ ] Consultant can view/manage scoped company docs.
- [ ] Company Admin can view/manage own company docs.
- [ ] Company User with `view=true, download=false`:
  - [ ] can see docs
  - [ ] cannot open/download docs
- [ ] Company User with `upload=false` cannot upload.
- [ ] Company User with `manage=false` cannot move/remove/scan.
- [ ] Folder override takes effect over default permissions.
- [ ] Document override takes effect over folder/default permissions.

## 3) Upload, Assignment, and Scan Lifecycle

- [ ] Upload valid file to DataRoom folder succeeds.
- [ ] New assignment creates queued scan state (`pending_scan`) when appropriate.
- [ ] Auto-scan trigger runs after upload/assignment.
- [ ] Clean file transitions to `clean`.
- [ ] Malicious/suspicious file transitions to `blocked`.
- [ ] Scanner failure transitions to `scan_failed`.
- [ ] Retry logic:
  - [ ] `scanAttempts` increments
  - [ ] `nextScanAt` is set using backoff
  - [ ] retries stop at max attempts
- [ ] Manual `Scan Pending` retries failed/pending files.

## 4) Download Controls and Open Behavior

- [ ] `clean` + download allowed => Open works.
- [ ] `pending_scan` => Open blocked with pending message.
- [ ] `scan_failed` => Open blocked with retry guidance.
- [ ] `blocked` => Open blocked/quarantined.
- [ ] download disabled by policy => Open blocked with permission message.
- [ ] watermark-enabled docs emit watermark header on open response.

## 5) External Invite Flow

- [ ] Invite existing user email:
  - [ ] access granted immediately
  - [ ] no password reset/override
- [ ] Invite new user email:
  - [ ] invite email arrives with accept link
  - [ ] accept page loads token details
  - [ ] user sets password (new account)
  - [ ] invite status changes to accepted
  - [ ] company access is linked
- [ ] Expired or reused invite is rejected.
- [ ] New invited user login in production triggers MFA flow as expected.

## 6) Audit Trail Validation

- [ ] Audit panel visible to manage-capable users only.
- [ ] Events appear for:
  - [ ] overview view
  - [ ] document assigned
  - [ ] move/remove
  - [ ] open success / open blocked
  - [ ] scan completed
  - [ ] permissions updated
- [ ] Event fields populated:
  - [ ] timestamp
  - [ ] action
  - [ ] user email
  - [ ] document/folder IDs when applicable
  - [ ] IP/user-agent (where available)
- [ ] Filter behavior works (action, user email, date range, document ID).
- [ ] CSV export matches filtered dataset.

## 7) Regression Checks

- [ ] Existing Company Management user flows still work.
- [ ] DataRoom document ordering remains chronological.
- [ ] Uploaded/Downloaded by display remains correct.
- [ ] Open button UX remains functional and informative.
- [ ] No major console/API 500 errors during normal flows.

## Signoff

- Release date:
- Tester(s):
- Environment URL:
- Scanner provider used:
- Result: PASS / FAIL
- Notes / defects:

