export const COMPANY_DOCUMENT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const COMPANY_DOCUMENT_MAX_SPREADSHEET_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const COMPANY_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.txt',
] as const;

export const COMPANY_DOCUMENT_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
] as const;

function extensionOf(fileName: string): string {
  const lower = String(fileName || '').trim().toLowerCase();
  const idx = lower.lastIndexOf('.');
  if (idx < 0) return '';
  return lower.slice(idx);
}

function isSpreadsheetExtension(ext: string): boolean {
  return ext === '.xls' || ext === '.xlsx' || ext === '.csv';
}

export function validateCompanyDocumentFilePolicy(params: {
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}) {
  const ext = extensionOf(params.fileName);
  const ct = String(params.contentType || '').toLowerCase();
  const size = typeof params.sizeBytes === 'number' ? params.sizeBytes : null;

  if (!(COMPANY_DOCUMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension (${ext || 'unknown'}).`,
    };
  }

  if (ct && !(COMPANY_DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(ct)) {
    return {
      valid: false,
      error: `Unsupported content type (${ct}).`,
    };
  }

  if (size !== null && isSpreadsheetExtension(ext) && size > COMPANY_DOCUMENT_MAX_SPREADSHEET_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Spreadsheet files exceed max size of ${Math.round(COMPANY_DOCUMENT_MAX_SPREADSHEET_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  if (size !== null && size > COMPANY_DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds max size of ${Math.round(COMPANY_DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  return { valid: true as const };
}
