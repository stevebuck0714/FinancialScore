import { NextRequest, NextResponse } from 'next/server';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isAllowedReadPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const lowered = normalized.toLowerCase();
  // Keep this route read-only and limited to known accounting API read paths.
  const isReadScope =
    lowered.includes('/m3/') ||
    lowered.includes('/idorequestservice/') ||
    lowered.includes('/ionapi/metadata/');
  const isBlocked =
    lowered.includes('/revoke') ||
    lowered.includes('token.oauth2') ||
    lowered.includes('authorization.oauth2');
  return isReadScope && !isBlocked;
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
    const requestedSite = String(request.nextUrl.searchParams.get('site') || '').trim();
    if (!endpointPath) {
      return NextResponse.json(
        {
          error: 'Missing required query parameter: path',
          example:
            '/api/infor-m3/probe?site=MAIN&path=/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=1',
        },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (inforSystem === 'INFOR_CSI' && !requestedSite) {
      return NextResponse.json(
        {
          error: 'Missing required query parameter: site',
          hint: 'CSI probe requires a site value from the accounting program configuration.',
        },
        { status: 400 }
      );
    }

    if (!isAllowedReadPath(endpointPath)) {
      return NextResponse.json(
        {
          error: 'Unsupported path. Only read-only M3/CSI API paths are allowed.',
          received: endpointPath,
        },
        { status: 400 }
      );
    }

    const result = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 15000,
      headers: requestedSite ? { 'X-Infor-Site': requestedSite } : undefined,
    });
    return NextResponse.json(
      {
        ok: result.ok,
        source,
        companyId,
        site: requestedSite || null,
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
