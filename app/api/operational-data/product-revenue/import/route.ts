import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parseProductRevenueWorkbook } from '@/lib/operations/product-revenue-actual';
import {
  assertProductsForecastAccess,
  ensureProductRevenueTables,
  persistParsedRevenueWorkbook,
} from '@/lib/operations/product-revenue-actual-db';
import { ensureProductRevenueForecastTables } from '@/lib/operations/product-revenue-forecast-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const companyId = String(form.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload an Excel workbook (.xlsx).' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Workbook is larger than 20 MB.' }, { status: 400 });
    }

    await Promise.all([ensureProductRevenueTables(), ensureProductRevenueForecastTables()]);

    const fallbackYear = Number(form.get('year')) || new Date().getUTCFullYear();
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parsed = parseProductRevenueWorkbook(workbook, fallbackYear);
    const result = await persistParsedRevenueWorkbook({ companyId, parsed });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import revenue workbook' },
      { status: 500 }
    );
  }
}
