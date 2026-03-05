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

/**
 * QuickBooks Adapter
 * Implements the AccountingAdapter interface for QuickBooks Online
 */
export class QuickBooksAdapter implements AccountingAdapter {
  readonly platform = 'QUICKBOOKS';
  
  private config: AdapterConfig;
  private baseUrl: string;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    // QuickBooks sandbox vs production
    this.baseUrl = process.env.QUICKBOOKS_API_BASE_URL || 
                   'https://quickbooks.api.intuit.com/v3/company';
  }
  
  /**
   * Test if the connection is valid
   */
  async testConnection(): Promise<boolean> {
    if (!this.config.accessToken) {
      throw new Error('QuickBooks access token is missing on this connection.');
    }
    if (!this.config.realmId) {
      throw new Error('QuickBooks realmId is missing on this connection. Reconnect QuickBooks for this company.');
    }

    try {
      await this.makeRequest(`/companyinfo/${this.config.realmId}?minorversion=65`);
      return true;
    } catch (error: any) {
      const message = error?.message || 'Unknown QuickBooks connection error';
      console.error('QuickBooks connection test failed:', message);
      throw new Error(`QuickBooks connection test failed: ${message}`);
    }
  }
  
  /**
   * Get cash balances from all bank accounts
   */
  async getCashBalances(): Promise<CashBalance[]> {
    try {
      // Query for all bank accounts
      const query = "SELECT * FROM Account WHERE AccountType='Bank' AND Active=true";
      const response = await this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const accounts = data.QueryResponse?.Account || [];
      
      return accounts.map((account: any) => ({
        accountId: account.Id,
        accountName: account.Name,
        accountNumber: account.AcctNum,
        balance: account.CurrentBalance || 0,
        currency: account.CurrencyRef?.value || 'USD',
        asOfDate: new Date()
      }));
    } catch (error) {
      console.error('Error fetching cash balances from QuickBooks:', error);
      throw error;
    }
  }

  private getOperationalSettings(): Record<string, unknown> {
    const metadata =
      this.config.connectionMetadata &&
      typeof this.config.connectionMetadata === 'object' &&
      !Array.isArray(this.config.connectionMetadata)
        ? (this.config.connectionMetadata as Record<string, unknown>)
        : {};

    const settings =
      metadata.quickbooksOnlineSettings &&
      typeof metadata.quickbooksOnlineSettings === 'object' &&
      !Array.isArray(metadata.quickbooksOnlineSettings)
        ? (metadata.quickbooksOnlineSettings as Record<string, unknown>)
        : {};

    return settings;
  }

  private parseStartDateFromSettings(): Date | null {
    const settings = this.getOperationalSettings();
    const raw = typeof settings.initialSyncStartDate === 'string' ? settings.initialSyncStartDate.trim() : '';
    if (!raw) return null;
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private parseMoney(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private resolveCashHistoryStartDate(today: Date): Date {
    const maxWindowStart = new Date(today);
    maxWindowStart.setFullYear(maxWindowStart.getFullYear() - 3);
    maxWindowStart.setHours(0, 0, 0, 0);

    const configuredStart = this.parseStartDateFromSettings();
    if (!configuredStart) return maxWindowStart;
    return configuredStart > maxWindowStart ? configuredStart : maxWindowStart;
  }

  private async getDailyCashHistory(
    startDate: Date,
    endDate: Date,
    bankAccounts: CashBalance[]
  ): Promise<Map<string, CashBalance[]>> {
    const history = new Map<string, CashBalance[]>();
    if (bankAccounts.length === 0) return history;

    const knownById = new Map<string, CashBalance>();
    const knownByName = new Map<string, CashBalance>();
    for (const account of bankAccounts) {
      if (account.accountId) knownById.set(account.accountId, account);
      if (account.accountName) knownByName.set(account.accountName, account);
    }

    const chunkStart = new Date(startDate);
    // Keep day-level report windows small; large ranges are frequently rejected by QBO.
    const maxChunkDays = 30;

    while (chunkStart <= endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + (maxChunkDays - 1));
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      const response = await this.makeRequest(
        `/reports/BalanceSheet?start_date=${this.formatDate(chunkStart)}&end_date=${this.formatDate(chunkEnd)}&summarize_column_by=Day&minorversion=65`
      );
      const report = await response.json();

      const columns: any[] = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
      const dateColumns = columns
        .map((column, index) => ({ column, index }))
        .filter((entry) => entry.index > 0)
        .map((entry) => {
          const colTitle =
            typeof entry.column?.ColTitle === 'string' && entry.column.ColTitle.trim()
              ? entry.column.ColTitle.trim()
              : typeof entry.column?.MetaData?.value === 'string'
                ? entry.column.MetaData.value
                : '';
          const parsed = new Date(`${colTitle}T00:00:00`);
          if (Number.isNaN(parsed.getTime())) return null;
          parsed.setHours(0, 0, 0, 0);
          return { index: entry.index, date: parsed };
        })
        .filter((entry): entry is { index: number; date: Date } => Boolean(entry));

      const rows = Array.isArray(report?.Rows?.Row) ? report.Rows.Row : [];
      const stack: any[] = [...rows];
      while (stack.length) {
        const row = stack.pop();
        if (!row || typeof row !== 'object') continue;

        if (row.type === 'Section' && row.Rows && Array.isArray(row.Rows.Row)) {
          stack.push(...row.Rows.Row);
        }

        if (row.type !== 'Data' || !Array.isArray(row.ColData) || row.ColData.length === 0) continue;

        const name = typeof row.ColData[0]?.value === 'string' ? row.ColData[0].value : '';
        const id = typeof row.ColData[0]?.id === 'string' ? row.ColData[0].id : '';
        const knownAccount = (id && knownById.get(id)) || (name && knownByName.get(name));
        if (!knownAccount) continue;

        for (const column of dateColumns) {
          const value = this.parseMoney(row.ColData[column.index]?.value);
          const key = this.formatDate(column.date);
          const existing = history.get(key) || [];
          existing.push({
            accountId: knownAccount.accountId,
            accountName: knownAccount.accountName,
            accountNumber: knownAccount.accountNumber,
            currency: knownAccount.currency,
            balance: value,
            asOfDate: column.date,
          });
          history.set(key, existing);
        }
      }

      chunkStart.setDate(chunkStart.getDate() + maxChunkDays);
    }

    return history;
  }
  
  /**
   * Get Accounts Receivable Aging Report
   */
  async getARAgingReport(asOfDate?: Date): Promise<ARAgingData> {
    try {
      const date = asOfDate || new Date();
      const dateStr = date.toISOString().split('T')[0];
      
      // QuickBooks API for AR Aging Summary report
      const response = await this.makeRequest(
        `/reports/AgedReceivables?date_macro=Today&aging_period=30`
      );
      const data = await response.json();
      
      // Parse the report data (QuickBooks returns complex nested structure)
      const rows = data.Rows?.Row || [];
      let totalAR = 0;
      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;
      
      // QuickBooks AR Aging has columns: Current, 1-30, 31-60, 61-90, 91+, Total
      rows.forEach((row: any) => {
        if (row.type === 'Data' && row.ColData) {
          const cols = row.ColData;
          if (cols.length >= 6) {
            current += parseFloat(cols[0]?.value || '0');
            days1to30 += parseFloat(cols[1]?.value || '0');
            days31to60 += parseFloat(cols[2]?.value || '0');
            days61to90 += parseFloat(cols[3]?.value || '0');
            days90plus += parseFloat(cols[4]?.value || '0');
            totalAR += parseFloat(cols[5]?.value || '0');
          }
        }
      });
      
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
      console.error('Error fetching AR aging from QuickBooks:', error);
      throw error;
    }
  }
  
  /**
   * Get Accounts Payable Aging Report
   */
  async getAPAgingReport(asOfDate?: Date): Promise<APAgingData> {
    try {
      const date = asOfDate || new Date();
      
      // QuickBooks API for AP Aging Summary report
      const response = await this.makeRequest(
        `/reports/AgedPayables?date_macro=Today&aging_period=30`
      );
      const data = await response.json();
      
      const rows = data.Rows?.Row || [];
      let totalAP = 0;
      let current = 0;
      let days1to30 = 0;
      let days31to60 = 0;
      let days61to90 = 0;
      let days90plus = 0;
      
      rows.forEach((row: any) => {
        if (row.type === 'Data' && row.ColData) {
          const cols = row.ColData;
          if (cols.length >= 6) {
            current += parseFloat(cols[0]?.value || '0');
            days1to30 += parseFloat(cols[1]?.value || '0');
            days31to60 += parseFloat(cols[2]?.value || '0');
            days61to90 += parseFloat(cols[3]?.value || '0');
            days90plus += parseFloat(cols[4]?.value || '0');
            totalAP += parseFloat(cols[5]?.value || '0');
          }
        }
      });
      
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
      console.error('Error fetching AP aging from QuickBooks:', error);
      throw error;
    }
  }
  
  /**
   * Get customer sales data for a date range
   */
  async getCustomerSales(startDate: Date, endDate: Date): Promise<CustomerSalesData[]> {
    try {
      // Query for invoices in the date range
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`;
      const response = await this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const invoices = data.QueryResponse?.Invoice || [];
      
      // Group by customer
      const customerMap = new Map<string, CustomerSalesData>();
      
      invoices.forEach((invoice: any) => {
        const customerId = invoice.CustomerRef?.value;
        const customerName = invoice.CustomerRef?.name || 'Unknown';
        const amount = invoice.TotalAmt || 0;
        
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
      console.error('Error fetching customer sales from QuickBooks:', error);
      throw error;
    }
  }
  
  /**
   * Get product/item sales data for a date range
   */
  async getProductSales(startDate: Date, endDate: Date): Promise<ProductSalesData[]> {
    try {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      // Get sales by product/service report
      const response = await this.makeRequest(
        `/reports/SalesByProduct?start_date=${startStr}&end_date=${endStr}`
      );
      const data = await response.json();
      
      const rows = data.Rows?.Row || [];
      const products: ProductSalesData[] = [];
      
      rows.forEach((row: any) => {
        if (row.type === 'Data' && row.ColData) {
          const cols = row.ColData;
          if (cols.length >= 2) {
            const itemName = cols[0]?.value || 'Unknown';
            const revenue = parseFloat(cols[1]?.value || '0');
            const quantity = parseFloat(cols[2]?.value || '0');
            
            products.push({
              itemId: undefined, // May need separate query for item details
              itemName,
              sku: undefined,
              quantitySold: quantity,
              revenue,
              cogs: undefined,
              grossMargin: undefined,
              grossMarginPct: undefined,
              period: endDate
            });
          }
        }
      });
      
      return products;
    } catch (error) {
      console.error('Error fetching product sales from QuickBooks:', error);
      throw error;
    }
  }
  
  /**
   * Get current inventory levels
   */
  async getInventory(): Promise<InventoryData[]> {
    try {
      // Query for all inventory items
      const query = "SELECT * FROM Item WHERE Type='Inventory' AND Active=true";
      const response = await this.makeRequest(`/query?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const items = data.QueryResponse?.Item || [];
      
      return items.map((item: any) => ({
        itemId: item.Id,
        itemName: item.Name,
        sku: item.Sku,
        qtyOnHand: item.QtyOnHand || 0,
        assetValue: (item.QtyOnHand || 0) * (item.PurchaseCost || 0),
        avgCost: item.PurchaseCost || 0,
        asOfDate: new Date()
      }));
    } catch (error) {
      console.error('Error fetching inventory from QuickBooks:', error);
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
        if (frequency === 'daily') {
          const startDate = this.resolveCashHistoryStartDate(today);
          const cashHistory = await this.getDailyCashHistory(startDate, today, cashBalances);
          const dates = Array.from(cashHistory.keys()).sort();

          for (const dayKey of dates) {
            const snapshotDate = this.normalizeDay(new Date(`${dayKey}T00:00:00`));
            const balancesForDay = cashHistory.get(dayKey) || [];
            await prisma.cashSnapshot.deleteMany({
              where: {
                companyId: this.config.companyId,
                frequency,
                snapshotDate,
              },
            });
            if (balancesForDay.length === 0) continue;
            await prisma.cashSnapshot.createMany({
              data: balancesForDay.map((balance) => ({
                companyId: this.config.companyId,
                snapshotDate,
                frequency,
                accountId: balance.accountId,
                accountName: balance.accountName,
                accountNumber: balance.accountNumber,
                cashBalance: balance.balance,
                changeAmount: null,
                changePercent: null,
              })),
            });
            recordsCreated += balancesForDay.length;
          }
        } else {
          await prisma.cashSnapshot.deleteMany({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: today,
            },
          });
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
        }
      } catch (error: any) {
        errors.push(`Cash sync failed: ${error.message}`);
      }
      
      // 2. Sync AR Aging
      try {
        const arAging = await this.getARAgingReport();
        await prisma.aRAgingSnapshot.upsert({
          where: {
            companyId_snapshotDate_frequency: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency
            }
          },
          update: {
            totalAR: arAging.totalAR,
            current: arAging.current,
            days1to30: arAging.days1to30,
            days31to60: arAging.days31to60,
            days61to90: arAging.days61to90,
            days90plus: arAging.days90plus
          },
          create: {
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
        await prisma.aPAgingSnapshot.upsert({
          where: {
            companyId_snapshotDate_frequency: {
              companyId: this.config.companyId,
              snapshotDate: today,
              frequency
            }
          },
          update: {
            totalAP: apAging.totalAP,
            current: apAging.current,
            days1to30: apAging.days1to30,
            days31to60: apAging.days31to60,
            days61to90: apAging.days61to90,
            days90plus: apAging.days90plus
          },
          create: {
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
   * Make authenticated request to QuickBooks API
   */
  private async makeRequest(endpoint: string): Promise<Response> {
    if (!this.config.realmId) {
      throw new Error('QuickBooks realmId is missing on this connection.');
    }
    const url = `${this.baseUrl}/${this.config.realmId}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      // TODO: Implement token refresh logic if 401
      const body = await response.text().catch(() => '');
      const detail = body ? ` - ${body.slice(0, 500)}` : '';
      throw new Error(`QuickBooks API error: ${response.status} ${response.statusText}${detail}`);
    }
    
    return response;
  }

}

