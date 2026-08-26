# Payroll Bureau Cost-to-Serve: QBD, QBE, and Other ERPs

Analysis only. This describes how client Cost-to-Serve would be estimated and reported. It is not an implementation spec.

Cost-to-Serve is assembled from three categories:

1. Data available from isolved
2. Data available from QBD / QBE (or another ERP)
3. Data that is not currently captured and would need a new process or allocation model

Support tickets likely need a CRM connection later. They are not required for a Phase 1 estimate.

---

## Where it appears in Operations

For CTR Payroll Services (sector 54 / payroll bureau), Cost-to-Serve lives on the **Client Economics** tab:

- **Cost to Serve** — client table with isolved volume, net revenue, allocated cost, contribution, and data-quality flags
- **Cost-to-Serve Stack** — direct vs isolved / ACH / checks / processor / support / overhead
- **Implementation Cost vs Fee** — setup cost kept separate from recurring monthly cost-to-serve

Year-to-date and current-month views are on the same tab. Processor time and support tickets are still Phase 2.

---

## How cost-to-serve is estimated

The model is activity-based costing on a **client contribution-margin** report. QuickBooks (Desktop or Enterprise) only supplies the **money** half. isolved supplies the **workload** half. Everything else is either a coding convention in the books or a new capture process.

For each employer client and month:

**Net client revenue**  
Invoices + sales receipts − credit memos − discounts − refunds. Use **invoiced** amounts, not cash received.

**Cost-to-serve** is three layers:

1. **Direct costs that can be tagged to the client** — courier, check stock, W-2 printing, tax amendments, ACH returns, contractors, client-specific software. These exist in QBD/QBE only if bills, checks, and credit-card charges are coded to that customer (or customer:job).
2. **Shared operating costs allocated by a driver** — isolved fees, ACH, check processing, payroll wages, support wages, overhead. These sit on the P&L with no customer. Split them using isolved volume (employees, ACH counts, live checks, payroll runs, states) or, later, actual hours.
3. **Labor that is not in isolved or QBD today** — processor time, support tickets, implementation. Until hours are captured, this is also an allocation: weighted workload units × payroll-department labor pool.

```
Contribution margin = Net revenue − Direct client costs − Allocated shared costs − Labor (actual or estimated)
```

Phase 1 is an **estimate**. It is still useful: a 15-employee single-state client and a 126-employee four-state client with off-cycles will not look the same, even if both pay two payrolls a month. Phase 2 replaces the labor estimate with hours.

The mock **Billings by Customer** table already has Cost to Serve / Profit / Margin, but that mock is a PEPM formula (`42 + weighted units × 18`), not this accounting model.

---

## Source mapping

| Report component | Primary source | Specific source/data |
|---|---|---|
| Client payroll volume | isolved | Client/company ID, payroll runs, employee counts and payroll frequency |
| Payroll complexity | isolved | States, locations, earning codes, deductions, taxes, garnishments, off-cycle payrolls |
| Payroll corrections | isolved | Voids, reversals, adjustments and reopened payrolls |
| Payroll-company billing | QBD / QBE | Customer invoices, sales receipts, credit memos and item-level charges |
| Processor time | Timekeeping system or new Corelytics entry | Employee time by client and work category |
| Support tickets | Support / CRM platform | Tickets, calls, issue types and resolution time |
| Implementation work | Project/time system or new Corelytics entry | Setup tasks, implementation hours and third-party costs |
| Direct costs | QBD / QBE plus allocation rules | isolved fees, ACH fees, check costs, delivery and client-specific services |
| Service credits | QBD / QBE | Credit memos, discounts, invoice adjustments and refunds |
| Accounting revenue/expense | QBD / QBE | General ledger, profit and loss, payroll and vendor expenses |

---

## 1. isolved: operating volume and complexity

isolved supplies the operational workload drivers for each employer client. This does not change if the books are QBD, QBE, Sage, or NetSuite. isolved is the operational system of record for the **clients you process**, not for the payroll company’s own P&L.

### Client master

Corelytics should extract:

