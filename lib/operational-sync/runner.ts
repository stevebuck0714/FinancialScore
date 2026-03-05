import prisma from '@/lib/prisma';
import { AdapterFactory } from '@/lib/accounting-adapters';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import { syncQuickBooksDesktopOperationalPayload, type QbDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';
import { syncDynamicsOperationalPayload, type DynamicsOperationalPayload } from '@/lib/dynamics-365/operational-sync';
import { syncAcumaticaOperationalPayload, type AcumaticaOperationalPayload } from '@/lib/acumatica/operational-sync';
import { syncOdooOperationalPayload, type OdooOperationalPayload } from '@/lib/odoo/operational-sync';
import { syncSageIntacctOperationalPayload, type SageIntacctOperationalPayload } from '@/lib/sage-intacct/operational-sync';
import type { AccountingConnection, AccountingPlatform } from '@prisma/client';

export type SyncFrequency = 'daily' | 'weekly' | 'monthly';

export type OperationalSyncResult = {
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
  errors: string[];
};

function normalizeFrequency(value: unknown): SyncFrequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function normalizeErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

async function pruneCompanyOperationalData(companyId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);

  await Promise.all([
    prisma.cashSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aRAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.aPAgingSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.customerSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.productSalesSnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
    prisma.inventorySnapshot.deleteMany({ where: { companyId, snapshotDate: { lt: cutoff } } }),
  ]);
}

function notImplementedResult(platform: AccountingPlatform): OperationalSyncResult {
  const message = `${platform} operational sync is not implemented yet for live API pulls.`;
  return { success: false, recordsCreated: 0, errors: [message] };
}

export async function runOperationalSyncForConnection(
  connection: Pick<AccountingConnection, 'id' | 'companyId' | 'platform' | 'accessToken' | 'connectionMetadata'>,
  frequencyInput: unknown
): Promise<OperationalSyncResult> {
  const frequency = normalizeFrequency(frequencyInput);

  if (connection.platform === 'INFOR_M3') {
    const result = await syncInforM3OperationalData(connection.companyId, frequency);
    await pruneCompanyOperationalData(connection.companyId);
    return {
      success: result.success,
      recordsCreated: result.recordsCreated,
      moduleCounts: result.moduleCounts,
      errors: normalizeErrors(result.errors),
    };
  }

  if (connection.platform === 'QUICKBOOKS') {
    if (!connection.accessToken) {
      const metadata =
        connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      const payload =
        metadata.quickbooksDesktopOperationalPayload && typeof metadata.quickbooksDesktopOperationalPayload === 'object'
          ? (metadata.quickbooksDesktopOperationalPayload as QbDesktopOperationalPayload)
          : null;
      if (!payload) {
        return {
          success: false,
          recordsCreated: 0,
          errors: [
            'No token-based QuickBooks connection or QB Desktop operational payload is available yet.',
          ],
        };
      }
      return syncQuickBooksDesktopOperationalPayload(connection.companyId, frequency, payload);
    }
    const adapter = await AdapterFactory.createFromConnection(connection.id);
    let isConnected = false;
    try {
      isConnected = await adapter.testConnection();
    } catch (error: any) {
      const message = error?.message || 'Connection test failed';
      return { success: false, recordsCreated: 0, errors: [message] };
    }
    if (!isConnected) {
      return { success: false, recordsCreated: 0, errors: ['Connection test failed.'] };
    }
    const result = await adapter.syncAll(frequency);
    await pruneCompanyOperationalData(connection.companyId);
    return {
      success: result.success,
      recordsCreated: result.recordsCreated,
      errors: normalizeErrors(result.errors),
    };
  }

  if (connection.platform === 'DYNAMICS365') {
    const metadata =
      connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const payload =
      metadata.dynamicsOperationalPayload && typeof metadata.dynamicsOperationalPayload === 'object'
        ? (metadata.dynamicsOperationalPayload as DynamicsOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Dynamics operational payload is available yet.'],
      };
    }
    return syncDynamicsOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'ACUMATICA') {
    const metadata =
      connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const payload =
      metadata.acumaticaOperationalPayload && typeof metadata.acumaticaOperationalPayload === 'object'
        ? (metadata.acumaticaOperationalPayload as AcumaticaOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Acumatica operational payload is available yet.'],
      };
    }
    return syncAcumaticaOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'ODOO') {
    const metadata =
      connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const payload =
      metadata.odooOperationalPayload && typeof metadata.odooOperationalPayload === 'object'
        ? (metadata.odooOperationalPayload as OdooOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Odoo operational payload is available yet.'],
      };
    }
    return syncOdooOperationalPayload(connection.companyId, frequency, payload);
  }

  if (connection.platform === 'SAGE_INTACCT') {
    const metadata =
      connection.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};
    const payload =
      metadata.sageIntacctOperationalPayload && typeof metadata.sageIntacctOperationalPayload === 'object'
        ? (metadata.sageIntacctOperationalPayload as SageIntacctOperationalPayload)
        : null;
    if (!payload) {
      return {
        success: false,
        recordsCreated: 0,
        errors: ['No Sage Intacct operational payload is available yet.'],
      };
    }
    return syncSageIntacctOperationalPayload(connection.companyId, frequency, payload);
  }

  return notImplementedResult(connection.platform);
}

export async function runOperationalSyncForCompany(
  companyId: string,
  platform: AccountingPlatform,
  frequencyInput: unknown
): Promise<OperationalSyncResult> {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform,
      },
    },
    select: {
      id: true,
      companyId: true,
      platform: true,
      accessToken: true,
      connectionMetadata: true,
    },
  });

  if (!connection) {
    return {
      success: false,
      recordsCreated: 0,
      errors: [`No ${platform} connection found for this company.`],
    };
  }

  return runOperationalSyncForConnection(connection, frequencyInput);
}
