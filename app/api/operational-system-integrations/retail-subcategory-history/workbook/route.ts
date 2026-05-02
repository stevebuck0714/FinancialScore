import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import {
  parseRetailSubcategoryHistoryWorkbook,
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

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
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

    const response = await fetch(blob.url);
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch uploaded workbook (${response.status})` }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    const parsed = parseRetailSubcategoryHistoryWorkbook(workbook);
    await saveRetailSubcategoryHistoryFacts({ companyId, parsed });

    return NextResponse.json({
      ok: true,
      companyId,
      documentId,
      originalFileName: originalFileName || 'Retail subcategory history workbook',
      sheetNames: parsed.sheetNames,
      monthCount: parsed.monthKeys.length,
      monthKeys: parsed.monthKeys,
      subcategoryCount: parsed.subcategories.length,
      rowCount: parsed.subcategories.reduce((sum, row) => sum + row.rows.length, 0),
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to import retail subcategory history workbook' },
      { status: 500 },
    );
  }
}
