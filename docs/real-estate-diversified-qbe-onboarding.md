# Real Estate Diversified - QuickBooks Enterprise Onboarding

Company: Real Estate Diversified  
Corelytics Company ID: `cmqb6e66i0003qhzgu451he2b`  
Integration: QuickBooks Enterprise via QuickBooks Web Connector  
Accounting system key: `QUICKBOOKS_ENTERPRISE`  
Backend platform: `QUICKBOOKS` with `quickbooksDesktopVariant: ENTERPRISE`  
Default sync: Daily at 08:00 local time  

## 1) What Corelytics Sends To The Client

Corelytics will send the client a QuickBooks Web Connector configuration file:

File name: `real_estate_diversified_corelytics_dev.qwc`

```xml
<?xml version="1.0"?>
<QBWCXML>
  <AppName>Corelytics Data Connector</AppName>
  <AppID></AppID>
  <AppURL>https://api.corelytics.com/qbdesktop/service.asmx</AppURL>
  <AppDescription>Corelytics QuickBooks Enterprise integration (read-only sync)</AppDescription>
  <AppSupport>https://dashboard.corelytics.com/support</AppSupport>
  <UserName>qbwc_cmqb6e66i_dev</UserName>
  <OwnerID>{cf2e6a66-c951-47f6-a08c-2e0db01fbc5f}</OwnerID>
  <FileID>{79c8bc8a-8f4f-4b3d-98bc-12c4bb3c1a7d}</FileID>
  <QBType>QBFS</QBType>
  <Style>Document</Style>
  <AuthFlags>0xF</AuthFlags>
  <Scheduler>
    <RunEveryNSeconds>3600</RunEveryNSeconds>
  </Scheduler>
</QBWCXML>
```

Corelytics will send the Web Connector password for `qbwc_cmqb6e66i_dev` through a secure channel. Do not send this password in plain email, and do not include it in the `.qwc` file.

Corelytics stores this password in the QuickBooks Desktop-family Site Admin credentials field for this company.

Corelytics setup values:

| Field | Value |
|---|---|
| Accounting System | QuickBooks Enterprise |
| Integration Type | QuickBooks Web Connector |
| Application Name | Corelytics Data Connector |
| SOAP/App Endpoint URL | `https://api.corelytics.com/qbdesktop/service.asmx` |
| Support URL | `https://dashboard.corelytics.com/support` |
| Owner ID | `{cf2e6a66-c951-47f6-a08c-2e0db01fbc5f}` |
| File ID | `{79c8bc8a-8f4f-4b3d-98bc-12c4bb3c1a7d}` |
| Web Connector Username | `qbwc_cmqb6e66i_dev` |
| Polling Interval | 60 minutes |
| Permission Scope | Read-only |
| Unattended Access Required | Yes |
| Sync Direction | QuickBooks to Corelytics |
| Sync Frequency | Daily |
| Sync Time | 08:00 local time |

## 2) What The Client Needs To Do

1. Confirm QuickBooks Web Connector is installed on the Windows machine/server that can access the production QuickBooks Enterprise company file.
2. Open QuickBooks Enterprise as Admin in the target production company file.
3. Open QuickBooks Web Connector.
4. Import the Corelytics `.qwc` file provided above.
5. Enter the Web Connector password provided separately by Corelytics.
6. Approve the QuickBooks integrated application prompt for Corelytics.
7. Allow access when QuickBooks is not running, if prompted, so scheduled syncs can run.
8. Keep the QuickBooks host machine online during the agreed sync window.
9. Coordinate with Corelytics for the first test sync and validation.

## 3) What The Client Sends Back To Corelytics

Please return the following information before setup:

| Required Item | Client Response |
|---|---|
| QuickBooks Enterprise edition and year | |
| QuickBooks country version | US |
| Target production company file path (`.QBW`) | |
| Confirmation this is the production company file | Yes / No |
| QuickBooks host machine/server name | |
| Is QuickBooks Web Connector installed? | Yes / No |
| Can a QuickBooks Admin attend the setup session? | Yes / No |
| Can the host machine stay online during sync windows? | Yes / No |
| Is outbound HTTPS allowed from the QB host? | Yes / No |
| IT/network contact name and email | |
| Preferred setup date/time and time zone | |

Requested data domains for initial sync:

| Data Domain | QuickBooks Entity |
|---|---|
| Chart of Accounts | `AccountQuery` |
| Offices / Divisions | `ClassQuery` |
| Customers / Jobs | `CustomerQuery` |
| Customer Types | `CustomerTypeQuery` |
| Job Types | `JobTypeQuery` |
| Vendors | `VendorQuery` |
| Vendor Types | `VendorTypeQuery` |
| Employees / Agents | `EmployeeQuery` |
| Sales Reps | `SalesRepQuery` |
| Service / Product Items | `ItemQuery` |
| Terms | `TermsQuery` |
| Payment Methods | `PaymentMethodQuery` |
| Sales Tax Codes | `SalesTaxCodeQuery` |
| Invoices | `InvoiceQuery` |
| Sales Receipts | `SalesReceiptQuery` |
| Payments | `ReceivePaymentQuery` |
| Deposits | `DepositQuery` |
| Credit Memos | `CreditMemoQuery` |
| Estimates | `EstimateQuery` |
| Sales Orders | `SalesOrderQuery` |
| Bills | `BillQuery` |
| Bill Payments - Checks | `BillPaymentCheckQuery` |
| Bill Payments - Credit Cards | `BillPaymentCreditCardQuery` |
| Vendor Credits | `VendorCreditQuery` |
| Checks | `CheckQuery` |
| Credit Card Charges | `CreditCardChargeQuery` |
| Purchase Orders | `PurchaseOrderQuery` |
| Item Receipts | `ItemReceiptQuery` |
| Journal Entries | `JournalEntryQuery` |
| Transfers | `TransferQuery` |
| Inventory Adjustments | `InventoryAdjustmentQuery` |
| Inventory Sites | `InventorySiteQuery` |

## 4) Internal Corelytics Notes

Site Admin setup:

1. Set Real Estate Diversified accounting system to `QUICKBOOKS_ENTERPRISE`.
2. Save QuickBooks Enterprise settings in the QuickBooks Desktop-family panel.
3. Confirm saved connection metadata includes `quickbooksDesktopVariant: ENTERPRISE`.
4. Save the QBE default programs listed above.
5. Import the first financial JSON payload, then run operational sync.

Fields still requiring client-provided values:

| Field | Status |
|---|---|
| QB Enterprise Edition + Year | Waiting on client |
| Country Version | Default to `US`, confirm with client |
| Target Company File Path (`.QBW`) | Waiting on client |
| Host Machine Name | Waiting on client |

Corelytics must enter and save the Web Connector password for `qbwc_cmqb6e66i_dev` before the client imports the `.qwc` file.
