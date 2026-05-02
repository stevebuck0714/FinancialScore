import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  type ParsedRetailSubcategoryHistory,
  parseRetailSubcategoryHistoryWorkbook,
  PLATOS_INVENTORY_SOURCE_CODE,
  saveRetailSubcategoryHistoryFacts,
} from '@/lib/operational/retail-subcategory-history';

export const dynamic = 'force-dynamic';

type BlobLike = {
  url?: string;
  pathname?: string;
  contentType?: string | null;
  size?: number | null;
};

function getMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function limitToLatestMonths(parsed: ParsedRetailSubcategoryHistory, monthCount: number): ParsedRetailSubcategoryHistory {
  const monthKeys = parsed.monthKeys.slice(-monthCount);
  const monthKeySet = new Set(monthKeys);
  return {
    ...parsed,
    monthKeys,
    subcategories: parsed.subcategories.map((subcategory) => ({
      ...subcategory,
      rows: subcategory.rows.filter((row) => monthKeySet.has(row.monthKey)),
    })),
  };
}

function buildAccessoriesBeltsSample(parsed: ParsedRetailSubcategoryHistory) {
  const subcategory = parsed.subcategories
    .filter((row) => row.code === '1011' || /accessories\s+belts/i.test(row.name))
    .sort((a, b) => {
      const bSales = b.rows.reduce((sum, row) => sum + Number(row.salesUnits || 0), 0);
      const aSales = a.rows.reduce((sum, row) => sum + Number(row.salesUnits || 0), 0);
      return bSales - aSales;
    })[0];
  if (!subcategory) return null;
  return {
    code: subcategory.code,
    name: subcategory.name,
    currentOnHandUnits: subcategory.currentOnHandUnits,
    salesUnits: subcategory.rows.map((row) => ({ monthKey: row.monthKey, salesUnits: row.salesUnits })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const documentId = String(body.documentId || '').trim();
    const originalFileName = String(body.originalFileName || '').trim();
    const blob = getMetadataObject(body.blob) as BlobLike;

    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    if (!documentId) {
      return NextResponse.json({ ok: false, error: 'documentId is required' }, { status: 400 });
    }
    if (!blob.url) {
      return NextResponse.json({ ok: false, error: 'blob.url is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', PLATOS_INVENTORY_SOURCE_CODE);
    if (!connection) {
      return NextResponse.json({ ok: false, error: "Spreadsheet - Plato's Inventory is not enabled for this company." }, { status: 400 });
    }

    const response = await fetch(blob.url);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    const parsed = limitToLatestMonths(parseRetailSubcategoryHistoryWorkbook(workbook), 12);
    const accessoriesBeltsSample = buildAccessoriesBeltsSample(parsed);
    if (accessoriesBeltsSample) {
      console.log("[PLATOS_INVENTORY] Accessories Belts parsed sample:", accessoriesBeltsSample);
    }
    await saveRetailSubcategoryHistoryFacts({
      companyId,
      parsed,
      sourceCode: PLATOS_INVENTORY_SOURCE_CODE,
    });

    const metadata = getMetadataObject(connection.connectionMetadata);
    const uploadedAt = new Date().toISOString();
    await saveOperationalSystemConnection({
      companyId,
      provider: 'SPREADSHEET_UPLOAD',
      sourceCode: PLATOS_INVENTORY_SOURCE_CODE,
      status: connection.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      authType: connection.authType,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt,
      baseUrl: connection.baseUrl,
      lastSyncAt: new Date(),
      autoSync: connection.autoSync,
      syncFrequency: connection.syncFrequency,
      connectionMetadata: {
        ...metadata,
        platosInventoryWorkbookUpload: {
          documentId,
          originalFileName: originalFileName || "Plato's Inventory workbook",
          blobUrl: blob.url,
          blobPathname: blob.pathname || null,
          contentType: blob.contentType || null,
          sizeBytes: typeof blob.size === 'number' ? Math.trunc(blob.size) : null,
          uploadedAt,
          uploadedByUserId: context.userId,
          sheetNames: parsed.sheetNames,
          expectedMonths: 12,
        },
        platosInventoryParsedWorkbook: {
          parsedAt: uploadedAt,
          monthCount: parsed.monthKeys.length,
          monthKeys: parsed.monthKeys,
          subcategoryCount: parsed.subcategories.length,
          rowCount: parsed.subcategories.reduce((sum, row) => sum + row.rows.length, 0),
        },
      },
      errorMessage: null,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      originalFileName: originalFileName || "Plato's Inventory workbook",
      sheetNames: parsed.sheetNames,
      monthCount: parsed.monthKeys.length,
      monthKeys: parsed.monthKeys,
      subcategoryCount: parsed.subcategories.length,
      rowCount: parsed.subcategories.reduce((sum, row) => sum + row.rows.length, 0),
      accessoriesBeltsSample,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to import Plato's Inventory workbook" },
      { status: 500 },
    );
  }
}
