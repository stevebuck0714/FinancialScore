# Corelytics New Client Setup Guide

## Internal use only

Use this guide to set up a new client in Corelytics. Work with the client to enter the required information directly in the application, collect the systems and documents needed for the agreed scope, and document anything that remains open.

This workflow excludes the Quality of Earnings (QoE) module. Do not enable QoE access or configure, request, or train on QoE, Cash Proof, bank-statement review, credit-card review, QoE adjustments, or QoE reports.

## How to use this guide

Complete the sections in order. Keep the client finance and operations contacts involved when their information or approval is needed. At the end of each section, update the readiness checklist as **Complete** or **Still Open**, name an owner, and note the next action.

## 1. Identify the client team and onboarding scope

Before entering data or requesting access, identify:

- Executive sponsor.
- Finance lead or controller.
- Accounting-system administrator.
- Operations lead.
- Owner for each operational system.
- Primary DataRoom document owner.
- Company Admin who will manage client users after setup.

Confirm the immediate Corelytics use case: financial reporting, operating visibility, advisory support, lender reporting, financing readiness, or another agreed purpose. Record the target go-live date and the financial history that must be available at launch.

## 2. Collect the accounting and operational systems

This is the first data-collection conversation with the client. Do not begin connection work until the system inventory is complete.

### Accounting-system intake

For each accounting or ERP system in scope, collect:

| Information to collect | Record |
|---|---|
| System | Vendor/product, version or edition, and cloud or desktop deployment. |
| Accounting owner | Finance contact and administrator who can grant access or produce exports. |
| Companies in scope | Legal entities, divisions, locations, and any entities that must be excluded. |
| Financial history | Closed months/years available; 36 months of monthly history is preferred. |
| Connection path | Supported connection, approved export, or trial-balance upload. |
| Refresh expectation | Monthly close process and any agreed refresh cadence. |
| Known limitations | Missing periods, restatements, chart-of-account changes, or source-data limitations. |

Corelytics has system-specific connection workflows. Confirm the supported path with the Site Admin before committing to a connection method or date.

### Operational-system intake

Work with the operations lead to identify every system that supports a key operating measure. This includes, as applicable, CRM, sales/pipeline, order management, inventory, job/project management, production, payroll/HR, field service, point-of-sale, lending, or sector-specific systems.

For each system, collect:

| Information to collect | Record |
|---|---|
| Business process | The process supported: sales, service delivery, production, inventory, workforce, pipeline, lending, or another process. |
| System | Vendor/product, version, and cloud or desktop deployment. |
| System owner | Client contact who understands the data and can approve access. |
| Data needed | The requested data domains, such as customers, invoices, payments, orders, inventory, shipments, AR/AP aging, pipeline, or employee data. |
| Connection path | Supported connection, API, scheduled export, or manual upload. |
| Go-live decision | Connect now, defer, or out of scope. Record the reason. |
| Refresh expectation | Manual, daily, weekly, or other agreed cadence. |

Do not connect a system merely because it is available. Connect only the sources that support the client’s agreed use case.

## 3. Complete Company Management with the client

Open the client company and go to **Company Management**. Enter the information with the client rather than collecting it separately for later entry. Save after each section.

### 3.1 Profile

In **Profile**, complete or confirm:

- Company address: street, city, state, ZIP, and country.
- Accounting System. This selection is required and determines the connection workflow available to the company.
- Base currency and reporting currency, if applicable.
- Company Size.
- Industry Sector and Industry Group.
- Business Status.
- Legal Structure.
- Ownership.
- Workforce.
- Key Advisors.
- Lines of Business and any supported allocation information.
- Key Employees: name, title, year employed, and background/responsibility information.

Use the client’s legal entity and finance contacts to verify these entries. The Accounting System, Industry Sector, and Industry Group are required selections.

### 3.2 Company Disclosures

In the **Company Disclosures** section of Profile, review every item with the client. Select **NONE** or **YES** for each disclosure. When the answer is **YES**, enter a concise explanation that identifies the relevant dates, parties, and supporting document location.

Review:

- Bankruptcies.
- Liens or Judgements (business, equipment).
- Material Contract Covenants (for example, loan covenants).
- Lawsuits (as plaintiff and/or defendant).
- Most Favored Nation provisions in contracts.
- Equity Control requirements.
- Right of First Refusal on sale.
- Shareholder Protections, including blocking or approval rights.
- Change-in-Control triggers with customers and/or suppliers.
- Regulatory Approvals (local, state, or federal).
- Audited Financial Statements.

Upload supporting documents to the appropriate DataRoom folder when they are available.

### 3.3 Company Context

Open **Company Context** and enter the information used to tailor company and industry research. Work with the client to complete:

- Product / Capability Focus.
- Brands / Product Lines.
- Customers / Channels.
- Competitors / Market Events.
- Known Local Developments.
- Known Opportunity Themes.

Use clear, client-specific descriptions rather than generic industry terms. Save the Company Context when complete.

### 3.4 Manage Users

Open **Manage Users** and set up the users required for the client’s core workflow:

