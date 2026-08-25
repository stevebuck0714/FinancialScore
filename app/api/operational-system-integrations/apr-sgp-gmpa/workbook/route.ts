import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import {
  APR_SGP_GMPA_LABEL,
  APR_SGP_GMPA_SOURCE_CODE,
  parseAprSgpDutyTariffItems,
  parseAprSgpGmpaWorkbook,
} from '@/lib/operational/apr-sgp-gmpa';
import { parseSgpFreightWorkbook } from '@/lib/operational/apr-sgp-freight';
import { refreshCompanyItemDuties } from '@/lib/hts/item-duty-overlay';
import { seedCompanyItemFreightFromSgp } from '@/lib/operations/item-freight-overlay';

export const dynamic = 'force-dynamic';

const ATLANTIC_PRECISION_COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

type BlobLike = {
  url?: string;
  pathname?: string;
  contentType?: string | null;
  size?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const documentId = String(body.documentId || '').trim();
    const originalFileName = String(body.originalFileName || '').trim();
    const blob = asRecord(body.blob) as BlobLike;

    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    if (!documentId) return NextResponse.json({ ok: false, error: 'documentId is required' }, { status: 400 });
    if (!blob.url) return NextResponse.json({ ok: false, error: 'blob.url is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', APR_SGP_GMPA_SOURCE_CODE);
    if (!connection) {
      if (companyId !== ATLANTIC_PRECISION_COMPANY_ID) {
        return NextResponse.json({ ok: false, error: `${APR_SGP_GMPA_LABEL} is not enabled for this company.` }, { status: 400 });
      }
    }

    const response = await fetch(blob.url);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer', cellDates: true });
    const parsed = parseAprSgpGmpaWorkbook(workbook);
    const freightParsed = parseSgpFreightWorkbook(workbook);
    const dutyIdentities = parseAprSgpDutyTariffItems(workbook);

    const metadata = asRecord(connection?.connectionMetadata);
    const uploadedAt = new Date().toISOString();
    const priorVersions = Array.isArray(metadata.aprSgpGmpaVersions) ? metadata.aprSgpGmpaVersions : [];
    const activeUpload = {
      documentId,
      originalFileName: originalFileName || `${APR_SGP_GMPA_LABEL} workbook`,
      blobUrl: blob.url,
      blobPathname: blob.pathname || null,
      contentType: blob.contentType || null,
      sizeBytes: typeof blob.size === 'number' ? Math.trunc(blob.size) : null,
      uploadedAt,
      uploadedByUserId: context.userId,
      sheetNames: parsed.sheetNames,
      sourceDateIso: parsed.sourceDateIso,
    };

    await saveOperationalSystemConnection({
      companyId,
      provider: 'SPREADSHEET_UPLOAD',
      sourceCode: APR_SGP_GMPA_SOURCE_CODE,
      status: 'ACTIVE',
      authType: connection?.authType || null,
      accessToken: connection?.accessToken || null,
      refreshToken: connection?.refreshToken || null,
      tokenExpiresAt: connection?.tokenExpiresAt || null,
      baseUrl: connection?.baseUrl || null,
      lastSyncAt: new Date(),
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: {
        ...metadata,
        sourceLabel: APR_SGP_GMPA_LABEL,
        aprSgpGmpaWorkbookUpload: activeUpload,
        aprSgpGmpaParsedWorkbook: {
          ...parsed,
          parsedAt: uploadedAt,
        },
        aprSgpDutyHtsByItem: dutyIdentities,
        aprSgpFreightParsed: freightParsed
          ? {
              sheetName: freightParsed.sheetName,
              rowCount: freightParsed.rowCount,
              rows: freightParsed.rows,
              assumptions: freightParsed.assumptions,
              parsedAt: uploadedAt,
            }
          : metadata.aprSgpFreightParsed || null,
        aprSgpGmpaVersions: [
          {
            ...activeUpload,
            rowCount: parsed.rowCount,
            customerCount: parsed.customerCount,
            itemCount: parsed.itemCount,
          },
          ...priorVersions,
        ].slice(0, 20),
      },
      errorMessage: null,
    });

    const freightSeed = await seedCompanyItemFreightFromSgp(companyId).catch((error) => {
      console.error('SGP freight overlay seed failed:', error);
      return { itemCount: 0, seeded: 0 };
    });
    const dutySeed = await refreshCompanyItemDuties(companyId).catch((error) => {
      console.error('SGP duties overlay seed failed:', error);
      return { spreadsheetItems: 0, discovered: 0 };
    });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      originalFileName: originalFileName || `${APR_SGP_GMPA_LABEL} workbook`,
      sheetNames: parsed.sheetNames,
      sourceDateIso: parsed.sourceDateIso,
      rowCount: parsed.rowCount,
      customerCount: parsed.customerCount,
      itemCount: parsed.itemCount,
      dutyItemsSeeded: dutySeed.spreadsheetItems,
      freightItemsSeeded: freightSeed.itemCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || `Failed to import ${APR_SGP_GMPA_LABEL}` },
      { status: 500 },
    );
  }
}
