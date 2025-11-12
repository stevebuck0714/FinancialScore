import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

// Encryption for OAuth tokens using modern cipher
function encryptToken(token: string): string {
  const key = process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  // Create a 32-byte key from the encryption key
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  // Generate a random IV
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Prepend IV to encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This is the companyId
    const realmId = searchParams.get('realmId'); // QuickBooks company ID

    if (!code || !state || !realmId) {
      return NextResponse.redirect(
        new URL('/dashboard?error=oauth_failed', request.url)
      );
    }

    const companyId = state;

    // Initialize OAuth client
    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
    });

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging authorization code for tokens...');
    const authResponse = await oauthClient.createToken(request.url);
    const token = authResponse.getJson();
    
    console.log('✅ Received new tokens from QuickBooks');
    console.log('   Access token length:', token.access_token?.length);
    console.log('   Refresh token length:', token.refresh_token?.length);
    console.log('   Expires in:', token.expires_in, 'seconds');
    console.log('   Realm ID:', realmId);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(token.access_token);
    const encryptedRefreshToken = encryptToken(token.refresh_token);

    // Calculate token expiration
    const expiresIn = token.expires_in || 3600; // Default 1 hour
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    
    console.log('💾 Storing tokens in database, will expire at:', tokenExpiresAt.toISOString());

    // Store connection in database
    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      update: {
        status: 'ACTIVE',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        realmId,
        platformVersion: 'v3',
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'QUICKBOOKS',
        status: 'ACTIVE',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt,
        realmId,
        platformVersion: 'v3',
        autoSync: false,
        syncFrequency: 'manual',
      },
    });

    // Redirect back to admin dashboard API Connections tab with success message
    return NextResponse.redirect(
      new URL(`/?view=admin&tab=api-connections&success=quickbooks_connected`, request.url)
    );
  } catch (error: any) {
    console.error('QuickBooks callback error:', error);
    
    // Try to save error to database if we have companyId
    const searchParams = request.nextUrl.searchParams;
    const state = searchParams.get('state');
    
    if (state) {
      try {
        await prisma.accountingConnection.upsert({
          where: {
            companyId_platform: {
              companyId: state,
              platform: 'QUICKBOOKS',
            },
          },
          update: {
            status: 'ERROR',
            errorMessage: error.message || 'OAuth callback failed',
          },
          create: {
            companyId: state,
            platform: 'QUICKBOOKS',
            status: 'ERROR',
            errorMessage: error.message || 'OAuth callback failed',
            autoSync: false,
            syncFrequency: 'manual',
          },
        });
      } catch (dbError) {
        console.error('Failed to save error to database:', dbError);
      }
    }
    
    return NextResponse.redirect(
      new URL('/?view=admin&tab=api-connections&error=quickbooks_connection_failed', request.url)
    );
  }
}