- Confirm at least one appropriate Company Admin.
- Add internal client users with the correct role and sidebar access.
- Add external users only when an outside accountant, lender, or advisor needs company access.
- Assign each user only the access required for their responsibilities.
- Do not grant QoE access.
- Confirm each user completes the required MFA setup and retains their backup codes.

Internal and external users are managed separately. External users cannot be Company Admins and do not receive Site Admin, accounting, or company-management access.

## 4. Configure and validate the accounting data

### 4.1 Connect or import

After the accounting system has been identified in Profile:

1. Open the approved accounting connection workflow in Site Admin.
2. Have the client administrator complete authorization or enter credentials in the approved workflow. Request least-privileged, read-only access whenever possible.
3. Confirm the intended company, entity, location, and data range are in scope.
4. Run the available validation or manual sync.

If the client cannot use a connection, request a trial-balance export in Excel format that includes account name/description, account number when available, monthly balances, and entity/location information where applicable. Request at least 24 months; 36 months is preferred.

Never request passwords over email or store credentials in the DataRoom.

### 4.2 Map and process financial data

With the finance lead:

1. Open **Account Mapping**.
2. Review and complete the chart-of-account mapping.
3. Use **Data Review** to resolve unmapped accounts, missing months, outliers, or obvious misclassifications.
4. Select **Process & Save Monthly Data** in Account Mapping.
5. Review the resulting financial statements, dashboard metrics, and trend views with the finance lead.

The client owns its month-end close. After each close, the client must review new accounts and mapping coverage, save mapping changes, process the closed month, and validate the financial outputs.

## 5. Configure and validate operational data sources

For each operational system approved for go-live:

1. Open the system’s operational-source connection container.
2. Configure the approved connection path with the client system owner.
3. Select only the agreed **Data Domains**.
4. Confirm the correct company, entity, location, and date range.
5. Run the available manual sync.
6. Review record counts, dates, and representative records with the client system owner.
7. Set the agreed refresh schedule, if one is configured. Displayed sync times are EST.

For each deferred source, record the reason, owner, prerequisite, and next review date in the readiness checklist.

## 6. Set up the DataRoom and collect core documents

Use the DataRoom as the controlled repository for the documents below. Grant the minimum permissions needed: View, Download, Upload, Share, or Manage. Use folder-level permissions whenever possible.

Ask the client to use this filename format:

`YYYY-MM-DD – Document type – Entity or lender – Description`

Do not upload passwords, credentials, MFA backup codes, or other secrets to the DataRoom.

| DataRoom folder | Request at onboarding | Minimum expectation |
|---|---|---|
| Financial Statements | Most recent monthly income statement, balance sheet, and cash-flow statement; annual financial statements; current budget/forecast; detailed trial balance when available. | Current month plus 2–3 completed fiscal years where available. |
| Legal | Formation documents, operating agreement/bylaws, material contracts, leases, licenses, and litigation/claim summaries if relevant to the engagement. | Current and executed versions. |
| Tax | Complete business federal, state, and local income-tax returns with all schedules; extensions; notices; and tax payment or filing-status support. | Most recent 3 completed tax years, plus current-year filings when available. |
| Loans & Leases | Executed loan agreements, promissory notes, amendments, guarantees, security agreements, lease agreements, amortization schedules, payoff letters, covenant calculations/certificates, borrowing-base reports, and lender correspondence. | Every active facility or lease; current balance and latest amendments. |

Before marking a document request complete, confirm that each document is readable, complete, current for the appropriate entity and period, final/executed when applicable, and stored in the correct folder.

The **Quality of Earnings / Adjustments**, **Bank Statements**, and **Credit Card Statements** folders are outside this setup workflow.

## 7. New client setup readiness checklist

Use the **Completion acknowledgment** column for every item. Select **Complete** only after the work has been verified. Select **Still Open** for any item that requires a client response, additional configuration, or follow-up.

| Setup item | Completion acknowledgment | Owner / next action |
|---|---|---|
| Client team, onboarding scope, and target go-live date are recorded. | Complete / Still Open | |
| Accounting-system intake is complete, including administrator, entities, history, connection path, and limitations. | Complete / Still Open | |
| Operational-system intake is complete; each source is marked connect now, defer, or out of scope. | Complete / Still Open | |
| Profile is complete and saved with the client. | Complete / Still Open | |
| Company Disclosures are reviewed and saved; supporting documents are requested where needed. | Complete / Still Open | |
| Company Context is complete and saved. | Complete / Still Open | |
| Manage Users is complete; users have the appropriate role/access and no QoE access. | Complete / Still Open | |
| Accounting connection or trial-balance import is complete and validated. | Complete / Still Open | |
| Account Mapping, Data Review, and Process & Save Monthly Data are complete. | Complete / Still Open | |
| Financial statements, dashboard metrics, and trend views are reviewed with the finance lead. | Complete / Still Open | |
| Each in-scope operational source is connected, synced, and validated. | Complete / Still Open | |
| Deferred operational sources have an owner, prerequisite, and next review date. | Complete / Still Open | |
| DataRoom permissions are configured. | Complete / Still Open | |
| Financial Statements, Legal, Tax, and Loans & Leases document requests are complete or have documented follow-up. | Complete / Still Open | |
| Setup is ready to hand off to the ongoing Account Manager/client review cadence. | Complete / Still Open | |
