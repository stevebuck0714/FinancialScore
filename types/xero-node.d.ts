declare module 'xero-node' {
  export interface XeroClientConfiguration {
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    scopes: string[];
    state?: string;
    httpTimeout?: number;
  }

  export interface TokenSet {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    id_token?: string;
    scope?: string;
  }

  export interface XeroIdToken {
    sub: string;
    email: string;
    given_name?: string;
    family_name?: string;
    [key: string]: any;
  }

  export class XeroClient {
    constructor(config: XeroClientConfiguration);
    
    buildConsentUrl(): Promise<string>;
    apiCallback(url: string): Promise<TokenSet>;
    setTokenSet(tokenSet: TokenSet): void;
    readTokenSet(): TokenSet;
    refreshToken(): Promise<TokenSet>;
    disconnect(connectionId: string): Promise<void>;
    
    // Accounting API
    accountingApi: AccountingApi;
    
    // Identity
    updateTenants(waitForRateLimiter?: boolean): Promise<Tenant[]>;
  }

  export interface Tenant {
    id: string;
    tenantId: string;
    tenantType: string;
    tenantName?: string;
    createdDateUtc?: string;
    updatedDateUtc?: string;
  }

  export class AccountingApi {
    // Account methods
    getAccounts(
      xeroTenantId: string,
      ifModifiedSince?: Date,
      where?: string,
      order?: string
    ): Promise<{ body: { accounts: Account[] } }>;

    // Report methods
    getReportTrialBalance(
      xeroTenantId: string,
      date?: string,
      paymentsOnly?: boolean | number
    ): Promise<{ body: ReportWithRows }>;

    getReportProfitAndLoss(
      xeroTenantId: string,
      fromDate?: string,
      toDate?: string,
      periods?: number,
      timeframe?: string,
      trackingCategoryID?: string,
      trackingOptionID?: string,
      standardLayout?: boolean,
      paymentsOnly?: boolean
    ): Promise<{ body: ReportWithRows }>;

    getReportBalanceSheet(
      xeroTenantId: string,
      date?: string,
      periods?: number,
      timeframe?: string,
      trackingOptionID?: string,
      standardLayout?: boolean,
      paymentsOnly?: boolean
    ): Promise<{ body: ReportWithRows }>;

    getReportAgedReceivablesByContact(
      xeroTenantId: string,
      contactId?: string,
      date?: string,
      fromDate?: string,
      toDate?: string
    ): Promise<{ body: ReportWithRows }>;

    getReportAgedPayablesByContact(
      xeroTenantId: string,
      contactId?: string,
      date?: string,
      fromDate?: string,
      toDate?: string
    ): Promise<{ body: ReportWithRows }>;

    // Invoice methods
    getInvoices(
      xeroTenantId: string,
      ifModifiedSince?: Date,
      where?: string,
      order?: string,
      iDs?: string[],
      invoiceNumbers?: string[],
      contactIDs?: string[],
      statuses?: string[],
      page?: number,
      includeArchived?: boolean | number,
      createdByMyApp?: boolean | number,
      unitdp?: number,
      summaryOnly?: boolean | number,
      extra?: any
    ): Promise<{ body: { invoices: Invoice[] } }>;

    // Contact methods
    getContacts(
      xeroTenantId: string,
      ifModifiedSince?: Date,
      where?: string,
      order?: string,
      iDs?: string[],
      page?: number,
      includeArchived?: boolean,
      summaryOnly?: boolean
    ): Promise<{ body: { contacts: Contact[] } }>;

    // Organisation methods
    getOrganisations(
      xeroTenantId: string
    ): Promise<{ body: { organisations: Organisation[] } }>;

    // Item methods
    getItems(
      xeroTenantId: string,
      ifModifiedSince?: Date,
      where?: string,
      order?: string,
      unitdp?: number
    ): Promise<{ body: { items: Item[] } }>;

    getBankTransactions(...args: any[]): Promise<{ body: { bankTransactions: any[] } }>;
    getManualJournals(...args: any[]): Promise<{ body: { manualJournals: any[] } }>;
  }

  export interface Account {
    accountID?: string;
    code?: string;
    name?: string;
    type?: string;
    taxType?: string;
    description?: string;
    class?: string;
    status?: string;
    systemAccount?: string;
    enablePaymentsToAccount?: boolean;
    showInExpenseClaims?: boolean;
    bankAccountNumber?: string;
    bankAccountType?: string;
    currencyCode?: string;
    reportingCode?: string;
    reportingCodeName?: string;
    hasAttachments?: boolean;
    updatedDateUTC?: string;
    addToWatchlist?: boolean;
  }

  export interface ReportWithRows {
    reportID?: string;
    reportName?: string;
    reportType?: string;
    reportTitles?: string[];
    reportDate?: string;
    updatedDateUTC?: string;
    rows?: ReportRow[];
  }

  export interface ReportRow {
    rowType?: string;
    title?: string;
    cells?: ReportCell[];
    rows?: ReportRow[];
  }

  export interface ReportCell {
    value?: string;
    attributes?: ReportAttribute[];
  }

  export interface ReportAttribute {
    id?: string;
    value?: string;
  }

  export interface Invoice {
    invoiceID?: string;
    invoiceNumber?: string;
    reference?: string;
    type?: string;
    contact?: Contact;
    date?: string;
    dueDate?: string;
    lineAmountTypes?: string;
    lineItems?: LineItem[];
    subTotal?: number;
    totalTax?: number;
    total?: number;
    status?: string;
    currencyCode?: string;
    amountDue?: number;
    amountPaid?: number;
    amountCredited?: number;
  }

  export interface Contact {
    contactID?: string;
    contactNumber?: string;
    accountNumber?: string;
    contactStatus?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    companyNumber?: string;
    emailAddress?: string;
    phones?: Phone[];
    addresses?: Address[];
    isSupplier?: boolean;
    isCustomer?: boolean;
  }

  export interface LineItem {
    lineItemID?: string;
    description?: string;
    quantity?: number;
    unitAmount?: number;
    itemCode?: string;
    accountCode?: string;
    accountName?: string;
    taxType?: string;
    taxAmount?: number;
    lineAmount?: number;
    discountRate?: number;
    tracking?: TrackingCategory[];
  }

  export interface TrackingCategory {
    name?: string;
    option?: string;
    trackingCategoryID?: string;
    trackingOptionID?: string;
  }

  export interface Phone {
    phoneType?: string;
    phoneNumber?: string;
    phoneAreaCode?: string;
    phoneCountryCode?: string;
  }

  export interface Address {
    addressType?: string;
    addressLine1?: string;
    addressLine2?: string;
    addressLine3?: string;
    addressLine4?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    attentionTo?: string;
  }

  export interface Organisation {
    organisationID?: string;
    aPIKey?: string;
    name?: string;
    legalName?: string;
    paysTax?: boolean;
    version?: string;
    organisationType?: string;
    baseCurrency?: string;
    countryCode?: string;
    isDemoCompany?: boolean;
    organisationStatus?: string;
    registrationNumber?: string;
    taxNumber?: string;
    financialYearEndDay?: number;
    financialYearEndMonth?: number;
    salesTaxBasis?: string;
    salesTaxPeriod?: string;
    defaultSalesTax?: string;
    defaultPurchasesTax?: string;
    periodLockDate?: string;
    endOfYearLockDate?: string;
    createdDateUTC?: string;
    timezone?: string;
    organisationEntityType?: string;
    shortCode?: string;
    lineOfBusiness?: string;
    addresses?: Address[];
    phones?: Phone[];
    externalLinks?: ExternalLink[];
    paymentTerms?: PaymentTerm;
  }

  export interface ExternalLink {
    linkType?: string;
    url?: string;
  }

  export interface PaymentTerm {
    bills?: Bill;
    sales?: Sale;
  }

  export interface Bill {
    day?: number;
    type?: string;
  }

  export interface Sale {
    day?: number;
    type?: string;
  }

  export interface Item {
    itemID?: string;
    code?: string;
    inventoryAssetAccountCode?: string;
    name?: string;
    isSold?: boolean;
    isPurchased?: boolean;
    description?: string;
    purchaseDescription?: string;
    purchaseDetails?: Purchase;
    salesDetails?: SalesDetails;
    isTrackedAsInventory?: boolean;
    totalCostPool?: number;
    quantityOnHand?: number;
    updatedDateUTC?: string;
  }

  export interface Purchase {
    unitPrice?: number;
    accountCode?: string;
    cOGSAccountCode?: string;
    taxType?: string;
  }

  export interface SalesDetails {
    unitPrice?: number;
    accountCode?: string;
    taxType?: string;
  }
}







