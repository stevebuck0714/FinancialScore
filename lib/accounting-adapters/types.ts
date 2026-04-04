/**
 * Platform-agnostic types for operational data sync
 * These types standardize data from different accounting platforms (QuickBooks, Xero, Sage, etc.)
 */

export interface CashBalance {
  accountId: string;
  accountName: string;
  accountNumber?: string;
  balance: number;
  currency?: string;
  asOfDate: Date;
}

export interface ARAgingData {
  asOfDate: Date;
  totalAR: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

export interface APAgingData {
  asOfDate: Date;
  totalAP: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

export interface CustomerSalesData {
  customerId?: string;
  customerName: string;
  revenue: number;
  invoiceCount: number;
  avgInvoiceSize?: number;
  period: Date;
}

export interface ProductSalesData {
  itemId?: string;
  itemName: string;
  sku?: string;
  quantitySold: number;
  revenue: number;
  cogs?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  period: Date;
}

export interface InventoryData {
  itemId?: string;
  itemName: string;
  sku?: string;
  qtyOnHand: number;
  assetValue: number;
  avgCost?: number;
  asOfDate: Date;
}

export interface SyncResult {
  success: boolean;
  recordsCreated: number;
  moduleCounts?: {
    cash: number;
    arAging: number;
    apAging: number;
    customers: number;
    products: number;
    inventory: number;
  };
  errors?: string[];
  timestamp: Date;
}

/**
 * Base interface that all accounting platform adapters must implement
 */
export interface AccountingAdapter {
  // Platform identification
  readonly platform: string;
  
  // Connection test
  testConnection(): Promise<boolean>;
  
  // Cash data
  getCashBalances(): Promise<CashBalance[]>;
  
  // AR/AP Aging
  getARAgingReport(asOfDate?: Date): Promise<ARAgingData>;
  getAPAgingReport(asOfDate?: Date): Promise<APAgingData>;
  
  // Sales data
  getCustomerSales(startDate: Date, endDate: Date): Promise<CustomerSalesData[]>;
  getProductSales(startDate: Date, endDate: Date): Promise<ProductSalesData[]>;
  
  // Inventory
  getInventory(): Promise<InventoryData[]>;
  
  // Sync all operational data
  syncAll(frequency: 'daily' | 'weekly' | 'monthly'): Promise<SyncResult>;
}

/**
 * Configuration for creating adapters
 */
export interface AdapterConfig {
  companyId: string;
  connectionId: string;
  accessToken: string;
  refreshToken?: string;
  realmId?: string; // QuickBooks
  tenantId?: string; // Xero
  organizationId?: string; // Sage
  [key: string]: unknown; // Allow platform-specific config
}

