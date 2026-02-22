import { NextRequest, NextResponse } from 'next/server';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function isAllowedReadPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Keep this route read-only and limited to M3 API paths.
  return normalized.includes('/M3/') && !normalized.includes('/revoke');
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

    const endpointPath = request.nextUrl.searchParams.get('path');
    if (!endpointPath) {
      return NextResponse.json(
        {
          error: 'Missing required query parameter: path',
          example:
            '/api/infor-m3/probe?path=/APR_PRD/M3/m3api-rest/execute/MNS150MI/GetUserData',
        },
        { status: 400 }
      );
    }

    if (!isAllowedReadPath(endpointPath)) {
      return NextResponse.json(
        {
          error: 'Unsupported path. Only read-only M3 paths are allowed.',
          received: endpointPath,
        },
        { status: 400 }
      );
    }

    const result = await callInforIonApi(credentials, endpointPath, { timeoutMs: 15000 });
    return NextResponse.json(
      {
        ok: result.ok,
        source,
        companyId,
        status: result.status,
        url: result.url,
        token: {
          tokenEndpoint: result.token.tokenEndpoint,
          tokenType: result.token.tokenType,
          expiresIn: result.token.expiresIn,
          scope: result.token.scope,
        },
        data: result.body,
      },
      { status: result.ok ? 200 : result.status }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Infor M3 probe request timed out',
          details: 'No response from Infor endpoint within 15 seconds.',
        },
        { status: 504 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Infor M3 probe failed',
        details: message,
      },
      { status }
    );
  }
}
