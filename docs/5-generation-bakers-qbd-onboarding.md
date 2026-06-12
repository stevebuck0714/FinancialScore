# 5 Generation Bakers LLC - QuickBooks Desktop Onboarding

Company: 5 Generation Bakers LLC  
Corelytics Company ID: `cmq6pjenb0001l5049udok08d`  
Integration: QuickBooks Desktop via QuickBooks Web Connector  
Default sync: Daily at 08:00 local time  

## 1) What Corelytics Sends To The Client

Corelytics will send the client a QuickBooks Web Connector configuration file:

File name: `5_generation_bakers_corelytics_prod.qwc`

```xml
<?xml version="1.0"?>
<QBWCXML>
  <AppName>Corelytics Data Connector</AppName>
  <AppID></AppID>
  <AppURL>https://api.corelytics.com/qbdesktop/service.asmx</AppURL>
  <AppDescription>Corelytics QuickBooks Desktop integration (read-only sync)</AppDescription>
  <AppSupport>https://dashboard.corelytics.com/support</AppSupport>
  <UserName>qbwc_cmq6pjenb_prod</UserName>
  <OwnerID>{837ad88b-c1a9-42df-9fa2-b82f853543b4}</OwnerID>
  <FileID>{1ce8696f-a566-4eb0-9c0f-aa39c683063e}</FileID>
  <QBType>QBFS</QBType>
  <Style>Document</Style>
  <AuthFlags>0xF</AuthFlags>
  <Scheduler>
    <RunEveryNSeconds>3600</RunEveryNSeconds>
  </Scheduler>
</QBWCXML>
```

Corelytics will also send the Web Connector password for `qbwc_cmq6pjenb_prod` through a secure channel. Do not send this password in plain email, and do not include it in the `.qwc` file.

Corelytics stores this password in the QuickBooks Desktop Site Admin credentials field for this company.

Corelytics setup values:

| Field | Value |
|---|---|
| Integration Type | QuickBooks Web Connector |
| Application Name | Corelytics Data Connector |
| SOAP/App Endpoint URL | `https://api.corelytics.com/qbdesktop/service.asmx` |
| Support URL | `https://dashboard.corelytics.com/support` |
| Owner ID | `{837ad88b-c1a9-42df-9fa2-b82f853543b4}` |
| File ID | `{1ce8696f-a566-4eb0-9c0f-aa39c683063e}` |
| Web Connector Username | `qbwc_cmq6pjenb_prod` |
| Polling Interval | 60 minutes |
| Permission Scope | Read-only |
| Unattended Access Required | Yes |
| Sync Direction | QuickBooks to Corelytics |
| Sync Frequency | Daily |
| Sync Time | 08:00 local time |

## 2) What The Client Needs To Do

1. Confirm QuickBooks Web Connector is installed on the Windows machine/server that can access the production QuickBooks company file.
2. Open QuickBooks Desktop as Admin in the target production company file.
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
| QuickBooks Desktop edition and year | |
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
| Customers | `CustomerQuery` |
| Vendors | `VendorQuery` |
| Invoices | `InvoiceQuery` |
| Bills | `BillQuery` |
| Payments | `ReceivePaymentQuery` |

## 4) Internal Corelytics Notes

Site Admin fields still requiring client-provided values:

| Field | Status |
|---|---|
| QB Desktop Edition + Year | Waiting on client |
| Country Version | Default to `US`, confirm with client |
| Target Company File Path (`.QBW`) | Waiting on client |
| Host Machine Name | Waiting on client |

Corelytics must enter and save the Web Connector password for `qbwc_cmq6pjenb_prod` in the QuickBooks Desktop Site Admin credentials field before the client imports the `.qwc` file.
