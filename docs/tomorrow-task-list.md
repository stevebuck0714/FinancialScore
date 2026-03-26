# Tomorrow Task List

- [ ] 1) Finish financial COA work
- [ ] 2) Check dedupe coverage on all operational data loads
- [ ] 3) Reload operational data
- [ ] 4) Review operations charts for completeness and map all missing data needs
- [ ] 5) Import specialized data needed for chart details
- [ ] 6) Build AP data from `SLAptrx` fallback path (open bills + payment facts) and validate AP charts
- [ ] 7) Confirm customer revenue by period is sourced from Customers + Sales invoice data (`SLInvHdrs`/`SLCoitems`)
- [ ] 8) Confirm product analysis is sourced from item master + sales detail and fill any missing fields

## Recommended Order

- [ ] Run dedupe audit first (`2`)
- [ ] Reload ops data only after dedupe is confirmed (`3`)
- [ ] Review chart completeness and identify gaps (`4`)
- [ ] Import targeted detail datasets for missing chart dimensions (`5`)
- [ ] Run AP fallback build + validation (`6`)
- [ ] Validate customer/product chart data pipelines (`7`, `8`)
- [ ] Close final COA + financial validation (`1`)
