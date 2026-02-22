import { NextRequest, NextResponse } from 'next/server';
import { requestInforM3AccessToken } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function redact(value: string | undefined): string {
  if (!value) return 'MISSING';
  if (value.length <= 8) return 'SET';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireAuthorizedInforCompany(request);

    const { credentials, source } = await getInforM3CredentialsWithOptionalEnvFallback(companyId);
    if (!credentials) {
      return NextResponse.json(
        {
          error: 'Infor M3 credentials not configured for this company.',
          companyId,
          hint: 'Use POST /api/infor-m3/connect to save per-company credentials.',
        },
        { status: 404 }
      );
    }

    const tokenResult = await requestInforM3AccessToken(credentials, 12000);
    if (!tokenResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          source,
          companyId,
          tokenEndpoint: tokenResult.tokenEndpoint,
          request: {
            grantType: 'password',
            clientId: redact(credentials.clientId),
            username: redact(credentials.serviceAccountAccessKey),
          },
          response: {
            status: tokenResult.status,
            error: tokenResult.error,
            errorDescription: tokenResult.errorDescription,
          },
        },
        { status: tokenResult.status }
      );
    }

    return NextResponse.json({
      ok: true,
      source,
      companyId,
      tokenEndpoint: tokenResult.tokenEndpoint,
      request: {
        grantType: 'password',
        clientId: redact(credentials.clientId),
        username: redact(credentials.serviceAccountAccessKey),
      },
      response: {
        status: 200,
        tokenType: tokenResult.tokenType,
        expiresIn: tokenResult.expiresIn,
        scope: tokenResult.scope,
        accessTokenPreview: redact(tokenResult.accessToken),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Infor M3 token request timed out',
          details: 'No response from Infor SSO token endpoint within 12 seconds.',
        },
        { status: 504 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Infor M3 token test failed',
        details: message,
      },
      { status }
    );
  }
}
