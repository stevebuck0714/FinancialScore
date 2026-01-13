import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { XeroClient } from 'xero-node';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Find Xero connection
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'XERO',
        },
      },
    });

    if (!connection) {
      return NextResponse.json({ error: 'No Xero connection found' }, { status: 404 });
    }

    // Try to revoke the connection with Xero (optional, connection will still be deleted locally)
    try {
      const accessToken = decryptOAuthToken(connection.accessToken || '');
      const refreshToken = decryptOAuthToken(connection.refreshToken || '');

      const scopes = process.env.XERO_SCOPES?.split(' ') || [
        'accounting.transactions.read',
        'accounting.reports.read',
        'accounting.contacts.read',
        'accounting.settings.read',
        'offline_access',
      ];

      const xeroClient = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID || '',
        clientSecret: process.env.XERO_CLIENT_SECRET || '',
        redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'],
        scopes: scopes,
      });

      xeroClient.setTokenSet({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 1800,
        token_type: 'Bearer',
      });

      // Disconnect from Xero
      if (connection.tenantId) {
        await xeroClient.disconnect(connection.tenantId);
        console.log('✅ Disconnected from Xero tenant:', connection.tenantId);
      }
    } catch (revokeError) {
      console.warn('⚠️ Could not revoke Xero connection (will delete locally):', revokeError);
    }

    // Delete connection from database
    await prisma.accountingConnection.delete({
      where: {
        companyId_platform: {
          companyId,
          platform: 'XERO',
        },
      },
    });

    console.log('✅ Xero connection deleted from database');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Xero:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Xero' },
      { status: 500 }
    );
  }
}

