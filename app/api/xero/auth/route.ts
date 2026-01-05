import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Debug: Log environment variables
    console.log('🔍 Xero Environment Variables:');
    console.log('XERO_CLIENT_ID:', process.env.XERO_CLIENT_ID ? `${process.env.XERO_CLIENT_ID.substring(0, 10)}...` : 'MISSING');
    console.log('XERO_CLIENT_SECRET:', process.env.XERO_CLIENT_SECRET ? 'SET' : 'MISSING');
    console.log('XERO_REDIRECT_URI:', process.env.XERO_REDIRECT_URI || 'MISSING');

    // Parse scopes from environment
    const scopes = process.env.XERO_SCOPES?.split(' ') || [
      'accounting.transactions.read',
      'accounting.reports.read',
      'accounting.contacts.read',
      'accounting.settings.read',
      'offline_access',
    ];

    // Initialize Xero client
    const xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID || '',
      clientSecret: process.env.XERO_CLIENT_SECRET || '',
      redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'],
      scopes: scopes,
      state: companyId, // Pass company ID as state parameter
    });

    // Generate authorization URL
    const authUrl = await xeroClient.buildConsentUrl();

    console.log('✅ Generated Xero authorization URL');
    
    return NextResponse.json({ authUri: authUrl });
  } catch (error) {
    console.error('Xero auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}