- isolved client/company ID
- Client name
- Active or inactive status
- Payroll frequency
- Assigned processor, if maintained
- Number of locations
- Number of states and tax jurisdictions
- Enabled isolved services
- First payroll date
- Last payroll date

The isolved client ID becomes the key that must be mapped to the corresponding QBD/QBE customer.

### Payroll activity

For each client and reporting month:

- Number of regular payroll runs
- Number of off-cycle payrolls
- Employees paid
- Checks produced
- Direct deposits produced
- Gross payroll
- Net payroll
- Tax volume
- Number of earning and deduction types
- Payrolls requiring adjustments
- Voids and reversals
- Manual checks
- New hires and terminations
- Number of states or tax jurisdictions

These data measure the amount and complexity of service delivered. They do not directly measure the payroll company’s revenue or labor cost.

### Example isolved operating record

| Client | Payrolls | Employees paid | Off-cycle runs | Adjustments | States |
|---|---:|---:|---:|---:|---:|
| ABC Manufacturing | 2 | 126 | 1 | 3 | 4 |

This tells Corelytics that ABC is likely more expensive to serve than a 15-employee, single-state client, even if both have two payrolls per month.

The isolved People Cloud domains already listed in Corelytics cover most of this: clients, locations, pay groups, payroll runs, earnings, deductions, taxes, direct deposit, onboarding. What still has to be confirmed in a live isolved extract is **off-cycle vs regular**, **voids/reversals**, **assigned processor**, and **enabled services**. Those are often in payroll-run status fields rather than the HR census.

---

## 2. QBD / QBE: client revenue

The payroll company’s invoices should be entered using customers and invoice items.

Corelytics should extract:

- Invoices
- Sales receipts
- Credit memos
- Receive payments
- Discounts
- Refunds
- Accounts-receivable balances

### Important fields

- Customer ID or CustomerRef
- Customer name
- Transaction date
- Invoice number
- Service item
- Description
- Quantity
- Rate
- Amount
- Class, if used
- Credit amount
- Payment status

### Recommended service items

Invoices should use separate service items rather than posting the entire invoice as “Payroll Services.”

For example:

- Base payroll processing
- Per-payroll fee
- Per-employee fee
- Direct-deposit fee
- Check-printing fee
- Tax filing
- Quarterly filing
- Year-end W-2 processing
- Time and attendance
- HR services
- Benefits administration
- Garnishment administration
- Delivery/courier
- Implementation
- Special payroll
- Amendment/correction
- Other services

This lets Corelytics determine both total client revenue and the source of that revenue.

### Revenue calculation

For each client:

```
Net Client Revenue = Invoices and Sales Receipts − Credits, Discounts and Refunds
```

Cash received is useful for collections reporting, but profitability should normally be based on earned or invoiced revenue—not merely cash receipts.

Sales receipts vs invoices: cash shops use receipts; accrual shops use invoices. Both already sync in Corelytics. Profitability should ignore Receive Payment except for collections/AR.

If everything posts as “Payroll Services,” you can still get **total** client revenue. You cannot see **why** one client is more profitable.

---

## 3. QBD / QBE: service credits

Service credits should come from:

- Credit memos
- Negative invoice lines
- Discount items
- Refund checks
- Invoice adjustments

Corelytics should distinguish:

- Courtesy credit
- Processing error credit
- SLA credit
- Pricing discount
- Client dispute
- Refund of pass-through expense

If those reasons are not identified in QBD/QBE, the payroll company should add standardized credit-memo items or classes. Otherwise, Corelytics can report the dollar value but cannot explain the cause.

---

## 4. QBD / QBE: direct costs

Some direct costs may be identifiable in the books, while others will need allocation.

### Directly identifiable costs

Possible sources include vendor bills, checks and credit-card charges for:

- Courier and delivery
- Check stock
- Postage
- W-2 and 1099 printing
- Third-party background checks
- Client-specific integrations
- Implementation contractors
- Tax amendment fees
- Bank or ACH return fees
- Client-specific software
- Outsourced HR services

These costs must be associated with a customer, class or customer:job to be reported directly by client.

### Shared operating costs

Shared costs may include:

- isolved platform fees
- ACH processing
- General banking fees
- Payroll department salaries
- Customer-support salaries
- General software
- Office and administrative overhead

