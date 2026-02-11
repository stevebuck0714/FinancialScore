import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import path from 'path';
import { readFile } from 'fs/promises';

const ALLOWED_FILES = [
  'Corelytics Value proposition.docx',
  'Privacy_Policy.docx',
  'Sample API Integration questionnaire.docx',
  'SECURITY_FOR_STAKEHOLDERS.docx',
  'Getting Started Guide.docx',
  'USER_MANUAL.docx',
];

/**
 * GET /api/docs/view?file=Privacy_Policy.docx
 * Converts the requested .docx from docs/ to HTML for in-app viewing.
 */
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file || !ALLOWED_FILES.includes(file)) {
    return NextResponse.json(
      { error: 'Invalid or missing file parameter' },
      { status: 400 }
    );
  }
  try {
    const filePath = path.join(process.cwd(), 'docs', file);
    const buffer = await readFile(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    return NextResponse.json({ html: result.value });
  } catch (error) {
    console.warn('Docs view failed for', file, error);
    return NextResponse.json(
      { error: 'Document could not be loaded' },
      { status: 500 }
    );
  }
}
