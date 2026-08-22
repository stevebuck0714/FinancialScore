import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parseProductRevenueForecastWorkbook } from '@/lib/operations/product-revenue-forecast';
import { parseProductRevenueWorkbook } from '@/lib/operations/product-revenue-actual';
import {
  assertProductsForecastAccess,
  ensureProductRevenueForecastTables,
  normalizeForecastLineInput,
  upsertForecastLines,
} from '@/lib/operations/product-revenue-forecast-db';
import {
  ensureProductRevenueTables,
  persistParsedRevenueWorkbook,
} from '@/lib/operations/product-revenue-actual-db';

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

    await Promise.all([ensureProductRevenueForecastTables(), ensureProductRevenueTables()]);

    const fallbackYear = Number(form.get('year')) || new Date().getUTCFullYear();
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    try {
      const parsed = parseProductRevenueWorkbook(workbook, fallbackYear);
      const result = await persistParsedRevenueWorkbook({ companyId, parsed });
      return NextResponse.json({
        ok: true,
        ...result,
        sheetName: parsed.forecast?.sheetName || result.sheetName,
      });
    } catch {
      const parsed = parseProductRevenueForecastWorkbook(workbook, fallbackYear);
      const lines = parsed.rows.map((row, index) =>
        normalizeForecastLineInput(row, { customerId: row.customerId, customerName: row.customerName }, index)
      );
      const dataThru = parsed.dataThru ? new Date(`${parsed.dataThru}T00:00:00.000Z`) : null;
      await upsertForecastLines({
        companyId,
        year: parsed.year,
        dataThru,
        replaceCustomer: null,
        lines,
      });
      const customerCount = new Set(lines.map((line) => `${line.customerId}||${line.customerName}`)).size;
      return NextResponse.json({
        ok: true,
        year: parsed.year,
        dataThru: parsed.dataThru,
        sheetName: parsed.sheetName,
        rowCount: lines.length,
        customerCount,
        priceCount: 0,
        forecastRowCount: lines.length,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import revenue forecast workbook' },
      { status: 500 }
    );
  }
}
