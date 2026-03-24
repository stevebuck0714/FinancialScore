# Corelytics DataRoom - Functional Overview

Corelytics DataRoom is a secure diligence workspace for company documents. It is designed for consultant-led transactions and internal company collaboration with strong access controls, scan gating, and auditable activity.

## Purpose

DataRoom provides a controlled place to:

- Organize diligence documents by folder and category
- Share access with internal and external users
- Enforce per-user and per-document permissions
- Protect downloads with scan and policy checks
- Maintain an immutable activity trail for compliance

## Access and Entitlement

DataRoom access is controlled by both entitlement and permissions:

- **Entitlement layer**
  - DataRoom must be enabled for the company
  - If pricing is `$0`, access is treated as free
  - If pricing is non-zero, active subscription is required
- **Permission layer**
  - Capabilities: `view`, `download`, `upload`, `share`, `manage`
  - Rules can be set at:
    - Default (user-wide)
    - Folder override
    - Document override

## Navigation Model

DataRoom is opened from the **Company Dashboard DataRoom tab**.

- This is the canonical entry point
- Payment and enablement checks run before opening
- If payment is required and inactive, checkout is shown instead of DataRoom

## Document Lifecycle

1. File uploaded to company documents storage
2. File assigned to a DataRoom folder
3. Scan state initialized (`pending_scan`)
4. Auto-scan trigger runs (plus manual `Scan Pending` support)
5. File transitions to:
   - `clean` (allowed)
   - `blocked` (quarantined)
   - `scan_failed` (retry/backoff path)

Only `clean` files can be viewed/downloaded.

## View vs Download

DataRoom supports distinct actions:

- **View**
  - Intended for preview behavior
  - Tracks view events in audit
- **Download**
  - Opens/downloads document through guarded delivery route
  - Enforces permission + scan state
  - Emits watermark header when configured
  - Tracks open/download events in audit

## Security Controls

Implemented controls include:

- Company scope checks (`companyId`) on DataRoom and document routes
- Capability checks for all critical actions
- Malware scan gate before file delivery
- Blocked/quarantined document handling
- Watermark metadata header support on delivery path
- Controlled invite flow for new external users

## External User Invite Flow

Manage Users supports inviting external users to company access:

- Existing account: access is granted immediately
- New email: invite token flow is issued
  - User creates credentials on accept page
  - Login and MFA apply per environment policy

## Audit Trail

DataRoom writes append-only audit events (stored under company allocations):

- Assignment/move/remove events
- View and blocked-view events
- Download/open and blocked-open events
- Scan completion events
- Permission update events

Audit includes user, action, timestamp, and context fields (document/folder, IP/user-agent where available).  
UI supports filtering, grouping by folder, pagination, and CSV export.

## Search in DataRoom

DataRoom includes document search that reuses the same backend AI document-search pipeline used elsewhere:

- Select a DataRoom document
- Ask a question
- Uses indexed chunks + retrieval
- Returns grounded short answer and cited bullets

## Admin Configuration

Site administration supports:

- Enable/disable DataRoom per company
- DataRoom pricing configuration (monthly/quarterly/annual)
- Default DataRoom pricing baselines
- Manage-user DataRoom permission editing

## Current Scope Notes

- Watermark rendering is currently header/policy level; full file-content watermark rendering can be extended later.
- Office preview behavior depends on viewer compatibility and storage URL accessibility.
- Production validation should follow `docs/DATAROOM_PROD_VALIDATION_CHECKLIST.md`.

