import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { callInforIonApi } from '@/lib/infor-m3/client';
import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { validateCompanyAccess } from '@/lib/tenant-security';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

export const dynamic = 'force-dynamic';

const DEFAULT_CACHE_TTL_DAYS = 30;
const ITEM_OVERVIEW_PROPERTIES = ['Item', 'Description', 'Overview', 'itmUf_PartNotes', 'RecordDate', 'ChangeDate'];

type CacheRow = {
  itemNumber: string;
  description: string | null;
  overview: string | null;
  partNotes: string | null;
  recordDate: Date | null;
  changeDate: Date | null;
  fetchedAt: Date;
  expiresAt: Date;
};

function normalizeItemNumber(value: unknown): string {
  return String(value || '').trim();
}

function parseMaybeDate(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?)?$/);
  if (compact) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = compact;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addOrReplaceQueryParam(path: string, key: string, value: string): string {
  const [basePath, queryString = ''] = path.split('?');
  const params = new URLSearchParams(queryString);
  params.set(key, value);
  return `${basePath}?${params.toString()}`;
}

function buildItemOverviewEndpoint(configuredEndpointPath: string | null, itemNumber: string): string {
  let endpointPath = configuredEndpointPath || '/APR_PRD/CSI/IDORequestService/ido/load/SLItems?recordCap=1';
  endpointPath = addOrReplaceQueryParam(endpointPath, 'properties', ITEM_OVERVIEW_PROPERTIES.join(','));
  endpointPath = addOrReplaceQueryParam(endpointPath, 'filter', `Item='${itemNumber.replace(/'/g, "''")}'`);
  endpointPath = addOrReplaceQueryParam(endpointPath, 'recordCap', '1');
  return endpointPath;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function findSlItemsProgram(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const rows = Array.isArray(metadata.accountingPrograms) ? metadata.accountingPrograms : [];
  const match = rows.find((row) => String(asRecord(row).miProgram || '').trim().toUpperCase() === 'SLITEMS');
  if (match) return asRecord(match);

  const bySystem = asRecord(metadata.accountingProgramsBySystem);
  for (const value of Object.values(bySystem)) {
    const systemRows = Array.isArray(value) ? value : [];
    const systemMatch = systemRows.find((row) => String(asRecord(row).miProgram || '').trim().toUpperCase() === 'SLITEMS');
    if (systemMatch) return asRecord(systemMatch);
  }
  return null;
}

function extractFirstItem(body: unknown): Record<string, unknown> | null {
  const record = asRecord(body);
  const items = Array.isArray(record.Items) ? record.Items : [];
  const first = items[0];
  return first && typeof first === 'object' && !Array.isArray(first) ? (first as Record<string, unknown>) : null;
}

async function readFreshCache(companyId: string, itemNumber: string): Promise<CacheRow | null> {
  const rows = await prisma.$queryRaw<CacheRow[]>(Prisma.sql`
    SELECT
      "itemNumber",
      "description",
      "overview",
      "partNotes",
      "recordDate",
      "changeDate",
      "fetchedAt",
      "expiresAt"
    FROM "InforItemOverviewCache"
    WHERE "companyId" = ${companyId}
      AND "platform" = 'INFOR_M3'
      AND "itemNumber" = ${itemNumber}
      AND "expiresAt" > NOW()
    LIMIT 1
  `);
  return rows[0] || null;
}

async function upsertCache(companyId: string, itemNumber: string, payload: Record<string, unknown>, ttlDays: number): Promise<CacheRow> {
  const description = String(payload.Description || payload.description || '').trim() || null;
  const overview = String(payload.Overview || payload.overview || '').trim() || null;
  const partNotes = String(payload.itmUf_PartNotes || payload.partNotes || '').trim() || null;
  const recordDate = parseMaybeDate(payload.RecordDate || payload.recordDate);
  const changeDate = parseMaybeDate(payload.ChangeDate || payload.changeDate);
  const rawPayload = JSON.stringify(payload);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<CacheRow[]>(Prisma.sql`
    INSERT INTO "InforItemOverviewCache"
      ("id", "companyId", "platform", "itemNumber", "description", "overview", "partNotes", "recordDate", "changeDate", "rawPayload", "fetchedAt", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${companyId}, 'INFOR_M3', ${itemNumber}, ${description}, ${overview}, ${partNotes}, ${recordDate}, ${changeDate}, ${rawPayload}::jsonb, NOW(), ${expiresAt}, NOW(), NOW())
    ON CONFLICT ("companyId", "platform", "itemNumber")
    DO UPDATE SET
      "description" = EXCLUDED."description",
      "overview" = EXCLUDED."overview",
      "partNotes" = EXCLUDED."partNotes",
      "recordDate" = EXCLUDED."recordDate",
      "changeDate" = EXCLUDED."changeDate",
      "rawPayload" = EXCLUDED."rawPayload",
      "fetchedAt" = EXCLUDED."fetchedAt",
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = NOW()
    RETURNING "itemNumber", "description", "overview", "partNotes", "recordDate", "changeDate", "fetchedAt", "expiresAt"
  `);
  return rows[0];
}

export async function GET(request: NextRequest) {
  try {
    const companyId = getRequestedCompanyId(request);
    const itemNumber = normalizeItemNumber(request.nextUrl.searchParams.get('item'));
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    if (!itemNumber) {
      return NextResponse.json({ ok: false, error: 'item is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!forceRefresh) {
      const cached = await readFreshCache(companyId, itemNumber);
      if (cached) {
        return NextResponse.json({ ok: true, source: 'cache', item: cached });
      }
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
        company: {
          select: { accountingSystem: true },
        },
      },
    });

    const metadata = asRecord(connection?.connectionMetadata);
    const slItemsProgram = findSlItemsProgram(metadata);
    const inforSystem = normalizeInforSystem(connection?.company?.accountingSystem);
    const { credentials } = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem);
    if (!credentials) {
      return NextResponse.json({ ok: false, error: 'Infor credentials are not configured' }, { status: 400 });
    }

    const endpointPath = buildItemOverviewEndpoint(String(slItemsProgram?.endpointPath || ''), itemNumber);
    const headers: Record<string, string> = {};
    const mongooseConfig = String(slItemsProgram?.mongooseConfig || '').trim();
    const site = String(slItemsProgram?.site || '').trim();
    if (mongooseConfig) headers['X-Infor-MongooseConfig'] = mongooseConfig;
    if (site) headers['X-Infor-Site'] = site;

    const response = await callInforIonApi(credentials, endpointPath, {
      timeoutMs: 30_000,
      headers,
      meta: { programId: 'SLITEMS', sourcePath: endpointPath },
    });

    if (!response.ok || response.status >= 400) {
      return NextResponse.json(
        { ok: false, error: 'Infor item overview lookup failed', status: response.status, body: response.body },
        { status: 502 }
      );
    }

    const payload = extractFirstItem(response.body);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'Item overview not found' }, { status: 404 });
    }

    const ttlDays = Math.max(1, Math.min(90, Number(request.nextUrl.searchParams.get('ttlDays') || DEFAULT_CACHE_TTL_DAYS)));
    const cached = await upsertCache(companyId, itemNumber, payload, ttlDays);
    return NextResponse.json({ ok: true, source: 'infor', item: cached });
  } catch (error) {
    console.error('Infor CSI item overview lookup failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Item overview lookup failed' },
      { status: 500 }
    );
  }
}
