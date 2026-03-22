# Operational Hub Custom Report Selection Process

This document explains how the new report selection flow works in `Site Admin -> Operational Hub Customization`.

## Purpose

The feature allows a Site Admin to:

- create a new report entry
- assign it to a selected tab category
- choose scope as either:
  - **Company only** (only the current company), or
  - **All companies (global)** (applied to all companies at creation time)

It works alongside existing section toggles in Operational Hub customization.

## Where It Lives

In each company card inside Site Admin, under **Operational Hub Customization**:

- `TAB CATEGORIES` remains the master list of categories for that company sector.
- The add-report controls appear in the customization header:
  - **New report name**
  - **Tab category selector**
  - **Scope selector** (`Company only` or `All companies (global)`)
  - **Add Report** button

## Admin Workflow

1. Open the target company in Site Admin.
2. In Operational Hub Customization, enter a report name.
3. Select the tab category where the report should live.
4. Choose scope:
   - `Company only`: add to current company only
   - `All companies (global)`: add to all current companies
5. Click **Add Report**.
6. Use existing checkboxes to enable/disable visibility in that company’s configuration.
7. Click **Save** to persist section toggle state changes.

## How Scope Works

- **Company only**
  - The report metadata is added only to the selected company.

- **All companies (global)**
  - The same report metadata is written to all companies currently in the system.
  - The report label is shown with `(global)` in the customization list.

## Data Storage

Configuration is stored in:

- `Company.userDefinedAllocations.operationalHub`

New custom reports are stored in:

- `operationalHub.customReports[]`

Each custom report record includes:

- `id`
- `label`
- `tabKey`
- `dataType`
- `scope` (`company` or `global`)
- `createdAt`
- `createdByCompanyId`

Visibility toggles (including custom report toggles) are stored in:

- `operationalHub.sections`

Custom report toggle keys use:

- `customReport:<reportId>`

## Category and Toggle Rendering

- Tab categories are generated from the company sector profile.
- Each selected category renders its own container.
- Standard report toggles are derived from module-to-data-type mapping.
- Custom reports assigned to that category are appended as additional toggles.

## Important Notes

- Adding a custom report creates a **configurable report entry**; it does not automatically create chart/table rendering logic in `OperationsTab`.
- For a custom report to display real content in Operations, corresponding UI/data logic must be implemented.
- Current UI supports **add** behavior; there is no dedicated edit/delete management workflow yet.
- `global` scope is applied to companies present at creation time.

