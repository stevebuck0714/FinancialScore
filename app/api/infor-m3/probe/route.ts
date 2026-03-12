import { NextRequest, NextResponse } from 'next/server';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function isAllowedReadPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const lower = normalized.toLowerCase();
  const isAllowedReadSurface =
    lower.includes('/m3/') ||
    lower.includes('/csi/') ||
    lower.includes('/idorequestservice/') ||
    lower.includes('/ido/');
  // Keep this route read-only and block obvious token/write endpoints.
  const hasBlockedTokenOrWriteHints =
    lower.includes('/revoke') ||
    lower.includes('oauth') ||
    lower.includes('token.oauth2') ||
    lower.includes('/update') ||
    lower.includes('/delete') ||
    lower.includes('/remove') ||
    lower.includes('/create') ||
    lower.includes('/insert');
  return isAllowedReadSurface && !hasBlockedTokenOrWriteHints;
}

function summarizeProbeBody(body: Record<string, unknown> | string): string {
  if (typeof body === 'string') {
    return body.slice(0, 600);
  }
  try {
    return JSON.stringify(body).slice(0, 600);
  } catch {
    return 'Unable to serialize probe response body.';
  }
}

function withTenantPrefixIfNeeded(path: string, tenantId: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const lower = normalized.toLowerCase();
  const tenantPrefix = `/${String(tenantId || '').trim().toLowerCase()}/`;
  const isCsiOrIdoPath =
    lower.includes('/idorequestservice/') || lower.includes('/ido/') || lower.includes('/csi/');
  const alreadyTenantScoped = tenantPrefix.length > 2 && lower.includes(tenantPrefix);
  if (!isCsiOrIdoPath || alreadyTenantScoped) {
    return normalized;
  }
  const cleanTenant = String(tenantId || '').trim().replace(/^\/+|\/+$/g, '');
  if (!cleanTenant) return normalized;
  return `/${cleanTenant}${normalized}`;
}

function withCsiProxyBasePathIfNeeded(path: string, csiProxyBasePath?: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const lower = normalized.toLowerCase();
  const isCsiOrIdoPath = lower.includes('/idorequestservice/') || lower.includes('/ido/') || lower.includes('/csi/');
  if (!isCsiOrIdoPath) return normalized;

  const cleanProxyBase = String(csiProxyBasePath || '').trim().replace(/^\/+|\/+$/g, '');
  if (!cleanProxyBase) return normalized;
  const proxySegment = `/${cleanProxyBase.toLowerCase()}/`;
  if (lower.includes(proxySegment)) return normalized;

  return `/${cleanProxyBase}${normalized}`;
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);

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
          csiExample:
            '/api/infor-m3/probe?path=/IDORequestService/ido/load/Customers',
        },
        { status: 400 }
      );
    }

    if (!isAllowedReadPath(endpointPath)) {
      return NextResponse.json(
        {
          error: 'Unsupported path. Only read-only Infor paths are allowed (M3/CSI/IDO).',
          received: endpointPath,
        },
        { status: 400 }
      );
    }

    const proxyResolvedPath = withCsiProxyBasePathIfNeeded(endpointPath, credentials.csiProxyBasePath);
    const normalizedPath = withTenantPrefixIfNeeded(proxyResolvedPath, credentials.tenantId);
    const result = await callInforIonApi(credentials, normalizedPath, { timeoutMs: 15000 });
    return NextResponse.json(
      {
        ok: result.ok,
        source,
        companyId,
        status: result.status,
        url: result.url,
        requestedPath: endpointPath,
        resolvedPath: normalizedPath,
        token: {
          tokenEndpoint: result.token.tokenEndpoint,
          tokenType: result.token.tokenType,
          expiresIn: result.token.expiresIn,
          scope: result.token.scope,
        },
        error: result.ok ? null : 'Infor probe request returned a non-success response.',
        details: result.ok
          ? null
          : `Downstream status ${result.status} from ${result.url}. Body: ${summarizeProbeBody(result.body)}`,
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
