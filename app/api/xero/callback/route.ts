import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.url;
    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state'); // This is the companyId

    // Check for OAuth errors first
    const error = searchParams.get('error');
    if (error) {
      console.error('❌ Xero OAuth error:', error);
      const errorDescription = searchParams.get('error_description');
      console.error('   Description:', errorDescription);
      return NextResponse.redirect(
        new URL(`/?view=admin&tab=api-connections&error=xero_auth_denied&details=${encodeURIComponent(errorDescription || error)}`, request.url)
      );
    }
    
    const code = searchParams.get('code');

    if (!state || !code) {
      return NextResponse.redirect(
        new URL('/?view=admin&tab=api-connections&error=oauth_failed', request.url)
      );
    }

    const companyId = state;

    // Parse scopes from environment
    const scopes = process.env.XERO_SCOPES?.split(' ') || [
      'accounting.transactions.read',
      'accounting.reports.read',
      'accounting.contacts.read',
      'accounting.settings.read',
      'offline_access',
    ];

    // Initialize Xero client with state to match the auth request
    const xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID || '',
      clientSecret: process.env.XERO_CLIENT_SECRET || '',
      redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'],
      scopes: scopes,
      state: companyId, // Must match the state from auth request
    });

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging authorization code for tokens...');
    console.log('   Expected state:', companyId);
    console.log('   Callback URL:', url);
    const tokenSet = await xeroClient.apiCallback(url);
    
    console.log('✅ Received new tokens from Xero');
    console.log('   Access token length:', tokenSet.access_token?.length);
    console.log('   Refresh token length:', tokenSet.refresh_token?.length);
    console.log('   Expires in:', tokenSet.expires_in, 'seconds');

    // Set token on client to get tenant information
    xeroClient.setTokenSet(tokenSet);
    
    // Get tenant/organization information
    console.log('🔄 Fetching Xero tenant information...');
    const tenants = await xeroClient.updateTenants(false);
    
    if (!tenants || tenants.length === 0) {
      console.error('❌ No Xero organizations found');
      return NextResponse.redirect(
        new URL('/?view=admin&tab=api-connections&error=no_xero_org', request.url)
      );
    }

    // Use the first tenant (organization)
    const tenant = tenants[0];
    console.log('✅ Connected to Xero organization:', tenant.tenantName);
    console.log('   Tenant ID:', tenant.tenantId);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptOAuthToken(tokenSet.access_token);
    const encryptedRefreshToken = encryptOAuthToken(tokenSet.refresh_token);

    // Calculate token expiration (Xero tokens expire in 30 minutes)
    const expiresIn = tokenSet.expires_in || 1800; // Default 30 minutes
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    
    console.log('💾 Storing tokens in database, will expire at:', tokenExpiresAt.toISOString());

    // Store or update connection in database
    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'XERO',
        },
      },
      create: {
        companyId,
        platform: 'XERO',
        status: 'ACTIVE',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        tenantId: tenant.tenantId,
        connectionMetadata: {
          tenantName: tenant.tenantName,
          tenantType: tenant.tenantType,
          connectedAt: new Date().toISOString(),
        },
      },
      update: {
        status: 'ACTIVE',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        tenantId: tenant.tenantId,
        connectionMetadata: {
          tenantName: tenant.tenantName,
          tenantType: tenant.tenantType,
          reconnectedAt: new Date().toISOString(),
        },
        errorMessage: null,
      },
    });

    console.log('✅ Xero connection stored successfully');

    // Redirect to API Connections tab with success message
    return NextResponse.redirect(
      new URL('/?view=admin&tab=api-connections&success=xero_connected', request.url)
    );
  } catch (error) {
    console.error('Xero callback error:', error);
    return NextResponse.redirect(
      new URL('/?view=admin&tab=api-connections&error=xero_connection_failed', request.url)
    );
  }
}

