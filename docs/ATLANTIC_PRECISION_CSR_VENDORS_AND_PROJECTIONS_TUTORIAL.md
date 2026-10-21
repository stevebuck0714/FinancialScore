# Atlantic Precision Resources: CSR Tutorial — Vendors and Projections

**Environment:** Production  
**Audience:** Atlantic Precision Resources customer service representatives (CSRs)  
**Format:** Instructor-led walkthrough with hands-on practice  
**Suggested duration:** 75–90 minutes  

## Training outcome

After this session, a CSR should be able to:

1. Explain the purpose of the **Vendors** and operational **Projections** areas.
2. Find the right report, filter to the right vendor or customer, and distinguish editable data from calculated or source-system data.
3. Enter approved changes, save them, and confirm that the save completed.
4. Know when to stop and escalate a data-quality, permission, or Infor-source issue.
5. Provide specific usability and missing-information feedback after using each area.

> **Important:** This guide is for the **Operations** area used by Atlantic Precision. It does not describe the separate **Financial Reporting → Projections** page, which is a read-only financial-scenario view based on published accounting history. When someone says “Projections,” first confirm whether they mean the operational product forecast workflow covered here.

---

## 1. Before the session

### Access and data checks

Before asking a CSR to enter production data, confirm that:

- The active company is **Atlantic Precision Resources**.
- The user can open **Operational Reporting** and has the **Vendors** module assigned.
- The needed report is enabled. In particular, **Duties & Tariffs** must be explicitly enabled by a Site Administrator.
- The CSR has the approved source information for the change: for example, an approved vendor price change, HTS classification, origin, freight assumption, customer forecast, or goal.
- The CSR understands that Infor remains the system of record for source operational data. Corelytics stores approved operational planning inputs and displays calculations; it is not a substitute for an approved Infor correction.

### Safe data-entry practice

1. Work only on the intended vendor, customer, year, and month.
2. Filter first. Do not edit a broad, unfiltered list when the change applies to one vendor or customer.
3. Enter only information that is approved and traceable to the supporting source.
4. Use **Save** or **Save page** before navigating away.
5. Treat the on-screen success message as confirmation. If it does not appear, do not assume the change saved.
6. If a number looks wrong because its Infor source value is wrong, do not use an override simply to hide the issue. Escalate the source-data issue.

---

## 2. Navigation and terminology

1. Select **Atlantic Precision Resources** in the company selector.
2. Open **Operational Reporting**.
3. Use the Operations tabs:
   - **Vendors** — vendor cost, contract, duty, tariff, freight, and vendor-level unit forecast information.
   - **Projections** — customer/product unit and revenue forecasting, goals, trend reporting, and plan-versus-actual analysis.
4. Within either tab, use the report-name buttons at the top to select the specific report.
5. Use the **What is this?** or **How this works** link when available for the in-product definition and calculation notes.

**Production terminology**

| Term | Meaning |
|---|---|
| APR P/N | Atlantic Precision part number. |
| Customer P/N | The customer’s part number. |
| Infor / CSI | The operational source system. Source values are normally read-only in Corelytics. |
| Data thru | The last month treated as closed for plan-versus-actual calculations. |
| Forecasted | The original entered or source forecast. |
| Forecast - ADJ | The adjusted forecast. It uses actual shipped quantity for closed months and the applicable forecast for open months. |
| Planned/MTO | Planning/manufacture-to-order status for the forecast line. |
| SGP | The approved planning baseline/goals used in Atlantic’s operational reports. |

---

# Part A — Vendors

## 3. What the Vendors section is for

The Vendors section helps Atlantic Precision review the cost and supply-side information behind products:

- Purchase, payment, and vendor concentration reporting.
- Contract cost compared with actual and proposed pricing.
- HTS, country-of-origin, duty, and tariff information.
- Freight assumptions and freight per item.
- Vendor-scoped unit estimates and rollups.

It supports review and planning. It does **not** authorize a price, customs, or purchasing decision by itself.

## 4. Vendor reports: what a CSR can do

### Standard vendor reports — review only

These reports are read-only. They are useful for answering questions and spotting exceptions; there is nothing to enter or save.

| Report | Use it to review | CSR action |
|---|---|---|
| Vendor catalog & purchase history | Vendor status, terms, purchase and payment history. | Filter/sort, review, and escalate unexpected source data. |
| 6-month item volume and pricing | Vendor/item volume and contract or SGP price context. | Review trends and differences; do not overwrite source values. |
| Payment history by month | Monthly vendor payment pattern. | Review timing and investigate unusual movement. |
| Vendor concentration | Reliance on each vendor. | Flag material concentration to the appropriate owner. |
| Price-change tracker | Contract-versus-SGP price variance. | Use as a review list for pricing follow-up. |
| Spend by item category | Forecast-backed vendor spend by category. | Review category movement and data completeness. |
| Vendor Contracts | Actual unit cost, contract values, approved vendor pricing sheet values, and differences. | Filter by vendor or item, use **Only unit cost ≠ contract**, and expand a row for price history. This report is read-only. |

