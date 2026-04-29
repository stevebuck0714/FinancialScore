import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { parsePlatosClosetWorkbook } from '@/lib/operational/platos-closet-parser';
import { savePlatosClosetWorkbookSnapshot } from '@/lib/operational/platos-closet-workbook-snapshots';

export const dynamic = 'force-dynamic';

const SOURCE_CODE = 'PLATOS_CLOSET_STORE_VISIT';
const REQUIRED_SHEETS = ['YTD Key Performance Indicators', 'YTD Key Indicator'];

type BlobLike = {
  url?: string;
  pathname?: string;
  contentType?: string | null;
  size?: number | null;
};

function getMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

    const connection = await getOperationalSystemConnection(companyId, 'SPREADSHEET_UPLOAD', SOURCE_CODE);
    if (!connection) {
      return NextResponse.json({ ok: false, error: "Spreadsheet - Plato's Closet is not enabled for this company." }, { status: 400 });
    }

    const response = await fetch(blob.url);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    }
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    const parsedWorkbook = parsePlatosClosetWorkbook(workbook);
    const sheetNames = parsedWorkbook.sheetNames;
    const missingSheets = REQUIRED_SHEETS.filter((sheet) => !sheetNames.includes(sheet));
    if (missingSheets.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Workbook is missing required sheet(s): ${missingSheets.join(', ')}`,
          sheetNames,
          missingSheets,
        },
        { status: 400 }
      );
    }

    const metadata = getMetadataObject(connection.connectionMetadata);
    const updatedMetadata = {
      ...metadata,
      platosClosetWorkbookUpload: {
        documentId,
        originalFileName: originalFileName || 'Workbook upload',
        blobUrl: blob.url,
        blobPathname: blob.pathname || null,
        contentType: blob.contentType || null,
        sizeBytes: typeof blob.size === 'number' ? Math.trunc(blob.size) : null,
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: context.userId,
        sheetNames,
        requiredSheets: REQUIRED_SHEETS,
      },
      platosClosetParsedWorkbook: {
        parsedAt: new Date().toISOString(),
        workbookPeriod: parsedWorkbook.storeInfo['Visit Date'] || null,
        storeInfo: parsedWorkbook.storeInfo,
        salesKpis: parsedWorkbook.salesKpis,
        lossPreventionKpis: parsedWorkbook.lossPreventionKpis,
        salesHistory: parsedWorkbook.salesHistory,
        buysHistory: parsedWorkbook.buysHistory,
        marketingChannels: parsedWorkbook.marketingChannels,
        categorySummary: parsedWorkbook.categorySummary,
        categoryMetrics: parsedWorkbook.categoryMetrics,
      },
    };

    await saveOperationalSystemConnection({
      companyId,
      provider: 'SPREADSHEET_UPLOAD',
      sourceCode: SOURCE_CODE,
      status: connection.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      authType: connection.authType,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt,
      baseUrl: connection.baseUrl,
      lastSyncAt: connection.lastSyncAt,
      autoSync: connection.autoSync,
      syncFrequency: connection.syncFrequency,
      connectionMetadata: updatedMetadata,
      errorMessage: null,
    });

    await savePlatosClosetWorkbookSnapshot({
      companyId,
      documentId,
      originalFileName: originalFileName || 'Workbook upload',
      blobUrl: blob.url,
      workbookPeriod: typeof parsedWorkbook.storeInfo['Visit Date'] === 'string' ? String(parsedWorkbook.storeInfo['Visit Date']) : null,
      storeNumber: parsedWorkbook.storeInfo['Store Number'] == null ? null : String(parsedWorkbook.storeInfo['Store Number']),
      cityState: parsedWorkbook.storeInfo['City/State'] == null ? null : String(parsedWorkbook.storeInfo['City/State']),
      visitDateText: parsedWorkbook.storeInfo['Visit Date'] == null ? null : String(parsedWorkbook.storeInfo['Visit Date']),
      openDateText: parsedWorkbook.storeInfo['Open Date'] == null ? null : String(parsedWorkbook.storeInfo['Open Date']),
      salesTrend:
        typeof parsedWorkbook.storeInfo['Sales Trend'] === 'number' ? Number(parsedWorkbook.storeInfo['Sales Trend']) : null,
      buysTrend:
        typeof parsedWorkbook.storeInfo['Buys Trend'] === 'number' ? Number(parsedWorkbook.storeInfo['Buys Trend']) : null,
      rowCount: parsedWorkbook.categorySummary.rowCount,
      departmentCount: parsedWorkbook.categorySummary.departmentCount,
      categoryCount: parsedWorkbook.categorySummary.categoryCount,
      parsedWorkbook: {
        sheetNames: parsedWorkbook.sheetNames,
        requiredSheets: parsedWorkbook.requiredSheets,
        storeInfo: parsedWorkbook.storeInfo,
        salesKpis: parsedWorkbook.salesKpis,
        lossPreventionKpis: parsedWorkbook.lossPreventionKpis,
        salesHistory: parsedWorkbook.salesHistory,
        buysHistory: parsedWorkbook.buysHistory,
        marketingChannels: parsedWorkbook.marketingChannels,
        categorySummary: parsedWorkbook.categorySummary,
        categoryMetrics: parsedWorkbook.categoryMetrics,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      sheetNames,
      requiredSheets: REQUIRED_SHEETS,
      parsedWorkbook: {
        storeInfo: parsedWorkbook.storeInfo,
        salesKpisCount: parsedWorkbook.salesKpis.length,
        categoryRowCount: parsedWorkbook.categorySummary.rowCount,
        departmentCount: parsedWorkbook.categorySummary.departmentCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to register Plato's Closet workbook" }, { status: 500 });
  }
}
