# QuickBooks Desktop JSON Payload Request

Please provide a JSON export file so we can import your QuickBooks Desktop financial data into Corelytics.

---

## What to Send

- One `.json` file for the target company.
- File should contain:
  - `monthlyData` array (required)
  - account list data (recommended for account mapping), such as `AccountQuery` / `AccountRet`
  - optional `metadata` object

---

## Required Data Format

### 1) `monthlyData` (required)

Each row should represent one month.  
At minimum, each row must include:

- `monthDate` (or `date` / `month`) in `YYYY-MM` or `YYYY-MM-DD`

Include your normal financial values for each month (for example revenue, COGS, operating expenses, and related totals your export provides).

### 2) Account List (recommended)

To auto-seed account mappings, include account data in the payload if available:

- `AccountQuery` / `accountQuery`
- rows such as `AccountRet` with fields like:
  - `ListID` / `accountId`
  - `FullName` / `Name`
  - `AccountNumber` (if available)
  - `AccountType` (if available)

### 3) Optional `metadata`

You may include a `metadata` object for notes such as export timestamp, source file name, desktop version, etc.

---

## Example JSON (Template)

```json
{
  "monthlyData": [
    {
      "monthDate": "2025-01",
      "revenue": 125000,
      "cogs": 48000,
      "operatingExpenses": 52000,
      "ebitda": 25000,
      "netIncome": 18000
    },
    {
      "monthDate": "2025-02",
      "revenue": 131500,
      "cogs": 50000,
      "operatingExpenses": 54000,
      "ebitda": 27500,
      "netIncome": 19500
    }
  ],
  "AccountQuery": {
    "AccountRet": [
      {
        "ListID": "80000001-111111111",
        "FullName": "4000 Sales Revenue",
        "AccountNumber": "4000",
        "AccountType": "Income"
      },
      {
        "ListID": "80000002-222222222",
        "FullName": "5000 Cost of Goods Sold",
        "AccountNumber": "5000",
        "AccountType": "Cost of Goods Sold"
      }
    ]
  },
  "metadata": {
    "source": "QuickBooks Desktop",
    "exportedAt": "2026-03-09T10:00:00Z",
    "notes": "Monthly financial payload for Corelytics import"
  }
}
```

---

## Delivery Instructions

- Send the JSON file by secure email or approved secure file transfer.
- Include the company name in the filename, for example:
  - `ClientName-QBDesktop-payload.json`

---

## Validation Notes

- The import requires at least one valid row in `monthlyData`.
- If `monthlyData` is missing or empty, import will fail.
- Account list data is recommended to improve initial account mapping quality.

