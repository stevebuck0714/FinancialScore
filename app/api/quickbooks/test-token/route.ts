import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

// Decrypt OAuth tokens
function decryptToken(encryptedToken: string): string {
  const key = process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Get connection from database
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
    });

    if (!connection || !connection.accessToken || !connection.refreshToken) {
      return NextResponse.json({ 
        error: 'QuickBooks not connected',
        connected: false 
      }, { status: 400 });
    }

    console.log('\n🧪 QUICKBOOKS TOKEN TEST');
    console.log('========================');
    
    // Decrypt tokens
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.accessToken);
      console.log('✅ Token decryption: SUCCESS');
      console.log('   Access token length:', accessToken.length);
      console.log('   Access token (first 30 chars):', accessToken.substring(0, 30) + '...');
    } catch (err) {
      console.error('❌ Token decryption: FAILED', err);
      return NextResponse.json({
        error: 'Token decryption failed',
        needsReconnect: true
      }, { status: 401 });
    }

    // Check expiration
    const now = new Date();
    const expired = connection.tokenExpiresAt && connection.tokenExpiresAt < now;
    const timeUntilExpiry = connection.tokenExpiresAt 
      ? connection.tokenExpiresAt.getTime() - now.getTime()
      : null;
    
    console.log('⏰ Token expiration:');
    console.log('   Current time:', now.toISOString());
    console.log('   Expires at:', connection.tokenExpiresAt?.toISOString() || 'Not set');
    console.log('   Time until expiry:', timeUntilExpiry ? Math.round(timeUntilExpiry / 1000 / 60) + ' minutes' : 'Unknown');
    console.log('   Status:', expired ? '❌ EXPIRED' : '✅ VALID');

    // Test the token with a simple API call
    const baseUrl = (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';
    
    const testUrl = `${baseUrl}/v3/company/${connection.realmId}/companyinfo/${connection.realmId}`;
    
    console.log('🔍 Testing token with QuickBooks API...');
    console.log('   URL:', testUrl);
    
    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const tokenWorks = testResponse.ok;
    
    console.log('📡 API Response:', testResponse.status, testResponse.statusText);
    
    if (!tokenWorks) {
      const errorBody = await testResponse.text();
      console.error('❌ Token test FAILED');
      console.error('   Response:', errorBody);
    } else {
      console.log('✅ Token test PASSED - token is working!');
    }
    
    console.log('========================\n');

    return NextResponse.json({
      connected: true,
      tokenDecryption: 'success',
      tokenExpired: expired,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString(),
      timeUntilExpiry: timeUntilExpiry ? Math.round(timeUntilExpiry / 1000 / 60) + ' minutes' : null,
      tokenWorksWithAPI: tokenWorks,
      apiResponseStatus: testResponse.status,
      realmId: connection.realmId,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
    });

  } catch (error: any) {
    console.error('❌ Token test error:', error);
    return NextResponse.json({
      error: 'Token test failed',
      details: error.message
    }, { status: 500 });
  }
}




