If a standard report shows no data, confirm that the vendor/item exists in Infor and that the relevant operational data has been loaded before escalating.

### Vendor Pricing — enter and save proposed pricing

**Purpose:** Record the pricing proposal and approval state. An approved new cost feeds the Vendor Contracts view’s Vendor Pricing Sheet value.

1. Open **Vendors → Vendor Pricing**.
2. Narrow the list with vendor ID, vendor name, approval status, or item search.
3. Verify the current Infor cost and dates before entering a change.
4. Enter only the approved fields that apply:
   - Subsupplier
   - MTO override
   - New Cost
   - Approval Status: `Pending`, `Approved`, `Rejected`, or `MTO`
   - Material and material-cost fields
   - Part-weight override
   - Start, end, and required-load dates
5. Confirm that **New Cost** is not negative and that dates and approval status match the approved source.
6. Select **Save**. The button states how many changed rows will be saved.
7. Wait for the green confirmation: **Saved N changed rows**.
8. Re-open or refresh the filtered row and, when approved, verify the Vendor Contracts value.

**Do not enter:** a guessed cost, a status that has not been approved, or a workaround for a bad Infor current-cost value. The visible list is capped; narrow filters if the report tells you to do so.

### Duties & Tariffs — maintain customs inputs, then refresh rates

**Purpose:** Maintain the item-level customs data used for duty/tariff analysis and related margin/P&L reclassification.

1. Open **Vendors → Duties & Tariffs**.
2. Start with **Needs HTS input** to resolve incomplete classification, or choose **All items** for review.
3. Filter to the vendor and item. Include inactive items only when an approved historical correction requires it.
4. Enter or correct the approved HTS/duty-code information, country of origin, customs value, and applicable duty/tariff fields.
5. Review the item description, unit, program, and percentages before saving.
6. Select **Save** and wait for the success notice. Resolve any red error before leaving the page.
7. Only after all edits are saved, choose an **As of** date and select **Refresh rates** to request the USITC rate lookup.
8. Review the refresh result. If it reports failed HTS codes, correct or escalate those codes; do not treat a partial refresh as a completed review.
9. Use **Monthly Tariff Summary** only after saving the underlying data and applying the intended vendor filter.

**Key safeguard:** Rate refresh is blocked while there are unsaved edits. Save first. Country of origin is shared with SGP Freight, so verify it carefully.

### SGP Freight — maintain freight inputs and assumptions

**Purpose:** Calculate current/future estimated freight per item and container utilization using company-level shipment assumptions plus item data.

1. Open **Vendors → SGP Freight**.
2. Select one vendor. This report works one vendor at a time.
3. Review the rate and shipment assumptions at the top before changing any item:
   - Domestic rate and estimated increase
   - Average shipment cost and estimated freight cost
   - Container CBM
4. For an item, enter only missing or approved override values such as country of origin, planner code, quantity, dimensions, CBM, weight, or cost.
5. Check calculated freight and **% of container**. A missing or zero order multiple leaves container percentage and overseas freight blank; that is a missing-input condition, not a value to guess.
6. Select **Save** and wait for **Saved N items and/or rate assumptions**.

**Key safeguard:** A manually entered CBM remains locked until a dimension changes. Do not change dimensions merely to force a freight result.

### Vendor Monthly Forecast — enter vendor-level unit overrides

**Purpose:** Review estimated versus actual shipped units by primary vendor, APR part, and customer; record approved monthly overrides.

1. Open **Vendors → Monthly Forecast**.
2. Select the **Vendor** first; it is required.
3. Select the correct **Year**, **Data thru** month, and reporting **Month**. Use the previous/next arrows only after confirming the current month.
4. Review the identity columns: APR P/N, Customer, Customer P/N, and Group.
5. Change **Planned/MTO** when the approved planning classification changes.
6. Enter a monthly estimated-unit override only when approved. The override is highlighted; clear it to return to the Infor value.
7. Review the month’s estimate, actual shipped units, percentage versus estimate, and summary totals.
8. Select **Save page** and wait for the saved confirmation before selecting another vendor or year.

**Key safeguard:** Switching vendor or year with unsaved changes triggers a warning. Save or deliberately discard only after verifying the intended action.

### Forecast Rollup — review only

**Purpose:** Review the quarterly and annual rollup of Vendor Monthly Forecast.

Select a vendor and year, then use the rollup to review estimated, adjusted estimate, YTD, percentage-to-estimate, and remaining-year figures. This page is read-only. To correct a plan input, return to **Vendor Monthly Forecast**, make the approved change, save it, and then revisit the rollup.

