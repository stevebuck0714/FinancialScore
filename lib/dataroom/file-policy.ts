import {
  DATAROOM_ALLOWED_CONTENT_TYPES,
  DATAROOM_ALLOWED_EXTENSIONS,
  DATAROOM_MAX_FILE_SIZE_BYTES,
  DATAROOM_MAX_SPREADSHEET_FILE_SIZE_BYTES,
} from './constants';

function extensionOf(fileName: string): string {
  const lower = String(fileName || '').trim().toLowerCase();
  const idx = lower.lastIndexOf('.');
  if (idx < 0) return '';
  return lower.slice(idx);
}

function isSpreadsheetExtension(ext: string): boolean {
  return ext === '.xls' || ext === '.xlsx' || ext === '.csv';
}

const ALLOWED_EXTENSIONS = DATAROOM_ALLOWED_EXTENSIONS as readonly string[];
const ALLOWED_CONTENT_TYPES = DATAROOM_ALLOWED_CONTENT_TYPES as readonly string[];

export function validateDataRoomFilePolicy(params: {
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}) {
  const ext = extensionOf(params.fileName);
  const ct = String(params.contentType || '').toLowerCase();
  const size = typeof params.sizeBytes === 'number' ? params.sizeBytes : null;

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension (${ext || 'unknown'}).`,
    };
  }

  if (ct && !ALLOWED_CONTENT_TYPES.includes(ct)) {
    return {
      valid: false,
      error: `Unsupported content type (${ct}).`,
    };
  }

  if (size !== null && isSpreadsheetExtension(ext) && size > DATAROOM_MAX_SPREADSHEET_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Spreadsheet files exceed max size of ${Math.round(DATAROOM_MAX_SPREADSHEET_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  if (size !== null && size > DATAROOM_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds max size of ${Math.round(DATAROOM_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  return { valid: true as const };
}

