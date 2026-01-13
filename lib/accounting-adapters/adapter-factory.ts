import { AccountingAdapter, AdapterConfig } from './types';
import { QuickBooksAdapter } from './quickbooks-adapter';
import { XeroAdapter } from './xero-adapter';
import prisma from '@/lib/prisma';
import { AccountingPlatform } from '@prisma/client';

/**
 * Factory for creating platform-specific accounting adapters
 */
export class AdapterFactory {
  /**
   * Create an adapter for a specific accounting connection
   */
  static async createFromConnection(connectionId: string): Promise<AccountingAdapter> {
    // Fetch the connection from database
    const connection = await prisma.accountingConnection.findUnique({
      where: { id: connectionId },
      include: { company: true }
    });
    
    if (!connection) {
      throw new Error(`Accounting connection not found: ${connectionId}`);
    }
    
    if (!connection.accessToken) {
      throw new Error(`Connection ${connectionId} has no access token`);
    }
    
    // Build adapter config
    const config: AdapterConfig = {
      companyId: connection.companyId,
      connectionId: connection.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken || undefined,
      realmId: connection.realmId || undefined,
      tenantId: connection.tenantId || undefined,
      organizationId: connection.organizationId || undefined
    };
    
    // Return platform-specific adapter
    return this.createAdapter(connection.platform, config);
  }
  
  /**
   * Create an adapter for a specific company's active connection
   */
  static async createForCompany(companyId: string): Promise<AccountingAdapter> {
    // Find the active accounting connection for this company
    const connection = await prisma.accountingConnection.findFirst({
      where: {
        companyId,
        status: 'ACTIVE'
      },
      include: { company: true }
    });
    
    if (!connection) {
      throw new Error(`No active accounting connection found for company: ${companyId}`);
    }
    
    return this.createFromConnection(connection.id);
  }
  
  /**
   * Create adapter based on platform type
   */
  private static createAdapter(platform: AccountingPlatform, config: AdapterConfig): AccountingAdapter {
    switch (platform) {
      case 'QUICKBOOKS':
        return new QuickBooksAdapter(config);
      
      case 'XERO':
        return new XeroAdapter(config);
      
      case 'SAGE':
        // TODO: Implement SageAdapter
        throw new Error('Sage adapter not yet implemented');
      
      case 'NETSUITE':
        // TODO: Implement NetSuiteAdapter
        throw new Error('NetSuite adapter not yet implemented');
      
      case 'DYNAMICS365':
        // TODO: Implement Dynamics365Adapter
        throw new Error('Dynamics365 adapter not yet implemented');
      
      default:
        throw new Error(`Unsupported accounting platform: ${platform}`);
    }
  }
  
  /**
   * Get all companies that have active connections and auto-sync enabled
   */
  static async getCompaniesForAutoSync(): Promise<string[]> {
    const connections = await prisma.accountingConnection.findMany({
      where: {
        status: 'ACTIVE',
        autoSync: true
      },
      select: {
        companyId: true
      },
      distinct: ['companyId']
    });
    
    return connections.map(c => c.companyId);
  }
}

