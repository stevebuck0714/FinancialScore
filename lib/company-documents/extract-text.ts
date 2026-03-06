import mammoth from 'mammoth';

type ExtractResult =
  | { status: 'DONE'; text: string }
  | { status: 'NO_TEXT'; text: string }
  | { status: 'FAILED'; text: string; error: string };

const MAX_EXTRACTED_CHARS = 400_000;

export function sanitizeTextForPostgres(raw: unknown): string {
  // Postgres text columns reject NUL bytes; strip them before write.
  return String(raw || '').replace(/\u0000/g, '');
}

function clampText(raw: string): string {
  const s = sanitizeTextForPostgres(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length <= MAX_EXTRACTED_CHARS) return s;
  return s.slice(0, MAX_EXTRACTED_CHARS);
}

export async function extractTextFromArrayBuffer(params: {
  arrayBuffer: ArrayBuffer;
  contentType?: string | null;
  fileName?: string | null;
}): Promise<ExtractResult> {
  const { arrayBuffer, contentType, fileName } = params;
  const name = (fileName || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();

  try {
    const buf = Buffer.from(arrayBuffer);

    const isPdf = ct.includes('pdf') || name.endsWith('.pdf');
    const isDocx =
      ct.includes('officedocument.wordprocessingml.document') || name.endsWith('.docx');

    if (isDocx) {
      const res = await mammoth.extractRawText({ buffer: buf });
      const text = clampText(res?.value || '');
      if (!text) return { status: 'NO_TEXT', text: '' };
      return { status: 'DONE', text };
    }

    if (isPdf) {
      // We intentionally pin `pdf-parse` to the v1.x CJS API because pdfjs-dist v5 (used by v2)
      // has caused Next/webpack runtime issues in this repo (Object.defineProperty called on non-object).
      // v1.x exposes the classic function form: `pdfParse(buffer) -> { text }`.
      const mod: any = await import('pdf-parse');
      const pdfParse: any = mod?.default || mod;
      if (typeof pdfParse !== 'function') {
        throw new Error('PDF parser not available (pdf-parse function export missing)');
      }

      // Best-effort extraction from PDF content stream (no OCR).
      const parsed: any = await pdfParse(buf);
      const text = clampText(parsed?.text || '');
      if (!text) return { status: 'NO_TEXT', text: '' };
      return { status: 'DONE', text };
    }

    return {
      status: 'FAILED',
      text: '',
      error: `Unsupported document type. Only PDF and DOCX are supported. (contentType=${contentType || 'n/a'})`,
    };
  } catch (e: any) {
    // Helpful in dev when PDF parsing fails inside pdf.js/pdf-parse.
    // (The caller stores only the message in DB; the stack is useful in logs.)
    console.warn('❌ Document text extraction failed', {
      message: e?.message || String(e),
      stack: e?.stack,
    });
    return {
      status: 'FAILED',
      text: '',
      error: e?.message || 'Failed to extract text from document',
    };
  }
}

