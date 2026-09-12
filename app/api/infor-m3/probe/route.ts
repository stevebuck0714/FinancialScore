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

function inforPropertyNames(body: unknown): string[] {
  const payload = asRecord(body);
  const properties = Array.isArray(payload.Properties) ? payload.Properties : [];
  return properties
    .map((property) => String(asRecord(property).Name || '').trim())
    .filter(Boolean)
    .sort();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function idoNameFromPath(path: string): string {
  const match = /\/ido\/(?:load|info)\/([A-Za-z0-9_]+)/i.exec(path);
  return match ? match[1] : '';
}

function configuredIdoMongooseConfig(metadata: unknown, idoName: string): string {
  const source = asRecord(metadata);
  const programSets: unknown[] = [
    source.accountingPrograms,
    ...Object.values(asRecord(source.accountingProgramsBySystem)),
  ];
  for (const programSet of programSets) {
    if (!Array.isArray(programSet)) continue;
    const program = programSet
      .map(asRecord)
      .find((item) => String(item.miProgram || '').trim().toUpperCase() === idoName.toUpperCase());
    if (!program) continue;
    const config = String(
      program.mongooseConfig ??
      program.mongoose_configuration ??
      program.mongooseConfiguration ??
      program.configName ??
      ''
    ).trim();
    if (config) return config;
  }
  return '';
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

    const discoverIdoName =
      request.nextUrl.searchParams.get('mode') === 'slcustomers-fields'
        ? 'SLCustomers'
        : request.nextUrl.searchParams.get('mode') === 'slitems-fields'
        ? 'SLItems'
        : '';
    const endpointPath = discoverIdoName
      ? `/APR_PRD/CSI/IDORequestService/ido/info/${discoverIdoName}`
      : request.nextUrl.searchParams.get('path');
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

    // CSI rejects any IDO request without a Mongoose configuration header, so resolve it
    // for explicit paths too rather than only for the discovery modes.
    const requestedIdoName = discoverIdoName || idoNameFromPath(endpointPath);
    const connection = requestedIdoName
      ? await prisma.accountingConnection.findUnique({
          where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
          select: { connectionMetadata: true },
        })
      : null;
    const mongooseConfig = requestedIdoName
      ? configuredIdoMongooseConfig(connection?.connectionMetadata, requestedIdoName)
      : '';
    if (discoverIdoName && !mongooseConfig) {
      return NextResponse.json(
        { error: `${discoverIdoName} Mongoose configuration is not configured for this company.` },
        { status: 400 }
      );
    }

    const result = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 15000,
      headers: {
        ...(requestedSite ? { 'X-Infor-Site': requestedSite } : {}),
        ...(mongooseConfig ? { 'X-Infor-MongooseConfig': mongooseConfig } : {}),
      },
    });
    const inforPayload = asRecord(result.body);
    const inforSuccess = inforPayload.Success !== false;
    const inforMessage = String(inforPayload.Message || '').trim() || null;
    const fields = discoverIdoName ? inforPropertyNames(result.body) : [];
    return NextResponse.json(
      {
        ok: result.ok && inforSuccess,
        source,
        companyId,
        site: requestedSite || null,
        status: result.ok && inforSuccess ? result.status : 502,
        url: result.url,
        token: {
          tokenEndpoint: result.token.tokenEndpoint,
          tokenType: result.token.tokenType,
          expiresIn: result.token.expiresIn,
          scope: result.token.scope,
        },
        ...(discoverIdoName
          ? {
              ido: discoverIdoName,
              fields,
              recordFound: fields.length > 0,
              mongooseConfigApplied: Boolean(mongooseConfig),
              inforSuccess,
              inforMessage,
            }
          : { data: result.body }),
      },
      { status: result.ok && inforSuccess ? 200 : 502 }
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
