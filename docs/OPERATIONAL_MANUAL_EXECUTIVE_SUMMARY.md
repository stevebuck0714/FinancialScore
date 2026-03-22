# Corelytics Operational Manual - Executive Summary

## Purpose

Corelytics is designed as a multi-tenant financial operations platform that combines:

- deterministic financial data processing
- sector-aware operational reporting
- configurable company-level controls
- controlled AI-assisted analysis and recommendations

This summary explains the operating model and key controls at an executive level.

## Platform Operating Model

- **Tenant boundary:** Company-level isolation for data, access, credentials, and configuration.
- **Control plane:** Site Admin manages integration settings, feature visibility, pricing, and operational overrides.
- **Reporting model:** Sector defaults define starting tab categories; company overrides control what is shown.
- **Data model:** Source-system inputs map into canonical contracts for consistent downstream reporting.

## Core Design Principles

1. **Deterministic-first financial logic**
   - Canonical calculations and thresholds are rules-based.
   - AI layers augment prioritization and narrative; they do not replace source-of-truth metrics.

2. **Scoped customization**
   - Company-specific configuration persists in `userDefinedAllocations`.
   - Operational Hub supports section-level visibility controls and custom report entries.

3. **Security and separation**
   - Authentication, MFA, role controls, and company-scope checks are foundational.
   - Integration credentials and data access are partitioned by company.

4. **Operational transparency**
   - Visibility controls, scan gates, reconciliation thresholds, and audit trails support governance.

## Functional Areas (High-Level)

- **Operations Hub:** AR/AP/Cash/Inventory/Products/Customers/Daily Financials; sector-aware category behavior.
- **DataRoom:** secure diligence workspace with entitlement checks, scan gate, permissions, and audit trail.
- **Analysis (Performance Analytics):** Focus Board, Trend Explorer, Anomaly Inbox, Opportunity Workspace.
- **Ask Corelytics:** AI-assisted Q&A and period review with company-specific prompts.
- **Ratios and Trends:** KPI ratios, benchmarks, and trend exploration.
- **Goals and Projections:** target setting and forward scenarios.
- **Valuation/SDE modules:** deterministic scoring and recommendation framework with guardrails.
- **Payments:** webhook-driven revenue tracking and consultant payable support.

## New Operational Hub Report Scope Capability

Site Admin can now create custom report entries with scope:

- **Company only** - available for one company
- **Global** - propagated to all companies at creation time

This currently governs report **configuration visibility/toggles**.  
If a new report requires new visuals/data logic, module implementation is still required.

## Governance and Cadence

- **Daily:** monitor integration health, scan queues, and failures.
- **Weekly:** review operational exception queues and dashboard readiness.
- **Monthly:** execute controlled publish/reconciliation workflows.
- **For product margins:** enforce Saturday EST operational cadence and tolerance thresholds.

## Key Risks to Track

- New custom report entries without corresponding rendering logic in module UI.
- Incomplete mapping for newly introduced sector categories if registry updates are missed.
- Policy docs in non-markdown format requiring separate governance-source alignment.

## Recommended Next Actions

1. Convert remaining policy `.docx` docs to markdown and append to operations policy section.
2. Add custom report edit/delete lifecycle with approval and audit metadata.
3. Add “global template inheritance” strategy for companies created after global report definition.