## 5. Vendors practice exercise

Use a non-sensitive, trainer-selected vendor and item.

1. In **Vendor Contracts**, locate a cost difference and explain what it means.
2. In **Vendor Pricing**, enter a trainer-provided proposed cost and set its required approval status. Save and confirm the success notice.
3. In **Duties & Tariffs**, identify an item needing HTS input. Explain the save-first, refresh-rates-second sequence; do not refresh production rates unless the trainer authorizes it.
4. In **Vendor Monthly Forecast**, select the vendor/month, enter a trainer-provided unit override, save, and confirm that the rollup reflects the saved input.

---

# Part B — Operational Projections

## 6. What the Projections section is for

Operational Projections is Atlantic Precision’s product/customer planning workspace. It ties unit plans, booked revenue, goals, and actual shipment data together so CSRs and managers can see whether the business is tracking to plan.

This is distinct from financial projections:

- **Operational Projections:** editable product/customer plans, revenue, goals, and operational analysis.
- **Financial Reporting → Projections:** read-only 12-month accounting scenarios based on published monthly financials; no inputs and no Save button.

## 7. Projection reports: what a CSR can do

### Monthly Forecast (Volume Forecast) — enter unit plans

**Purpose:** Maintain monthly unit forecast versus actual shipments by APR P/N and customer.

1. Open **Projections → Monthly Forecast**.
2. Select the **Customer**. This page edits one customer at a time.
3. Select the correct **Year** and **Month**.
4. On each applicable row, complete or update the approved:
   - Group
   - TEAM
   - CSR
   - Planned/MTO
   - Monthly forecast quantity
5. Use **Monthly trend** to review January–December Forecast, Forecast-ADJ, and Actual units before saving if the trend is relevant.
6. Select **Save page** and wait for the saved confirmation.

**Important behavior:** Forecasted quantity is editable only through the end of its calendar month. After the next month begins, it becomes read-only. Forecast-ADJ is read-only; closed months use the applicable actual shipment data.

### Forecast Rollup — review unit plans

**Purpose:** Review the quarterly and annual rollup of Monthly Forecast by APR P/N and customer.

Select a customer and year. Review quarterly Forecasted, Forecasted-ADJ, YTD, and percentage-to-forecast, plus annual totals and remaining-year forecast. This is read-only. Correct the plan in **Monthly Forecast**, save it, then return to the rollup.

### Monthly Revenue — enter/review revenue timing data

**Purpose:** Compare monthly forecast dollars with actual booked revenue by APR P/N.

1. Open **Projections → Monthly Revenue**.
2. Select the appropriate customer, year, **Data thru**, and month. Leave Customer blank only when intentionally reviewing company totals.
3. Review Forecasted $, Forecast-ADJ $, Actual $, percentage-to-plan, difference, and shipping-days context.
4. Enter only the trainer- or manager-approved editable information for the selected customer/month.
5. Select **Save page** and wait for the success confirmation before changing customer, year, or month.

Forecasted revenue is based on forecast units multiplied by the January 1 contract price for the customer group and APR P/N. Actual is booked revenue. A missing saved price can produce $0 forecast dollars; escalate missing pricing rather than inventing a price.

### Revenue Rollup — review revenue plans

**Purpose:** Review quarterly and annual Monthly Revenue totals, including Forecasted $, Forecast-ADJ $, booked actuals, and percent-to-plan.

Choose the appropriate customer/year, or leave Customer blank for company totals. This is read-only. If there are no revenue rows, save the relevant Monthly Forecast and Monthly Revenue data first, then return to this report.

### Goal Update — enter company-level SGP goals

**Purpose:** Maintain company-level monthly revenue and volume goals and compare them with current forecasts and SGP through Pyramid MTD/QTD/YTD.

1. Open **Projections → Goal Update**.
2. Confirm the year before making changes. There is no customer picker because these are company-level goals.
3. Enter the approved monthly **Baseline**, **Growth**, and **Stretch** revenue and volume goals for the relevant planning year.
4. Review the derived monthly, quarterly, and YTD values and the Pyramid comparison.
5. Select **Save** and wait for the confirmation that the SGP Revenue Goals and SGP Volume Goals saved.

**Key safeguard:** Goals change the planning baseline used across reports. Do not copy a forecast into a goal or change a goal without the approved planning decision.

### Reports — analyze trends

**Purpose:** Chart monthly SGP Baseline, Growth, Stretch, Forecasted, Forecast-ADJ, and Actual revenue for the month range selected.

Choose the date range and toggle lines on/off to make the comparison readable. This is read-only. Actuals stop at each year’s Data thru month so an in-progress month is not shown as a completed month.

### YTD Gap Analysis — explain plan versus actual

**Purpose:** Identify where booked actuals are ahead of or behind adjusted forecast.

