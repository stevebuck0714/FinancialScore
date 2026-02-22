import { NextRequest, NextResponse } from 'next/server';
import { requestInforM3AccessToken } from '@/lib/infor-m3/client';
import {
  type InforM3Credentials,
  getInforM3CredentialsFromEnv,
  saveInforM3CredentialsForCompany,
} from '@/lib/infor-m3/credentials';
import { requireAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function redact(value: string | undefined): string {
  if (!value) return 'MISSING';
  if (value.length <= 8) return 'SET';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBodyCredentials(body: Record<string, unknown>): Partial<InforM3Credentials> {
  const parsed: Partial<InforM3Credentials> = {};
  const tenantId = normalizeString(body.tenantId);
  const clientName = normalizeString(body.clientName);
  const clientId = normalizeString(body.clientId);
  const clientSecret = normalizeString(body.clientSecret);
  const ionApiBaseUrl = normalizeString(body.ionApiBaseUrl);
  const ssoBaseUrl = normalizeString(body.ssoBaseUrl);
  const oauthAuthPath = normalizeString(body.oauthAuthPath);
  const oauthTokenPath = normalizeString(body.oauthTokenPath);
  const oauthRevokePath = normalizeString(body.oauthRevokePath);
  const serviceAccountAccessKey = normalizeString(body.serviceAccountAccessKey);
  const serviceAccountSecretKey = normalizeString(body.serviceAccountSecretKey);

  if (tenantId) parsed.tenantId = tenantId;
  if (clientName) parsed.clientName = clientName;
  if (clientId) parsed.clientId = clientId;
  if (clientSecret) parsed.clientSecret = clientSecret;
  if (ionApiBaseUrl) parsed.ionApiBaseUrl = ionApiBaseUrl;
  if (ssoBaseUrl) parsed.ssoBaseUrl = ssoBaseUrl;
  if (oauthAuthPath) parsed.oauthAuthPath = oauthAuthPath;
  if (oauthTokenPath) parsed.oauthTokenPath = oauthTokenPath;
  if (oauthRevokePath) parsed.oauthRevokePath = oauthRevokePath;
  if (serviceAccountAccessKey) parsed.serviceAccountAccessKey = serviceAccountAccessKey;
  if (serviceAccountSecretKey) parsed.serviceAccountSecretKey = serviceAccountSecretKey;

  return parsed;
}

function isCompleteCredentials(value: Partial<InforM3Credentials>): value is InforM3Credentials {
  return Boolean(
    value.tenantId &&
      value.clientId &&
      value.clientSecret &&
      value.ionApiBaseUrl &&
      value.ssoBaseUrl &&
      value.serviceAccountAccessKey &&
      value.serviceAccountSecretKey
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireAuthorizedInforCompany(request, body);

    const useEnvFallback = body.useEnvFallback === true;
    const bodyCredentials = parseBodyCredentials(body);
    const envCredentials = useEnvFallback ? getInforM3CredentialsFromEnv() : null;
    const mergedCredentials: Partial<InforM3Credentials> = {
      ...envCredentials,
      ...bodyCredentials,
    };

    if (!isCompleteCredentials(mergedCredentials)) {
      return NextResponse.json(
        {
          error: 'Missing required Infor M3 credential fields.',
          required: [
            'tenantId',
            'clientId',
            'clientSecret',
            'ionApiBaseUrl',
            'ssoBaseUrl',
            'serviceAccountAccessKey',
            'serviceAccountSecretKey',
          ],
          note: 'You can set useEnvFallback=true temporarily to source missing fields from env.',
        },
        { status: 400 }
      );
    }

    const tokenResult = await requestInforM3AccessToken(mergedCredentials, 12000);
    if (!tokenResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          companyId,
          tokenEndpoint: tokenResult.tokenEndpoint,
          response: {
            status: tokenResult.status,
            error: tokenResult.error,
            errorDescription: tokenResult.errorDescription,
          },
        },
        { status: tokenResult.status }
      );
    }

    await saveInforM3CredentialsForCompany(companyId, mergedCredentials);

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Infor M3 credentials validated and saved for this company.',
      token: {
        tokenEndpoint: tokenResult.tokenEndpoint,
        tokenType: tokenResult.tokenType,
        expiresIn: tokenResult.expiresIn,
        accessTokenPreview: redact(tokenResult.accessToken),
      },
      saved: {
        tenantId: mergedCredentials.tenantId,
        clientId: redact(mergedCredentials.clientId),
        serviceAccountAccessKey: redact(mergedCredentials.serviceAccountAccessKey),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Infor M3 connect request timed out',
          details: 'No response from Infor SSO token endpoint within 12 seconds.',
        },
        { status: 504 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to connect Infor M3',
        details: message,
      },
      { status }
    );
  }
}
