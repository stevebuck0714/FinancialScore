import { NextRequest, NextResponse } from 'next/server';
import { readProductOperationsWorkbook } from '@/lib/operations/product-revenue-forecast';
import { parseProductRevenueWorkbook } from '@/lib/operations/product-revenue-actual';
import {
  assertProductsForecastAccess,
  ensureProductRevenueTables,
  persistParsedRevenueWorkbook,
  workbookFromImportPayload,
} from '@/lib/operations/product-revenue-actual-db';
import { ensureProductRevenueForecastTables } from '@/lib/operations/product-revenue-forecast-db';

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

function isUploadBlob(value: FormDataEntryValue | null): value is File {
  return typeof File !== 'undefined' && value instanceof File && typeof value.arrayBuffer === 'function';
}

async function persistFromRequest(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || '').trim();
    const fallbackYear = Number(body.year) || new Date().getUTCFullYear();
    return { companyId, parsed: workbookFromImportPayload(body.parsed ?? body, fallbackYear) };
  }

  const form = await request.formData();
  const companyId = String(form.get('companyId') || '').trim();
  const file = form.get('file');
  if (!isUploadBlob(file)) {
    throw new Error('Upload an Excel workbook (.xlsx).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Workbook is larger than 20 MB.');
  }
  const fallbackYear = Number(form.get('year')) || new Date().getUTCFullYear();
  const workbook = readProductOperationsWorkbook(await file.arrayBuffer());
  return { companyId, parsed: parseProductRevenueWorkbook(workbook, fallbackYear) };
}

export async function POST(request: NextRequest) {
  try {
    const { companyId, parsed } = await persistFromRequest(request);
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await Promise.all([ensureProductRevenueTables(), ensureProductRevenueForecastTables()]);
    const result = await persistParsedRevenueWorkbook({ companyId, parsed });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error('product-revenue import failed', error);
    const message = errorMessage(error, 'Failed to import revenue workbook');
    const status = message.includes('Company ID') || message.includes('Upload') || message.includes('too many') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