1. Select the year.
2. Use **YTD Analysis** to compare actuals and adjusted forecast through Data thru.
3. Use **Annual Analysis** to see projected full-year revenue: actuals through Data thru plus adjusted forecast for remaining months.
4. Expand a parent group to review the customer and SKU driving the result.
5. Explain colors consistently: green is above plan; red is below plan.

This report is read-only. It identifies where follow-up is needed; it does not correct the underlying forecast, revenue, or source data.

## 8. Projections practice exercise

Use a trainer-selected customer and a non-sensitive line.

1. Enter a trainer-provided monthly unit forecast in **Monthly Forecast**, save it, and show the confirmation.
2. Open **Forecast Rollup** and explain where the saved unit appears.
3. Open **Monthly Revenue** and explain the difference among Forecasted $, Forecast-ADJ $, and Actual $.
4. In **YTD Gap Analysis**, expand a line that is below plan and identify the customer/SKU to follow up on.
5. State whether the issue calls for a forecast correction, a missing-price investigation, an Infor source-data investigation, or management review.

---

## 9. Troubleshooting and escalation

| Situation | CSR response |
|---|---|
| The Vendors or Projections tab is missing. | Confirm active company and assigned Operational Reporting/module access. Escalate to the company administrator or Site Administrator; do not use another user’s account. |
| Duties & Tariffs is missing. | Ask a Site Administrator to confirm that the report is explicitly enabled. |
| A report has no rows. | Confirm filters, selected vendor/customer/year, and whether the item has Infor orders, shipments, pricing, or vendor identity. Document the filters used before escalating. |
| Save button is disabled or says Saved. | Confirm whether there are any edits. Make the intended approved edit, then save. |
| Save shows an error. | Do not navigate away or repeatedly retry without review. Capture the error text, selected company/report/filter/year/month, and the affected vendor/customer/item; then escalate. |
| A rate refresh is blocked. | Save or deliberately resolve/discard unsaved Duties & Tariffs edits first. |
| Current cost, shipment, or customer data is wrong. | Identify it as an Infor/source-data issue. Do not use a Corelytics override unless the approved workflow expressly permits the planning override. |
| Numbers differ across reports. | Confirm the report’s scope, Data thru month, selected year, customer/vendor filter, and whether you are comparing Forecasted with Forecast-ADJ or Actual. |

When escalating, include: company name, report name, selected filters, year/month/Data thru value, the affected APR P/N and customer/vendor, the action attempted, the exact error or unexpected result, and a screenshot if permitted by policy.

---

## 10. Follow-up usability and missing-information feedback

Ask each CSR to use both areas in production on real work after training, then submit feedback within one week. Feedback should describe the task attempted, not just whether the page was liked.

### Feedback form

**Participant:** ____________________  
**Date:** ____________________  
**Report used:** ☐ Vendors / report: ____________  ☐ Projections / report: ____________  
**Task attempted:** _________________________________________________  

1. Could you find the correct report without help?  
   ☐ Yes  ☐ No — What label, location, or navigation step was unclear?

2. Could you tell which fields were editable, calculated, and sourced from Infor?  
   ☐ Yes  ☐ No — Which field or status was unclear?

3. Could you tell what to enter and why it was needed?  
   ☐ Yes  ☐ No — What instruction, example, definition, or source reference was missing?

4. Could you tell whether your change saved?  
   ☐ Yes  ☐ No — What confirmation or warning would make this clearer?

5. Did any filter, table, date/month control, or error message make the task difficult?  
   ☐ No  ☐ Yes — Describe the task and the exact control/message:

6. What information would be useful but is missing from this report?  
   Examples: source date, owner, approval status/history, definition, last-refresh time, related item/customer/vendor link, calculation detail, export, or a clearer exception reason.

7. What is the single most important change that would make this report easier or safer to use?

### Trainer review

Review feedback by report and classify it as:

- **Training gap:** clarify the tutorial, job aid, or in-product definition.
- **Data gap:** source data, missing identity, pricing, order, shipment, or approval data.
- **Usability gap:** navigation, labels, filter behavior, editable-state clarity, error handling, or save confirmation.
- **Enhancement request:** a useful new field, calculation, export, history, or workflow.

Do not promise a product change during the training session. Record the example, the business reason, and the report/filter context so the product team can evaluate it.

---

## 11. Completion check

The CSR has completed the tutorial when they can:

- Locate Vendors and Projections without assistance.
- Explain when to use Vendor Pricing, Duties & Tariffs, SGP Freight, Monthly Forecast, and the relevant rollups.
- Save an approved practice entry and verify the success message.
- Explain the difference between Forecasted, Forecast-ADJ, and Actual.
- Identify a source-data problem versus a permitted planning override.
- Submit one usability observation and one missing-information suggestion for each section.