These normally appear in the general ledger but are not coded to individual clients. Corelytics must allocate them using an operating driver.

| Shared cost | Recommended allocation driver |
|---|---|
| isolved platform cost | Active employees or active clients |
| Per-employee isolved fee | Employees paid |
| ACH fees | ACH transactions or direct deposits |
| Check-processing cost | Live checks produced |
| Payroll staff cost | Processor time or weighted payroll volume |
| Support staff cost | Ticket time or ticket count |
| Tax-service cost | Tax jurisdictions or payroll runs |
| General overhead | Client revenue or direct labor cost |

QBD/QBE should remain the financial source of truth for the expense recognized in the company’s books. If the bureau also runs its own staff through isolved, use isolved for hours/headcount and QBD for the expense that hit the books — do not add them together.

---

## 5. Processor time

Processor time generally will not be available from isolved or QBD/QBE unless the payroll company already records time by client.

There are three approaches.

### Best: actual time by client

Processors record time using:

- Client
- Work category
- Time spent
- Date

Suggested work categories:

- Regular payroll processing
- Off-cycle payroll
- Payroll correction
- Client support
- Tax issue
- New employee/setup
- Reporting
- Implementation
- Internal administration

```
Processor Cost = Client Hours × Loaded Hourly Cost
```

Loaded hourly cost should include wages, payroll taxes, benefits and an appropriate employment-overhead factor, from QBD expense totals ÷ productive hours.

### Practical: exception-only time tracking

Processors record only unusual work:

- Corrections
- Tax issues
- Off-cycle payrolls
- Manual adjustments
- Client training
- Escalations

Routine payroll cost is allocated using payroll volume. This is usually less burdensome and may be the best starting point.

### Initial: estimated allocation

If no time data exists, Corelytics can estimate processor cost using weighted workload units:

```
Client Processor Cost = (Client Weighted Units / Total Weighted Units) × Payroll Department Labor Cost
```

Weighted units can incorporate:

- Payroll runs
- Employees paid
- Off-cycle payrolls
- Multistate complexity
- Corrections
- Garnishments
- Live checks
- Special reporting

This is an estimate, but it is much better than allocating all payroll labor based solely on client revenue.

Time Tracking exists in QuickBooks (`TimeTrackingQuery`) but is not in the current Corelytics connector. For a payroll bureau, a Corelytics activity log or exception-only sheet is usually less painful than turning on QB time for every processor.

---

## 6. Support tickets

Support activity will not normally come from isolved or QBD/QBE unless support work is documented there.

The source could be:

- CRM
- Help-desk system
- Shared support mailbox
- Phone system
- Corelytics client-activity module
- Manual monthly entry

Corelytics needs:

- Client
- Ticket date
- Issue category
- Priority
- Assigned employee
- Time spent
- Resolution date
- Payroll-impacting indicator
- Escalation indicator
- Root cause

If the company has no ticketing system, Corelytics could initially add a lightweight client activity log. At minimum, staff should record client, category, minutes and resolution status.

CRM/tickets wait for Phase 2 and are not required to estimate cost-to-serve.

---

## 7. Implementation work

Implementation cost is also unlikely to exist in isolved or QBD/QBE at the required level of detail unless Customer:Job (QBE) or a project tracker is used.

Potential sources:

- Project-management system
- Employee time tracking
- QBD/QBE customer:job transactions
- Corelytics implementation tracker
- Manual implementation worksheet

Track:

- Client setup hours
- Data conversion
- Employee imports
- Tax setup
- Bank and ACH setup
- General-ledger configuration
- Parallel payroll
- Client training
- Third-party costs
- Travel or delivery
- isolved setup charges
- Internal review

Implementation cost should normally be reported separately from recurring monthly cost-to-serve. It can then be compared with the implementation fee and expected client payback period. Mixing it into monthly CTS makes new clients look unprofitable.

---

## QBD vs QBE: same pipe, different coding power

In Corelytics, Desktop and Enterprise are the same Web Connector family. The difference that matters for this report is **what the company file can code**, not a different API.

