import {
  AccountingAdapter,
  AdapterConfig,
  CashBalance,
  ARAgingData,
  APAgingData,
  CustomerSalesData,
  ProductSalesData,
  InventoryData,
  SyncResult
} from './types';
import prisma from '@/lib/prisma';
import { XeroClient } from 'xero-node';

/**
 * Xero Adapter
 * Implements the AccountingAdapter interface for Xero
 */
export class XeroAdapter implements AccountingAdapter {
  readonly platform = 'XERO';
  
  private config: AdapterConfig;
  private xeroClient: XeroClient;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    
    // Parse scopes from environment
    const scopes = process.env.XERO_SCOPES?.split(' ') || [
      'accounting.transactions.read',
      'accounting.reports.read',
      'accounting.contacts.read',
      'accounting.settings.read',
      'offline_access',
    ];
    
    // Initialize Xero client
    this.xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID || '',
      clientSecret: process.env.XERO_CLIENT_SECRET || '',
      redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'],
      scopes: scopes,
    });
    
    // Set the token set
    this.xeroClient.setTokenSet({
      access_token: config.accessToken,
      refresh_token: config.refreshToken || '',
      expires_in: 1800,
      token_type: 'Bearer',
    });
  }
  
  /**
   * Test if the connection is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.config.tenantId) {
        console.error('Xero tenant ID not found');
        return false;
      }
      
      const response = await this.xeroClient.accountingApi.getOrganisations(this.config.tenantId);
      return response?.body?.organisations && response.body.organisations.length > 0;
    } catch (error) {
      console.error('Xero connection test failed:', error);
      return false;
    }
  }
  
  /**
   * Get cash balances from all bank accounts
   */
  async getCashBalances(): Promise<CashBalance[]> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      // Query for all bank accounts
      const response = await this.xeroClient.accountingApi.getAccounts(
        this.config.tenantId,
        undefined,
        'Type=="BANK"&&Status=="ACTIVE"'
      );
      
      const accounts = response.body?.accounts || [];
      
      return accounts.map((account) => ({
        accountId: account.accountID || '',
        accountName: account.name || 'Unknown',
        accountNumber: account.bankAccountNumber,
        balance: 0, // Xero doesn't return balance in account query, need to calculate from transactions
        currency: account.currencyCode || 'USD',
        asOfDate: new Date()
      }));
    } catch (error) {
      console.error('Error fetching cash balances from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Get Accounts Receivable Aging Report
   */
  async getARAgingReport(asOfDate?: Date): Promise<ARAgingData> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      const date = asOfDate || new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // Get AR Aging report from Xero
      const response = await this.xeroClient.accountingApi.getReportAgedReceivablesByContact(
        this.config.tenantId,
        undefined,
        dateStr
      );
      
      const report = response.body;
      let totalAR = 0;
      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;
      
      // Parse Xero report structure
      // Xero AR Aging has columns: Contact, Current, 1-30 days, 31-60 days, 61-90 days, Older, Total
      if (report.rows) {
        this.parseAgingRows(report.rows, (cells) => {
          if (cells.length >= 7) {
            current += this.parseAmount(cells[1]?.value);
            days1to30 += this.parseAmount(cells[2]?.value);
            days31to60 += this.parseAmount(cells[3]?.value);
            days61to90 += this.parseAmount(cells[4]?.value);
            days90plus += this.parseAmount(cells[5]?.value);
            totalAR += this.parseAmount(cells[6]?.value);
          }
        });
      }
      
      return {
        asOfDate: date,
        totalAR,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus
      };
    } catch (error) {
      console.error('Error fetching AR aging from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Get Accounts Payable Aging Report
   */
  async getAPAgingReport(asOfDate?: Date): Promise<APAgingData> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      const date = asOfDate || new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // Get AP Aging report from Xero
      const response = await this.xeroClient.accountingApi.getReportAgedPayablesByContact(
        this.config.tenantId,
        undefined,
        dateStr
      );
      
      const report = response.body;
      let totalAP = 0;
      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;
      
      // Parse Xero report structure (same as AR aging)
      if (report.rows) {
        this.parseAgingRows(report.rows, (cells) => {
          if (cells.length >= 7) {
            current += this.parseAmount(cells[1]?.value);
            days1to30 += this.parseAmount(cells[2]?.value);
            days31to60 += this.parseAmount(cells[3]?.value);
            days61to90 += this.parseAmount(cells[4]?.value);
            days90plus += this.parseAmount(cells[5]?.value);
            totalAP += this.parseAmount(cells[6]?.value);
          }
        });
      }
      
      return {
        asOfDate: date,
        totalAP,
        current,
        days1to30,
        days31to60,
        days61to90,
        days90plus
      };
    } catch (error) {
      console.error('Error fetching AP aging from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Get customer sales data for a date range
   */
  async getCustomerSales(startDate: Date, endDate: Date): Promise<CustomerSalesData[]> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      // Query for sales invoices in the date range
      const whereClause = `Type=="ACCREC"&&Date>="${startStr}"&&Date<="${endStr}"&&Status!="DELETED"`;
      const response = await this.xeroClient.accountingApi.getInvoices(
        this.config.tenantId,
        undefined,
        whereClause
      );
      
      const invoices = response.body?.invoices || [];
      
      // Group by customer
      const customerMap = new Map<string, CustomerSalesData>();
      
      invoices.forEach((invoice) => {
        const customerId = invoice.contact?.contactID || 'unknown';
        const customerName = invoice.contact?.name || 'Unknown';
        const amount = invoice.total || 0;
        
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customerId,
            customerName,
            revenue: 0,
            invoiceCount: 0,
            avgInvoiceSize: 0,
            period: endDate
          });
        }
        
        const customer = customerMap.get(customerId)!;
        customer.revenue += amount;
        customer.invoiceCount += 1;
      });
      
      // Calculate averages
      const results = Array.from(customerMap.values());
      results.forEach(customer => {
        customer.avgInvoiceSize = customer.invoiceCount > 0 
          ? customer.revenue / customer.invoiceCount 
          : 0;
      });
      
      return results;
    } catch (error) {
      console.error('Error fetching customer sales from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Get product/item sales data for a date range
   */
  async getProductSales(startDate: Date, endDate: Date): Promise<ProductSalesData[]> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      // Get all sales invoices in date range
      const whereClause = `Type=="ACCREC"&&Date>="${startStr}"&&Date<="${endStr}"&&Status!="DELETED"`;
      const response = await this.xeroClient.accountingApi.getInvoices(
        this.config.tenantId,
        undefined,
        whereClause
      );
      
      const invoices = response.body?.invoices || [];
      
      // Group line items by product/item code
      const productMap = new Map<string, ProductSalesData>();
      
      invoices.forEach((invoice) => {
        invoice.lineItems?.forEach((lineItem) => {
          const itemCode = lineItem.itemCode || lineItem.description || 'Unknown';
          const quantity = lineItem.quantity || 0;
          const amount = lineItem.lineAmount || 0;
          
          if (!productMap.has(itemCode)) {
            productMap.set(itemCode, {
              itemId: lineItem.lineItemID,
              itemName: lineItem.description || itemCode,
              sku: lineItem.itemCode,
              quantitySold: 0,
              revenue: 0,
              cogs: undefined,
              grossMargin: undefined,
              grossMarginPct: undefined,
              period: endDate
            });
          }
          
          const product = productMap.get(itemCode)!;
          product.quantitySold += quantity;
          product.revenue += amount;
        });
      });
      
      return Array.from(productMap.values());
    } catch (error) {
      console.error('Error fetching product sales from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Get current inventory levels
   */
  async getInventory(): Promise<InventoryData[]> {
    try {
      if (!this.config.tenantId) {
        throw new Error('Xero tenant ID not found');
      }
      
      // Query for all tracked inventory items
      const response = await this.xeroClient.accountingApi.getItems(
        this.config.tenantId
      );
      
      const items = response.body?.items || [];
      
      return items
        .filter(item => item.isTrackedAsInventory)
        .map((item) => ({
          itemId: item.itemID,
          itemName: item.name || 'Unknown',
          sku: item.code,
          qtyOnHand: item.quantityOnHand || 0,
          assetValue: item.totalCostPool || 0,
          avgCost: (item.quantityOnHand && item.quantityOnHand > 0) 
            ? (item.totalCostPool || 0) / item.quantityOnHand 
            : 0,
          asOfDate: new Date()
        }));
    } catch (error) {
      console.error('Error fetching inventory from Xero:', error);
      throw error;
    }
  }
  
  /**
   * Sync all operational data and save to database
   */
  async syncAll(frequency: 'daily' | 'weekly' | 'monthly'): Promise<SyncResult> {
    const errors: string[] = [];
    let recordsCreated = 0;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 1. Sync cash balances
      try {
        const cashBalances = await this.getCashBalances();
        for (const balance of cashBalances) {
          await prisma.cashSnapshot.create({
            data: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency,
              accountId: balance.accountId,
              accountName: balance.accountName,
              accountNumber: balance.accountNumber,
              cashBalance: balance.balance,
              changeAmount: null,
              changePercent: null
            }
          });
          recordsCreated++;
        }
      } catch (error: any) {
        errors.push(`Cash sync failed: ${error.message}`);
      }
      
      // 2. Sync AR Aging
      try {
        const arAging = await this.getARAgingReport();
        await prisma.aRAgingSnapshot.create({
          data: {
            companyId: this.config.companyId,
            snapshotDate: today,
            frequency,
            totalAR: arAging.totalAR,
            current: arAging.current,
            days1to30: arAging.days1to30,
            days31to60: arAging.days31to60,
            days61to90: arAging.days61to90,
            days90plus: arAging.days90plus
          }
        });
        recordsCreated++;
      } catch (error: any) {
        errors.push(`AR Aging sync failed: ${error.message}`);
      }
      
      // 3. Sync AP Aging
      try {
        const apAging = await this.getAPAgingReport();
        await prisma.aPAgingSnapshot.create({
          data: {
            companyId: this.config.companyId,
            snapshotDate: today,
            frequency,
            totalAP: apAging.totalAP,
            current: apAging.current,
            days1to30: apAging.days1to30,
            days31to60: apAging.days31to60,
            days61to90: apAging.days61to90,
            days90plus: apAging.days90plus
          }
        });
        recordsCreated++;
      } catch (error: any) {
        errors.push(`AP Aging sync failed: ${error.message}`);
      }
      
      // 4. Sync Customer Sales (yesterday's data)
      try {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const customerSales = await this.getCustomerSales(yesterday, yesterday);
        for (const sale of customerSales) {
          await prisma.customerSalesSnapshot.create({
            data: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency,
              customerId: sale.customerId,
              customerName: sale.customerName,
              revenue: sale.revenue,
              invoiceCount: sale.invoiceCount,
              avgInvoiceSize: sale.avgInvoiceSize
            }
          });
          recordsCreated++;
        }
      } catch (error: any) {
        errors.push(`Customer sales sync failed: ${error.message}`);
      }
      
      // 5. Sync Product Sales (yesterday's data)
      try {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const productSales = await this.getProductSales(yesterday, yesterday);
        for (const product of productSales) {
          await prisma.productSalesSnapshot.create({
            data: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency,
              itemId: product.itemId,
              itemName: product.itemName,
              sku: product.sku,
              quantitySold: product.quantitySold,
              revenue: product.revenue,
              cogs: product.cogs,
              grossMargin: product.grossMargin,
              grossMarginPct: product.grossMarginPct
            }
          });
          recordsCreated++;
        }
      } catch (error: any) {
        errors.push(`Product sales sync failed: ${error.message}`);
      }
      
      // 6. Sync Inventory
      try {
        const inventory = await this.getInventory();
        for (const item of inventory) {
          await prisma.inventorySnapshot.create({
            data: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency,
              itemId: item.itemId,
              itemName: item.itemName,
              sku: item.sku,
              qtyOnHand: item.qtyOnHand,
              assetValue: item.assetValue,
              avgCost: item.avgCost
            }
          });
          recordsCreated++;
        }
      } catch (error: any) {
        errors.push(`Inventory sync failed: ${error.message}`);
      }
      
      return {
        success: errors.length === 0,
        recordsCreated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        recordsCreated,
        errors: [error.message],
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Helper to parse aging report rows recursively
   */
  private parseAgingRows(rows: any[], callback: (cells: any[]) => void): void {
    rows.forEach((row) => {
      if (row.rowType === 'Row' && row.cells) {
        callback(row.cells);
      }
      if (row.rows) {
        this.parseAgingRows(row.rows, callback);
      }
    });
  }
  
  /**
   * Helper to parse amount from Xero report cell
   */
  private parseAmount(value: string | undefined): number {
    if (!value) return 0;
    // Remove currency symbols and commas
    const cleaned = value.replace(/[$,]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}

