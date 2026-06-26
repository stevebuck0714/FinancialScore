import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  BAKERS_COGS_LABEL,
  BAKERS_COGS_SOURCE_CODE,
  parseBakersCogsWorkbook,
  saveBakersCogsFacts,
} from '@/lib/operational/bakers-cogs';

export const dynamic = 'force-dynamic';

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

    const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', BAKERS_COGS_SOURCE_CODE);
    if (!connection) {
      return NextResponse.json({ ok: false, error: `${BAKERS_COGS_LABEL} is not enabled for this company.` }, { status: 400 });
    }

    const response = await fetch(blob.url);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer', cellDates: true });
    const parsed = parseBakersCogsWorkbook(workbook);
    await saveBakersCogsFacts({ companyId, parsed, sourceCode: BAKERS_COGS_SOURCE_CODE });

    const metadata = asRecord(connection.connectionMetadata);
    const uploadedAt = new Date().toISOString();
    const priorVersions = Array.isArray(metadata.bakersCogsVersions) ? metadata.bakersCogsVersions : [];
    const activeUpload = {
      documentId,
      originalFileName: originalFileName || `${BAKERS_COGS_LABEL} workbook`,
      blobUrl: blob.url,
      blobPathname: blob.pathname || null,
      contentType: blob.contentType || null,
      sizeBytes: typeof blob.size === 'number' ? Math.trunc(blob.size) : null,
      uploadedAt,
      uploadedByUserId: context.userId,
      sheetNames: parsed.sheetNames,
    };

    await saveOperationalSystemConnection({
      companyId,
      provider: 'SPREADSHEET_UPLOAD',
      sourceCode: BAKERS_COGS_SOURCE_CODE,
      status: 'ACTIVE',
      authType: connection.authType,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt,
      baseUrl: connection.baseUrl,
      lastSyncAt: new Date(),
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: {
        ...metadata,
        sourceLabel: BAKERS_COGS_LABEL,
        bakersCogsWorkbookUpload: activeUpload,
        bakersCogsParsedWorkbook: {
          parsedAt: uploadedAt,
          productCount: parsed.productCount,
          rowCount: parsed.rowCount,
          formulaDateKeys: parsed.formulaDateKeys,
          products: parsed.products.map((product) => ({
            sheetName: product.sheetName,
            productName: product.productName,
            productId: product.productId,
            formulaDateKey: product.formulaDateKey,
            totals: product.totals,
            rowCount: product.rows.length,
          })),
        },
        bakersCogsVersions: [
          {
            ...activeUpload,
            productCount: parsed.productCount,
            rowCount: parsed.rowCount,
            formulaDateKeys: parsed.formulaDateKeys,
          },
          ...priorVersions,
        ].slice(0, 20),
      },
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      originalFileName: originalFileName || `${BAKERS_COGS_LABEL} workbook`,
      sheetNames: parsed.sheetNames,
      productCount: parsed.productCount,
      rowCount: parsed.rowCount,
      formulaDateKeys: parsed.formulaDateKeys,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || `Failed to import ${BAKERS_COGS_LABEL}` },
      { status: 500 },
    );
  }
}
