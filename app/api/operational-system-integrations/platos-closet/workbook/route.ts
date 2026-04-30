import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection, saveOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { parsePlatosClosetWorkbook } from '@/lib/operational/platos-closet-parser';
import { savePlatosClosetMonthlyFacts } from '@/lib/operational/platos-closet-monthly-facts';
import { savePlatosClosetWorkbookSnapshot } from '@/lib/operational/platos-closet-workbook-snapshots';

export const dynamic = 'force-dynamic';

const SOURCE_CODE = 'PLATOS_CLOSET_STORE_VISIT';
const REQUIRED_SHEETS = ['YTD Key Performance Indicators', 'YTD Key Indicator'];
const FILE_MONTH_ALIASES: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

type BlobLike = {
  url?: string;
  pathname?: string;
  contentType?: string | null;
  size?: number | null;
};

function getMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseWorkbookPeriodFromFileName(fileName: string): { monthKey: string; periodLabel: string } | null {
  const normalized = fileName.toLowerCase();
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;
  const monthEntry = Object.entries(FILE_MONTH_ALIASES).find(([label]) =>
    new RegExp(`(^|[^a-z])${label}([^a-z]|$)`, 'i').test(normalized),
  );
  if (!monthEntry) return null;
  const monthNumber = Number(monthEntry[1]);
  const year = Number(yearMatch[1]);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(year)) return null;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const shortYear = String(year).slice(-2);
  return {
    monthKey: `${year}-${String(monthNumber).padStart(2, '0')}`,
    periodLabel: `${monthNumber}/1-${monthNumber}/${lastDay}/${shortYear}`,
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
    const filePeriod = parseWorkbookPeriodFromFileName(originalFileName);
    const resolvedWorkbook = filePeriod
      ? {
          ...parsedWorkbook,
          monthKey: filePeriod.monthKey,
          currentPeriodLabel: filePeriod.periodLabel,
        }
      : parsedWorkbook;
    if (!resolvedWorkbook.monthKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Unable to determine workbook month from the required worksheet period header.',
        },
        { status: 400 }
      );
    }
    const resolvedMonthKey = resolvedWorkbook.monthKey;
    const sheetNames = resolvedWorkbook.sheetNames;
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
        workbookPeriod: resolvedWorkbook.currentPeriodLabel || resolvedWorkbook.storeInfo['Visit Date'] || null,
        monthKey: resolvedMonthKey,
        storeInfo: resolvedWorkbook.storeInfo,
        salesKpis: resolvedWorkbook.salesKpis,
        buysKpis: resolvedWorkbook.buysKpis,
        lossPreventionKpis: resolvedWorkbook.lossPreventionKpis,
        salesHistory: resolvedWorkbook.salesHistory,
        buysHistory: resolvedWorkbook.buysHistory,
        marketingChannels: resolvedWorkbook.marketingChannels,
        categorySummary: resolvedWorkbook.categorySummary,
        categoryMetrics: resolvedWorkbook.categoryMetrics,
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
      monthKey: resolvedMonthKey,
      documentId,
      originalFileName: originalFileName || 'Workbook upload',
      blobUrl: blob.url,
      workbookPeriod: resolvedWorkbook.currentPeriodLabel || null,
      storeNumber: resolvedWorkbook.storeInfo['Store Number'] == null ? null : String(resolvedWorkbook.storeInfo['Store Number']),
      cityState: resolvedWorkbook.storeInfo['City/State'] == null ? null : String(resolvedWorkbook.storeInfo['City/State']),
      visitDateText: resolvedWorkbook.storeInfo['Visit Date'] == null ? null : String(resolvedWorkbook.storeInfo['Visit Date']),
      openDateText: resolvedWorkbook.storeInfo['Open Date'] == null ? null : String(resolvedWorkbook.storeInfo['Open Date']),
      salesTrend:
        typeof resolvedWorkbook.storeInfo['Sales Trend'] === 'number' ? Number(resolvedWorkbook.storeInfo['Sales Trend']) : null,
      buysTrend:
        typeof resolvedWorkbook.storeInfo['Buys Trend'] === 'number' ? Number(resolvedWorkbook.storeInfo['Buys Trend']) : null,
      rowCount: resolvedWorkbook.categorySummary.rowCount,
      departmentCount: resolvedWorkbook.categorySummary.departmentCount,
      categoryCount: resolvedWorkbook.categorySummary.categoryCount,
      parsedWorkbook: {
        sheetNames: resolvedWorkbook.sheetNames,
        requiredSheets: resolvedWorkbook.requiredSheets,
        storeInfo: resolvedWorkbook.storeInfo,
        salesKpis: resolvedWorkbook.salesKpis,
        buysKpis: resolvedWorkbook.buysKpis,
        lossPreventionKpis: resolvedWorkbook.lossPreventionKpis,
        salesHistory: resolvedWorkbook.salesHistory,
        buysHistory: resolvedWorkbook.buysHistory,
        marketingChannels: resolvedWorkbook.marketingChannels,
        categorySummary: resolvedWorkbook.categorySummary,
        categoryMetrics: resolvedWorkbook.categoryMetrics,
      },
    });

    await savePlatosClosetMonthlyFacts({
      companyId,
      monthKey: resolvedMonthKey,
      parsedWorkbook: resolvedWorkbook,
    });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      sheetNames,
      requiredSheets: REQUIRED_SHEETS,
      parsedWorkbook: {
        storeInfo: resolvedWorkbook.storeInfo,
        monthKey: resolvedMonthKey,
        currentPeriodLabel: resolvedWorkbook.currentPeriodLabel,
        salesKpisCount: resolvedWorkbook.salesKpis.length,
        categoryRowCount: resolvedWorkbook.categorySummary.rowCount,
        departmentCount: resolvedWorkbook.categorySummary.departmentCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to register Plato's Closet workbook" }, { status: 500 });
  }
}