| Capability needed for CTS | QBD Pro/Premier | QBE | Already in Corelytics sync |
|---|---|---|---|
| Customers, invoices, sales receipts, credit memos, items | Yes | Yes | Yes |
| Bills, checks, vendor credits, bill payments | Yes | Yes | Yes |
| Credit-card charges as client-specific cost | Possible | Default program | QBE default; not on QBD default list |
| **Customer:Job** (parent customer + child job) | Available | Default “Customers / Jobs” | QBE default; QBD default is customers only |
| **Class** (Payroll vs HR vs Tax, or office) | Optional, often unused | Default “Offices / Divisions” | QBE default |
| Job types / customer types | Limited | Default | QBE only |
| Employees (for payroll-company labor roster) | Possible | Default | QBE default |
| Line-level service items on invoices | Yes | Yes | Pulled on invoice lines; not yet rolled to per-client item mix |
| Credit memos | Yes | Yes | Pulled; not subtracted from customer sales today |
| Time by customer (`TimeTrackingQuery`) | Native QB time | Native QB time | Not synced |

**QBE is the better accounting host** for this report because jobs, classes, employees, and credit-card charges are first-class. QBD can do the same if the file uses Customer:Job and Class and those queries are added. If the file invoices one lump item “Payroll Services” and never codes bills to a customer, neither edition can produce client cost-to-serve from the books.

QBO is the same economic model over REST (`Invoice`, `SalesReceipt`, `CreditMemo`, `Bill`, `Purchase`, `TimeActivity`, Class, Customer). It does **not** have true Customer:Job. People fake it with sub-customers, Class, or Projects.

### QBE extras that help

- **Customer:Job** — implementation job vs recurring processing job under the same parent customer, so implementation cost stays out of monthly CTS.
- **Class** — split payroll processing vs HR vs tax if those are separate teams.
- **Job types / customer types** — size or industry segments without a CRM.

Important QBD/QBE quirk: a **job ListID is not the parent customer ListID**. Bills coded to “ABC Mfg:Implementation” must roll up to ABC for the client table, and stay separate if you want an implementation P&L.

---

## Other ERPs: same report, different field names

The report does not care whether the GL is QuickBooks. It cares that the accounting system can give you:

1. Customer (or equivalent) **stable ID**
2. Sales documents **by customer and item**
3. Credit/adjustment documents
4. AP/expense documents that can carry a **customer or project**
5. GL account totals for unallocated pools

| Corelytics idea | QBD/QBE | QBO | Sage Intacct | Dynamics 365 | NetSuite / Acumatica / SAP |
|---|---|---|---|---|---|
| Client AR entity | Customer / Job | Customer, sub-customer | CUSTOMER + Project/dimension | Customer + Project | Customer + Job/Project/WBS |
| Fee catalog | Service items | Items | Items | Products | Items / non-stock |
| Revenue | Invoice, SalesReceipt | Invoice, SalesReceipt | AR invoice / SO | Sales invoice | AR invoice |
| Credits | CreditMemo | CreditMemo | AR adjustment | Credit note | Credit memo |
| Direct cost tag | Customer:Job on Bill/Check/CC | Customer/Class on Bill/Expense | Customer or project dimension on AP | Project on vendor invoice | Project/job on AP |
| Shared pool | P&L accounts | P&L | GL + statistical accounts (good for “employees” as a driver) | GL | GL |
| Time (phase 2) | Time Tracking by job | TimeActivity | Timesheets | Project timesheets | Time bills / CATS |

Sage Intacct is often **better than QBD** for allocations because statistical accounts can store “employees paid” or “ACH count” as a driver inside the ERP. QBD cannot do that; Corelytics would store the drivers from isolved and apply them to QBD P&L totals.

Vista / job-cost ERPs already think in jobs; a payroll bureau on Vista would treat each employer as a job. That is conceptually cleaner than QBD, but unusual for this industry.

**isolved never comes from the ERP.** Switching from QBD to Sage does not replace the isolved extract or the crosswalk.

---

## Required client mapping

The most important integration requirement is a cross-reference table. Do not match systems solely by client name. Names will differ—for example, “ABC Manufacturing LLC” in isolved and “ABC Mfg.” in QBD.

