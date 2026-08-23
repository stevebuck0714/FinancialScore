import { NextRequest, NextResponse } from 'next/server';
import {
  parseVendorMonthlyForecastWorkbook,
} from '@/lib/operations/vendor-monthly-forecast';
import { readProductOperationsWorkbook } from '@/lib/operations/product-revenue-forecast';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertVendorsForecastAccess,
  ensureVendorMonthlyForecastTables,
  loadPrimaryVendorByItem,
  normalizeVendorForecastLineInput,
  upsertVendorForecastLines,
} from '@/lib/operations/vendor-monthly-forecast-db';
import { UNASSIGNED_VENDOR_ID } from '@/lib/operations/vendor-monthly-forecast';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  return fallback;
}

function isUploadBlob(value: FormDataEntryValue | null): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob && typeof value.arrayBuffer === 'function';
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const companyId = String(form.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    const file = form.get('file');
    if (!isUploadBlob(file)) {
      return NextResponse.json({ error: 'Upload an Excel workbook (.xlsx).' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Workbook is larger than 20 MB.' }, { status: 400 });
    }

    const fallbackYear = asForecastYear(form.get('year'));
    const workbook = readProductOperationsWorkbook(await file.arrayBuffer());
    const parsed = parseVendorMonthlyForecastWorkbook(workbook, fallbackYear);

    await ensureVendorMonthlyForecastTables();
    const vendorsByItem = await loadPrimaryVendorByItem(companyId);
    const lines = parsed.rows.map((row, index) => {
      const overlay = !row.vendorId || row.vendorId === UNASSIGNED_VENDOR_ID
        ? vendorsByItem.get(String(row.itemSku || '').trim().toUpperCase())
        : null;
      return normalizeVendorForecastLineInput({
        ...row,
        vendorId: overlay?.vendorId || row.vendorId,
        vendorName: overlay?.vendorName || row.vendorName,
      }, {
        vendorId: overlay?.vendorId || row.vendorId,
        vendorName: overlay?.vendorName || row.vendorName,
      }, index);
    });

    const byVendor = new Map<string, typeof lines>();
    for (const line of lines) {
      const key = `${line.vendorId}||${line.vendorName}`;
      const group = byVendor.get(key) || [];
      group.push(line);
      byVendor.set(key, group);
    }

    for (const group of byVendor.values()) {
      const first = group[0];
      await upsertVendorForecastLines({
        companyId,
        year: parsed.year || fallbackYear,
        dataThru: asOptionalIsoDay(parsed.dataThru),
        replaceVendor: { vendorId: first.vendorId, vendorName: first.vendorName },
        lines: group,
      });
    }

    return NextResponse.json({
      ok: true,
      year: parsed.year || fallbackYear,
      dataThru: parsed.dataThru,
      sheetName: parsed.sheetName,
      rowCount: lines.length,
      vendorCount: byVendor.size,
    });
  } catch (error: unknown) {
    console.error('vendor-forecast import failed', error);
    const message = errorMessage(error, 'Failed to import vendor monthly forecast workbook');
    const status = message.includes('Company ID') || message.includes('Upload') || message.includes('missing') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
