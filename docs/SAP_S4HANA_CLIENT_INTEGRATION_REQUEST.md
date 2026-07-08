# SAP S/4HANA Integration Access Request

To connect Corelytics to your SAP S/4HANA environment, please provide the information below and have your SAP administrator enable API access for the required finance and operational data domains.

## Connection Information Needed

Please provide:

- SAP tenant base URL, for example `https://company.sap.com`
- SAP OData service root, usually `/sap/opu/odata/sap`
- Company Code
- Ledger, usually `0L`
- Chart of Accounts code, if applicable
- Preferred authentication method:
  - OAuth2, preferred for cloud deployments
  - SAML
  - Basic Authentication
  - Client Certificate
- OAuth2 details, if using OAuth2:
  - Client ID
  - Client Secret
  - Token URL
  - Required scopes, if applicable
- SAP username/password, if using Basic Authentication
- Client certificate alias/subject, if using certificate authentication
- SAP technical contact for connection testing and troubleshooting

## SAP Access Setup Needed

Please ask your SAP administrator to create or authorize a technical integration user or OAuth client for Corelytics with read-only access to the SAP Gateway OData services needed for reporting.

The integration should allow read access to:

- General Ledger
- Journal Entries
- Trial Balance / Ledger Balances
- Accounts Receivable
- Accounts Payable
- Cash Management
- Customers
- Vendors
- Cost Centers
- Profit Centers
- Projects, if used
- Inventory, if licensed/used
- Fixed Assets, if used
- Sales Orders and Billing Documents, if used
- Purchasing / Purchase Orders, if used

## Key SAP OData Services

Please confirm these or equivalent services are active and accessible:

- `/sap/opu/odata/sap/API_GLACCOUNTLINEITEM_SRV`
- `/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItem`
- `/sap/opu/odata/sap/API_GLACCOUNT_SRV/A_GLAccount`
- `/sap/opu/odata/sap/API_COMPANYCODE_SRV/A_CompanyCode`
- Ledger balance / trial balance OData service used by your SAP tenant
- Customer, vendor, AR open item, AP open item, and payment services used by your SAP tenant

## Permissions Required

Corelytics only needs read/reporting access. The integration user should be able to:

- Query OData services using `$filter`, `$select`, `$orderby`, `$top`, `$skip`, and `$expand`
- Read historical GL and journal entry data for the initial load, typically 24 to 36 months
- Read daily incremental changes for GL, AR, AP, cash, customers, vendors, and dimensional master data
- Access company code, ledger, cost center, profit center, project, and plant dimensions where applicable

Corelytics does not need permission to post journal entries, approve transactions, change master data, or modify SAP configuration.

## Network And Security

Please confirm:

- Whether IP allowlisting is required
- Whether SAP Cloud Connector, SAP BTP, VPN, or another gateway is required
- Whether API access is available from the public internet over HTTPS
- Whether rate limits, pagination limits, or query timeouts apply
- Who should receive connection-test alerts or authentication-expiration notices

Once these items are available, Corelytics can configure the SAP S/4HANA integration container and test read-only access to the required OData services.
