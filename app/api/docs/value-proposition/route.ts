import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * GET /api/docs/value-proposition
 * Returns the content of docs/VALUE_PROPOSITION.md for the Consultant Dashboard tab.
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'VALUE_PROPOSITION.md');
    const content = await readFile(filePath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    console.warn('Value proposition doc read failed:', error);
    return NextResponse.json(
      { content: '# Value Proposition\n\nContent could not be loaded. Ensure docs/VALUE_PROPOSITION.md exists.' },
      { status: 200 }
    );
  }
}
