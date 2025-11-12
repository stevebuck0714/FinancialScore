import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Debug: Log environment variables
    console.log('🔍 QuickBooks Environment Variables:');
    console.log('QUICKBOOKS_CLIENT_ID:', process.env.QUICKBOOKS_CLIENT_ID ? `${process.env.QUICKBOOKS_CLIENT_ID.substring(0, 10)}...` : 'MISSING');
    console.log('QUICKBOOKS_CLIENT_SECRET:', process.env.QUICKBOOKS_CLIENT_SECRET ? 'SET' : 'MISSING');
    console.log('QUICKBOOKS_ENVIRONMENT:', process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox (default)');
    console.log('QUICKBOOKS_REDIRECT_URI:', process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback (default)');

    // Initialize OAuth client
    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
    });

    // Generate authorization URI
    const authUri = oauthClient.authorizeUri({
      scope: ['com.intuit.quickbooks.accounting'],
      state: companyId, // Pass company ID as state parameter
    });

    return NextResponse.json({ authUri });
  } catch (error) {
    console.error('QuickBooks auth error:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}


