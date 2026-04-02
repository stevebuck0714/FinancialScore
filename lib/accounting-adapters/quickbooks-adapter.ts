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
import OAuthClient from 'intuit-oauth';
import { encryptOAuthToken } from '@/lib/encryption';

/**
 * QuickBooks Adapter
 * Implements the AccountingAdapter interface for QuickBooks Online
 */
export class QuickBooksAdapter implements AccountingAdapter {
  readonly platform = 'QUICKBOOKS';
  private static readonly DAILY_INCREMENTAL_LOOKBACK_DAYS = 90;
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
  private static readonly MAX_RATE_LIMIT_RETRIES = 3;
  
  private config: AdapterConfig;
  private baseUrl: string;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    // QuickBooks sandbox vs production
    this.baseUrl = process.env.QUICKBOOKS_API_BASE_URL || 
                   'https://quickbooks.api.intuit.com/v3/company';
  }

  private parseRetryAfterMs(value: string | null): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.ceil(asNumber * 1000);
    }
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      return delta > 0 ? delta : 0;
    }
    return null;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private tokenExpiresSoon(): boolean {
    const expiresAtRaw = this.config.tokenExpiresAt;
    if (!expiresAtRaw) return false;
    const expiresAt = expiresAtRaw instanceof Date ? expiresAtRaw : new Date(expiresAtRaw);
    if (Number.isNaN(expiresAt.getTime())) return false;
    return expiresAt.getTime() - Date.now() <= QuickBooksAdapter.TOKEN_REFRESH_BUFFER_MS;
  }

  private async refreshAccessToken(reason: string): Promise<void> {
    if (!this.config.refreshToken) {
      throw new Error(`QuickBooks refresh token is missing (${reason}).`);
    }

    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri:
        process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
    });

    (oauthClient as any).token = {
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
    };

    try {
      const refreshResponse = await oauthClient.refresh();
      const newToken = refreshResponse.getJson();
      const accessToken = newToken.access_token || this.config.accessToken;
      const refreshToken = newToken.refresh_token || this.config.refreshToken;
      const tokenExpiresAt = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);

      this.config.accessToken = accessToken;
      this.config.refreshToken = refreshToken;
      this.config.tokenExpiresAt = tokenExpiresAt;

      await prisma.accountingConnection.update({
        where: { id: this.config.connectionId },
        data: {
          accessToken: encryptOAuthToken(accessToken),
          refreshToken: encryptOAuthToken(refreshToken),
          tokenExpiresAt,
          status: 'ACTIVE',
          errorMessage: null,
        },
      });
    } catch (error: any) {
      await prisma.accountingConnection.update({
        where: { id: this.config.connectionId },
        data: {
          status: 'EXPIRED',
          errorMessage: `Token refresh failed: ${error?.message || 'Unknown error'}`.slice(0, 900),
        },
      });
      throw new Error(`QuickBooks token refresh failed: ${error?.message || 'Unknown error'}`);
    }
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

  private isProgramEnabled(dataDomain: string): boolean {
    const metadata =
      this.config.connectionMetadata &&
      typeof this.config.connectionMetadata === 'object' &&
      !Array.isArray(this.config.connectionMetadata)
        ? (this.config.connectionMetadata as Record<string, unknown>)
        : {};
    const programs = Array.isArray(metadata.quickbooksOnlinePrograms) ? metadata.quickbooksOnlinePrograms : [];
    if (!programs.length) return true;

    const normalizedTarget = dataDomain.trim().toLowerCase();
    const match = programs.find((entry: any) => {
      const entryDomain = String(entry?.dataDomain || '').trim().toLowerCase();
      return entryDomain === normalizedTarget;
    }) as any;

    if (!match) return true;
    return match.enabled !== false;
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

  private getOperationalSyncMode(): 'BACKFILL' | 'INCREMENTAL' {
    const settings = this.getOperationalSettings();
    const raw = typeof settings.operationalSyncMode === 'string' ? settings.operationalSyncMode.trim().toUpperCase() : '';
    return raw === 'INCREMENTAL' ? 'INCREMENTAL' : 'BACKFILL';
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

  private parseOptionalMoney(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractNumericColumns(colData: any[]): number[] {
    if (!Array.isArray(colData)) return [];
    return colData
      .map((col: any) => this.parseOptionalMoney(col?.value))
      .filter((value): value is number => value !== null);
  }

  private parseAgingBucketsFromColData(colData: any[]): {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
  } | null {
    const numericValues = this.extractNumericColumns(colData);
    if (numericValues.length < 5) return null;

    const current = numericValues[0] || 0;
    const days1to30 = numericValues[1] || 0;
    const days31to60 = numericValues[2] || 0;
    const days61to90 = numericValues[3] || 0;
    const days90plus = numericValues[4] || 0;
    const total =
      numericValues.length >= 6
        ? numericValues[5]
        : current + days1to30 + days31to60 + days61to90 + days90plus;

    return { current, days1to30, days31to60, days61to90, days90plus, total };
  }

  private extractAgingTotals(rows: any[]): {
    total: number;
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
  } {
    const summedFromData = {
      total: 0,
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90plus: 0,
    };
    let hasDataRows = false;
    const summaryCandidates: Array<{
      total: number;
      current: number;
      days1to30: number;
      days31to60: number;
      days61to90: number;
      days90plus: number;
    }> = [];

    const walk = (inputRows: any[]) => {
      for (const row of inputRows || []) {
        if (!row || typeof row !== 'object') continue;

        if (Array.isArray(row.ColData) && row.type === 'Data') {
          const parsed = this.parseAgingBucketsFromColData(row.ColData);
          if (parsed) {
            hasDataRows = true;
            summedFromData.total += parsed.total;
            summedFromData.current += parsed.current;
            summedFromData.days1to30 += parsed.days1to30;
            summedFromData.days31to60 += parsed.days31to60;
            summedFromData.days61to90 += parsed.days61to90;
            summedFromData.days90plus += parsed.days90plus;
          }
        }

        if (Array.isArray(row.Summary?.ColData)) {
          const summaryParsed = this.parseAgingBucketsFromColData(row.Summary.ColData);
          if (summaryParsed) {
            summaryCandidates.push({
              total: summaryParsed.total,
              current: summaryParsed.current,
              days1to30: summaryParsed.days1to30,
              days31to60: summaryParsed.days31to60,
              days61to90: summaryParsed.days61to90,
              days90plus: summaryParsed.days90plus,
            });
          }
        }

        const nestedRows = Array.isArray(row.Rows?.Row) ? row.Rows.Row : [];
        if (nestedRows.length) walk(nestedRows);
      }
    };

    walk(rows || []);

    if (hasDataRows && summedFromData.total > 0) {
      return summedFromData;
    }

    if (summaryCandidates.length > 0) {
      summaryCandidates.sort((a, b) => b.total - a.total);
      return summaryCandidates[0];
    }

    return summedFromData;
  }

  private tryParseDateString(value: string): Date | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    // Handle date ranges like "2026-01-01 - 2026-01-31" by taking the end.
    const rangeParts = trimmed.split(' - ');
    const candidate = (rangeParts.length > 1 ? rangeParts[rangeParts.length - 1] : trimmed).trim();

    const parsed = new Date(`${candidate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }

    // Try native parsing as fallback.
    const parsedNative = new Date(candidate);
    if (!Number.isNaN(parsedNative.getTime())) {
      parsedNative.setHours(0, 0, 0, 0);
      return parsedNative;
    }

    return null;
  }

  private extractColumnDate(column: any): Date | null {
    if (!column || typeof column !== 'object') return null;

    const directCandidates: string[] = [];
    if (typeof column.ColTitle === 'string') directCandidates.push(column.ColTitle);
    if (typeof column.value === 'string') directCandidates.push(column.value);

    const meta = column.MetaData;
    if (Array.isArray(meta)) {
      for (const entry of meta) {
        if (entry && typeof entry === 'object') {
          if (typeof (entry as any).value === 'string') directCandidates.push((entry as any).value);
          if (typeof (entry as any).Name === 'string') directCandidates.push((entry as any).Name);
        } else if (typeof entry === 'string') {
          directCandidates.push(entry);
        }
      }
    } else if (meta && typeof meta === 'object' && typeof (meta as any).value === 'string') {
      directCandidates.push((meta as any).value);
    }

    for (const candidate of directCandidates) {
      const parsed = this.tryParseDateString(candidate);
      if (parsed) return parsed;
    }

    const json = JSON.stringify(column);
    const isoMatch = json.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (isoMatch?.[0]) {
      const parsedIso = this.tryParseDateString(isoMatch[0]);
      if (parsedIso) return parsedIso;
    }

    return null;
  }

  private normalizeDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private resolveSyncAnchorDate(frequency: 'daily' | 'weekly' | 'monthly'): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (frequency !== 'monthly') return today;
    // Monthly operational snapshots are strictly keyed to the most recent closed month.
    return new Date(today.getFullYear(), today.getMonth(), 0);
  }

  private getMonthBounds(asOfDate: Date): { start: Date; end: Date; monthKey: string } {
    const start = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, 0);
    end.setHours(0, 0, 0, 0);
    return {
      start,
      end,
      monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  private resolveCashHistoryStartDate(
    today: Date,
    frequency: 'daily' | 'weekly' | 'monthly'
  ): Date {
    const defaultBackfillStart = new Date(today);
    defaultBackfillStart.setFullYear(defaultBackfillStart.getFullYear() - 3);
    defaultBackfillStart.setHours(0, 0, 0, 0);

    let targetStart = defaultBackfillStart;
    if (frequency === 'daily' && this.getOperationalSyncMode() === 'INCREMENTAL') {
      targetStart = new Date(today);
      targetStart.setDate(targetStart.getDate() - QuickBooksAdapter.DAILY_INCREMENTAL_LOOKBACK_DAYS);
      targetStart.setHours(0, 0, 0, 0);
    }

    const configuredStart = this.parseStartDateFromSettings();
    if (!configuredStart) return targetStart;
    return configuredStart > targetStart ? configuredStart : targetStart;
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
        `/reports/BalanceSheet?start_date=${this.formatDate(chunkStart)}&end_date=${this.formatDate(chunkEnd)}&summarize_column_by=Days&minorversion=65`
      );
      const report = await response.json();

      const columns: any[] = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
      const dateColumns = columns
        .map((column, index) => ({ column, index }))
        .filter((entry) => entry.index > 0)
        .map((entry) => {
          const parsed = this.extractColumnDate(entry.column);
          if (!parsed) return null;
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

  private async getEntityMasterCount(entity: 'Customer' | 'Vendor'): Promise<number> {
    const rows = await this.runPagedEntityQuery(entity, '');
    return rows.length;
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
        `/reports/AgedReceivables?as_of_date=${dateStr}&aging_period=30&minorversion=65`
      );
      const data = await response.json();
      
      // Parse the report data (QuickBooks returns complex nested structure)
      const rows = data.Rows?.Row || [];
      const totals = this.extractAgingTotals(rows);
      
      return {
        asOfDate: date,
        totalAR: totals.total,
        current: totals.current,
        days1to30: totals.days1to30,
        days31to60: totals.days31to60,
        days61to90: totals.days61to90,
        days90plus: totals.days90plus
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
      const dateStr = date.toISOString().split('T')[0];
      
      // QuickBooks API for AP Aging Summary report
      const response = await this.makeRequest(
        `/reports/AgedPayables?as_of_date=${dateStr}&aging_period=30&minorversion=65`
      );
      const data = await response.json();
      
      const rows = data.Rows?.Row || [];
      const totals = this.extractAgingTotals(rows);
      
      return {
        asOfDate: date,
        totalAP: totals.total,
        current: totals.current,
        days1to30: totals.days1to30,
        days31to60: totals.days31to60,
        days61to90: totals.days61to90,
        days90plus: totals.days90plus
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
      // Query for invoices and sales receipts in the date range.
      // Many QBO companies post direct sales as SalesReceipt instead of Invoice.
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const invoiceQuery = `SELECT * FROM Invoice WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`;
      const salesReceiptQuery = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`;
      const [invoiceResponse, salesReceiptResponse] = await Promise.all([
        this.makeRequest(`/query?query=${encodeURIComponent(invoiceQuery)}`),
        this.makeRequest(`/query?query=${encodeURIComponent(salesReceiptQuery)}`),
      ]);
      const [invoiceData, salesReceiptData] = await Promise.all([
        invoiceResponse.json(),
        salesReceiptResponse.json(),
      ]);

      const invoices = invoiceData.QueryResponse?.Invoice || [];
      const salesReceipts = salesReceiptData.QueryResponse?.SalesReceipt || [];
      const salesDocuments = [...invoices, ...salesReceipts];
      
      // Group by customer
      const customerMap = new Map<string, CustomerSalesData>();
      
      salesDocuments.forEach((saleDoc: any) => {
        const customerId = saleDoc.CustomerRef?.value;
        const customerName = saleDoc.CustomerRef?.name || 'Unknown';
        const amount = saleDoc.TotalAmt || 0;
        
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

  private async getCustomerSalesDailyBuckets(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ snapshotDate: Date; rows: CustomerSalesData[] }>> {
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(endDate);
    const invoiceQuery = `SELECT * FROM Invoice WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`;
    const salesReceiptQuery = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`;
    const [invoiceResponse, salesReceiptResponse] = await Promise.all([
      this.makeRequest(`/query?query=${encodeURIComponent(invoiceQuery)}&minorversion=65`),
      this.makeRequest(`/query?query=${encodeURIComponent(salesReceiptQuery)}&minorversion=65`),
    ]);
    const [invoiceData, salesReceiptData] = await Promise.all([
      invoiceResponse.json(),
      salesReceiptResponse.json(),
    ]);
    const invoices = invoiceData.QueryResponse?.Invoice || [];
    const salesReceipts = salesReceiptData.QueryResponse?.SalesReceipt || [];
    const documents = [...invoices, ...salesReceipts];

    const byDateAndCustomer = new Map<string, Map<string, CustomerSalesData>>();

    for (const invoice of documents) {
      const txnDateRaw = typeof invoice?.TxnDate === 'string' ? invoice.TxnDate : '';
      const txnDate = this.tryParseDateString(txnDateRaw);
      if (!txnDate) continue;
      const dayKey = this.formatDate(txnDate);

      const customerId = String(invoice?.CustomerRef?.value || '');
      const customerName = String(invoice?.CustomerRef?.name || 'Unknown');
      const amount = Number(invoice?.TotalAmt || 0);
      const customerKey = `${customerId}::${customerName}`;

      if (!byDateAndCustomer.has(dayKey)) byDateAndCustomer.set(dayKey, new Map());
      const byCustomer = byDateAndCustomer.get(dayKey)!;
      if (!byCustomer.has(customerKey)) {
        byCustomer.set(customerKey, {
          customerId: customerId || undefined,
          customerName,
          revenue: 0,
          invoiceCount: 0,
          avgInvoiceSize: 0,
          period: txnDate,
        });
      }

      const row = byCustomer.get(customerKey)!;
      row.revenue += amount;
      row.invoiceCount += 1;
    }

    const results: Array<{ snapshotDate: Date; rows: CustomerSalesData[] }> = [];
    const sortedDays = Array.from(byDateAndCustomer.keys()).sort();
    for (const dayKey of sortedDays) {
      const snapshotDate = this.normalizeDay(new Date(`${dayKey}T00:00:00`));
      const rows = Array.from(byDateAndCustomer.get(dayKey)!.values()).map((row) => ({
        ...row,
        avgInvoiceSize: row.invoiceCount > 0 ? row.revenue / row.invoiceCount : 0,
        period: snapshotDate,
      }));
      results.push({ snapshotDate, rows });
    }
    return results;
  }

  private extractQueryRows(responseJson: any, entity: string): any[] {
    const queryResponse = responseJson?.QueryResponse;
    if (!queryResponse || typeof queryResponse !== 'object') return [];
    const direct = queryResponse[entity];
    if (Array.isArray(direct)) return direct;
    if (direct && typeof direct === 'object') return [direct];
    const firstArray = Object.values(queryResponse).find((value) => Array.isArray(value));
    return Array.isArray(firstArray) ? firstArray : [];
  }

  private async runPagedEntityQuery(entity: string, whereClause: string): Promise<any[]> {
    const allRows: any[] = [];
    const pageSize = 1000;
    let startPosition = 1;

    while (true) {
      const query = `SELECT * FROM ${entity} ${whereClause} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const response = await this.makeRequest(`/query?query=${encodeURIComponent(query)}&minorversion=65`);
      const data = await response.json();
      const rows = this.extractQueryRows(data, entity);
      if (!rows.length) break;
      allRows.push(...rows);
      if (rows.length < pageSize) break;
      startPosition += pageSize;
    }

    return allRows;
  }

  private computeAgingBuckets(amountDue: number, dueDate: Date | null, asOfDate: Date) {
    const safeAmount = Math.max(0, Number(amountDue || 0));
    const normalizedAsOf = this.normalizeDay(asOfDate);
    const normalizedDue = dueDate ? this.normalizeDay(dueDate) : null;
    if (!normalizedDue) {
      return { current: safeAmount, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    }

    const dayDiff = Math.floor((normalizedAsOf.getTime() - normalizedDue.getTime()) / (24 * 60 * 60 * 1000));
    if (dayDiff <= 0) return { current: safeAmount, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    if (dayDiff <= 30) return { current: 0, days1to30: safeAmount, days31to60: 0, days61to90: 0, days90plus: 0 };
    if (dayDiff <= 60) return { current: 0, days1to30: 0, days31to60: safeAmount, days61to90: 0, days90plus: 0 };
    if (dayDiff <= 90) return { current: 0, days1to30: 0, days31to60: 0, days61to90: safeAmount, days90plus: 0 };
    return { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: safeAmount };
  }

  private async syncARTransactionFacts(
    startDate: Date,
    asOfDate: Date,
    frequency: 'daily' | 'weekly' | 'monthly',
    options?: { includePayments?: boolean }
  ): Promise<number> {
    const includePayments = options?.includePayments !== false;
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(asOfDate);
    const invoices = await this.runPagedEntityQuery('Invoice', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`);
    const openInvoices = invoices.filter((invoice: any) => Number(invoice?.Balance || 0) > 0);

    await prisma.aROpenInvoiceSnapshot.deleteMany({
      where: { companyId: this.config.companyId, frequency, snapshotDate: asOfDate },
    });

    const openRows = openInvoices.map((invoice: any, index: number) => {
      const amountDueHome = Number(invoice?.Balance || 0);
      const dueDate = this.tryParseDateString(String(invoice?.DueDate || invoice?.TxnDate || ''));
      const buckets = this.computeAgingBuckets(amountDueHome, dueDate, asOfDate);
      return {
        companyId: this.config.companyId,
        snapshotDate: asOfDate,
        frequency,
        customerId: invoice?.CustomerRef?.value ? String(invoice.CustomerRef.value) : null,
        customerName: invoice?.CustomerRef?.name ? String(invoice.CustomerRef.name) : `Unknown Customer ${index + 1}`,
        invoiceNo: String(invoice?.DocNumber || invoice?.Id || `INV-${index + 1}`),
        invoiceDate: this.tryParseDateString(String(invoice?.TxnDate || '')),
        dueDate,
        status: amountDueHome > 0 ? 'OPEN' : 'CLOSED',
        currencyCode: invoice?.CurrencyRef?.value ? String(invoice.CurrencyRef.value) : null,
        amountCurrency: Number(invoice?.TotalAmt || amountDueHome || 0),
        amountHome: Number(invoice?.TotalAmt || amountDueHome || 0),
        amountDueHome,
        current: buckets.current,
        days1to30: buckets.days1to30,
        days31to60: buckets.days31to60,
        days61to90: buckets.days61to90,
        days90plus: buckets.days90plus,
        sourcePlatform: 'QUICKBOOKS',
        sourceProgram: 'QBO_QUERY',
        sourceTransaction: 'INVOICE',
        cono: null,
        divi: null,
      };
    });
    if (openRows.length) {
      await prisma.aROpenInvoiceSnapshot.createMany({ data: openRows });
    }

    if (!includePayments) {
      await prisma.aRPaymentFact.deleteMany({
        where: { companyId: this.config.companyId, paymentDate: { gte: startDate, lte: asOfDate } },
      });
      return openRows.length;
    }

    const [payments, creditMemos, refundReceipts] = await Promise.all([
      this.runPagedEntityQuery('ReceivePayment', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`),
      this.runPagedEntityQuery('CreditMemo', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`),
      this.runPagedEntityQuery('RefundReceipt', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`),
    ]);
    await prisma.aRPaymentFact.deleteMany({
      where: { companyId: this.config.companyId, paymentDate: { gte: startDate, lte: asOfDate } },
    });
    const paymentRows = payments
      .map((payment: any, index: number) => {
        const paymentDate = this.tryParseDateString(String(payment?.TxnDate || ''));
        if (!paymentDate) return null;
        const linked = Array.isArray(payment?.Line)
          ? payment.Line.flatMap((line: any) => (Array.isArray(line?.LinkedTxn) ? line.LinkedTxn : []))
          : [];
        const linkedInvoice = linked.find((tx: any) => String(tx?.TxnType || '').toLowerCase() === 'invoice');
        return {
          companyId: this.config.companyId,
          paymentDate,
          customerId: payment?.CustomerRef?.value ? String(payment.CustomerRef.value) : null,
          customerName: payment?.CustomerRef?.name ? String(payment.CustomerRef.name) : `Unknown Customer ${index + 1}`,
          invoiceNo: linkedInvoice?.TxnId ? String(linkedInvoice.TxnId) : null,
          currencyCode: payment?.CurrencyRef?.value ? String(payment.CurrencyRef.value) : null,
          paidAmountCurrency: Number(payment?.TotalAmt || 0),
          paidAmountHome: Number(payment?.TotalAmt || 0),
          sourcePlatform: 'QUICKBOOKS',
          sourceProgram: 'QBO_QUERY',
          sourceTransaction: 'RECEIVE_PAYMENT',
          cono: null,
          divi: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row) && Number.isFinite(row.paidAmountHome));
    if (paymentRows.length) {
      await prisma.aRPaymentFact.createMany({ data: paymentRows });
    }
    const creditMemoRows = creditMemos
      .map((creditMemo: any, index: number) => {
        const paymentDate = this.tryParseDateString(String(creditMemo?.TxnDate || ''));
        if (!paymentDate) return null;
        const linked = Array.isArray(creditMemo?.Line)
          ? creditMemo.Line.flatMap((line: any) => (Array.isArray(line?.LinkedTxn) ? line.LinkedTxn : []))
          : [];
        const linkedInvoice = linked.find((tx: any) => String(tx?.TxnType || '').toLowerCase() === 'invoice');
        return {
          companyId: this.config.companyId,
          paymentDate,
          customerId: creditMemo?.CustomerRef?.value ? String(creditMemo.CustomerRef.value) : null,
          customerName: creditMemo?.CustomerRef?.name ? String(creditMemo.CustomerRef.name) : `Unknown Customer ${index + 1}`,
          invoiceNo: linkedInvoice?.TxnId ? String(linkedInvoice.TxnId) : null,
          currencyCode: creditMemo?.CurrencyRef?.value ? String(creditMemo.CurrencyRef.value) : null,
          paidAmountCurrency: Number(creditMemo?.TotalAmt || 0),
          paidAmountHome: Number(creditMemo?.TotalAmt || 0),
          sourcePlatform: 'QUICKBOOKS',
          sourceProgram: 'QBO_QUERY',
          sourceTransaction: 'CREDIT_MEMO',
          cono: null,
          divi: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row) && Number.isFinite(row.paidAmountHome));
    if (creditMemoRows.length) {
      await prisma.aRPaymentFact.createMany({ data: creditMemoRows });
    }
    const refundRows = refundReceipts
      .map((refund: any, index: number) => {
        const paymentDate = this.tryParseDateString(String(refund?.TxnDate || ''));
        if (!paymentDate) return null;
        return {
          companyId: this.config.companyId,
          paymentDate,
          customerId: refund?.CustomerRef?.value ? String(refund.CustomerRef.value) : null,
          customerName: refund?.CustomerRef?.name ? String(refund.CustomerRef.name) : `Unknown Customer ${index + 1}`,
          invoiceNo: null,
          currencyCode: refund?.CurrencyRef?.value ? String(refund.CurrencyRef.value) : null,
          paidAmountCurrency: Number(refund?.TotalAmt || 0),
          paidAmountHome: Number(refund?.TotalAmt || 0),
          sourcePlatform: 'QUICKBOOKS',
          sourceProgram: 'QBO_QUERY',
          sourceTransaction: 'REFUND_RECEIPT',
          cono: null,
          divi: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row) && Number.isFinite(row.paidAmountHome));
    if (refundRows.length) {
      await prisma.aRPaymentFact.createMany({ data: refundRows });
    }

    return openRows.length + paymentRows.length + creditMemoRows.length + refundRows.length;
  }

  private async syncAPTransactionFacts(
    startDate: Date,
    asOfDate: Date,
    frequency: 'daily' | 'weekly' | 'monthly',
    options?: { includePayments?: boolean }
  ): Promise<number> {
    const includePayments = options?.includePayments !== false;
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(asOfDate);
    const bills = await this.runPagedEntityQuery('Bill', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`);
    const openBills = bills.filter((bill: any) => Number(bill?.Balance || 0) > 0);

    await (prisma as any).aPOpenBillSnapshot.deleteMany({
      where: { companyId: this.config.companyId, frequency, snapshotDate: asOfDate },
    });

    const openRows = openBills.map((bill: any, index: number) => {
      const amountDueHome = Number(bill?.Balance || 0);
      const dueDate = this.tryParseDateString(String(bill?.DueDate || bill?.TxnDate || ''));
      const buckets = this.computeAgingBuckets(amountDueHome, dueDate, asOfDate);
      return {
        companyId: this.config.companyId,
        snapshotDate: asOfDate,
        frequency,
        vendorId: bill?.VendorRef?.value ? String(bill.VendorRef.value) : null,
        vendorName: bill?.VendorRef?.name ? String(bill.VendorRef.name) : `Unknown Vendor ${index + 1}`,
        billNo: String(bill?.DocNumber || bill?.Id || `BILL-${index + 1}`),
        billDate: this.tryParseDateString(String(bill?.TxnDate || '')),
        dueDate,
        status: amountDueHome > 0 ? 'OPEN' : 'CLOSED',
        currencyCode: bill?.CurrencyRef?.value ? String(bill.CurrencyRef.value) : null,
        amountCurrency: Number(bill?.TotalAmt || amountDueHome || 0),
        amountHome: Number(bill?.TotalAmt || amountDueHome || 0),
        amountDueHome,
        current: buckets.current,
        days1to30: buckets.days1to30,
        days31to60: buckets.days31to60,
        days61to90: buckets.days61to90,
        days90plus: buckets.days90plus,
        sourcePlatform: 'QUICKBOOKS',
        sourceProgram: 'QBO_QUERY',
        sourceTransaction: 'BILL',
        cono: null,
        divi: null,
      };
    });
    if (openRows.length) {
      await (prisma as any).aPOpenBillSnapshot.createMany({ data: openRows });
    }

    if (!includePayments) {
      await (prisma as any).aPPaymentFact.deleteMany({
        where: { companyId: this.config.companyId, paymentDate: { gte: startDate, lte: asOfDate } },
      });
      return openRows.length;
    }

    const [billPayments, vendorCredits] = await Promise.all([
      this.runPagedEntityQuery('BillPayment', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`),
      this.runPagedEntityQuery('VendorCredit', `WHERE TxnDate >= '${startStr}' AND TxnDate <= '${endStr}'`),
    ]);
    await (prisma as any).aPPaymentFact.deleteMany({
      where: { companyId: this.config.companyId, paymentDate: { gte: startDate, lte: asOfDate } },
    });
    const paymentRows = billPayments
      .map((payment: any, index: number) => {
        const paymentDate = this.tryParseDateString(String(payment?.TxnDate || ''));
        if (!paymentDate) return null;
        const linked = Array.isArray(payment?.Line)
          ? payment.Line.flatMap((line: any) => (Array.isArray(line?.LinkedTxn) ? line.LinkedTxn : []))
          : [];
        const linkedBill = linked.find((tx: any) => String(tx?.TxnType || '').toLowerCase() === 'bill');
        const vendorRef = payment?.VendorRef || payment?.PayeeRef;
        return {
          companyId: this.config.companyId,
          paymentDate,
          vendorId: vendorRef?.value ? String(vendorRef.value) : null,
          vendorName: vendorRef?.name ? String(vendorRef.name) : `Unknown Vendor ${index + 1}`,
          billNo: linkedBill?.TxnId ? String(linkedBill.TxnId) : null,
          currencyCode: payment?.CurrencyRef?.value ? String(payment.CurrencyRef.value) : null,
          paidAmountCurrency: Number(payment?.TotalAmt || 0),
          paidAmountHome: Number(payment?.TotalAmt || 0),
          sourcePlatform: 'QUICKBOOKS',
          sourceProgram: 'QBO_QUERY',
          sourceTransaction: 'BILL_PAYMENT',
          cono: null,
          divi: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row) && Number.isFinite(row.paidAmountHome));
    if (paymentRows.length) {
      await (prisma as any).aPPaymentFact.createMany({ data: paymentRows });
    }
    const vendorCreditRows = vendorCredits
      .map((credit: any, index: number) => {
        const paymentDate = this.tryParseDateString(String(credit?.TxnDate || ''));
        if (!paymentDate) return null;
        const linked = Array.isArray(credit?.Line)
          ? credit.Line.flatMap((line: any) => (Array.isArray(line?.LinkedTxn) ? line.LinkedTxn : []))
          : [];
        const linkedBill = linked.find((tx: any) => String(tx?.TxnType || '').toLowerCase() === 'bill');
        return {
          companyId: this.config.companyId,
          paymentDate,
          vendorId: credit?.VendorRef?.value ? String(credit.VendorRef.value) : null,
          vendorName: credit?.VendorRef?.name ? String(credit.VendorRef.name) : `Unknown Vendor ${index + 1}`,
          billNo: linkedBill?.TxnId ? String(linkedBill.TxnId) : null,
          currencyCode: credit?.CurrencyRef?.value ? String(credit.CurrencyRef.value) : null,
          paidAmountCurrency: Number(credit?.TotalAmt || 0),
          paidAmountHome: Number(credit?.TotalAmt || 0),
          sourcePlatform: 'QUICKBOOKS',
          sourceProgram: 'QBO_QUERY',
          sourceTransaction: 'VENDOR_CREDIT',
          cono: null,
          divi: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row) && Number.isFinite(row.paidAmountHome));
    if (vendorCreditRows.length) {
      await (prisma as any).aPPaymentFact.createMany({ data: vendorCreditRows });
    }

    return openRows.length + paymentRows.length + vendorCreditRows.length;
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
    const moduleCounts = {
      cash: 0,
      arAging: 0,
      apAging: 0,
      customers: 0,
      products: 0,
      inventory: 0,
    };
    
    try {
      const asOfDate = this.resolveSyncAnchorDate(frequency);
      const isMonthly = frequency === 'monthly';
      const monthWindow = this.getMonthBounds(asOfDate);
      const detailsStartDate = isMonthly
        ? monthWindow.start
        : this.resolveCashHistoryStartDate(asOfDate, frequency);
      const customersEnabled = this.isProgramEnabled('Customers');
      const vendorsEnabled = this.isProgramEnabled('Vendors');
      const arEnabled = this.isProgramEnabled('AR');
      const arPaymentsEnabled = this.isProgramEnabled('AR Payments');
      const apEnabled = this.isProgramEnabled('AP');
      const apPaymentsEnabled = this.isProgramEnabled('AP Payments');
      const productsEnabled = this.isProgramEnabled('Products');
      let arAgingSaved = false;
      let apAgingSaved = false;
      let arOpenItemRows = 0;
      let apOpenItemRows = 0;
      let customerMasterCount = 0;
      let vendorMasterCount = 0;
      
      // 1. Sync cash balances
      try {
        const cashBalances = await this.getCashBalances();
        if (frequency === 'daily') {
          const startDate = this.resolveCashHistoryStartDate(asOfDate, frequency);
          const cashHistory = await this.getDailyCashHistory(startDate, asOfDate, cashBalances);
          const dates = Array.from(cashHistory.keys()).sort();

          // Replace the full requested daily window so stale trailing days cannot persist.
          await prisma.cashSnapshot.deleteMany({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: {
                gte: startDate,
                lte: asOfDate,
              },
            },
          });

          for (const dayKey of dates) {
            const snapshotDate = this.normalizeDay(new Date(`${dayKey}T00:00:00`));
            const balancesForDay = cashHistory.get(dayKey) || [];
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
            moduleCounts.cash += balancesForDay.length;
          }
        } else {
          await prisma.cashSnapshot.deleteMany({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: asOfDate,
            },
          });
          for (const balance of cashBalances) {
            await prisma.cashSnapshot.create({
              data: {
                companyId: this.config.companyId,
                snapshotDate: asOfDate,
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
            moduleCounts.cash++;
          }
        }
      } catch (error: any) {
        errors.push(`Cash sync failed: ${error.message}`);
      }
      
      // 2. Sync AR Aging
      if (arEnabled) {
        try {
          const arAging = await this.getARAgingReport(asOfDate);
          await prisma.aRAgingSnapshot.upsert({
            where: {
              companyId_snapshotDate_frequency: {
                companyId: this.config.companyId,
                snapshotDate: asOfDate,
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
              snapshotDate: asOfDate,
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
          moduleCounts.arAging++;
          arAgingSaved = true;
        } catch (error: any) {
          errors.push(`AR Aging sync failed: ${error.message}`);
        }
      } else {
        await prisma.aRAgingSnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
      }
      
      // 3. Sync AP Aging
      if (apEnabled) {
        try {
          const apAging = await this.getAPAgingReport(asOfDate);
          await prisma.aPAgingSnapshot.upsert({
            where: {
              companyId_snapshotDate_frequency: {
                companyId: this.config.companyId,
                snapshotDate: asOfDate,
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
              snapshotDate: asOfDate,
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
          moduleCounts.apAging++;
          apAgingSaved = true;
        } catch (error: any) {
          errors.push(`AP Aging sync failed: ${error.message}`);
        }
      } else {
        await prisma.aPAgingSnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
      }

      // 3b. Sync AR/AP transaction-level facts for drilldowns
      if (arEnabled) {
        try {
          const arDetailCount = await this.syncARTransactionFacts(detailsStartDate, asOfDate, frequency, {
            includePayments: arPaymentsEnabled,
          });
          recordsCreated += arDetailCount;
          moduleCounts.arAging += arDetailCount;
          arOpenItemRows = await prisma.aROpenInvoiceSnapshot.count({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: asOfDate,
            },
          });
        } catch (error: any) {
          errors.push(`AR transaction sync failed: ${error.message}`);
        }
      } else {
        await prisma.aROpenInvoiceSnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
        await prisma.aRPaymentFact.deleteMany({
          where: {
            companyId: this.config.companyId,
            paymentDate: { gte: detailsStartDate, lte: asOfDate },
          },
        });
      }
      if (apEnabled) {
        try {
          const apDetailCount = await this.syncAPTransactionFacts(detailsStartDate, asOfDate, frequency, {
            includePayments: apPaymentsEnabled,
          });
          recordsCreated += apDetailCount;
          moduleCounts.apAging += apDetailCount;
          apOpenItemRows = await (prisma as any).aPOpenBillSnapshot.count({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: asOfDate,
            },
          });
        } catch (error: any) {
          errors.push(`AP transaction sync failed: ${error.message}`);
        }
      } else {
        await (prisma as any).aPOpenBillSnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
        await (prisma as any).aPPaymentFact.deleteMany({
          where: {
            companyId: this.config.companyId,
            paymentDate: { gte: detailsStartDate, lte: asOfDate },
          },
        });
      }

      // 3c. Pull customer/vendor dimensions for monthly coverage checks.
      if (isMonthly) {
        if (customersEnabled) {
          try {
            customerMasterCount = await this.getEntityMasterCount('Customer');
          } catch (error: any) {
            errors.push(`Customer master sync failed: ${error.message}`);
          }
        }
        if (vendorsEnabled) {
          try {
            vendorMasterCount = await this.getEntityMasterCount('Vendor');
          } catch (error: any) {
            errors.push(`Vendor master sync failed: ${error.message}`);
          }
        }
      }
      
      // 4. Sync Customer Sales
      if (customersEnabled) {
        try {
        if (frequency === 'daily') {
          const startDate = this.resolveCashHistoryStartDate(asOfDate, frequency);
          const buckets = await this.getCustomerSalesDailyBuckets(startDate, asOfDate);
          for (const bucket of buckets) {
            await prisma.customerSalesSnapshot.deleteMany({
              where: {
                companyId: this.config.companyId,
                frequency,
                snapshotDate: bucket.snapshotDate,
              },
            });
            if (!bucket.rows.length) continue;
            await prisma.customerSalesSnapshot.createMany({
              data: bucket.rows.map((sale) => ({
                companyId: this.config.companyId,
                snapshotDate: bucket.snapshotDate,
                frequency,
                customerId: sale.customerId,
                customerName: sale.customerName,
                revenue: sale.revenue,
                invoiceCount: sale.invoiceCount,
                avgInvoiceSize: sale.avgInvoiceSize,
              })),
            });
            recordsCreated += bucket.rows.length;
            moduleCounts.customers += bucket.rows.length;
          }
        } else {
          const customerSalesWindow = isMonthly
            ? { start: monthWindow.start, end: monthWindow.end }
            : { start: asOfDate, end: asOfDate };
          const customerSales = await this.getCustomerSales(customerSalesWindow.start, customerSalesWindow.end);
          await prisma.customerSalesSnapshot.deleteMany({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: asOfDate,
            },
          });
          if (customerSales.length) {
            await prisma.customerSalesSnapshot.createMany({
              data: customerSales.map((sale) => ({
                companyId: this.config.companyId,
                snapshotDate: asOfDate,
                frequency,
                customerId: sale.customerId,
                customerName: sale.customerName,
                revenue: sale.revenue,
                invoiceCount: sale.invoiceCount,
                avgInvoiceSize: sale.avgInvoiceSize ?? (sale.invoiceCount > 0 ? sale.revenue / sale.invoiceCount : null),
              })),
            });
            recordsCreated += customerSales.length;
            moduleCounts.customers += customerSales.length;
          }
        }
        } catch (error: any) {
          errors.push(`Customer sales sync failed: ${error.message}`);
        }
      } else {
        await prisma.customerSalesSnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
      }
      
      // 5. Sync Product Sales
      if (productsEnabled) {
        try {
          const productSalesWindow = isMonthly
            ? { start: monthWindow.start, end: monthWindow.end }
            : { start: asOfDate, end: asOfDate };
          const productSales = await this.getProductSales(productSalesWindow.start, productSalesWindow.end);
          await prisma.productSalesSnapshot.deleteMany({
            where: {
              companyId: this.config.companyId,
              frequency,
              snapshotDate: asOfDate,
            },
          });
          if (productSales.length) {
            await prisma.productSalesSnapshot.createMany({
              data: productSales.map((product) => ({
                companyId: this.config.companyId,
                snapshotDate: asOfDate,
                frequency,
                itemId: product.itemId,
                itemName: product.itemName,
                sku: product.sku,
                quantitySold: product.quantitySold,
                revenue: product.revenue,
                cogs: product.cogs,
                grossMargin: product.grossMargin,
                grossMarginPct: product.grossMarginPct,
              })),
            });
            recordsCreated += productSales.length;
            moduleCounts.products += productSales.length;
          }
        } catch (error: any) {
          if (this.isOptionalProductSalesError(error)) {
            console.warn('Skipping product sales sync (optional program or QBO permission):', error?.message || error);
          } else {
            errors.push(`Product sales sync failed: ${error.message}`);
          }
        }
      } else {
        console.log('Skipping product sales sync: Products program disabled in QuickBooks Online settings.');
      }
      
      // 6. Sync Inventory
      try {
        const inventory = await this.getInventory();
        await prisma.inventorySnapshot.deleteMany({
          where: {
            companyId: this.config.companyId,
            frequency,
            snapshotDate: asOfDate,
          },
        });
        if (inventory.length) {
          await prisma.inventorySnapshot.createMany({
            data: inventory.map((item) => ({
              companyId: this.config.companyId,
              snapshotDate: asOfDate,
              frequency,
              itemId: item.itemId,
              itemName: item.itemName,
              sku: item.sku,
              qtyOnHand: item.qtyOnHand,
              assetValue: item.assetValue,
              avgCost: item.avgCost,
            })),
          });
          recordsCreated += inventory.length;
          moduleCounts.inventory += inventory.length;
        }
      } catch (error: any) {
        errors.push(`Inventory sync failed: ${error.message}`);
      }

      if (isMonthly) {
        if (arEnabled && !arAgingSaved) errors.push(`Monthly QBO dataset missing: AR aging snapshot (${monthWindow.monthKey}).`);
        if (apEnabled && !apAgingSaved) errors.push(`Monthly QBO dataset missing: AP aging snapshot (${monthWindow.monthKey}).`);
        if (arEnabled && arOpenItemRows <= 0) errors.push(`Monthly QBO dataset missing: AR open-item detail (${monthWindow.monthKey}).`);
        if (apEnabled && apOpenItemRows <= 0) errors.push(`Monthly QBO dataset missing: AP open-item detail (${monthWindow.monthKey}).`);
        if (customersEnabled && customerMasterCount <= 0) errors.push(`Monthly QBO dataset missing: customer master (${monthWindow.monthKey}).`);
        if (vendorsEnabled && vendorMasterCount <= 0) errors.push(`Monthly QBO dataset missing: vendor master (${monthWindow.monthKey}).`);
      }

      if (isMonthly) {
        const existingMetadata =
          this.config.connectionMetadata && typeof this.config.connectionMetadata === 'object' && !Array.isArray(this.config.connectionMetadata)
            ? (this.config.connectionMetadata as Record<string, unknown>)
            : {};
        const monthlyCoverage = {
          month: monthWindow.monthKey,
          asOfDate: asOfDate.toISOString().slice(0, 10),
          required: {
            arAging: !arEnabled ? null : arAgingSaved,
            apAging: !apEnabled ? null : apAgingSaved,
            arOpenItems: !arEnabled ? null : arOpenItemRows > 0,
            apOpenItems: !apEnabled ? null : apOpenItemRows > 0,
            customerMaster: !customersEnabled ? null : customerMasterCount > 0,
            vendorMaster: !vendorsEnabled ? null : vendorMasterCount > 0,
          },
          counts: {
            arOpenItemRows,
            apOpenItemRows,
            customerMasterCount,
            vendorMasterCount,
            customerSalesRows: moduleCounts.customers,
          },
          status: errors.length === 0 ? 'success' : 'error',
          updatedAt: new Date().toISOString(),
        };
        await prisma.accountingConnection.update({
          where: { id: this.config.connectionId },
          data: {
            connectionMetadata: {
              ...existingMetadata,
              quickbooksMonthlyOperationalCoverage: monthlyCoverage,
            } as any,
          },
        });
      }
      
      return {
        success: errors.length === 0,
        recordsCreated,
        moduleCounts,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        success: false,
        recordsCreated,
        moduleCounts,
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

    if (this.tokenExpiresSoon()) {
      await this.refreshAccessToken('expiring soon before API call');
    }

    let tokenRetried = false;
    let rateLimitRetry = 0;

    while (true) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) return response;

      if ((response.status === 401 || response.status === 403) && !tokenRetried) {
        tokenRetried = true;
        await this.refreshAccessToken(`received ${response.status}`);
        continue;
      }

      if (response.status === 429 && rateLimitRetry < QuickBooksAdapter.MAX_RATE_LIMIT_RETRIES) {
        const retryAfterMs = this.parseRetryAfterMs(response.headers.get('retry-after'));
        const fallbackMs = 1000 * Math.pow(2, rateLimitRetry);
        const waitMs = Math.max(retryAfterMs ?? fallbackMs, fallbackMs);
        rateLimitRetry += 1;
        await this.sleep(waitMs);
        continue;
      }

      const body = await response.text().catch(() => '');
      const detail = body ? ` - ${body.slice(0, 500)}` : '';
      throw new Error(`QuickBooks API error: ${response.status} ${response.statusText}${detail}`);
    }
  }

  private isOptionalProductSalesError(error: unknown): boolean {
    const message = String((error as any)?.message || '').toLowerCase();
    return (
      message.includes('salesbyproduct') ||
      message.includes('product') ||
      message.includes('item') ||
      message.includes('sku') ||
      message.includes('does not track') ||
      message.includes('not track') ||
      message.includes('permission denied') ||
      message.includes('insufficient permission') ||
      message.includes('access denied')
    );
  }

}