| Corelytics client ID | isolved company ID | QBD/QBE customer ID (parent, not job) | CRM/ticket ID |
|---|---|---|---|
| CL-001 | IS-84721 | QBD-ABC-MFG | CRM-1147 |

Jobs, classes, and invoice items hang off the QBD customer. Payroll volume hangs off the isolved company. Unmapped clients show volume with $0 revenue, or revenue with no workload — both of which are useful data-quality flags.

---

## Report table

One row per client per month (with a YTD toggle).

### Phase 1 columns

- Client, processor, status
- Payrolls, employees paid, off-cycles, states, adjustments/voids
- Complexity / weighted units
- Gross billed, credits, **net revenue**
- Revenue per payroll, revenue per employee
- Direct costs (tagged)
- Allocated isolved / ACH / check / labor / overhead
- **Estimated cost-to-serve**
- **Estimated contribution $ and %**
- Data quality: mapped? itemized invoices? any tagged AP?

Drill (same data, not a new source): revenue by service item; credits as a lump until reasons exist; cost stack (direct vs allocated).

Keep **implementation** on a second table: setup hours/cost vs implementation fee vs months to pay back.

Phase 2 adds processor hours, support hours/tickets, implementation hours, and credit reason. Estimated margin becomes actual or near-actual.

---

## What can be produced immediately

Using only isolved and QBD/QBE, after the crosswalk and item hygiene, Corelytics can initially report:

- Revenue by client
- Credits by client
- Payroll runs by client
- Employees paid by client
- Revenue per payroll
- Revenue per employee paid
- Off-cycle payroll frequency
- Correction and reversal frequency
- Client complexity
- Estimated allocated service cost
- Estimated client contribution margin

---

## What cannot be known accurately yet

Without another capture process, Corelytics cannot accurately know:

- Actual processor hours by client
- Support hours by client
- Implementation labor by client
- Reason for each service credit
- Client-specific share of common expenses

| Component | If you do nothing | Practical start | Best |
|---|---|---|---|
| Processor time | Allocate payroll wages by weighted isolved units | Exception-only time (corrections, off-cycle, tax, training) | Hours by client and work category × loaded rate |
| Support tickets | Leave out, or allocate support wages by employees/payrolls | Monthly activity log: client, category, minutes | CRM/helpdesk |
| Implementation | Leave in recurring CTS (distorts monthly margin) or exclude until tagged | QBE customer:job + a worksheet | Project hours + third-party bills on that job |
| Credit reasons | Credits as a dollar bucket | Standard credit-memo items | Same |
| Shared expense share | Driver table (employees, ACH, checks, runs, states) | Same | Hours where they exist, drivers for the rest |

---

## Launch in two phases

**Phase 1:** isolved volume + QBD/QBE revenue/costs + weighted cost allocations.

**Phase 2:** add lightweight processor, support and implementation time capture so estimated client margins become actual or near-actual margins.

---

## Practical constraints in this stack

- Current QBD operational rollup **sums invoice revenue by customer** and **does not net credit memos**. CTS would need that netting, plus sales receipts, plus item-level mix.
- Bills/checks are stored as AP, not as “cost of serving customer X.” Direct cost requires `CustomerRef` on those transactions (QBE jobs make this realistic).
- Time Tracking exists in QuickBooks but is **not** in the current connector.
- Shared-cost allocation is the same idea as the existing LOB allocator, pointed at **clients and isolved drivers** instead of P&L accounts and LOB percentages.
- QBD company files are messy. The report quality is mostly a **bookkeeping standard**: itemized invoices, credit-memo items, customer:job on client-specific AP. The integration cannot invent that.

---

## Bottom line

QBD can host Phase 1 if invoices are itemized and customers map to isolved. QBE is the same integration with a better chance of Phase 1 direct costs and a clean implementation split (jobs + classes). Any other ERP works if it can emit customer-level AR, item mix, credits, optionally project-tagged AP, and GL pools. isolved, the crosswalk, and the allocation engine stay the same regardless of the books. CRM/tickets wait for Phase 2 and are not required to estimate cost-to-serve.
